# BTA Platform — Consolidated Improvements Tracker

Last updated: April 8, 2026.

This file is the consolidated backlog for platform improvements across:
- Existing backlog notes
- Deployment/hosting runbooks
- Reliability notes from prior investigations
- Newly identified future enhancements

## How To Use This File

Status keys:
- [ ] Not started
- [~] In progress
- [x] Completed
- [!] Blocker / pre-production requirement

Priority keys:
- P0 = must complete before production games
- P1 = should complete before first full season rollout
- P2 = post-launch improvements

---

## P0 — Pre-Production Blockers

### Security / Tenant Isolation
- [!] P0 Enforce explicit production origins and reject wildcard origin misuse.
  - Source: DEPLOYMENT.md, HOSTING_SETUP.md
  - Notes: Keep ALLOWED_ORIGINS explicit for coach/operator domains.
- [!] P0 Ensure BTA_REQUIRE_TENANT=1 and BTA_JWT_WRITE_REQUIRED=1 in production.
  - Source: DEPLOYMENT.md
- [ ] P0 Harden AI output safety before rendering on coach UI.
  - Source: existing backlog + current AI paths
  - Current gap: length guards and control-char stripping are minimal.
  - Action: add strict response validation and safe rendering policy.

### Reliability / Live Game Safety
- [!] P0 Set DATABASE_URL to durable Postgres (Supabase) for production.
  - Source: DEPLOYMENT.md, HOSTING_SETUP.md
  - Notes: file-backed persistence is dev-only.
- [ ] P0 Integrate end-to-end checks into CI/release gate.
  - Source: existing backlog + ci-gate/smoke/ui-audit scripts
  - Current gap: smoke-test and ui-audit are manual-only.
  - Action: run smoke + UI audit in staging/promotion pipeline.
- [ ] P0 Complete and sign off roster sync checklist end-to-end.
  - Source: existing backlog
  - Current gap: no formal full-flow verification for coach<->operator sync.

### Operational Readiness
- [!] P0 Validate environment before deploy.
  - Source: DEPLOYMENT.md
  - Required commands:
    - npm run validate:env
    - npm run test -w @bta/realtime-api
    - npm run build
- [ ] P0 Document AI rate-limit behavior and degraded mode for coaches.
  - Source: existing backlog
  - Current gap: unclear user-facing behavior when AI is throttled/unavailable.

---

## P1 — High-Value Improvements (Pre-Season)

### AI Safety, Cost, and UX
- [ ] P1 Add structured AI failure telemetry (429/timeouts/parse failures).
  - Action: emit counters and logs with clear error codes.
- [ ] P1 Add coach-visible AI status states.
  - Action: show "AI temporarily unavailable" instead of silent empty state.
- [ ] P1 Add configurable per-game AI budget and enforcement.
  - Proposed envs:
    - BTA_OPENAI_MAX_TOKENS_PER_GAME
    - BTA_OPENAI_MAX_COST_PER_GAME_USD
- [ ] P1 Add alerting for runaway AI spend.
  - Action: route metrics to push endpoint + thresholds.

### iPad Operator Reliability
- [ ] P1 Improve iOS audio/haptic re-unlock on app resume/background transitions.
  - Source: existing backlog
  - Action: re-prime AudioContext on visibility restore and action fallback.
- [ ] P1 Guard pre-game/queue behavior until school scope is resolved.
  - Source: reliability notes
  - Action: prevent tenant-scoped event flushes before schoolId sync.

### Testing / CI Quality
- [ ] P1 Add full E2E scenario coverage:
  - Coach creates/links session
  - Operator syncs by code
  - Operator starts game and submits events
  - Coach receives realtime updates
  - Session persists and reload/replay is deterministic
- [ ] P1 Add AI integration failure tests:
  - timeout
  - rate limit
  - malformed model output
- [ ] P1 Add iOS-focused interaction checks (Safari/WebKit behavior).

### Documentation Alignment
- [ ] P1 Keep deployment + hosting docs synchronized and non-overlapping.
  - Action: one canonical release checklist; link from all docs.
- [ ] P1 Add explicit rollback procedure for AI degradation.
  - Action: rules engine remains authoritative if AI fails.

---

## P2 — Post-Launch Roadmap

### Product and Access Control
- [ ] P2 Role-based access control expansion (owner/coach/operator/analyst granularity).
- [ ] P2 Roster audit log and change history.
- [ ] P2 Per-client API key rotation and scoped credentials.

### Platform Operations
- [ ] P2 Prometheus/Grafana dashboards for:
  - tenant/auth denials
  - socket auth denials
  - missing-tenant rejections
  - AI request volume/cost/error-rate
- [ ] P2 Add automated retention-policy verification in scheduled jobs.

### Performance / Scale
- [ ] P2 Load test ingest + fanout under realistic game bursts.
- [ ] P2 Add cache warming for season analytics endpoints to reduce first-hit latency.

---

## Confirmed Existing Strengths (Do Not Regress)

- Deterministic game-state replay remains a hard requirement.
- Shared schema remains source of truth for event contracts.
- No direct app-to-app imports (share through packages/*).
- Runtime config validation exists and should stay mandatory in production.
- Strong API test coverage already exists in realtime-api tests.

---

## Consolidated Action Plan (Suggested Execution Order)

1. P0 CI/release gate hardening
- Wire smoke-test and UI audit into gated staging/release workflow.

2. P0 Production safety completion
- Confirm tenant/auth envs, ALLOWED_ORIGINS, and Postgres durability in hosted env.

3. P0/P1 AI resilience pass
- Add model output validation + user-visible degraded-state handling.
- Add metrics and cost/rate-limit observability.

4. P1 Operator reliability pass
- Improve iOS feedback unlock resilience.
- Enforce school-scope guardrails in pregame/queue transitions.

5. P1 E2E confidence expansion
- Build one full cross-app E2E happy path + failure-path coverage.

6. P1 Docs stabilization
- Publish one canonical release checklist and rollback matrix.

---

## Source Index Used For Consolidation

- IMPROVEMENTS.md (root)
- DEPLOYMENT.md
- HOSTING_SETUP.md
- .github/copilot-instructions.md
- /memories/repo/reliability-notes.md
- scripts/ci-gate.mjs
- scripts/smoke-test.ps1
- scripts/ui-audit.mjs
- services/realtime-api/src/store.ts
- services/realtime-api/src/server.ts
- apps/ipad-operator/src/hooks/useFeedback.ts
- apps/ipad-operator/src/PreGameScreen.tsx
- apps/coach-dashboard/src/InsightsPanel.tsx

---

## Future Improvement Intake (Template)

Use this block for new items:

- [ ] PX <title>
  - Area: <Security|Reliability|UX|Testing|Ops|Docs>
  - Why: <risk or value>
  - Change: <specific action>
  - Owner: <team/person>
  - ETA: <date or sprint>
  - Validation: <test/monitoring proof>
