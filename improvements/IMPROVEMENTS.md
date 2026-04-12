# BTA Courtside — Consolidated Improvements Tracker

Last updated: April 10, 2026.

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
- [x] P0 Harden AI output safety before rendering on coach UI.
  - Source: existing backlog + current AI paths
  - Current gap: length guards and control-char stripping are minimal.
  - Action: add strict response validation and safe rendering policy.

### Reliability / Live Game Safety
- [!] P0 Set DATABASE_URL to durable Postgres (Supabase) for production.
  - Source: DEPLOYMENT.md, HOSTING_SETUP.md
  - Notes: file-backed persistence is dev-only.
  - April 8, 2026 note: database was rebuilt; re-verify connection string, migration state, and persistence after restart before marking complete.
- [ ] P0 Complete and sign off roster sync checklist end-to-end.
  - Source: existing backlog
  - Current gap: no formal full-flow verification for coach<->operator sync.
- [!] P0 Guarantee acknowledged-write durability for live event ingest.
  - Why: avoid acknowledged-event loss if API process crashes after in-memory mutate but before durable write.
  - Change: require durable event persistence (transactional DB write and/or append-only event journal) before returning 201 from ingest.
  - Validation: crash-injection integration test proves zero loss for acknowledged events.
- [x] P0 Add correction concurrency guardrails for event update/delete paths.
  - Why: prevent two-device correction races from producing non-deterministic final state.
  - Change: require expected version/hash precondition on `PUT/DELETE /api/games/:gameId/events/:eventId`; return 409 with current server payload on mismatch.
  - April 10, 2026 progress: implemented `x-event-sequence` precondition support for update/delete, conflict payloads (`code=event_conflict` with current event/state), and client-side header wiring in coach/operator correction flows.
  - April 10, 2026 progress: added realtime-api integration coverage for stale update preconditions returning `event_conflict`, followed by successful deterministic retry with the correct sequence header.
  - Validation (Apr 10, 2026): `npm run test -w @bta/realtime-api -- src/server.test.ts -t "stale update precondition"`.
- [ ] P0 Ship game-time outage recovery flow (operator offline, coach stale view).
  - Why: preserve stat capture and trust during full network/API outage.
  - Change: define explicit degrade/recover runbook and API-supported reconciliation sequence (queue replay + state diff + operator/coach confirmation).
  - April 10, 2026 progress: operator reconnect path now performs server-vs-local queue reconciliation before flush, auto-removes already-synced duplicates, and surfaces conflict warnings while continuing safe non-conflicting event resubmits.
  - April 11, 2026 progress: reconciliation conflicts are now quarantined out of pending queue into local conflict records to prevent repeated auto-sync retries from stalling uploads.
  - Validation: scripted outage drill from Q1 through post-game with successful reconciliation and no duplicate/missing events.

### Operational Readiness
- [!] P0 Validate environment before deploy.
  - Source: DEPLOYMENT.md
  - Required commands:
    - npm run validate:env
    - npm run test -w @bta/realtime-api
    - npm run build
- [x] P0 Implement production structured logging baseline in realtime-api.
  - Why: incident triage is slow with mixed free-form `console.*` output.
  - Change: adopt a structured JSON logger with level control, stable field schema, and environment-based verbosity.
  - April 10, 2026 progress: added `services/realtime-api/src/logger.ts` and switched core server startup/security/http request diagnostics to structured JSON output.
  - April 10, 2026 progress: converted high-volume store/persistence AI and snapshot diagnostics to structured logger events for consistent machine parsing.
  - April 10, 2026 progress: runtime config warnings now emit structured `runtime.config_warning` logs (no direct console warning formatting path in server startup).
  - April 10, 2026 progress: added logger unit coverage for production default level filtering (debug suppressed, info emitted) alongside redaction and error serialization assertions.
  - Validation (Apr 10, 2026): `npm run test -w @bta/realtime-api -- src/logger.test.ts`.
- [x] P0 Add request correlation IDs and propagate across HTTP + Socket.IO.
  - Why: without request IDs, cross-surface failures cannot be traced end-to-end during live games.
  - Change: assign or accept `x-request-id`, attach to request context, and include correlation fields on auth, ingest, correction, and fanout logs.
  - April 10, 2026 progress: HTTP middleware now accepts/generates `x-request-id`, echoes it in responses, logs request lifecycle with requestId, and includes requestId in core security telemetry events.
  - April 10, 2026 progress: socket handshake now captures/generates requestId and emits structured connect/disconnect logs with request correlation context.
  - April 10, 2026 progress: added auth integration regression asserting `socket.connected` logs carry caller-provided requestId correlation context.
  - April 11, 2026 progress: added auth integration regression asserting `socket.disconnected` logs retain caller-correlated requestId context.
  - Validation (Apr 10, 2026): `npm run test -w @bta/realtime-api -- src/server.test.ts -t "request tracing"`.
  - Validation (Apr 10, 2026): `npm run test -w @bta/realtime-api -- src/server.auth.integration.test.ts -t "requestId on HTTP tenant mismatch|requestId on unauthorized socket auth"`.
  - Validation (Apr 11, 2026): `npm run test -w @bta/realtime-api -- src/server.auth.integration.test.ts -t "socket.connected log with correlated requestId|socket.disconnected log with correlated requestId|unauthorized socket auth"`.
- [x] P0 Define and enforce log redaction policy for auth and PII-adjacent fields.
  - Why: production logs must not leak bearer tokens, reset tokens, passwords, or secrets.
  - Change: central redaction map + logger serializer rules for headers/body snapshots.
  - April 10, 2026 progress: logger now applies key-based redaction (`authorization`, `x-api-key`, `password`, `token`, `secret`, `cookie`) before emitting JSON payloads.
  - April 10, 2026 progress: added `services/realtime-api/src/logger.test.ts` coverage verifying nested redaction and Error serialization output.
  - April 10, 2026 progress: added auth integration regression asserting unauthorized socket security logs do not leak raw token/api-key values.
  - April 10, 2026 progress: added auth integration regression asserting HTTP unauthorized security logs do not leak raw Authorization or x-api-key values.
  - Validation (Apr 10, 2026): `npm run test -w @bta/realtime-api -- src/logger.test.ts`.
  - Validation (Apr 10, 2026): `npm run test -w @bta/realtime-api -- src/server.auth.integration.test.ts -t "does not leak HTTP auth credentials|does not leak socket auth credentials"`.
- [x] P0 Document AI rate-limit behavior and degraded mode for coaches.
  - Source: existing backlog
  - Current gap: unclear user-facing behavior when AI is throttled/unavailable.

---

## P1 — High-Value Improvements (Pre-Season)

### UX / Usability (pre-deploy blockers identified Apr 8 2026)
- [x] P0 Add forgot-password / self-service reset flow to coach dashboard login.
  - Result: added `/forgot-password` and `/reset-password` coach routes with form UX and server-backed token reset flow.
  - API: `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/confirm`.
- [x] P0 Add confirm dialog before destructive Remove actions (player, member).
  - Current gap: Remove buttons on Roster and Members pages fire immediately with no confirmation. A fat-finger on a touchscreen deletes a player permanently mid-season.
  - Action: wrap `removePlayer` and `removeMember` calls with a `window.confirm` or the existing `useConfirmDialog` hook already in the iPad operator.
- [x] P0 Add empty-state CTAs throughout stats pages.
  - Current gap: when roster is empty, all stats pages show blank/no-data states with no direction to the user. First-time users get stuck.
  - Action: add "Add players in Settings →" link on Players, Games, and Trends pages when the respective data set is empty.
- [x] P1 Add visible offline/queued indicator on iPad operator.
  - Current gap: `isNetworkOnline` is tracked internally but there is no clear visual banner when the operator is offline mid-game. Operators may double-tap stats thinking events didn't register.
  - Action: render a persistent top banner (e.g. "Offline — X events queued") whenever `isNetworkOnline` is false and the queue is non-empty.
- [x] P1 Add coach-side stat correction UI on the Live dashboard.
  - Current gap: if the operator logs a wrong stat, the coach has no way to correct it from the dashboard. The API has correction endpoints but no correction UI is wired up.
  - Action: add a recent-events correction panel on the Live page with coach "Undo" controls that call the existing event correction endpoint.
- [x] P2 Add session expiry warning banner on coach dashboard.
  - Current gap: the JWT expires silently and the coach is kicked to login with no warning, potentially mid-game.
  - Action: decode the JWT exp claim on load, show an in-app banner ~5 min before expiry with a "Stay signed in" refresh action.
- [x] P2 Add export box score to clipboard / printable view.
  - Current gap: coaches expect to share stats with parents or media after a game; no export path exists.
  - Action: add a "Copy box score" button on Games page that formats a plain-text or CSV summary to the clipboard.
- [x] P2 Player profile eyebrow now shows real team name (fixed Apr 8 2026).
  - Was showing raw school ID slug (e.g. "GAVINO1730 · VARSITY"); now fetches `/api/teams` and displays the actual team name.

### AI Safety, Cost, and UX
- [x] P1 Add configurable per-game AI budget and enforcement.
  - Proposed envs:
    - BTA_OPENAI_MAX_TOKENS_PER_GAME
    - BTA_OPENAI_MAX_COST_PER_GAME_USD
- [x] P1 Add alerting for runaway AI spend.
  - Action: route metrics to push endpoint + thresholds.

### iPad Operator Reliability
- [x] P1 Guard pre-game/queue behavior until school scope is resolved.
  - Source: reliability notes
  - Action: prevent tenant-scoped event flushes before schoolId sync.
- [x] P1 Add local queue integrity checks and safe repair flow.
  - Why: localStorage corruption or partial writes can silently poison pending queue.
  - Change: add queue schema version + checksum + corrupted-queue fallback (backup raw blob, notify operator, force reconcile-from-server path).
  - April 10, 2026 progress: pending queue now persists as versioned+checksummed envelope; corrupted queue payloads are backed up and reset automatically with operator warning.
  - April 10, 2026 progress: expanded malformed-payload coverage for unsupported envelope version and missing `events` shape, asserting queue reset plus raw backup retention for recovery.
  - Validation (Apr 10, 2026): `npm run test -w @bta/ipad-operator -- src/helpers/storage.test.ts`.

### Testing / CI Quality
- [x] P1 Add full E2E scenario coverage:
  - Coach creates/links session
  - Operator syncs by code
  - Operator starts game and submits events
  - Coach receives realtime updates
  - Session persists and reload/replay is deterministic
  - Validation (Apr 10, 2026): `e2e/full-game-logical.spec.ts` covers the full cross-app flow, including persisted events and coach reload verification.
- [x] P1 Add worst-case reliability scenario suite (chaos paths):
  - [x] API restart during high-frequency ingest burst
  - [x] Full offline operator for complete game then reconnect sync
  - [x] Duplicate operator link to same game (conflict handling)
  - [x] Concurrent coach correction while operator continues posting
  - [x] Mid-game token expiry during queue flush/retry
  - Validation: each scenario has deterministic pass/fail assertions for state hash, event count, and sequence continuity.
  - Apr 10, 2026 progress: added `e2e/reliability-api-restart-burst.spec.ts` to simulate restart-style ingest outage during rapid operator posting and assert queued replay plus sequence continuity after recovery; validated with `npx playwright test e2e/reliability-api-restart-burst.spec.ts --project=chromium`.
  - Apr 10, 2026 progress: added `e2e/reliability-duplicate-operator.spec.ts` to assert second-operator link is locked/rejected once a game is already live; validated with `npx playwright test e2e/reliability-duplicate-operator.spec.ts --project=chromium`.
  - Apr 10, 2026 progress: added `e2e/reliability-offline-reconnect.spec.ts` to assert offline operator capture does not persist while disconnected and flushes to API after reconnect; validated with `npx playwright test e2e/reliability-offline-reconnect.spec.ts --project=chromium`.
  - Apr 10, 2026 progress: expanded `e2e/reliability-offline-reconnect.spec.ts` with queued-duplicate reconciliation coverage to assert reconnect/resubmit does not double-ingest when the same queued event already exists on the server.
  - Apr 10, 2026 progress: added `e2e/reliability-concurrent-correction.spec.ts` to assert coach-side event correction can succeed while operator continues posting and sequence continuity/uniqueness remains intact; validated with `npx playwright test e2e/reliability-concurrent-correction.spec.ts --project=chromium`.
  - Apr 10, 2026 progress: added `e2e/reliability-token-expiry-retry.spec.ts` to assert queued event flush can recover from mid-game stale operator token and resume synced posting; validated with `npx playwright test e2e/reliability-token-expiry-retry.spec.ts --project=chromium`.
- [x] P1 Add AI integration failure tests:
  - timeout
  - rate limit
  - malformed model output
- [x] P1 Add iOS-focused interaction checks (Safari/WebKit behavior).
- [~] P1 Add error-handling consistency sweep across coach/operator clients.
  - Why: broad `catch {}` and empty `.catch(() => {})` paths hide root causes during live incidents.
  - Change: replace silent catches in critical network/state hydration flows with categorized handling and safe fallback messaging plus diagnostics.
  - April 10, 2026 progress: added non-sensitive diagnostics for previously silent catches in `useGameHydration`, `useCoachAi`, and `useEventQueue` while preserving existing offline and degraded-mode fallbacks.
  - April 10, 2026 progress: added repository guard script `npm run check:silent-errors` and wired it into `scripts/ci-gate.mjs` (CI enforces by default; local remains report-only unless `BTA_ENFORCE_NO_SILENT_CATCH=1`; CI opt-out via `BTA_ENFORCE_NO_SILENT_CATCH=0`).
  - April 10, 2026 progress: removed remaining empty promise catches in `AiInsightsPage`, `useFeedback`, and `useWakeLock`; current guard baseline reports zero empty catches.
  - April 10, 2026 progress: added focused hook regression tests in `apps/ipad-operator/src/hooks/useWakeLock.test.tsx` and `apps/ipad-operator/src/hooks/useFeedback.test.tsx` to assert cleanup failure diagnostics are logged.
  - Validation: targeted app tests pass after hook updates; extend with focused hook-level tests for error-path assertions.
- [x] P1 Add observability regression tests for error-path diagnostics.
  - Why: telemetry can silently regress even while feature tests pass.
  - Change: add tests for structured error logs, 4xx/5xx request logging, and security metric increments on auth/tenant denials.
  - April 10, 2026 progress: added realtime-api integration tests asserting security warning logs include correlated requestId for both HTTP tenant mismatch and unauthorized socket auth flows.
  - April 10, 2026 progress: added realtime-api integration assertions for structured `http.request` logging on denied 4xx paths and for security metric counter deltas (`unauthorizedHttp`, `requestTenantMismatch`) after explicit auth/tenant denial requests.
  - April 10, 2026 progress: added realtime-api integration coverage for deterministic 5xx diagnostics via test-mode unhandled error path, asserting both structured `request.unhandled_error` context and correlated `http.request` 500 logging.
  - April 10, 2026 progress: added startup regression coverage asserting stable structured startup event message keys (`startup.server_listening`, auth/persistence mode, tenant mode, CORS origins).
  - April 10, 2026 progress: added startup regression assertion for structured `startup.store_initialize_failed` error payload shape, including strict-mode marker and surfaced startup failure message.
  - April 10, 2026 progress: added `services/realtime-api/src/logging-guard.test.ts` to fail CI if core runtime modules reintroduce direct `console.*` logging outside the logger abstraction.
  - Validation (Apr 10, 2026): `npm run test -w @bta/realtime-api -- src/server.auth.integration.test.ts`.
  - Validation (Apr 10, 2026): `npm run test -w @bta/realtime-api -- src/server.auth.integration.test.ts -t "5xx unhandled request paths"`.
  - Validation (Apr 10, 2026): `npm run test -w @bta/realtime-api -- src/server.startup.test.ts`.
  - Validation (Apr 10, 2026): `npm run test -w @bta/realtime-api -- src/logging-guard.test.ts src/server.startup.test.ts`.
  - Validation: CI must fail when expected diagnostic fields or counters are missing.

### Documentation Alignment
- [x] P1 Keep deployment + hosting docs synchronized and non-overlapping.
  - Action: one canonical release checklist; link from all docs.
- [x] P1 Add explicit rollback procedure for AI degradation.
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
- [ ] P2 Add live-game reliability SLOs and paging thresholds.
  - Metrics: pending queue depth, flush lag, ingest conflict rate, reconnect time, persist latency, fanout lag.
  - Action: define game-window alert thresholds and on-call escalation matrix.
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
- Expand current CI e2e gating from optional to always-on in the production promotion pipeline.

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

## Recently Completed

- [x] P0 Added centralized API error boundary + strict startup persistence fail-fast.
  - Files: services/realtime-api/src/server.ts, services/realtime-api/src/store.ts, services/realtime-api/src/server.auth.integration.test.ts, services/realtime-api/src/server.startup.test.ts
  - Detail: realtime API now returns structured JSON errors (`error`, `code`, `requestId`) via a global Express error handler (including malformed JSON requests), and startup now fails immediately when strict persistence initialization is enabled and store init fails.
- [x] P1 Added preproduction support and contact hub pages.
  - Files: apps/coach-dashboard/src/SupportContactPages.tsx, apps/coach-dashboard/src/UnifiedCoachApp.tsx
  - Detail: `/support` and `/contact` now provide usable intake forms and guidance while backend ticket/email integration remains pending.
- [x] P0 Implemented self-service coach password reset flow (request + confirm).
  - Files: services/realtime-api/src/server.ts, services/realtime-api/src/server.auth.integration.test.ts, apps/coach-dashboard/src/ForgotPasswordPage.tsx, apps/coach-dashboard/src/ResetPasswordPage.tsx, apps/coach-dashboard/src/UnifiedCoachApp.tsx
  - Detail: added tokenized reset endpoints (`/api/auth/password-reset/request`, `/api/auth/password-reset/confirm`), wired forgot/reset routes and forms, and added integration test coverage.
- [x] P1 Added authenticated app footer + account completion placeholders.
  - Files: apps/coach-dashboard/src/UnifiedCoachApp.tsx, apps/coach-dashboard/src/AccountPage.tsx, apps/coach-dashboard/src/styles.css
  - Detail: authenticated shell now includes support/contact/billing/terms/privacy footer links; account page now surfaces preproduction placeholders for profile photo, sign-out-all-sessions, and delete-account actions.
- [x] P0 Added optional E2E checks to CI gate script.
  - File: scripts/ci-gate.mjs
  - Detail: `ci-gate` now runs `smoke-test` and `audit:ui` when `BTA_RUN_E2E_GATE=1` or when `CI=true`.
- [x] P1 Improved iPad feedback reliability on app resume/navigation restore.
  - File: apps/ipad-operator/src/hooks/useFeedback.ts
  - Detail: added `visibilitychange` and `pageshow` re-unlock hooks for Web Audio feedback.
- [x] P1 Added clearer coach-facing AI failure states for refresh/chat flows.
  - File: apps/coach-dashboard/src/hooks/useCoachAi.ts
  - Detail: status-specific messaging for rate-limit, service unavailable, and auth/scope failures.
- [x] P1 Added structured AI failure telemetry in realtime API insights flow.
  - Files: services/realtime-api/src/store.ts, services/realtime-api/src/server.ts
  - Detail: tracks AI health state and error codes (rate-limited/timeout/invalid payload/upstream/network), logs degradation context, and returns structured error payloads on forced AI refresh failures.
- [x] P1 Added configurable per-game AI budget enforcement.
  - Files: services/realtime-api/src/store.ts, services/realtime-api/src/store.test.ts, services/realtime-api/src/server.ts, apps/coach-dashboard/src/hooks/useCoachAi.ts, DEPLOYMENT.md, HOSTING_SETUP.md
  - Detail: added token/cost caps (`BTA_OPENAI_MAX_TOKENS_PER_GAME`, `BTA_OPENAI_MAX_COST_PER_GAME_USD`) with per-game usage tracking from OpenAI usage payloads, budget-exceeded health/error signaling (`budget_exceeded`/429), chat budget enforcement, and regression tests for token and cost exhaustion.
- [x] P1 Added AI runaway spend alert telemetry and thresholds.
  - Files: services/realtime-api/src/server.ts, services/realtime-api/src/store.ts, services/realtime-api/src/server.auth.integration.test.ts, DEPLOYMENT.md, HOSTING_SETUP.md
  - Detail: added AI alert counters and Prometheus metrics (`bta_ai_budget_exceeded_total`, threshold-exceeded counters, aggregate token/cost gauges), threshold envs (`BTA_AI_ALERT_TOKENS_THRESHOLD`, `BTA_AI_ALERT_COST_USD_THRESHOLD`), and push scheduling via the existing metrics endpoint flow.
- [x] P1 Published canonical release checklist and AI degradation rollback matrix.
  - Files: RELEASE_CHECKLIST.md, DEPLOYMENT.md, HOSTING_SETUP.md
  - Detail: created a single release source of truth for preflight, rollout verification, and sign-off; linked deployment and hosting runbooks to the checklist; added explicit AI degradation rollback triggers, containment steps, and recovery criteria.
- [x] P1 Added iOS-focused WebKit interaction checks.
  - Files: playwright.config.ts, e2e/ios-webkit.spec.ts, package.json
  - Detail: added a dedicated `ios-webkit` Playwright project and targeted pregame interaction test covering iPad/Safari-relevant input attributes, connection-code sanitization, and start-gating hint behavior; added `npm run test:e2e:ios` script for focused execution.
- [x] P0 Added destructive-action confirmation dialogs on Team Settings removals.
  - File: apps/coach-dashboard/src/TeamSettingsPage.tsx
  - Detail: member removal and roster player removal now require explicit confirm before DELETE actions.
- [x] P0 Added empty-state CTAs on key stats pages.
  - Files: apps/coach-dashboard/src/GamesPage.tsx, apps/coach-dashboard/src/PlayersPage.tsx, apps/coach-dashboard/src/TrendsPage.tsx
  - Detail: when datasets are empty, pages now show an "Add players in Settings" CTA that navigates directly to /stats/settings.
- [x] P1 Added explicit offline queue banner on iPad operator.
  - Files: apps/ipad-operator/src/App.tsx, apps/ipad-operator/src/styles.css
  - Detail: added a persistent top banner when offline with queued events, while preserving reconnect/pending badges for other sync states.
- [x] P2 Added Games-page box score export to clipboard.
  - File: apps/coach-dashboard/src/GamesPage.tsx
  - Detail: Game modal now includes a Copy Box Score action that copies a plain-text summary (game header, team stats, player lines, and coach notes) with clipboard fallback.
- [x] P2 Added coach session expiry warning banner + refresh action.
  - Files: apps/coach-dashboard/src/UnifiedCoachApp.tsx, apps/coach-dashboard/src/platform.ts, apps/coach-dashboard/src/styles.css, services/realtime-api/src/server.ts
  - Detail: dashboard now decodes token exp and warns when <=5 minutes remain; "Stay Signed In" rechecks session and stores refreshed local token from `/api/auth/session`.
- [x] P1 Hardened queue sync UX until school scope is available.
  - File: apps/ipad-operator/src/App.tsx
  - Detail: when queued events exist but school scope is missing, UI now shows a dedicated "waiting for school sync" message and avoids misleading resubmit prompts.
- [x] P0 Hardened AI insight text validation at API boundary.
  - Files: services/realtime-api/src/store.ts, services/realtime-api/src/store.test.ts
  - Detail: added stricter AI insight normalization and prompt-injection/script pattern filtering before coach UI payloads are emitted, with regression tests for unsafe payload rejection.
- [x] P1 Expanded AI failure-mode tests in realtime store.
  - File: services/realtime-api/src/store.test.ts
  - Detail: added explicit assertions for ai status degradation on OpenAI rate-limit (429), malformed JSON payload, and timeout (AbortError), alongside existing force-refresh and safety filtering tests.
- [x] P0 Documented AI degraded-mode and rate-limit behavior in runbooks.
  - Files: DEPLOYMENT.md, HOSTING_SETUP.md
  - Detail: added explicit coach-facing degraded-mode contract, expected HTTP failure semantics, fallback expectations, and staging validation checks.
- [x] P1 Added coach-side live stat correction controls.
  - Files: apps/coach-dashboard/src/GameSessionContext.tsx, apps/coach-dashboard/src/LivePage.tsx, apps/coach-dashboard/src/BoxScoreSection.tsx, apps/coach-dashboard/src/styles.css
  - Detail: Live dashboard now surfaces recent stat events with per-event Undo actions that call `DELETE /api/games/:gameId/events/:eventId`, update session state/insights, and show correction status feedback.
- [x] P0 Started correction concurrency guardrails for event mutations.
  - Files: services/realtime-api/src/store.ts, services/realtime-api/src/server.ts, services/realtime-api/src/store.test.ts, services/realtime-api/src/server.test.ts, apps/coach-dashboard/src/GameSessionContext.tsx, apps/coach-dashboard/src/BoxScoreSection.tsx, apps/ipad-operator/src/hooks/useEventEditor.ts
  - Detail: update/delete mutations now accept `x-event-sequence` preconditions and return structured `event_conflict` payloads on stale edits; coach and operator clients now send expected sequence headers; store and API tests cover stale-precondition rejection and successful retry path.
- [x] P1 Started local queue integrity and safe repair implementation.
  - Files: apps/ipad-operator/src/helpers/storage.ts, apps/ipad-operator/src/hooks/useEventQueue.ts, apps/ipad-operator/src/helpers/storage.test.ts
  - Detail: pending queue persistence now uses versioned/checksummed envelopes; invalid or corrupted payloads are backed up in local storage, queue is reset safely, and the operator receives an inline warning to reconnect/resubmit after setup check.
- [x] P0 Started outage-recovery queue reconciliation on reconnect.
  - Files: apps/ipad-operator/src/hooks/useEventQueue.ts
  - Detail: before flushing pending events, operator now fetches server events and reconciles by event ID to drop already-synced duplicates, flag conflicting payloads, and continue syncing only safe pending events.
- [x] P0 Added conflict quarantine for reconnect reconciliation.
  - Files: apps/ipad-operator/src/helpers/storage.ts, apps/ipad-operator/src/hooks/useEventQueue.ts, apps/ipad-operator/src/helpers/storage.test.ts
  - Detail: conflicting queued events are now removed from auto-sync queue and persisted as local conflict records (`operator-console:<gameId>:pending:conflicts`) so healthy queued events can continue syncing.

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
