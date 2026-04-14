import { describe, it, expect } from "vitest";
import {
  BillingEntitlementStatus,
  ALLOWED_STATE_TRANSITIONS,
  PHASE_1_VALID_PLAN_CYCLES,
  PREMIUM_FEATURE_MATRIX,
  REQUIRED_WEBHOOK_EVENT_TYPES,
  PHASE_1_CHECKOUT_CONFIG,
  ENTITLEMENT_ACCESS_MATRIX,
} from "./billing-constants.js";

describe("billing-constants: Phase 1 scope definition", () => {
  it("defines all required entitlement states", () => {
    expect(BillingEntitlementStatus.INCOMPLETE).toBe("incomplete");
    expect(BillingEntitlementStatus.ACTIVE).toBe("active");
    expect(BillingEntitlementStatus.PAST_DUE).toBe("past_due");
    expect(BillingEntitlementStatus.CANCELED).toBe("canceled");
  });

  it("includes both monthly and yearly checkout cycles", () => {
    expect(PHASE_1_VALID_PLAN_CYCLES).toContain("monthly");
    expect(PHASE_1_VALID_PLAN_CYCLES).toContain("yearly");
    expect(PHASE_1_VALID_PLAN_CYCLES).toHaveLength(2);
  });

  it("defines valid state transitions for billing lifecycle", () => {
    // INCOMPLETE can transition to ACTIVE or CANCELED
    expect(
      ALLOWED_STATE_TRANSITIONS.get(BillingEntitlementStatus.INCOMPLETE)
    ).toContain(BillingEntitlementStatus.ACTIVE);
    expect(
      ALLOWED_STATE_TRANSITIONS.get(BillingEntitlementStatus.INCOMPLETE)
    ).toContain(BillingEntitlementStatus.CANCELED);

    // ACTIVE can transition to PAST_DUE or CANCELED
    expect(
      ALLOWED_STATE_TRANSITIONS.get(BillingEntitlementStatus.ACTIVE)
    ).toContain(BillingEntitlementStatus.PAST_DUE);
    expect(
      ALLOWED_STATE_TRANSITIONS.get(BillingEntitlementStatus.ACTIVE)
    ).toContain(BillingEntitlementStatus.CANCELED);

    // PAST_DUE can transition back to ACTIVE or to CANCELED
    expect(
      ALLOWED_STATE_TRANSITIONS.get(BillingEntitlementStatus.PAST_DUE)
    ).toContain(BillingEntitlementStatus.ACTIVE);
    expect(
      ALLOWED_STATE_TRANSITIONS.get(BillingEntitlementStatus.PAST_DUE)
    ).toContain(BillingEntitlementStatus.CANCELED);

    // CANCELED has no valid outbound transitions
    expect(
      ALLOWED_STATE_TRANSITIONS.get(BillingEntitlementStatus.CANCELED)?.size
    ).toBe(0);
  });

  it("maps multiple premium endpoints to their features", () => {
    expect(PREMIUM_FEATURE_MATRIX["/api/advanced/game"]).toBeDefined();
    expect(PREMIUM_FEATURE_MATRIX["/api/advanced/game"].feature).toBe(
      "advanced_game_stats"
    );

    expect(PREMIUM_FEATURE_MATRIX["/api/ai/chat"]).toBeDefined();
    expect(PREMIUM_FEATURE_MATRIX["/api/ai/chat"].feature).toBe("ai_chat");

    expect(PREMIUM_FEATURE_MATRIX["/api/season-stats"]).toBeDefined();
    expect(PREMIUM_FEATURE_MATRIX["/api/season-stats"].restrictOn).toContain(
      "canceled"
    );
  });

  it("ensures all premium features restrict on canceled and incomplete", () => {
    for (const [_endpoint, config] of Object.entries(PREMIUM_FEATURE_MATRIX)) {
      expect(config.restrictOn).toContain("canceled");
      expect(config.restrictOn).toContain("incomplete");
    }
  });

  it("includes all required Stripe webhook events for Phase 1", () => {
    const requiredEvents = [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_failed",
      "invoice.payment_succeeded",
    ];

    for (const event of requiredEvents) {
      expect(REQUIRED_WEBHOOK_EVENT_TYPES).toContain(event);
    }
  });

  it("defines entitlement access matrix for all states", () => {
    expect(ENTITLEMENT_ACCESS_MATRIX[BillingEntitlementStatus.ACTIVE]).toBeDefined();
    expect(
      ENTITLEMENT_ACCESS_MATRIX[BillingEntitlementStatus.ACTIVE].allowPremiumFeatures
    ).toBe(true);

    expect(ENTITLEMENT_ACCESS_MATRIX[BillingEntitlementStatus.INCOMPLETE]).toBeDefined();
    expect(
      ENTITLEMENT_ACCESS_MATRIX[BillingEntitlementStatus.INCOMPLETE].allowPremiumFeatures
    ).toBe(false);

    expect(ENTITLEMENT_ACCESS_MATRIX[BillingEntitlementStatus.CANCELED]).toBeDefined();
    expect(
      ENTITLEMENT_ACCESS_MATRIX[BillingEntitlementStatus.CANCELED].allowPremiumFeatures
    ).toBe(false);

    // PAST_DUE allows read-only graceful access
    expect(ENTITLEMENT_ACCESS_MATRIX[BillingEntitlementStatus.PAST_DUE]).toBeDefined();
    expect(
      ENTITLEMENT_ACCESS_MATRIX[BillingEntitlementStatus.PAST_DUE].allowPremiumFeatures
    ).toBe(true);
    expect(
      ENTITLEMENT_ACCESS_MATRIX[BillingEntitlementStatus.PAST_DUE].gracefulDegradation
    ).toBe(true);
  });

  it("configures Stripe Checkout for Phase 1 (subscription mode, no tax)", () => {
    expect(PHASE_1_CHECKOUT_CONFIG.mode).toBe("subscription");
    expect(PHASE_1_CHECKOUT_CONFIG.taxBehavior).toBe("unspecified");
    expect(PHASE_1_CHECKOUT_CONFIG.allowedCustomerUpdateFields).toContain("email");
    expect(PHASE_1_CHECKOUT_CONFIG.allowedCustomerUpdateFields).toContain("name");
  });

  it("includes comprehensive premium feature coverage (19 endpoints)", () => {
    const endpoints = Object.keys(PREMIUM_FEATURE_MATRIX);
    expect(endpoints.length).toBeGreaterThanOrEqual(19);

    // Validate specific feature categories
    const advancedStats = endpoints.filter((ep) => ep.includes("/api/advanced/"));
    expect(advancedStats.length).toBeGreaterThanOrEqual(5);

    const aiFeatures = endpoints.filter((ep) => ep.includes("/api/ai/"));
    expect(aiFeatures.length).toBeGreaterThanOrEqual(5);

    const seasonFeatures = endpoints.filter((ep) => ep.includes("/api/season"));
    expect(seasonFeatures.length).toBeGreaterThanOrEqual(2);
  });

  it("locks current constraints: no trial", () => {
    expect(PHASE_1_VALID_PLAN_CYCLES).toEqual(["monthly", "yearly"]);
    expect(PHASE_1_CHECKOUT_CONFIG.mode).toBe("subscription");
  });
});
