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

### Operational Readiness
- [!] P0 Validate environment before deploy.
  - Source: DEPLOYMENT.md
  - Required commands:
    - npm run validate:env
    - npm run test -w @bta/realtime-api
    - npm run build
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
- [ ] P1 Add configurable per-game AI budget and enforcement.
  - Proposed envs:
    - BTA_OPENAI_MAX_TOKENS_PER_GAME
    - BTA_OPENAI_MAX_COST_PER_GAME_USD
- [ ] P1 Add alerting for runaway AI spend.
  - Action: route metrics to push endpoint + thresholds.

### iPad Operator Reliability
- [x] P1 Guard pre-game/queue behavior until school scope is resolved.
  - Source: reliability notes
  - Action: prevent tenant-scoped event flushes before schoolId sync.

### Testing / CI Quality
- [ ] P1 Add full E2E scenario coverage:
  - Coach creates/links session
  - Operator syncs by code
  - Operator starts game and submits events
  - Coach receives realtime updates
  - Session persists and reload/replay is deterministic
- [x] P1 Add AI integration failure tests:
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
