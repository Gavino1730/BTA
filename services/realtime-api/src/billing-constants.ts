/**
 * Billing Phase 1 Constants and Scope Definition
 *
 * This file defines the canonical billing model for Phase 1 of the platform rebuild.
 * All checkout, webhook, and entitlement logic must align with these constraints.
 *
 * Current Scope:
 * - Hosted Stripe Checkout (not custom Payment Element)
 * - Monthly and yearly subscription cycles
 * - No free trial (account finalization on successful payment)
 * - Hybrid account creation (lead context before checkout, account finalized post-payment)
 *
 * Explicitly excluded:
 * - Free trial
 * - Multi-seat, one-time add-ons, and advanced analytics (MRR/churn/LTV)
 */

/**
 * Billing entitlement states as defined by Stripe subscription lifecycle + custom mappings.
 * These states drive paywall enforcement and UI messaging throughout the platform.
 */
export enum BillingEntitlementStatus {
  /** No active subscription; user has no billing history or account is not yet created */
  INCOMPLETE = "incomplete",

  /** Subscription is active and current; all premium features enabled */
  ACTIVE = "active",

  /** Subscription exists but payment is overdue; graceful access degradation applies */
  PAST_DUE = "past_due",

  /** Subscription has been canceled; premium features are blocked */
  CANCELED = "canceled",
}

/**
 * Reason codes for why a user does not have active entitlement.
 * Used in paywall denial logs and entitlement endpoint responses.
 */
export enum EntitlementDenialReason {
  INACTIVE_SUBSCRIPTION = "inactive_subscription",
  PAST_DUE_PAYMENT = "past_due_payment",
  NO_BILLING_HISTORY = "no_billing_history",
  CANCELED_SUBSCRIPTION = "canceled_subscription",
  BILLING_DISABLED = "billing_disabled",
}

/**
 * Plan cycle options supported by hosted checkout.
 */
export enum PlanCycle {
  MONTHLY = "monthly",
  YEARLY = "yearly",
}

/**
 * Valid plan cycles for checkout request validation.
 */
export const PHASE_1_VALID_PLAN_CYCLES: readonly string[] = ["monthly", "yearly"];

/**
 * Canonical state transitions for billing lifecycle.
 * Webhook handlers must enforce these transitions to maintain deterministic state.
 *
 * Allowed transitions:
 * - INCOMPLETE → ACTIVE (customer.subscription.created with status=active, or invoice.paid)
 * - ACTIVE → PAST_DUE (invoice.payment_failed)
 * - PAST_DUE → ACTIVE (invoice.paid after failure)
 * - ACTIVE/PAST_DUE → CANCELED (customer.subscription.deleted)
 * - Any state → INACTIVE in local cache on subscription.created with status=incomplete/incomplete-trials
 */
export const ALLOWED_STATE_TRANSITIONS = new Map<
  BillingEntitlementStatus,
  Set<BillingEntitlementStatus>
>([
  [
    BillingEntitlementStatus.INCOMPLETE,
    new Set([BillingEntitlementStatus.ACTIVE, BillingEntitlementStatus.CANCELED]),
  ],
  [
    BillingEntitlementStatus.ACTIVE,
    new Set([BillingEntitlementStatus.PAST_DUE, BillingEntitlementStatus.CANCELED]),
  ],
  [
    BillingEntitlementStatus.PAST_DUE,
    new Set([BillingEntitlementStatus.ACTIVE, BillingEntitlementStatus.CANCELED]),
  ],
  [BillingEntitlementStatus.CANCELED, new Set()],
]);

/**
 * Default trial days for new accounts.
 * Current behavior: no trial. Reserved for future enablement.
 */
export const PHASE_1_TRIAL_DAYS = 0;

/**
 * Stripe mode indicator: whether this deployment uses Stripe test or live keys.
 * Read from BTA_STRIPE_TEST_MODE at startup.
 */
export let stripeTestMode = true;

/**
 * Initialize stripe test mode from environment.
 * If BTA_STRIPE_TEST_MODE=1, test mode is active.
 * If BTA_STRIPE_TEST_MODE=0, live mode is active (production only).
 */
export function initializeStripeMode(testModeStr: string): void {
  stripeTestMode = testModeStr === "1";
}

/**
 * Stripe Checkout configuration defaults.
 * These values are applied to Checkout session creation unless overridden.
 */
export const PHASE_1_CHECKOUT_CONFIG = {
  /**
   * Subscription mode: Stripe Checkout will create a subscription
   * (not a one-time payment or pre-filled subscription).
   */
  mode: "subscription" as const,

  /**
   * Metadata tags applied to sessions for tracking and audit logs.
   */
  metadataTags: {
    phase: "phase_1",
    product: "premium_subscription",
    planCycle: "monthly",
  },

  /**
   * Billing address collection: only email for compliance and cart recovery.
   */
  billingAddressCollection: "auto" as const,

  /**
   * Tax behavior: deferred (Stripe Checkout will not apply tax, app handles in fulfillment).
   * Phase 1 does not implement tax; reserved for Phase 4+.
   */
  taxBehavior: "unspecified" as const,

  /**
   * Customer update fields allowed on Checkout:
   * - email: always allow (soft update if different from session.customer_email)
   * - name: always allow (coach name / operator name)
   * - address: not required for Phase 1
   */
  allowedCustomerUpdateFields: ["email", "name"] as const,
};

/**
 * Premium feature endpoints and their entitlement requirements.
 * Used for centralized paywall enforcement and audit logging.
 *
 * All endpoints listed here require ACTIVE entitlement status.
 * Past_due states are allowed graceful access for critical dashboards.
 * Canceled and incomplete states deny access entirely.
 */
export const PREMIUM_FEATURE_MATRIX = {
  // Advanced stats and analytics
  "/api/advanced/game": { feature: "advanced_game_stats", restrictOn: ["canceled", "incomplete"] },
  "/api/advanced/player": { feature: "advanced_player_stats", restrictOn: ["canceled", "incomplete"] },
  "/api/advanced/team": { feature: "advanced_team_stats", restrictOn: ["canceled", "incomplete"] },
  "/api/advanced/patterns": { feature: "advanced_patterns", restrictOn: ["canceled", "incomplete"] },
  "/api/advanced/volatility": {
    feature: "advanced_volatility",
    restrictOn: ["canceled", "incomplete"],
  },

  // AI-powered analysis and insights
  "/api/ai/chat": { feature: "ai_chat", restrictOn: ["canceled", "incomplete"] },
  "/api/ai/analyze": { feature: "ai_analysis", restrictOn: ["canceled", "incomplete"] },
  "/api/ai/game-analysis": {
    feature: "ai_game_analysis",
    restrictOn: ["canceled", "incomplete"],
  },
  "/api/ai/player-analysis": {
    feature: "ai_player_analysis",
    restrictOn: ["canceled", "incomplete"],
  },
  "/api/ai/player-insights": {
    feature: "ai_player_insights",
    restrictOn: ["canceled", "incomplete"],
  },

  // Season insights and reporting
  "/api/season-stats": { feature: "season_stats", restrictOn: ["canceled", "incomplete"] },
  "/api/season-analysis": { feature: "season_analysis", restrictOn: ["canceled", "incomplete"] },

  // Real-time and contextual features
  "/api/live-context": { feature: "live_context", restrictOn: ["canceled", "incomplete"] },
  "/api/notifications": { feature: "notifications", restrictOn: ["canceled", "incomplete"] },

  // Leaderboards and comparisons
  "/api/leaderboards": { feature: "leaderboards", restrictOn: ["canceled", "incomplete"] },
  "/api/team-trends": { feature: "team_trends", restrictOn: ["canceled", "incomplete"] },
  "/api/player-trends": { feature: "player_trends", restrictOn: ["canceled", "incomplete"] },
  "/api/player-comparison": { feature: "player_comparison", restrictOn: ["canceled", "incomplete"] },

  // Comprehensive insights
  "/api/comprehensive-insights": {
    feature: "comprehensive_insights",
    restrictOn: ["canceled", "incomplete"],
  },
} as const;

/**
 * Entitlement mapping for paywall enforcement.
 * Maps BillingEntitlementStatus to allowed feature access.
 *
 * - ACTIVE: full access to all premium features
 * - PAST_DUE: graceful degradation (allow read, block writes or analytics-heavy operations)
 * - INCOMPLETE: no premium access (upsell prompt)
 * - CANCELED: no premium access (reactivate prompt)
 */
export const ENTITLEMENT_ACCESS_MATRIX = {
  [BillingEntitlementStatus.ACTIVE]: {
    allowPremiumFeatures: true,
    allowAnalytics: true,
    gracefulDegradation: false,
  },
  [BillingEntitlementStatus.PAST_DUE]: {
    allowPremiumFeatures: true, // Graceful: allow read-only access during payment grace period
    allowAnalytics: false, // Block analytics updates during payment issues
    gracefulDegradation: true,
  },
  [BillingEntitlementStatus.INCOMPLETE]: {
    allowPremiumFeatures: false,
    allowAnalytics: false,
    gracefulDegradation: false,
  },
  [BillingEntitlementStatus.CANCELED]: {
    allowPremiumFeatures: false,
    allowAnalytics: false,
    gracefulDegradation: false,
  },
} as const;

/**
 * Webhook event types required for Phase 1 billing lifecycle.
 * All handlers must implement strict signature verification and idempotent processing.
 */
export const REQUIRED_WEBHOOK_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.created",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
  "charge.dispute.created",
] as const;

/**
 * Audit log event taxonomy for billing operations.
 * Structured logging without PII or secrets.
 */
export enum BillingAuditEventType {
  CHECKOUT_SESSION_CREATED = "checkout.session_created",
  CHECKOUT_SESSION_COMPLETED = "checkout.session_completed",
  CHECKOUT_SESSION_CANCELED = "checkout.session_canceled",
  WEBHOOK_RECEIVED = "webhook.received",
  WEBHOOK_PROCESSING_STARTED = "webhook.processing_started",
  WEBHOOK_PROCESSING_COMPLETED = "webhook.processing_completed",
  WEBHOOK_PROCESSING_SKIPPED_DEDUPE = "webhook.processing_skipped_dedupe",
  ENTITLEMENT_CHECK_PERFORMED = "entitlement.check_performed",
  ENTITLEMENT_DENIED = "entitlement.denied",
  STATE_TRANSITION_ATTEMPTED = "state.transition_attempted",
  STATE_TRANSITION_SUCCEEDED = "state.transition_succeeded",
  STATE_TRANSITION_FAILED = "state.transition_failed",
  PORTAL_SESSION_CREATED = "portal.session_created",
}
