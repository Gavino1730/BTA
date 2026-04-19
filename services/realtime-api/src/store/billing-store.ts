import type { BillingState, BillingSubscriptionStatus, TenantScope } from "./store-types.js";

interface BillingStoreDependencies {
  resolveSchoolId: (scope?: TenantScope) => string;
  billingBySchool: Map<string, BillingState>;
  processedStripeWebhookEvents: Map<string, string>;
  persistSessions: () => void;
  persistBillingStateForSchool: (schoolId: string, billingState: BillingState | null) => void | Promise<void>;
}

export function createBillingStore(deps: BillingStoreDependencies) {
  const getBillingStateByScope = (scope?: TenantScope): BillingState | null => {
    const schoolId = deps.resolveSchoolId(scope);
    const existing = deps.billingBySchool.get(schoolId);
    return existing ? { ...existing } : null;
  };

  const findBillingStateByStripeCustomerId = (stripeCustomerId: string): BillingState | null => {
    const normalized = String(stripeCustomerId ?? "").trim();
    if (!normalized) {
      return null;
    }

    for (const state of deps.billingBySchool.values()) {
      if (state.stripeCustomerId === normalized) {
        return { ...state };
      }
    }

    return null;
  };

  const findBillingStateByStripeSubscriptionId = (stripeSubscriptionId: string): BillingState | null => {
    const normalized = String(stripeSubscriptionId ?? "").trim();
    if (!normalized) {
      return null;
    }

    for (const state of deps.billingBySchool.values()) {
      if (state.stripeSubscriptionId === normalized) {
        return { ...state };
      }
    }

    return null;
  };

  const ensureTrialBillingState = (scope?: TenantScope, trialDays = 14): BillingState => {
    const schoolId = deps.resolveSchoolId(scope);
    const existing = deps.billingBySchool.get(schoolId);
    if (existing) {
      return { ...existing };
    }

    const now = new Date();
    const normalizedTrialDays = Number.isFinite(trialDays) ? Math.max(0, Math.floor(trialDays)) : 0;
    const hasTrial = normalizedTrialDays > 0;
    const end = new Date(now.getTime());
    end.setUTCDate(end.getUTCDate() + normalizedTrialDays);

    const created: BillingState = {
      schoolId,
      planId: hasTrial ? "trial" : "pro",
      status: hasTrial ? "trialing" : "incomplete",
      includedActiveTeamLimit: 1,
      extraActiveTeamSeats: 0,
      trialStartedAtIso: hasTrial ? now.toISOString() : undefined,
      trialEndsAtIso: hasTrial ? end.toISOString() : undefined,
      createdAtIso: now.toISOString(),
      updatedAtIso: now.toISOString(),
    };

    deps.billingBySchool.set(schoolId, created);
    deps.persistSessions();
    void deps.persistBillingStateForSchool(schoolId, created);
    return { ...created };
  };

  const saveBillingState = (state: Partial<BillingState>, scope?: TenantScope): BillingState => {
    const schoolId = deps.resolveSchoolId(scope);
    const nowIso = new Date().toISOString();
    const existing = deps.billingBySchool.get(schoolId);

    const saved: BillingState = {
      schoolId,
      planId: String(state.planId ?? existing?.planId ?? "trial"),
      status: (state.status ?? existing?.status ?? "trialing") as BillingSubscriptionStatus,
      includedActiveTeamLimit: Number.isFinite(state.includedActiveTeamLimit)
        ? Number(state.includedActiveTeamLimit)
        : existing?.includedActiveTeamLimit ?? 1,
      extraActiveTeamSeats: Number.isFinite(state.extraActiveTeamSeats)
        ? Number(state.extraActiveTeamSeats)
        : existing?.extraActiveTeamSeats ?? 0,
      trialStartedAtIso: state.trialStartedAtIso ?? existing?.trialStartedAtIso,
      trialEndsAtIso: state.trialEndsAtIso ?? existing?.trialEndsAtIso,
      stripeCustomerId: state.stripeCustomerId ?? existing?.stripeCustomerId,
      stripeSubscriptionId: state.stripeSubscriptionId ?? existing?.stripeSubscriptionId,
      currentPeriodEndsAtIso: state.currentPeriodEndsAtIso ?? existing?.currentPeriodEndsAtIso,
      couponCode: state.couponCode === undefined
        ? existing?.couponCode
        : (state.couponCode.trim() || undefined),
      createdAtIso: existing?.createdAtIso ?? state.createdAtIso ?? nowIso,
      updatedAtIso: nowIso,
    };

    deps.billingBySchool.set(schoolId, saved);
    deps.persistSessions();
    void deps.persistBillingStateForSchool(schoolId, saved);
    return { ...saved };
  };

  const hasProcessedStripeWebhookEvent = (eventId: string): boolean => {
    const normalized = String(eventId ?? "").trim();
    if (!normalized) {
      return false;
    }

    return deps.processedStripeWebhookEvents.has(normalized);
  };

  const markProcessedStripeWebhookEvent = (eventId: string): void => {
    const normalized = String(eventId ?? "").trim();
    if (!normalized) {
      return;
    }

    deps.processedStripeWebhookEvents.set(normalized, new Date().toISOString());
    deps.persistSessions();
  };

  const trimProcessedStripeWebhookEvents = (maxEntries = 10_000): void => {
    const normalizedMax = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 10_000;
    if (deps.processedStripeWebhookEvents.size <= normalizedMax) {
      return;
    }

    const entries = [...deps.processedStripeWebhookEvents.entries()]
      .sort(([, leftProcessedAt], [, rightProcessedAt]) => Date.parse(leftProcessedAt) - Date.parse(rightProcessedAt));
    const toDeleteCount = entries.length - normalizedMax;
    for (let index = 0; index < toDeleteCount; index += 1) {
      const [eventId] = entries[index];
      deps.processedStripeWebhookEvents.delete(eventId);
    }
    deps.persistSessions();
  };

  return {
    getBillingStateByScope,
    findBillingStateByStripeCustomerId,
    findBillingStateByStripeSubscriptionId,
    ensureTrialBillingState,
    saveBillingState,
    hasProcessedStripeWebhookEvent,
    markProcessedStripeWebhookEvent,
    trimProcessedStripeWebhookEvents,
  };
}
