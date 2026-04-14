# BTA Courtside — Active Improvements Tracker

Last updated: April 14, 2026.

This tracker is intentionally limited to active work. Completed items were removed to reduce noise and keep execution focused.

## How To Use This File

Status keys:
- [ ] Not started
- [~] In progress
- [!] Blocker / pre-production requirement

Priority keys:
- P0 = must complete before production games
- P1 = should complete before first full season rollout
- P2 = post-launch improvements

## Criticality Discipline

Rules:
- P0 only if all are true: live-game data loss/corruption risk, security/tenant isolation gap, or production outage path with no safe fallback.
- P1 only if it materially reduces pre-season operational risk and has a clear owner/date.
- Every P0/P1 item must include owner, due date, and explicit exit criteria.

WIP limits:
- Max 5 open P0 items.
- Max 12 open P1 items.

---

## P0 — Pre-Production Blockers

### Security / Tenant Isolation
- [!] P0 Enforce explicit production origins and reject wildcard origin misuse.
  - Source: DEPLOYMENT.md, HOSTING_SETUP.md
  - Owner: Platform
  - Due: 2026-04-15
  - Exit criteria: production env has explicit coach/operator origins set; startup rejects wildcard/missing origins; deploy checklist evidence attached.

- [!] P0 Ensure `BTA_REQUIRE_TENANT=1` and `BTA_JWT_WRITE_REQUIRED=1` in production.
  - Source: DEPLOYMENT.md
  - Owner: Platform
  - Due: 2026-04-15
  - Exit criteria: hosted production variables set to `1` and verified by startup logs plus tenant-write auth smoke checks.

### Reliability / Live Game Safety
- [!] P0 Set `DATABASE_URL` to durable Postgres (Supabase) for production.
  - Source: DEPLOYMENT.md, HOSTING_SETUP.md
  - Owner: Platform
  - Due: 2026-04-16
  - Exit criteria: production points to Supabase Postgres, migrations current, and restart test confirms persisted events remain available.

- [!] P0 Guarantee acknowledged-write durability for live event ingest.
  - Why: avoid acknowledged-event loss if API process crashes after in-memory mutate but before durable write.
  - Change: require durable event persistence before returning 201 from ingest.
  - Owner: Realtime API
  - Due: 2026-04-19
  - Exit criteria: ingest only acknowledges after durable write and crash-injection test demonstrates zero acknowledged-event loss.

- [ ] P0 Ship game-time outage recovery flow (operator offline, coach stale view).
  - Why: preserve stat capture and trust during full network/API outage.
  - Change: publish explicit degrade/recover runbook and validated reconciliation sequence (queue replay + state diff + operator/coach confirmation).
  - Owner: Operator Client
  - Due: 2026-04-19
  - Exit criteria: outage runbook published and validated by full-game outage drill with no missing/duplicate events and explicit operator/coach recovery confirmation.

### Operational Readiness
- [!] P1 Validate environment before deploy.
  - Source: DEPLOYMENT.md
  - Required commands:
    - npm run validate:env
    - npm run test -w @bta/realtime-api
    - npm run build
  - Owner: Release
  - Due: 2026-04-15
  - Exit criteria: release pipeline runs required commands as blocking checks and stores passing evidence for promotion.

---

## P1 — High-Value Pre-Season Improvements

### Reliability / QA
- [ ] P1 Complete and sign off roster sync checklist end-to-end.
  - Owner: QA
  - Due: 2026-04-18
  - Exit criteria: checklist completed with evidence for create/link/start/live-update/reload paths and sign-off logged in release checklist.

### Frontend Error Handling Consistency
- [~] P1 Complete error-handling consistency sweep across coach/operator clients.
  - Why: remaining inconsistent error messaging can hide root causes during incidents.
  - Change: finish replacing non-actionable fallbacks with categorized handling, user-safe messaging, and diagnostics in critical flows.
  - Owner: Frontend
  - Due: 2026-05-03
  - Exit criteria: critical app flows use consistent fallback semantics and regression tests cover expected diagnostic behavior.

---

## P2 — Post-Launch Roadmap

### Product and Access Control
- [ ] P2 Role-based access control expansion (owner/coach/operator/analyst granularity).
- [ ] P2 Roster audit log and change history.
- [ ] P2 Per-client API key rotation and scoped credentials.

### Platform Operations
- [ ] P2 Add Prometheus/Grafana dashboards for tenant/auth denials, socket denials, and AI volume/cost/error trends.
- [ ] P2 Add live-game reliability SLOs and paging thresholds (queue depth, flush lag, ingest conflict rate, reconnect time, persist latency, fanout lag).
- [ ] P2 Add automated retention-policy verification in scheduled jobs.

### Performance / Scale
- [ ] P2 Load test ingest + fanout under realistic game bursts.
- [ ] P2 Add cache warming for season analytics endpoints to reduce first-hit latency.

---

## Notes

- Keep this file focused on active work only; remove items immediately after completion.
- Detailed historical completion context should live in changelog/PR history, not this active tracker.
