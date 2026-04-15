import type { Express, Request } from "express";
import type { BillingState, OrganizationProfile } from "../store.js";
type Middleware = (req: Request, res: import("express").Response, next: import("express").NextFunction) => void | Promise<void>;

interface RegisterBillingRoutesOptions {
  paywallEnabled: boolean;
  stripeTestMode: boolean;
  stripeSecretKey: string | undefined;
  stripeWebhookSecret: string | undefined;
  stripePriceIdMonthly: string | undefined;
  stripePriceIdYearly: string | undefined;
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  isValidEmail: (value: string) => boolean;
  allocateBootstrapSchoolId: (seed: string) => string;
  buildBootstrapSchoolSeed: (...candidates: unknown[]) => string;
  normalizeSchoolId: (value: unknown) => string | undefined;
  resolveCoachRedirectOrigin: (req: Request) => string;
  getBillingStateByScope: (scope: { schoolId: string }) => BillingState | null;
  saveBillingState: (state: Partial<BillingState>, scope: { schoolId: string }) => BillingState;
  findBillingStateByStripeCustomerId: (stripeCustomerId: string) => BillingState | null;
  findBillingStateByStripeSubscriptionId: (stripeSubscriptionId: string) => BillingState | null;
  hasProcessedStripeWebhookEvent: (eventId: string) => boolean;
  markProcessedStripeWebhookEvent: (eventId: string) => void;
  trimProcessedStripeWebhookEvents: (maxEntries?: number) => void;
  getOrganizationProfileByScope: (scope: { schoolId: string }) => OrganizationProfile | null;
  saveOrganizationProfile: (profile: Partial<OrganizationProfile>, scope: { schoolId: string }) => OrganizationProfile;
  loggerInfo: (message: string, context?: Record<string, unknown>) => void;
  loggerWarn: (message: string, context?: Record<string, unknown>) => void;
  loggerError: (message: string, context?: Record<string, unknown>) => void;
}

function buildBillingEntitlement(
  paywallEnabled: boolean,
  billingState: BillingState | null
): {
  paywallEnabled: boolean;
  accessActive: boolean;
  status: string;
  reason: string;
} {
  if (!paywallEnabled) {
    return {
      paywallEnabled: false,
      accessActive: true,
      status: "active",
      reason: "billing_disabled",
    };
  }

  if (!billingState) {
    return {
      paywallEnabled: true,
      accessActive: false,
      status: "incomplete",
      reason: "inactive_subscription",
    };
  }

  const status = billingState.status;

  if (status === "active" || status === "trialing") {
    return {
      paywallEnabled: true,
      accessActive: true,
      status,
      reason: "subscription_active",
    };
  }

  if (status === "past_due") {
    return {
      paywallEnabled: true,
      accessActive: false,
      status: "past_due",
      reason: "inactive_subscription",
    };
  }

  if (status === "canceled") {
    return {
      paywallEnabled: true,
      accessActive: false,
      status: "canceled",
      reason: "inactive_subscription",
    };
  }

  return {
    paywallEnabled: true,
    accessActive: false,
    status: status || "incomplete",
    reason: "inactive_subscription",
  };
}

function buildCouponDeprecationResponse() {
  return {
    error: "Coupon codes are entered on the Stripe-hosted checkout page.",
    code: "stripe_checkout_promotion_codes_only",
    checkoutHandlesPromotionCodes: true,
  };
}

export function registerBillingRoutes(app: Express, options: RegisterBillingRoutesOptions): void {
  // GET /api/billing/entitlement
  // Returns billing entitlement for the current school.
  // Suppresses missingTenantScope telemetry for this specific path.
  app.get("/api/billing/entitlement", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const billingState = options.getBillingStateByScope({ schoolId });
    const entitlement = buildBillingEntitlement(options.paywallEnabled, billingState);
    res.json({ entitlement });
  });

  // POST /api/billing/validate-coupon
  // Coupons are entered on the Stripe-hosted checkout page.
  app.post("/api/billing/validate-coupon", options.requireApiKey, (req, res) => {
    if (!options.paywallEnabled) {
      res.status(400).json({ valid: false, error: "Billing is not enabled" });
      return;
    }

    res.status(410).json({ valid: false, ...buildCouponDeprecationResponse() });
  });

  // POST /api/billing/apply-coupon
  // Coupons are entered on the Stripe-hosted checkout page.
  app.post("/api/billing/apply-coupon", options.requireApiKey, options.requireWriteRole, (req, res) => {
    if (!options.paywallEnabled) {
      res.status(400).json({ error: "Billing is not enabled" });
      return;
    }

    res.status(410).json(buildCouponDeprecationResponse());
  });

  // POST /api/billing/checkout-session
  // Creates a Stripe Checkout session for subscribing.
  app.post("/api/billing/checkout-session", options.requireApiKey, options.requireWriteRole, (req, res) => {
    if (!options.paywallEnabled) {
      res.status(400).json({ error: "Billing is not enabled" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const rawPlanCycle = options.sanitizeTextField(payload.planCycle, 20);
    const planCycle = !rawPlanCycle ? "monthly" : rawPlanCycle;

    if (planCycle !== "monthly" && planCycle !== "yearly") {
      res.status(400).json({ error: "Invalid plan cycle — must be 'monthly' or 'yearly'" });
      return;
    }

    const schoolId = options.getSchoolIdFromRequest(req);

    const priceId = planCycle === "yearly"
      ? (options.stripePriceIdYearly || options.stripePriceIdMonthly)
      : options.stripePriceIdMonthly;

    if (!priceId) {
      res.status(503).json({ error: "Stripe checkout is not configured" });
      return;
    }

    if (options.stripeTestMode) {
      const sessionId = `cs_test_${schoolId}_${Date.now()}`;
      const url = `https://checkout.stripe.com/test/session/${priceId}?school=${encodeURIComponent(schoolId)}&prefilled_promo_entry=1`;
      options.loggerInfo("billing.checkout_session_created", { schoolId, sessionId, planCycle, testMode: true });
      res.json({ id: sessionId, url, allowPromotionCodes: true, promotionCodeEntry: "stripe_checkout" });
      return;
    }

    // Non-test mode: real Stripe call would go here, handled via configuration.
    // For now, without a live Stripe key, return configuration error.
    if (!options.stripeSecretKey) {
      res.status(503).json({ error: "Stripe checkout is not configured" });
      return;
    }

    res.status(503).json({
      error: "Stripe checkout is not configured",
      allowPromotionCodes: true,
      promotionCodeEntry: "stripe_checkout",
    });
  });

  // POST /api/billing/bootstrap-checkout-session
  // Creates a Stripe Checkout session for marketing site bootstrap flow (no auth required).
  app.post("/api/billing/bootstrap-checkout-session", (req, res) => {
    if (!options.paywallEnabled) {
      res.status(400).json({ error: "Billing is not enabled" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const fullName = options.sanitizeTextField(payload.fullName, 120);
    const email = options.sanitizeTextField(payload.email, 160).toLowerCase();
    const schoolName = options.sanitizeTextField(payload.schoolName, 120);
    const teamName = options.sanitizeTextField(payload.teamName, 120);
    const planCycle = options.sanitizeTextField(payload.planCycle, 20) || "monthly";

    if (!fullName || !email || !options.isValidEmail(email)) {
      res.status(400).json({ error: "A valid full name and email are required" });
      return;
    }

    const priceId = planCycle === "yearly"
      ? (options.stripePriceIdYearly || options.stripePriceIdMonthly)
      : options.stripePriceIdMonthly;

    if (!priceId) {
      res.status(503).json({ error: "Stripe checkout is not configured" });
      return;
    }

    // Allocate a schoolId for this bootstrap session.
    // The org profile and billing state are NOT created until the webhook fires.
    const seed = options.buildBootstrapSchoolSeed(schoolName, email);
    const schoolId = options.allocateBootstrapSchoolId(seed || email);

    if (options.stripeTestMode) {
      const sessionId = `cs_test_bootstrap_${schoolId}_${Date.now()}`;
      const url = `https://checkout.stripe.com/test/session/bootstrap-${priceId}?school=${encodeURIComponent(schoolId)}&prefilled_promo_entry=1`;
      options.loggerInfo("billing.bootstrap_checkout_session_created", {
        schoolId,
        sessionId,
        planCycle,
        testMode: true,
        email,
        fullName,
        schoolName,
        teamName,
      });
      res.json({
        schoolId,
        id: sessionId,
        url,
        allowPromotionCodes: true,
        promotionCodeEntry: "stripe_checkout",
      });
      return;
    }

    // Non-test mode: real Stripe call would go here.
    if (!options.stripeSecretKey) {
      res.status(503).json({ error: "Stripe checkout is not configured" });
      return;
    }

    res.status(503).json({
      error: "Stripe checkout is not configured",
      allowPromotionCodes: true,
      promotionCodeEntry: "stripe_checkout",
    });
  });

  // POST /api/billing/webhook
  // Receives Stripe webhook events. No auth/tenant scope required.
  app.post("/api/billing/webhook", async (req, res) => {
    if (!options.paywallEnabled) {
      res.status(202).json({ received: true, ignored: true, reason: "paywall_disabled" });
      return;
    }

    // Non-test mode: validate Stripe signature
    if (!options.stripeTestMode) {
      if (!options.stripeWebhookSecret) {
        res.status(503).json({ error: "Stripe webhook is not configured" });
        return;
      }

      const sig = req.headers["stripe-signature"];
      if (!sig) {
        res.status(400).json({ error: "Missing Stripe signature" });
        return;
      }

      // Attempt to verify the signature by constructing the event.
      // If it fails, return 400.
      try {
        // In production, use stripe.webhooks.constructEvent(req.body, sig, options.stripeWebhookSecret).
        // The raw body must be used, not the parsed JSON.
        // Since we're in non-test mode and this would need raw body middleware, return an error here.
        const bodyStr = JSON.stringify(req.body);
        const timestamp = (String(sig).split(",").find((p) => p.startsWith("t=")) ?? "").slice(2);
        const v1 = (String(sig).split(",").find((p) => p.startsWith("v1=")) ?? "").slice(3);

        if (!timestamp || !v1) {
          res.status(400).json({ error: "Invalid Stripe signature" });
          return;
        }

        // Build expected hmac (simple check - webhooks need raw body in production)
        const crypto = await import("node:crypto");
        const signedPayload = `${timestamp}.${bodyStr}`;
        const expectedSig = crypto.createHmac("sha256", options.stripeWebhookSecret)
          .update(signedPayload, "utf8")
          .digest("hex");

        if (expectedSig !== v1) {
          res.status(400).json({ error: "Invalid Stripe signature" });
          return;
        }
      } catch {
        res.status(400).json({ error: "Invalid Stripe signature" });
        return;
      }
    }

    const event = (req.body ?? {}) as Record<string, unknown>;

    // Validate event envelope has id
    if (!event.id || typeof event.id !== "string") {
      res.status(400).json({ error: "Invalid Stripe event envelope" });
      return;
    }

    const eventId = event.id;
    const eventType = String(event.type ?? "");
    const dataObject = ((event.data as Record<string, unknown> | undefined)?.object ?? {}) as Record<string, unknown>;

    // Idempotency: skip already-processed events
    if (options.hasProcessedStripeWebhookEvent(eventId)) {
      res.json({ received: true, duplicate: true });
      return;
    }

    if (eventType === "checkout.session.completed") {
      const metadata = (dataObject.metadata ?? {}) as Record<string, unknown>;
      const schoolId = String(metadata.schoolId ?? "").trim();
      const flow = String(metadata.flow ?? "").trim();
      const stripeCustomerId = String(dataObject.customer ?? "").trim();
      const stripeSubscriptionId = String(dataObject.subscription ?? "").trim();

      if (schoolId) {
        options.saveBillingState(
          {
            status: "active",
            stripeCustomerId: stripeCustomerId || undefined,
            stripeSubscriptionId: stripeSubscriptionId || undefined,
          },
          { schoolId }
        );

        // When marketing-bootstrap flow, also set up org profile and onboarding data
        if (flow === "marketing-bootstrap") {
          const bootstrapFullName = String(metadata.fullName ?? "").trim();
          const bootstrapEmail = String(metadata.email ?? "").trim();
          const bootstrapSchoolName = String(metadata.schoolName ?? "").trim();
          const bootstrapTeamName = String(metadata.teamName ?? "").trim();

          if (bootstrapSchoolName) {
            options.saveOrganizationProfile(
              { organizationName: bootstrapSchoolName },
              { schoolId }
            );
          }

          options.loggerInfo("billing.bootstrap_checkout_completed", {
            schoolId,
            fullName: bootstrapFullName,
            email: bootstrapEmail,
            schoolName: bootstrapSchoolName,
            teamName: bootstrapTeamName,
          });
        }

        options.loggerInfo("billing.checkout_completed", { schoolId, stripeCustomerId, stripeSubscriptionId });
      }

      options.markProcessedStripeWebhookEvent(eventId);
      options.trimProcessedStripeWebhookEvents();
      res.json({ received: true });
      return;
    }

    if (eventType === "invoice.payment_failed") {
      const stripeCustomerId = String(dataObject.customer ?? "").trim();
      const stripeSubscriptionId = String(dataObject.subscription ?? "").trim();

      let billingState = stripeCustomerId
        ? options.findBillingStateByStripeCustomerId(stripeCustomerId)
        : null;

      if (!billingState && stripeSubscriptionId) {
        billingState = options.findBillingStateByStripeSubscriptionId(stripeSubscriptionId);
      }

      if (billingState && billingState.schoolId) {
        options.saveBillingState({ status: "past_due" }, { schoolId: billingState.schoolId });
        options.loggerWarn("billing.payment_failed", { schoolId: billingState.schoolId, stripeCustomerId });
      }

      options.markProcessedStripeWebhookEvent(eventId);
      options.trimProcessedStripeWebhookEvents();
      res.json({ received: true });
      return;
    }

    if (eventType === "invoice.payment_succeeded") {
      const stripeCustomerId = String(dataObject.customer ?? "").trim();
      const stripeSubscriptionId = String(dataObject.subscription ?? "").trim();

      let billingState = stripeCustomerId
        ? options.findBillingStateByStripeCustomerId(stripeCustomerId)
        : null;

      if (!billingState && stripeSubscriptionId) {
        billingState = options.findBillingStateByStripeSubscriptionId(stripeSubscriptionId);
      }

      if (billingState && billingState.schoolId) {
        options.saveBillingState(
          {
            status: "active",
            stripeCustomerId: stripeCustomerId || billingState.stripeCustomerId,
            stripeSubscriptionId: stripeSubscriptionId || billingState.stripeSubscriptionId,
          },
          { schoolId: billingState.schoolId }
        );
        options.loggerInfo("billing.payment_recovered", { schoolId: billingState.schoolId, stripeCustomerId });
      }

      options.markProcessedStripeWebhookEvent(eventId);
      options.trimProcessedStripeWebhookEvents();
      res.json({ received: true });
      return;
    }

    if (eventType === "customer.subscription.deleted") {
      const stripeCustomerId = String(dataObject.customer ?? "").trim();
      const stripeSubscriptionId = String(dataObject.id ?? "").trim();

      let billingState = stripeCustomerId
        ? options.findBillingStateByStripeCustomerId(stripeCustomerId)
        : null;

      if (!billingState && stripeSubscriptionId) {
        billingState = options.findBillingStateByStripeSubscriptionId(stripeSubscriptionId);
      }

      if (billingState && billingState.schoolId) {
        options.saveBillingState({ status: "canceled" }, { schoolId: billingState.schoolId });
        options.loggerInfo("billing.subscription_canceled", { schoolId: billingState.schoolId });
      }

      options.markProcessedStripeWebhookEvent(eventId);
      options.trimProcessedStripeWebhookEvents();
      res.json({ received: true });
      return;
    }

    // Unknown event type: acknowledge receipt
    options.markProcessedStripeWebhookEvent(eventId);
    res.json({ received: true });
  });

  // GET /api/billing/portal-session
  // Returns a Stripe billing portal session URL.
  app.get("/api/billing/portal-session", options.requireApiKey, (req, res) => {
    if (!options.paywallEnabled) {
      res.status(400).json({ error: "Billing is not enabled" });
      return;
    }

    const schoolId = options.getSchoolIdFromRequest(req);
    const billingState = options.getBillingStateByScope({ schoolId });

    if (!billingState?.stripeCustomerId) {
      res.status(400).json({ error: "No Stripe customer found for this school" });
      return;
    }

    const returnUrl = options.resolveCoachRedirectOrigin(req);

    if (options.stripeTestMode) {
      const url = `billing.stripe.com/test/p/session?customer=${billingState.stripeCustomerId}&return_url=${encodeURIComponent(returnUrl)}`;
      res.json({ url });
      return;
    }

    // Non-test mode: real Stripe portal session call would go here
    res.status(503).json({ error: "Stripe portal is not configured" });
  });
}
