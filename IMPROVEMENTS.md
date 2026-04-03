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
- **Rule 17 — Matchup Exploitation**: When a defender with an active matchup assignment picks up 3+ fouls, emit a defensive switch suggestion naming the specific assignment (priority: important; urgent if near foul-out). Fires on `foul` events only.
- **Rule 18 — Opponent 3PT Streak**: Fires when opponent hits 3 or more of their last 6 three-point attempts. Prompts a defensive adjustment to close out on perimeter shooters.
- **Rule 19 — Fouls to Give**: In Q4/OT with ≤45s remaining, fires once when our team still has fouls available before the bonus threshold. Prompts the bench to intentionally foul to stop the clock.
- **Rule 3 fix — Bonus alert threshold**: Previously re-fired on every event once a team was in the bonus. Now fires exactly once at the moment the fouling team's period tally hits `BONUS_FOUL_THRESHOLD` (5).
- **Rule 10b — Opponent Hot Hand**: When an opponent player is shooting efficiently (3+ of 4+ recent attempts, ≥60%), emits a defensive adjustment prompt naming the player.
- **Rule 20 — Cold Shooter**: When one of our players is 0-for-4 in recent field goal attempts, emits an `info`-priority nudge to reduce their shot volume until they can get an easy look.
- **Rule 21 — Transition Momentum**: When the opponent converts 2+ turnovers/live-ball steals into quick baskets within a 20-event window, emits an alert to tighten transition defense.
- New InsightTypes added: `scoring_drought`, `depth_warning`, `efficiency`, `leverage`, `matchup_exploitation`, `three_point_streak`, `foul_to_give`, `opponent_hot_hand`, `cold_shooter`, `transition_momentum`

### Shared Schema + Game State (packages/shared-schema, packages/game-state)
- **Matchup Tracking Foundation**: Added `matchup_assignment` event contract (`defenderPlayerId` -> `offensivePlayerId`), validation, and deterministic replay support via `activeMatchupsByTeam` in game state.
- **Lineup +/- Tracking**: Added deterministic lineup stint segmentation and aggregate plus/minus utilities (`computeLineupSegments`, `aggregateLineupStats`) with dashboard integration.

### Coach Dashboard (apps/coach-dashboard)
- Labels registered for all 4 new insight types
- `depth_warning` added to the Action Items panel (requires immediate response)
- Live scoreboard now shows **PPP** (points per possession, after ≥5 possessions) and **FT Rate** (FTA/FGA) instead of the less-actionable POSS and SUBS columns
- Insights now show relative age (for example, `2m ago`) using each insight's `createdAtIso`
- Added **Current Matchups** panel to show live defender assignment entries from operator matchup events.
- Added **Lineup +/-** panel showing points-for / points-against and net differential per unit.
- Label registered for `matchup_exploitation` insight type ("Matchup").

### Realtime API (services/realtime-api)
- GPT refresh throttled: every **8 events** (was 3) / **45 seconds** (was 20). Rules engine covers moment-to-moment; GPT reserved for synthesis. Both still env-overridable via `BTA_LIVE_INSIGHT_REFRESH_EVERY_EVENTS` and `BTA_LIVE_INSIGHT_MIN_INTERVAL_MS`.

### iPad Operator (apps/ipad-operator)
- **Shot Zone Capture**: Added zone chips to shot-entry modal so each shot records a real NFHS zone (`rim`, `paint`, `midrange`, `corner_three`, `above_break_three`) instead of hardcoded defaults. Zone options auto-filter by shot value (2PT vs 3PT) and preselect sensible defaults for speed.
- **Foul/Turnover Type Capture**: Stat modal now includes quick subtype chips for fouls (`personal`, `shooting`, `offensive`, `technical`, `flagrant`) and turnovers (`bad_pass`, `traveling`, `double_dribble`, `out_of_bounds`, `offensive_foul`, `steal`, `other`) so events are no longer forced to defaults.
- **Matchup Assignment UI**: Two-step modal flow — tap "match" in the stat grid (or "MTCH" on a roster player) to pick a defender then enter the opponent's jersey number. Posts a `matchup_assignment` event with `defenderPlayerId` and `offensivePlayerId = opp-{jersey}`. Indigo-themed button matches the existing action palette.
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

## Next Priorities — Easy Stats Parity Track (April 2026)

Goal: match Easy Stats' speed and low-friction game-day workflow while preserving BTA's existing AI and multi-device strengths.

### Execution Board

Status legend: `not-started`, `in-progress`, `blocked`, `done`

| Sprint | Status | Owner | Target Date | Work Item | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| Sprint 1 | not-started | unassigned | 2026-04-12 | Logical stat flows by default (made->assist, miss/block->rebound, guided FT sets) | Prompt chains complete without dead-end; no duplicate events on cancel/back |
| Sprint 1 | not-started | unassigned | 2026-04-12 | Two-tap guarantee audit for core stats (2PT/3PT/FT make/miss, foul, turnover, rebound, steal, block, assist) | >=90% of core events are <=2 taps from default live screen |
| Sprint 1 | not-started | unassigned | 2026-04-12 | Recovery UX pass (undo/redo/edit recent/insert missed event surfaced) | Undo/redo/edit/insert reachable in <=2 interactions during live game |
| Sprint 1 | not-started | unassigned | 2026-04-12 | Pilot run with scorekeepers | 1 full game logged with no flow reset or modal trap |
| Sprint 2 | not-started | unassigned | 2026-04-26 | Shot chart MVP (team + player, made/miss plotting, zone coloring) | Chart renders correctly on tablet + phone; no horizontal scroll |
| Sprint 2 | not-started | unassigned | 2026-04-26 | Shot chart filters (game, season subset, player, make/miss, shot type) | Filtered chart totals match filtered box score totals |
| Sprint 2 | not-started | unassigned | 2026-04-26 | Box score public share link (read-only) | Non-auth users can open and view complete game box score |
| Sprint 2 | not-started | unassigned | 2026-04-26 | CSV exports (play-by-play + cumulative box score) | Stable documented CSV columns; both files generated from one share/export path |
| Sprint 2 | not-started | unassigned | 2026-04-26 | Print/PDF report layout for single game | Readable one-page summary including score, period scoring, team stats, player stats |
| Sprint 3 | not-started | unassigned | 2026-05-10 | Minutes surfaced in game, season leaderboard, player detail | Minutes are deterministic from replay and consistent across operator/dashboard |
| Sprint 3 | not-started | unassigned | 2026-05-10 | Head-to-head matchup history for repeat opponents | Coach can select opponent and view aggregate comparisons across selected games |
| Sprint 3 | not-started | unassigned | 2026-05-10 | Lineup context tie-in for minutes and +/- | Minutes and +/- panels cross-link without identity alias duplication |
| Sprint 3 | not-started | unassigned | 2026-05-10 | Packaging/entitlement UX pass (if productized) | Free path completes setup->track->basic share; premium gating is explicit and non-blocking |

### Sprint Checklist

#### Sprint 1 — Input Speed + Recovery
- [ ] Implement logical stat prompt chains for make/miss/FT workflows.
- [ ] Add telemetry counters for tap-depth on core stat actions.
- [ ] Promote edit/insert actions in live feed and keep undo/redo persistent.
- [ ] Run pilot game test and capture friction notes.

#### Sprint 2 — Shot Chart + Share/Export
- [ ] Build shot chart component with team/player modes.
- [ ] Add filter state model shared between game and season contexts.
- [ ] Add public read-only share route for game box scores.
- [ ] Add one-click CSV export bundle (PBP + cumulative).
- [ ] Add print-safe box score report layout.

#### Sprint 3 — Minutes + Matchup History
- [ ] Add deterministic minutes aggregation pipeline to summaries and leaderboards.
- [ ] Build repeat-opponent matchup history view.
- [ ] Link minutes and lineup +/- context in coach dashboard.
- [ ] Add entitlement messaging and upgrade states where needed.

### Guardrails For This Track
- Do not regress deterministic replay semantics in `packages/game-state`.
- Do not make live coaching insights dependent on GPT availability.
- Do not increase game-day latency to ship visual polish.
- Prefer defaults that reduce decision count during live entry.

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
