# BTA Platform — Improvements Backlog

Consolidated from product audit, AI-assisted analysis, and implementation sessions.
Last updated: April 2, 2026.

---

## ✅ Done

### Rules Engine (services/insight-engine)
- **Rule 11 — Scoring Drought**: Alert after 6 consecutive missed field goals (priority: important)
- **Rule 12 — Depth Warning**: Alert when 2+ active players simultaneously have 3+ fouls (priority: important)
- **Rule 13 — PPP Efficiency Gap**: Alert when opponent PPP exceeds ours by ≥0.25 after both teams have ≥15 possessions (priority: important)
- **Rule 14 — Period-End Urgency**: Alert once when clock enters ≤18s window in Q1/Q2/Q3 (priority: info)
- **Rule 15 — Opponent FT Bombardment**: Alert when opponent draws 6+ FT trips in recent 10 events (priority: important)
- **Rule 16 — Timeout Budget Awareness**: In Q4/OT, when our timeout count drops below 2 and game is within reach, emit a timeout conservation alert (priority: important)
- **Rule 18 — Opponent 3PT Streak**: Fires when opponent hits 3 or more of their last 6 three-point attempts. Prompts a defensive adjustment to close out on perimeter shooters.
- **Rule 19 — Fouls to Give**: In Q4/OT with ≤45s remaining, fires once when our team still has fouls available before the bonus threshold. Prompts the bench to intentionally foul to stop the clock.
- **Rule 3 fix — Bonus alert threshold**: Previously re-fired on every event once a team was in the bonus. Now fires exactly once at the moment the fouling team's period tally hits `BONUS_FOUL_THRESHOLD` (5).
- **Rule 10b — Opponent Hot Hand**: When an opponent player is shooting efficiently (3+ of 4+ recent attempts, ≥60%), emits a defensive adjustment prompt naming the player.
- **Rule 20 — Cold Shooter**: When one of our players is 0-for-4 in recent field goal attempts, emits an `info`-priority nudge to reduce their shot volume until they can get an easy look.
- **Rule 21 — Transition Momentum**: When the opponent converts 2+ turnovers/live-ball steals into quick baskets within a 20-event window, emits an alert to tighten transition defense.
- New InsightTypes added: `scoring_drought`, `depth_warning`, `efficiency`, `leverage`, `three_point_streak`, `foul_to_give`, `opponent_hot_hand`, `cold_shooter`, `transition_momentum`

### Shared Schema + Game State (packages/shared-schema, packages/game-state)
- **Lineup +/- Tracking**: Added deterministic lineup stint segmentation and aggregate plus/minus utilities (`computeLineupSegments`, `aggregateLineupStats`) with dashboard integration.

### Coach Dashboard (apps/coach-dashboard)
- Labels registered for all 4 new insight types
- `depth_warning` added to the Action Items panel (requires immediate response)
- Live scoreboard now shows **PPP** (points per possession, after ≥5 possessions) and **FT Rate** (FTA/FGA) instead of the less-actionable POSS and SUBS columns
- Insights now show relative age (for example, `2m ago`) using each insight's `createdAtIso`
- Added **Lineup +/-** panel showing points-for / points-against and net differential per unit.

### Realtime API (services/realtime-api)
- GPT refresh throttled: every **8 events** (was 3) / **45 seconds** (was 20). Rules engine covers moment-to-moment; GPT reserved for synthesis. Both still env-overridable via `BTA_LIVE_INSIGHT_REFRESH_EVERY_EVENTS` and `BTA_LIVE_INSIGHT_MIN_INTERVAL_MS`.

### Reliability Hardening (services/realtime-api, packages/game-state, scripts)
- **`startServer()` dynamic port**: Signature changed from `(): Promise<void>` to `(overridePort?: number): Promise<number>`. Port/host moved inside the function body (no longer module-level). Passing `0` lets the OS assign an ephemeral port, eliminating `EADDRINUSE` conflicts when the dev server is running. Returns the actual bound port.
- **`server.test.ts` isolated ports**: All 28 server integration tests previously skipped due to `EADDRINUSE` on port 4000. Test suite now calls `startServer(0)` in `beforeAll`, captures the returned port, and dynamically sets `API_BASE` — tests reliably pass alongside a running dev server.
- **`/health` endpoint enriched**: Response now includes `uptime` (seconds), `persistence` (`"postgres"` or `"file"`), and `auth` flags (`apiKey`, `jwt`) so load balancers and monitoring tools can distinguish configuration states.
- **`eFG% test coverage`**: `state.test.ts` now asserts `fgMade3`/`fgAttempts3` are populated separately from 2PT makes, and validates the eFG% formula `(FGM + 0.5 × 3PM) / FGA`.
- **Correction-determinism test**: Verifies that deleting an event and re-applying a corrected version produces the exact same state as a fresh replay with the corrected event — the core guarantee of the replay model.
- **Golden fixture (20-event game stream)**: Full-coverage determinism test spanning shots, fouls, FTs, rebounds, subs, turnovers, and period transitions. Replays twice and asserts byte-identical state including score, stats, lineups, fouls, bonus.
- **Lineup +/- test coverage**: `computeLineupSegments` and `aggregateLineupStats` now have explicit tests that verify per-unit `pointsFor`, `pointsAgainst`, and `plusMinus` across a substitution boundary, and that `aggregateLineupStats` sorts best unit first.
- **`scripts/ci-gate.mjs`**: New script that chains `npm run build` + `npm run test`, exits non-zero on any failure — suitable as a pre-push or CI pipeline entrypoint.

### iPad Operator (apps/ipad-operator)
- **Shot Zone Capture**: Added zone chips to shot-entry modal so each shot records a real NFHS zone (`rim`, `paint`, `midrange`, `corner_three`, `above_break_three`) instead of hardcoded defaults. Zone options auto-filter by shot value (2PT vs 3PT) and preselect sensible defaults for speed.
- **Foul/Turnover Type Capture**: Stat modal now includes quick subtype chips for fouls (`personal`, `shooting`, `offensive`, `technical`, `flagrant`) and turnovers (`bad_pass`, `traveling`, `double_dribble`, `out_of_bounds`, `offensive_foul`, `steal`, `other`) so events are no longer forced to defaults.
- **Periodic offline flush**: every 15s during a live game, if `navigator.onLine` and pending events exist, retries the queue. Fixes iOS/mobile case where the native `online` event never fires after reconnect.
- **Instant undo**: removed confirmation dialog — `undoLast()` removes the last event immediately with haptic feedback and a toast. No friction under pressure.
- **MAKE/MISS split buttons**: left panel has 6 dedicated shot buttons (MAKE 2 / MISS 2, MAKE 3 / MISS 3, FT MAKE / FT MISS) — 2 taps to log any shot outcome without a modal toggle.
- **Semantic color coding**: shot buttons are green (make), red (miss), blue (3PT make), amber (3PT miss) — outcome colors for faster muscle memory.
- **FOUL and TURNOVER promoted**: moved to top of right stat grid; foul is amber, turnover is red. Both visually distinct from neutral stats.
- **UNDO button pending-event badge**: orange pill badge on the Undo nav button shows exact count of unsynced events (`pendingEvents.length`). Operator always knows their queue depth at a glance. (`apps/ipad-operator/src/App.tsx`, `styles.css`)
- **Live eFG% on scoreboard**: added `fgMade3`/`fgAttempts3` to `TeamShootingStats` in `game-state`; populated in `shot_attempt` handler when `event.points === 3`; coach dashboard scoreboard now shows eFG% cell `(FGM + 0.5×3PM) / FGA` alongside 3PT breakdown.
- **GPT output validation**: length guard (10–300 chars) discards malformed/bloated GPT messages; all AI coaching insights prefixed with `[AI]` so coaches can distinguish model-generated advice from rules-engine alerts.
- **Optimistic Local State**: `postEvent` adds events to `pendingEvents` immediately on tap; display state (scores, feed) derives from both `submittedEvents` and `pendingEvents` so UI updates instantly without waiting for the server round-trip.
- **Smarter Run Detection (Rule 7)**: Replaced "last 10 events" sliding window with `computeUninterruptedRun` — walks backwards through scoring events counting consecutive unanswered points. Alerts are now "opponent 8-0 run (started Q2) — call timeout" and "we're on a 10-0 run — keep the pressure on."
- **Clutch Rule Entry Guard (Rule 5)**: Alert fires only once when clock first crosses below 120s in Q4/OT, not on every subsequent event in the window.
- **Sub Suggestion Intelligence (Rule 9)**: When bench is empty and a player has 4 fouls (not fouled out), suggests a timeout for scheme adjustment instead of an impossible sub.
- **Possession Inference (Rule 13 + scoreboard)**: Rule 13 and the coach dashboard PPP column both fall back to inferred possessions (FGA + turnovers) when no explicit `possession_start` events exist.
- **Historical Context TTL at Period Transitions**: `refreshGameAiInsights` and `requestAiChatResponse` force a historical context refresh on `period_transition` events in addition to the time-based TTL.

---

## Architecture Observations (Don't Change Without Discussion)

- **Don't add direct app-to-app imports.** All shared logic goes through `packages/*`. Currently clean — keep it that way.
- **Game state must stay deterministic.** `replayEvents` must produce identical output given identical input. No Date.now() or randomness in `applyEvent`.
- **GPT is additive, not authoritative.** Rules engine output always shows; GPT is a layer on top. If GPT fails, the rules engine fallback handles it cleanly. Never make the coach view dependent on a GPT response.
- **File-backed persistence is dev-only.** `services/realtime-api/.platform-data` is fine locally. Production requires `DATABASE_URL` for Postgres.
- **Vite ports are strict**: operator on 5174, dashboard on 5173. Both fail if occupied.

---

## Code Audit — Cleanup (April 2, 2026)

Found during static analysis pass. All items resolved.

### ✅ Fixed
- **`getRosterTeams()`** in `services/realtime-api/src/store.ts` — dead export removed; only `getRosterTeamsByScope()` remains.
- **`SCHOOL_ID`** constant in `apps/coach-dashboard/src/platform.ts` — unused export removed.
- **`apps/coach-dashboard/src/App.tsx`** — removed stale imports of `formatBonusIndicator`, `formatDashboardClock`, `formatDashboardEventMeta`; then removed those dead helpers from `display.ts` and simplified `display.test.ts` to only cover the remaining live helper (`formatFoulTroubleLabel`).
- **`isLocalNetworkHost` cross-app duplication** — consolidated into `@bta/shared-schema` (`packages/shared-schema/src/validators.ts`) and now consumed by both `coach-dashboard/src/platform.ts` and `ipad-operator/src/roster-sync.ts` / `App.tsx`.
- **`RosterPlayer` / `RosterTeam` interfaces** — local definitions removed from `services/realtime-api/src/store.ts`; both now imported from `@bta/shared-schema` (canonical source) and re-exported so downstream imports are unchanged.
- **`apps/ipad-operator/src/App.tsx`** — removed six unused imports from `roster-sync.ts` (team/player CRUD helpers were imported but never invoked).
- **`services/insight-engine/src/config.ts`** — deleted orphaned module (unused thresholds/helpers with zero imports across the workspace).
- **`normalizeSchoolId` in realtime-api** — deduplicated into shared internal helper `services/realtime-api/src/school-id.ts` and consumed by both `store.ts` and `persistence.ts`.
- **`apiKeyHeader` vs `buildHeaders` in iPad operator** — consolidated into shared `buildAuthHeaders` in `apps/ipad-operator/src/roster-sync.ts`; behavior preserved via options (`allowBearerToken` for app requests, x-api-key-only for roster-sync requests).

### Deferred / Won't Fix
- None.

---

## Production Readiness Audit (April 7, 2026)

### Strengths
- Deterministic replay engine in `packages/game-state` — corrections are safe without state corruption.
- Rules engine is independent of AI — if OpenAI is down, coaches still get real-time alerts.
- Multi-org tenant scoping with proper JWT + API key paths.
- Offline event queue with periodic flush on iPad operator — correct approach for a gym environment.
- Extensive refactoring completed with test suite green throughout.

---

### Known Flaws

#### Security
1. **`LOCAL_AUTH_SECRET` falls back to `BTA_API_KEY`** (`services/realtime-api/src/auth.ts`). One credential compromise widens to both auth paths. Use a dedicated `BTA_LOCAL_AUTH_SECRET` in production.
2. **No rate limiting** on `/api/auth/login` or `/api/events` — brute force and ingest flooding are unconstrained.
3. **AI output safety filtering is minimal** — the 10–300 char length guard doesn't catch prompt injection in GPT responses displayed to coaches.
4. **No security headers** (HSTS, CSP, etc.) enforced at the app layer — relies entirely on Railway's platform proxy.

#### Architecture
5. **iPad operator `App.tsx` is still ~3958 lines.** The `renderModal()` block (~1000 lines) is the biggest remaining risk — modal bugs are hard to trace in a 4k-line file during a live game.
6. **Roster sync testing checklist is entirely unchecked.** Cross-platform sync flow has never been formally verified end-to-end.
7. **No service worker** despite `manifest.json` existing in both apps. True offline asset caching on iPad requires a SW; the current offline story covers event queuing only, not app-shell loading without connectivity.

#### Operations
8. **File-backed persistence is the default** — app boots and operates without `DATABASE_URL`, making it easy to accidentally deploy without Postgres.
9. **`ci-gate.mjs` skips `validate:env`** — misconfiguration passes CI and is only caught at Railway startup.
10. **No E2E tests in CI** — smoke test and UI audit both require all services running and aren't chained into the gate script.
11. **No OpenAI budget cap or cost alerting** — throttling (8 events / 45s) is in place but there's no documented behavior when the rate limit is hit mid-game, and no alerting on runaway cost.

#### UX / Reliability
12. **Lineup sync failure is silent** — `useLineupSync` keeps last known state on network failure but the operator has no specific indicator that lineup sync has failed vs. the general connection issue.
13. **iOS Web Audio gesture unlock reliability** — if the AudioContext unlock isn't handled on every iOS browser resume, haptic/audio feedback silently fails and the operator loses confirmation cues under pressure.

---

### Pre-Production Blocklist (do not deploy without these)

| # | What | Why |
|---|------|-----|
| 1 | Set `DATABASE_URL` (Supabase) in Railway | File-backed data lost on dyno restart |
| 2 | Use a dedicated `BTA_LOCAL_AUTH_SECRET` separate from `BTA_API_KEY` | One key compromise shouldn't widen auth surface |
| 3 | Add rate limiting to `/api/auth/login` and `/api/events` | OWASP A05 — no brute force protection currently |
| 4 | Set `ALLOWED_ORIGINS` explicitly | Default CORS is too permissive |
| 5 | Set `BTA_REQUIRE_TENANT=1` and `BTA_JWT_WRITE_REQUIRED=1` | Multi-org data isolation won't be enforced without these |
| 6 | Run and pass the roster sync checklist | Cross-platform sync flow has never been formally verified |
| 7 | Add `validate:env` to `ci-gate.mjs` | Catch misconfiguration before deployment, not after |

### High Priority (should be done before first real game)
- Extract `renderModal()` from iPad operator `App.tsx` before a live-game bug is buried in 4k lines.
- Add a service worker for offline asset caching — the event queue is there; the app shell isn't.
- Wire smoke test / UI audit into a staging CI step rather than manual-only.
- Document and test OpenAI rate limit behavior — coaches need to know if `[AI]` insights will go dark mid-game.

### Lower Priority (post-launch)
- Role-based access control (owner / coach / operator).
- Roster audit log.
- Per-client API key rotation.
- Prometheus push target + alerting rules for security metrics.
