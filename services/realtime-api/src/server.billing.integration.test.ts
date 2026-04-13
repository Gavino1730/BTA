import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const API_PORT = "4101";
const API_BASE = `http://localhost:${API_PORT}`;

function makeTestToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `test.${encoded}`;
}

describe("server billing integration", () => {
  let startServer: (overridePort?: number) => Promise<number>;
  let stopServer: () => Promise<void>;

  beforeAll(async () => {
    process.env.BTA_AUTH_TEST_MODE = "1";
    process.env.BTA_REQUIRE_TENANT = "1";
    process.env.BTA_JWT_WRITE_REQUIRED = "1";
    process.env.BTA_API_KEY = "billing-test-api-key";
    process.env.BTA_LOCAL_AUTH_SECRET = "billing-local-auth-secret";
    process.env.BTA_PAYWALL_ENABLED = "1";
    process.env.BTA_STRIPE_TEST_MODE = "1";
    process.env.BTA_STRIPE_SECRET_KEY = "stripe_test_secret_key";
    process.env.BTA_STRIPE_WEBHOOK_SECRET = "whsec_test_bta";
    process.env.BTA_STRIPE_PRICE_ID_MONTHLY = "price_monthly_test";
    process.env.BTA_STRIPE_PRICE_ID_YEARLY = "price_yearly_test";
    process.env.NODE_ENV = "test";
    process.env.PORT = API_PORT;

    vi.resetModules();
    const serverModule = await import("./server.js");
    startServer = serverModule.startServer;
    stopServer = serverModule.stopServer;
    await startServer();
  });

  afterAll(async () => {
    await stopServer();

    delete process.env.BTA_AUTH_TEST_MODE;
    delete process.env.BTA_REQUIRE_TENANT;
    delete process.env.BTA_JWT_WRITE_REQUIRED;
    delete process.env.BTA_API_KEY;
    delete process.env.BTA_LOCAL_AUTH_SECRET;
    delete process.env.BTA_PAYWALL_ENABLED;
    delete process.env.BTA_STRIPE_TEST_MODE;
    delete process.env.BTA_STRIPE_SECRET_KEY;
    delete process.env.BTA_STRIPE_WEBHOOK_SECRET;
    delete process.env.BTA_STRIPE_PRICE_ID_MONTHLY;
    delete process.env.BTA_STRIPE_PRICE_ID_YEARLY;
    delete process.env.PORT;
  });

  it("supports coupon, checkout, webhook activation, and portal flow", async () => {
    const schoolId = "billing-school-a";
    const token = makeTestToken({
      sub: "billing-coach-a",
      schoolId,
      role: "coach",
      email: "coach-a@school.org",
      name: "Coach A",
    });

    const entitlementBeforeResponse = await fetch(`${API_BASE}/api/billing/entitlement`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
      },
    });
    expect(entitlementBeforeResponse.status).toBe(200);
    const entitlementBefore = await entitlementBeforeResponse.json() as {
      entitlement?: { paywallEnabled?: boolean; accessActive?: boolean; reason?: string; status?: string };
    };
    expect(entitlementBefore.entitlement?.paywallEnabled).toBe(true);
    expect(entitlementBefore.entitlement?.accessActive).toBe(false);
    expect(entitlementBefore.entitlement?.reason).toBe("inactive_subscription");

    const premiumBlockedResponse = await fetch(`${API_BASE}/api/season-stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
      },
    });
    expect(premiumBlockedResponse.status).toBe(402);

    const validateCouponResponse = await fetch(`${API_BASE}/api/billing/validate-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "SAVE10" }),
    });
    expect(validateCouponResponse.status).toBe(200);
    const validateCouponPayload = await validateCouponResponse.json() as {
      valid?: boolean;
      percentOff?: number | null;
    };
    expect(validateCouponPayload.valid).toBe(true);
    expect(validateCouponPayload.percentOff).toBe(10);

    const applyCouponResponse = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "SAVE10" }),
    });
    expect(applyCouponResponse.status).toBe(200);

    const checkoutResponse = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "monthly" }),
    });
    expect(checkoutResponse.status).toBe(200);
    const checkoutPayload = await checkoutResponse.json() as { url?: string; id?: string };
    expect(checkoutPayload.id).toContain("cs_test_");
    expect(checkoutPayload.url).toContain("checkout.stripe.com/test/session");

    const webhookResponse = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_checkout_school_a",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { schoolId },
            customer: `cus_test_${schoolId}`,
            subscription: `sub_test_${schoolId}`,
          },
        },
      }),
    });
    expect(webhookResponse.status).toBe(200);

    const entitlementAfterResponse = await fetch(`${API_BASE}/api/billing/entitlement`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
      },
    });
    expect(entitlementAfterResponse.status).toBe(200);
    const entitlementAfter = await entitlementAfterResponse.json() as {
      entitlement?: { accessActive?: boolean; reason?: string; status?: string };
    };
    expect(entitlementAfter.entitlement?.accessActive).toBe(true);
    expect(entitlementAfter.entitlement?.status).toBe("active");
    expect(entitlementAfter.entitlement?.reason).toBe("subscription_active");

    const premiumAllowedResponse = await fetch(`${API_BASE}/api/season-stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
      },
    });
    expect(premiumAllowedResponse.status).toBe(200);

    const portalResponse = await fetch(`${API_BASE}/api/billing/portal-session`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
      },
    });
    expect(portalResponse.status).toBe(200);
    const portalPayload = await portalResponse.json() as { url?: string };
    expect(portalPayload.url).toContain("billing.stripe.com/test/p/session");

    const duplicateWebhookResponse = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_checkout_school_a",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { schoolId },
          },
        },
      }),
    });
    expect(duplicateWebhookResponse.status).toBe(200);
    const duplicatePayload = await duplicateWebhookResponse.json() as { duplicate?: boolean };
    expect(duplicatePayload.duplicate).toBe(true);

    const paymentFailedResponse = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_invoice_failed_school_a",
        type: "invoice.payment_failed",
        data: {
          object: {
            customer: `cus_test_${schoolId}`,
            subscription: `sub_test_${schoolId}`,
          },
        },
      }),
    });
    expect(paymentFailedResponse.status).toBe(200);

    const entitlementPastDueResponse = await fetch(`${API_BASE}/api/billing/entitlement`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
      },
    });
    expect(entitlementPastDueResponse.status).toBe(200);
    const entitlementPastDue = await entitlementPastDueResponse.json() as {
      entitlement?: { accessActive?: boolean; status?: string };
    };
    expect(entitlementPastDue.entitlement?.accessActive).toBe(false);
    expect(entitlementPastDue.entitlement?.status).toBe("past_due");
  });

  it("creates bootstrap checkout sessions without pre-existing tenant scope", async () => {
    const bootstrapResponse = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Bootstrap Coach",
        email: "bootstrap@school.org",
        schoolName: "Bootstrap High",
        teamName: "Bootstrap Varsity",
        planCycle: "monthly",
      }),
    });

    expect(bootstrapResponse.status).toBe(200);
    const bootstrapPayload = await bootstrapResponse.json() as { schoolId?: string; url?: string; id?: string };
    expect(typeof bootstrapPayload.schoolId).toBe("string");
    expect(bootstrapPayload.schoolId?.length ?? 0).toBeGreaterThan(0);
    expect(bootstrapPayload.id).toContain("cs_test_bootstrap_");
    expect(bootstrapPayload.url).toContain("checkout.stripe.com/test/session/bootstrap-");

    const token = makeTestToken({
      sub: "bootstrap-coach",
      schoolId: bootstrapPayload.schoolId,
      role: "coach",
    });

    const entitlementResponse = await fetch(`${API_BASE}/api/billing/entitlement`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": bootstrapPayload.schoolId ?? "",
      },
    });

    expect(entitlementResponse.status).toBe(200);
    const entitlementPayload = await entitlementResponse.json() as {
      entitlement?: { reason?: string; accessActive?: boolean };
    };
    expect(entitlementPayload.entitlement?.accessActive).toBe(false);
    expect(entitlementPayload.entitlement?.reason).toBe("inactive_subscription");
  });
});
