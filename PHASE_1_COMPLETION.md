# Stripe Checkout Rebuild - Phase 1 Completion & Roadmap

## Phase 1: Baseline and Contract Lock ✅ COMPLETE

**Delivered:**
- billing-constants.ts: Canonical Phase 1 baseline at completion time (monthly-only, no trial, hosted Checkout)
- BillingEntitlementStatus enum with 4-state lifecycle
- ALLOWED_STATE_TRANSITIONS: Deterministic state machine
- PREMIUM_FEATURE_MATRIX: 19 API endpoints mapped to paywall requirements
- REQUIRED_WEBHOOK_EVENT_TYPES: Phase 1 webhook taxonomy
- PHASE_1_CHECKOUT_CONFIG: Stripe session defaults
- config-validation.ts: Enforced monthly-only requirement at Phase 1 completion time
- server.ts: Integrated billing constants with Stripe mode initialization
- billing-constants.test.ts: 10 validation tests confirming scope lock

**Test Results:**
- 180 tests passing (170 existing + 10 new)
- Zero regressions
- TypeScript compilation clean

**Status:** Ready for Phase 2

---

## Phase 2: Checkout Entrypoint and Branded Hosted Experience

**IMPLEMENTATION DETAIL: Checkout Consolidation**

Two separate endpoints must be consolidated into one unified handler:
1. `POST /api/billing/checkout-session` (coach-billing) - authenticated, profile-driven
2. `POST /api/billing/bootstrap-checkout-session` (marketing-bootstrap) - public, input-driven

**Reference Implementation:**
- See `services/realtime-api/src/billing-checkout-consolidation-reference.ts` for complete `handleUnifiedCheckout` function
- Function consolidates 100+ lines of duplicated logic
- Both endpoints delegate through flow parameter: "coach-billing" | "marketing-bootstrap"
- Phase 1 constants and state machine are already integrated

**Steps to Complete Phase 2:**
1. Copy `handleUnifiedCheckout` function from reference file into server.ts (after `createSubscriptionCheckoutSession`)
2. Replace coach endpoint body with one-liner: `await handleUnifiedCheckout({ req, res, flow: "coach-billing", payload: (req.body ?? {}) as Record<string, unknown> });`
3. Replace bootstrap endpoint body with one-liner: `await handleUnifiedCheckout({ req, res, flow: "marketing-bootstrap", payload: (req.body ?? {}) as Record<string, unknown> });`
4. Verify: `npm run build && npm run test`
5. Delete `billing-checkout-consolidation-reference.ts` after implementation

**Flow-Specific Logic Handled:**
- Coach: Reads schoolId from request context, profile from DB, applies coupon discounts
- Bootstrap: Extracts schoolId from email/school name, creates profile if missing, no coupon handling
- Common: Trial state initialization, Stripe customer creation, checkout session generation

**Post-Implementation Tasks:**
- Update `apps/coach-dashboard/src/platform.ts` billing API client if needed
- Review `apps/marketing-site/src/app/pricing/pricing-client.tsx` for parity with consolidated endpoint
- Update `apps/marketing-site/src/app/get-started/start-client.tsx` to use unified flow

**Blockers:** None - Phase 1 complete

---

## Phase 3: Webhook Hardening and Deterministic Billing Sync

**Objectives:**
- Expand webhook handling for payment failure and invoice lifecycle
- Replace volatile-only dedupe with durable event ID persistence
- Implement idempotent, replay-safe billing state updates

**Key Files to Touch:**
- services/realtime-api/src/server.ts - webhook handlers
- services/realtime-api/src/store.ts - durable dedupe persistence
- Add webhook replay test (send same Stripe event ID twice, assert single mutation)

**Blockers:** None - Phase 1 complete

---

## Phase 4: Entitlement and Paywall Enforcement

**Objectives:**
- Wire entitlement checks to enforce premium feature access consistently
- Update billing UX messaging for all states (active, past_due, canceled, incomplete)
- Keep Stripe Customer Portal as account management surface

**Key Files to Touch:**
- apps/coach-dashboard/src/RouteShellPages.tsx - paywall/messaging for each state
- apps/coach-dashboard/src/platform.ts - entitlement check on premium routes
- Add payment failure transition test
- Add comprehensive entitlement gating test

**Blockers:** Phase 3 webhook hardening must be complete

---

## Phase 5: Migration and Rollout Safety

**Objectives:**
- Add migration logic for existing billing records to Phase 1 semantics
- Add feature flag rollout controls and fallback path
- Define cutover checklist (test mode validation, webhook switch, key verification)

**Key Files to Touch:**
- services/realtime-api/src/ - migration helpers for existing subscriptions
- services/realtime-api/src/config-validation.ts - feature flag validation

**Blockers:** Phases 2-4 must be complete

---

## Phase 6: Verification

**Objectives:**
- Extend automated tests for checkout, webhook idempotency, payment-failed transitions, entitlement gating
- Run targeted workspace tests + repo smoke checks
- Manual E2E billing journey in Stripe test mode

**Key Tests to Add:**
- Webhook replay idempotency test
- Payment failure → past_due transition
- Entitlement gating on premium routes
- Bootstrap checkout → success → entitlement unlock
- Payment failure → past_due → recovery via portal

**Checklist:**
- workspace tests pass (realtime-api, coach-dashboard, shared-schema)
- npm run smoke-test passes
- Manual E2E in Stripe test mode validated
- Production env: keys/secrets verified, no secrets in logs, webhook signing secret present

**Blockers:** Phases 2-5 must be complete

---

## Immediate Next Steps

1. **Phase 2 Kickoff** - Consolidate checkout entrypoint:
   - Audit current checkout handlers in server.ts
   - Define unified checkout request/response contract
   - Create bootstrap and authenticated pathways

2. **Parallel: Phase 3 Webhook Work** - Start webhook hardening:
   - Expand webhook event coverage
   - Implement durable dedupe in store layer
   - Add replay safety tests

3. **Keep Phase 1 Locked** - Do not make changes to:
   - billing-constants.ts scope definition
   - entitlement state machine
   - premium feature matrix

---

## Reference: Current Architecture

- **Source of Truth:** Phase 1 scope in billing-constants.ts
- **Entitlement Computation:** server.ts buildBillingEntitlement()
- **Paywall Enforcement:** Currently per-endpoint guards in server.ts (to be consolidated in Phase 4)
- **Webhook Handling:** server.ts POST /api/webhooks/stripe (to be hardened in Phase 3)
- **Stripe Config (Phase 1 baseline):** Monthly-only via BTA_STRIPE_PRICE_ID_MONTHLY (enforced in config-validation.ts at that time)

---

## Sign-Off

Phase 1 baseline and contract lock is production-ready. All constraint layers in place. Ready to proceed with Phase 2 checkout consolidation.

**Approval:** Phase 1 complete ✅
**Next Phase:** Phase 2 - Checkout Entrypoint Consolidation
