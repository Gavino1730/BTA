# BTA Platform — Improvements Backlog

Consolidated from product audit, AI-assisted analysis, and implementation sessions.
Last updated: April 2, 2026 (session 3 — offline queue hardening + lineup unit tracking).

---

## Strategic Context (from product audit, April 2 2026)

**Core thesis**: BTA is building a cheaper, simpler alternative to Hudl + NFHS Network for lower-level high school basketball. The gap exists. The current version is not yet differentiated enough to win.

**What will make it dangerous** (in order):
1. Operator input so fast it replaces pen-and-paper — 2–3 taps max per action
2. Structured event data (possession-based, not just stat-based) feeding AI that actually knows what happened
3. Real-time decision engine: "sub this lineup," "they're attacking left 78% of the time"

**Weakest points right now** (updated session 3):
- AI is generic because data is generic — no possession context, shot zones not used, no sequence data
- Operator tap efficiency: assist flow still takes 5–7 taps; target is ≤4
- No proof the system holds up under real game stress (concurrent games, network spikes, fat-fingering operators)
- Rule-based insights are labeled as "AI" — this is a credibility risk; coaches will catch it
- Clock is display-only, not tracked — breaks clutch context accuracy and pace calculation

**Operator usability audit (session 2, external review)**:
- Visual polish: 8/10
- Game usability: 6.5/10
- Pressure usability: 5.5/10
- Product direction: 8.5/10

**Platform maturity assessment (session 3, AI review)**:
- Engineering: 7/10 — strong architecture (deterministic replay, event-driven, SaaS-ready), solid foundation
- Product: 5/10 — good screens, but the system is not yet a game-time tool coaches rely on
- Real-world readiness: 3/10 — needs offline reliability, real lineup intelligence, honest AI labeling

Key finding: one layer away from being legitimately useful. That layer is **reliability** (offline queue, correction flow) and **intelligence** (real per-lineup insights, not generic rule triggers). The most dangerous gap is that coaches will tap fast in a gym, the network will blip, and they will have no idea what was or wasn't recorded.

Key finding (tap efficiency): the exact sequence for the most common event (Player X makes 3, Player Y assists) must be ≤4 taps total. Anything more is too slow for live in-game use.

---

## ✅ Done

### Rules Engine (services/insight-engine)
- **Rule 11 — Scoring Drought**: Alert after 6 consecutive missed field goals (priority: important)
- **Rule 12 — Depth Warning**: Alert when 2+ active players simultaneously have 3+ fouls (priority: important)
- **Rule 13 — PPP Efficiency Gap**: Alert when opponent PPP exceeds ours by ≥0.25 after both teams have ≥15 possessions (priority: important)
- **Rule 14 — Period-End Urgency**: Alert once when clock enters ≤18s window in Q1/Q2/Q3 (priority: info)
- **Rule 15 — Opponent FT Bombardment**: Alert when opponent draws 6+ FT trips in recent 10 events (priority: important)
- New InsightTypes added: `scoring_drought`, `depth_warning`, `efficiency`, `leverage`

### Coach Dashboard (apps/coach-dashboard)
- Labels registered for all 4 new insight types
- `depth_warning` added to the Action Items panel (requires immediate response)
- Live scoreboard now shows **PPP** (points per possession, after ≥5 possessions) and **FT Rate** (FTA/FGA) instead of the less-actionable POSS and SUBS columns

### Realtime API (services/realtime-api)
- GPT refresh throttled: every **8 events** (was 3) / **45 seconds** (was 20). Rules engine covers moment-to-moment; GPT reserved for synthesis. Both still env-overridable via `BTA_LIVE_INSIGHT_REFRESH_EVERY_EVENTS` and `BTA_LIVE_INSIGHT_MIN_INTERVAL_MS`.

### iPad Operator (apps/ipad-operator)
- **Offline queue — concurrent flush guard**: `isFlushingRef` prevents two flush loops running simultaneously (previously could double-submit the same pending event when `online` event fired and the 15s interval fired at the same time).
- **Offline queue — server-error backoff**: `flushBackoffUntilRef` backs off 30 seconds after a flush where 100% of attempts received server-side rejections. Prevents hammering a struggling server every 15s. Clears on any partial success.
- **Periodic offline flush**: every 15s during a live game, if `navigator.onLine` and pending events exist, retries the queue. Fixes iOS/mobile case where the native `online` event never fires after reconnect.
- **Bottom nav hierarchy**: End Game and Undo are now the two dominant primary buttons (larger, bolder, high-contrast). Summary, Dashboard, Settings demoted to ghost-style secondary buttons — non-distracting during live play. Order: End Game | Undo | Summary | Dashboard | Settings.
- **Opponent scoring parity**: Opponent buttons elevated to full-size tap targets (same height as own-team buttons) with clear 2PT/3PT/FT labels and "OPP" sub-label. Visually distinct via slate-grey tint but equally fast to tap. Replaced the old compact single-word buttons.
- **Player-first workflow**: Right panel now defaults to Players view with roster open immediately. Each on-court player expands inline with 12 quick-action buttons: 2PT✓, 2PT✗, 3PT✓, 3PT✗, FT, REB, FOUL, TO, STL, ASST, BLK, SUB. Simple stats (foul, reb, TO, steal, block) post immediately without a modal.
- **Clock admin decluttered**: Hide Clock / Disable Clock moved into a collapsed "▼ Clock Settings" toggle. Primary clock row is now just: Start/Stop · Reset · -1s · +1s.
- **Timeout section clarity**: Title reads "Record Timeout (Regulation — decrements count)". Buttons now say "Use 30s"/"Use 60s" with per-team remaining count displayed as `TeamName: 2 short · 3 full left`. Removes ambiguity about whether tapping records, starts, or decrements.
- **Foul badge on roster**: Players with 4+ fouls show a visible inline badge (amber at 4, red at 5/fouled out) in the roster panel so operator sees danger without opening a modal.
- **Instant undo**: removed confirmation dialog — `undoLast()` now removes the last event immediately with haptic feedback and a toast. No friction under pressure.
- **MAKE/MISS split buttons**: left panel now has 6 dedicated shot buttons (MAKE 2 / MISS 2, MAKE 3 / MISS 3, FT MAKE / FT MISS) — 2 taps to log any shot outcome without a modal toggle. Previously only MAKE was one-tap with MISS buried in a modal.
- **Semantic color coding**: shot buttons are green (make), red (miss), blue (3PT make), amber (3PT miss) — outcome colors instead of team colors for faster muscle memory.
- **FOUL and TURNOVER promoted**: moved to top of right stat grid; foul is amber, turnover is red. Both are now visually distinct from neutral stats (reb, ast, blk).
- **UNDO button highlighted**: amber tint in the bottom nav (`live-nav-btn-undo`) for instant identification under pressure.

---

## 🔴 High Priority — Do Next

### 1. Live eFG% on Scoreboard
**What**: Effective field goal percentage `(FGM + 0.5 * 3PM) / FGA`  
**Why missing**: Game state's `TeamShootingStats` doesn't separate 2PM from 3PM — all field goals are lumped together.  
**Fix**: Add `fgMade3` and `fgAttempts3` to `TeamShootingStats` in `packages/game-state/src/index.ts`. Populate it in the `shot_attempt` case when `event.points === 3`. Then compute eFG% in the live scoreboard.  
**Effort**: Small schema change + scoreboard render. Requires updating `TeamShootingStats`, `cloneTeamStats`, the `shot_attempt` handler, and the coach dashboard display.

### 2. GPT Output Validation
**What**: The AI coaching insight from GPT is inserted directly with no structure enforcement beyond string trimming.  
**Why it matters**: GPT can hallucinate player names, invent stats, or return empty/malformed messages that silently degrade trust.  
**Fix**: After `requestAiInsights()` parses the GPT response, validate each insight: require non-empty `message`, clamp `confidence` to allowed values, strip any message containing a numeric stat we can cross-check against game state for obvious hallucinations (e.g., "12 points" when player has 4). At minimum add a length guard and a `[AI]` prefix so coaches know these are model-generated.  
**Files**: `services/realtime-api/src/store.ts` — `requestAiInsights()` function.

### 3. Operator — Pending Event Count Badge
**What**: The "Undo" button exists and the queue persists, but there's no visible indicator showing the operator how many events are sitting unsynced.  
**Why it matters**: Operators don't know if they're 1 event behind or 20. High-stress moments → they tap fast → network blips → they have no feedback.  
**Fix**: Show a badge/counter near the nav bar displaying `pendingEvents.length` when > 0. Style it red/orange so it's impossible to miss. Already have `pendingEvents` in state; just needs JSX.  
**Files**: `apps/ipad-operator/src/App.tsx` — nav bar render section.

### 4. Operator — Optimistic Local State
**What**: When an event is submitted, the operator UI waits for the server round-trip before showing feedback. On flaky gym WiFi this feels broken.  
**Why it matters**: The operator thinks their tap didn't register and taps again → duplicate events.  
**Fix**: Apply the event to local display state immediately on tap, then reconcile with server response. If submission fails, the event drops into the pending queue (already does this) but the local display should still show it.  
**Files**: `apps/ipad-operator/src/App.tsx` — `submitEvent()` and display state.

### 5. Operator — Inline Assist After Quick-Shot
**What**: The most common sequence (player X makes shot, player Y assists) still routes through the full assist modal chain after the quick-shot tap. That adds 2–3 extra taps.  
**Target**: 4 taps total for make-with-assist: tap player → 2PT✓ → tap assisting player name → done.  
**Fix**: After a successful quick-shot make, show a lightweight "Who assisted? (skip)" row inline within the expanded player strip rather than opening the existing assist2/assist3 modals. A "Skip" option posts the shot-only immediately. If a teammate name is tapped, both events post together.  
**Why it matters**: This is the single biggest drag on pressure usability (currently 5.5/10). Reducing the primary flow to 4 taps would push that past 7/10.  
**Files**: `apps/ipad-operator/src/App.tsx` — `handlePlayerQuickShot`, new inline assist strip in the quick-action zone.

### 6. Operator — Quick Input Modes
**What**: Different operators have different skill levels (varsity assistant coach vs. distracted student manager). One-size input causes errors.  
**Modes**:
- **Simple**: points + turnovers only — for untrained operators  
- **Standard**: shots, assists, rebounds — current default  
- **Advanced**: full possession tracking — for experienced operators  
**Fix**: Add a `inputMode` field to `GameSetup`. The live UI renders different button sets based on mode. Simple mode shows 3 large buttons (2PT / 3PT / TO); advanced mode adds possession controls front-and-center.  
**Files**: `apps/ipad-operator/src/App.tsx`, `GameSetup` type.

### 7. Operator — Possession-Based Input Flow  
**What**: Current input is stat-by-stat. Possession-based input matches actual basketball flow and captures more structured data.  
**Target flow**: Tap player → tap action (drive / catch-shoot / post) → tap result (make / miss / foul / TO). Three taps captures a full possession with shot type context.  
**Why it matters**: Without possession sequences the AI only sees individual stats. With possession sequences we get play-type efficiency, shot selection patterns, and turnover type breakdowns.  
**Complexity**: Medium-high. New event metadata fields (play type, drive vs. catch-shoot). Shot zone already exists in schema but not surfaced in the operator UI.  
**Files**: `packages/shared-schema/src/types.ts` (add `playType` to `ShotAttemptEvent`), `apps/ipad-operator/src/App.tsx`.

### 8. Operator — Shot Zone Capture
**What**: `ShotAttemptEvent` already has a `zone` field (`rim`, `paint`, `midrange`, `corner_three`, `above_break_three`) defined in shared-schema. The operator UI always hard-codes zone to `"paint"` or `"above_break_three"` and never prompts the operator.  
**Fix**: After player selection for a shot, show a 5-zone court diagram (large touch targets). Single tap selects zone. This adds 1 tap but captures data that enables shot quality analysis and zone defense insights.  
**Files**: `apps/ipad-operator/src/App.tsx` — shot modal; add zone picker step.

---

## 🟡 Medium Priority

### 8. Smarter Run Detection (Rule 8 replacement)
**What**: Current run detection fires on 8 points in the last 10 events — this conflates opponent runs with our own scoring. It also doesn't track who ended the run.  
**Better version**: Separate "opponent on a run" vs "we're on a run." Track the last N points scored by *each* team independently (not just events). Alert specifically: "Opponent 8-0 run since Q2 4:30 — call timeout" vs "We've scored 10 straight — keep momentum."  
**Files**: `services/insight-engine/src/index.ts` — Rule 8.

### 9. Clutch Rule Improvement (existing Rule 6)
**What**: The current clutch/late-game rule fires in Q4/OT when the game is within a certain margin with little time left.  
**Problem**: It fires repeatedly on every event in that window, not just when entering it.  
**Fix**: Add the same "window entry" guard used in Rule 14 — only fire when clock first crosses into the threshold, not on every subsequent event.  
**Files**: `services/insight-engine/src/index.ts` — clutch rule section.

### 10. Sub Suggestion Intelligence
**What**: The current sub suggestion rule fires based on minutes/foul counts but doesn't know who's on the bench or whether a reasonable sub actually exists.  
**Better version**: Before suggesting "consider subbing X," check that `activeLineupsByTeam[ourTeamId]` contains the player AND that there's at least one bench player available (i.e., someone on the roster not in the active lineup). If the bench is empty, suggest a timeout instead.  
**Files**: `services/insight-engine/src/index.ts` — sub_suggestion rule.

### 11. Historical Context TTL
**What**: `HISTORICAL_CONTEXT_TTL_MS` defaults to some interval. The historical context (season trends, opponent history) that gets prepended to GPT prompts can go stale mid-game.  
**Fix**: Refresh historical context at period transitions, not just on a time interval. Listen for `period_transition` events as a trigger.  
**Files**: `services/realtime-api/src/store.ts` — `refreshGameAiInsights()` call site.

### 12. Possession Tracking Accuracy
**What**: `possessionsByTeam` only increments on explicit `possession_start` events. Operators frequently forget to log these — they focus on scoring events.  
**Impact**: PPP and efficiency gap rules become unreliable or never fire.  
**Fix (option A)**: Auto-infer possession changes from scoring events and rebounds. When a `shot_attempt` with `made: true` is logged, the opposing team logically starts a possession. Back-fill `possessionsByTeam` from the event log during `replayEvents`.  
**Fix (option B)**: On the operator side, auto-trigger a `possession_start` when certain events are logged (made basket → other team gets ball).  
**Files**: `packages/game-state/src/index.ts`, possibly `apps/ipad-operator/src/App.tsx`.

---

## 🟢 Low Priority / Long-Term

### 13. Matchup Tracking
**What**: Track which defender is assigned to which offensive player each possession. Enables "their #23 is 4-for-4 against your zone" style insights.  
**Complexity**: Requires operator workflow change — they'd need to log matchup assignments. New event type or annotation on existing events. Significant schema change.  
**Files**: `packages/shared-schema/src/types.ts`, game-state, insight engine, operator UI.

### 14. ~~Lineup +/- Tracking~~ — **DONE (session 3)**
Implemented in `packages/game-state/src/index.ts` (`computeLineupSegments`, `aggregateLineupStats`), propagated `startingLineupByTeam` through `GameState` and socket fanout, added **Lineup +/-** card to the coach dashboard live view. Shows each 5-man unit’s points-for / points-against / margin, sorted best to worst.

### 15. Timeout Budget Awareness
**What**: Currently timeouts-left is shown on the scoreboard. Missing: urgency scaling. With 2 timeouts left in Q4 down 6, one should be automatically flagged as "save it."  
**Fix**: Add a timeout conservation rule to the insight engine that fires when timeouts fall below 2 in Q4/OT with the game within reach.  
**Files**: `services/insight-engine/src/index.ts`.

### 16. Coach Dashboard — Insight Age Display
**What**: Insights show the message but not when they were generated. An insight about a scoring drought from 3 minutes ago may no longer be relevant.  
**Fix**: Show relative time (`2m ago`) next to each insight. The `createdAtIso` field is already on every `LiveInsight`.  
**Files**: `apps/coach-dashboard/src/App.tsx` — insight card render.

### 17. Operator — Game Clock UX
**What**: Running clock auto-decrement exists (Start/Stop/Reset/-1s/+1s), but `clockSecondsRemaining` on emitted events is snapshotted from the manually-typed clock input field, not from the live running timer.  
**Fix**: Track `clockStartedAt` timestamp when the clock starts running. When `base()` builds an event, compute `clockToSec(clockInput) - elapsed` using the live timer offset rather than the raw input. Operator only needs to set the clock once per period; the rest is automatic.  
**Complexity**: Small. Timer running state already exists as `clockRunning`; just needs `clockStartedAt` and an offset calculation.  
**Files**: `apps/ipad-operator/src/App.tsx` — `base()` function and clock state.

### 18. Operator — Bench Sub Flow from Roster
**What**: Bench players show a `+` button in the roster panel, but tapping it opens the generic sub1 modal (pick who comes out). From the roster context, the natural flow is the reverse: tap bench player → pick who they replace from the on-court list.  
**Fix**: On bench player `+` tap, open a streamlined "Sub in: [name] — who comes out?" modal showing only the on-court list. Skip the general player-selection step.  
**Files**: `apps/ipad-operator/src/App.tsx` — roster bench player handler, sub1 modal variant.

### 19. Stress & Reliability Testing
**What**: No proof the system holds under real-game conditions: concurrent games, rapid operator tapping, network spikes, iOS going to background mid-game.  
**Why it matters**: If events get dropped, duplicated, or reordered, the game state diverges and stats become wrong. Coaches have no way to detect this.  
**What's needed**:
- Load test: simulate 2+ concurrent games with rapid event submission (10 events/sec per game) against `services/realtime-api`
- Duplicate detection: if the same `eventId` arrives twice, the store should idempotently ignore it (currently unclear if it does)
- Background/foreground iOS test: operator taps quickly, locks iPhone, unlocks 30s later — verify all events flushed
- Reconciliation check: compare `replayEvents(gameLog)` output to live game state — they should always match  
**Files**: New test files; `services/realtime-api/src/store.ts` (idempotency check); `apps/ipad-operator/src/App.tsx` (background flush).

### 20. Honest AI Labeling / Insight Source Transparency
**Source**: External AI product review, session 3.  
**What**: The insight engine outputs rule-triggered alerts (conditional logic: "if fouls >= 4") but the coach-facing label says "AI Insights." This is a credibility risk — coaches who know basketball will recognize these as if-statements, and that erodes trust in the whole product.  
**Fix**: The `Live Insights` / `AI Bench Calls` split already started this. Complete it:
- Rename `AiInsightsPage.tsx` / route `stats-insights` to `LiveInsightsPage` / `stats-live`.
- Rule-engine insights labeled **"Live Alerts"** or **"Coaching Alerts"** — never "AI."
- GPT insights labeled **"AI Analysis"** with a visible `[AI]` tag so coaches know these are model-generated and may be wrong.
- Add `sourceType: "rule" | "ai"` to the `Insight` type so the UI renders them differently without string scanning.  
**Files**: `apps/coach-dashboard/src/AiInsightsPage.tsx`, `routes.ts`, `services/realtime-api/src/store.ts`.

### 21. Real Clock Integration
**Source**: External AI product review, session 3.  
**What**: The clock is display-only — events carry `clockSecondsRemaining` snapshotted from the operator's typed input, not from a live timer. This breaks clutch-context accuracy and makes pace/possession-per-minute impossible to compute.  
**Why it matters**: Without real clock data you can't compute pace, you can't reliably say "last 2 minutes" vs "last 4 minutes," and all time-contextual insights degrade to guesses.  
**Fix**: `#17` (Operator — Game Clock UX) covers the operator side. Once `clockStartedAt` is tracked and events carry accurate `clockSecondsRemaining`, update insight engine rules that currently use event counts as clock proxies to use actual clock values instead.  
**Files**: `apps/ipad-operator/src/App.tsx` (`base()` function, `clockStartedAt`), `services/insight-engine/src/index.ts` (leverage/clutch rules).

### 22. Event Correction Flow During Live Play
**Source**: External AI product review, session 3.  
**What**: Undo removes the last event. Real mistakes are often not the last event — wrong player on a foul logged 3 events ago. There's no way to fix that without wiping everything back.  
**Why it matters**: Every wrong event corrupts foul counts, score, lineup state, and all downstream insights. Coaches stop trusting the system after the first visible error they can't fix.  
**Fix (minimum viable)**: "Recent Events" list in the operator live view showing the last 10 events (player name, type, clock). Any event can be deleted with a single confirmation tap. The server already supports this via the realtime API; just expose it in the UI.  
**Fix (better)**: Allow editing `playerId`, `teamId`, or `made` on any recent event inline. State replays immediately after the patch.  
**Files**: `apps/ipad-operator/src/App.tsx` — new recent-events panel; verify `DELETE /api/games/:gameId/events/:eventId` endpoint exists and triggers correct replay.

### 23. AI Insight Depth — Lineup-Specific and Player-Specific Outputs
**Source**: External AI product review, session 3.  
**What**: The GPT prompt sends aggregate game stats. Output is generic: "consider a substitution," "maintain defensive pressure." This adds near-zero value over what the rules engine already provides.  
**What real value looks like**:
- "Lineup with #4 and #12 is −9 in the last 3 minutes"
- "Opponent scoring 75% on left wing actions"
- "Your second unit has been outscored 14–5 when #23 is on the bench"  
**Fix**: The GPT prompt in `store.ts` should include:
1. Top 3 lineup units by +/- (now computed via `computeLineupSegments` — pass them in)
2. Individual player fouls and scoring pace per minute
3. Recent scoring runs per team (last 5 possessions)
4. Shot zone distribution if available

This transforms the model from "generic basketball advisor" to commentary on this specific game right now.  
**Files**: `services/realtime-api/src/store.ts` — `buildAiPrompt()` or equivalent; include `lineupUnitStats` derived from game state events.

---

## Architecture Observations (Don't Change Without Discussion)

- **Don't add direct app-to-app imports.** All shared logic goes through `packages/*`. Currently clean — keep it that way.
- **Game state must stay deterministic.** `replayEvents` must produce identical output given identical input. No Date.now() or randomness in `applyEvent`.
- **GPT is additive, not authoritative.** Rules engine output always shows; GPT is a layer on top. If GPT fails, the rules engine fallback handles it cleanly. Never make the coach view dependent on a GPT response.
- **File-backed persistence is dev-only.** `services/realtime-api/.platform-data` is fine locally. Production requires `DATABASE_URL` for Postgres.
- **Vite ports are strict**: operator on 5174, dashboard on 5173. Both fail if occupied.
