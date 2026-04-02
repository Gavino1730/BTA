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
- New InsightTypes added: `scoring_drought`, `depth_warning`, `efficiency`, `leverage`

### Coach Dashboard (apps/coach-dashboard)
- Labels registered for all 4 new insight types
- `depth_warning` added to the Action Items panel (requires immediate response)
- Live scoreboard now shows **PPP** (points per possession, after ≥5 possessions) and **FT Rate** (FTA/FGA) instead of the less-actionable POSS and SUBS columns

### Realtime API (services/realtime-api)
- GPT refresh throttled: every **8 events** (was 3) / **45 seconds** (was 20). Rules engine covers moment-to-moment; GPT reserved for synthesis. Both still env-overridable via `BTA_LIVE_INSIGHT_REFRESH_EVERY_EVENTS` and `BTA_LIVE_INSIGHT_MIN_INTERVAL_MS`.

### iPad Operator (apps/ipad-operator)
- **Periodic offline flush**: every 15s during a live game, if `navigator.onLine` and pending events exist, retries the queue. Fixes iOS/mobile case where the native `online` event never fires after reconnect.
- **Instant undo**: removed confirmation dialog — `undoLast()` removes the last event immediately with haptic feedback and a toast. No friction under pressure.
- **MAKE/MISS split buttons**: left panel has 6 dedicated shot buttons (MAKE 2 / MISS 2, MAKE 3 / MISS 3, FT MAKE / FT MISS) — 2 taps to log any shot outcome without a modal toggle.
- **Semantic color coding**: shot buttons are green (make), red (miss), blue (3PT make), amber (3PT miss) — outcome colors for faster muscle memory.
- **FOUL and TURNOVER promoted**: moved to top of right stat grid; foul is amber, turnover is red. Both visually distinct from neutral stats.
- **UNDO button pending-event badge**: orange pill badge on the Undo nav button shows exact count of unsynced events (`pendingEvents.length`). Operator always knows their queue depth at a glance. (`apps/ipad-operator/src/App.tsx`, `styles.css`)
- **Live eFG% on scoreboard**: added `fgMade3`/`fgAttempts3` to `TeamShootingStats` in `game-state`; populated in `shot_attempt` handler when `event.points === 3`; coach dashboard scoreboard now shows eFG% cell `(FGM + 0.5×3PM) / FGA` alongside 3PT breakdown.
- **GPT output validation**: length guard (10–300 chars) discards malformed/bloated GPT messages; all AI coaching insights prefixed with `[AI]` so coaches can distinguish model-generated advice from rules-engine alerts.

---

## � High Priority — Do Next

### 1. Operator — Optimistic Local State
**What**: When an event is submitted, the operator UI waits for the server round-trip before showing feedback. On flaky gym WiFi this feels broken.
**Why it matters**: The operator thinks their tap didn't register and taps again → duplicate events.
**Fix**: Apply the event to local display state immediately on tap, then reconcile with server response. If submission fails, the event drops into the pending queue (already does this) but the local display should still show it.
**Files**: `apps/ipad-operator/src/App.tsx` — `submitEvent()` and display state.

---

## 🟡 Medium Priority

### 4. Smarter Run Detection (Rule 8 replacement)
**What**: Current run detection fires on 8 points in the last 10 events — this conflates opponent runs with our own scoring. It also doesn't track who ended the run.
**Better version**: Separate "opponent on a run" vs "we're on a run." Track the last N points scored by *each* team independently (not just events). Alert specifically: "Opponent 8-0 run since Q2 4:30 — call timeout" vs "We've scored 10 straight — keep momentum."
**Files**: `services/insight-engine/src/index.ts` — Rule 8.

### 5. Clutch Rule Improvement (existing Rule 6)
**What**: The current clutch/late-game rule fires in Q4/OT when the game is within a certain margin with little time left.
**Problem**: It fires repeatedly on every event in that window, not just when entering it.
**Fix**: Add the same "window entry" guard used in Rule 14 — only fire when clock first crosses into the threshold, not on every subsequent event.
**Files**: `services/insight-engine/src/index.ts` — clutch rule section.        

### 6. Sub Suggestion Intelligence
**What**: The current sub suggestion rule fires based on minutes/foul counts but doesn't know who's on the bench or whether a reasonable sub actually exists.   
**Better version**: Before suggesting "consider subbing X," check that `activeLineupsByTeam[ourTeamId]` contains the player AND that there's at least one bench player available (i.e., someone on the roster not in the active lineup). If the bench is empty, suggest a timeout instead.
**Files**: `services/insight-engine/src/index.ts` — sub_suggestion rule.        

### 7. Historical Context TTL
**What**: `HISTORICAL_CONTEXT_TTL_MS` defaults to some interval. The historical context (season trends, opponent history) that gets prepended to GPT prompts can go stale mid-game.
**Fix**: Refresh historical context at period transitions, not just on a time interval. Listen for `period_transition` events as a trigger.
**Files**: `services/realtime-api/src/store.ts` — `refreshGameAiInsights()` call site.

### 8. Possession Tracking Accuracy
**What**: `possessionsByTeam` only increments on explicit `possession_start` events. Operators frequently forget to log these — they focus on scoring events.   
**Impact**: PPP and efficiency gap rules become unreliable or never fire.       
**Fix (option A)**: Auto-infer possession changes from scoring events and rebounds. When a `shot_attempt` with `made: true` is logged, the opposing team logically starts a possession. Back-fill `possessionsByTeam` from the event log during `replayEvents`.
**Fix (option B)**: On the operator side, auto-trigger a `possession_start` when certain events are logged (made basket → other team gets ball).
**Files**: `packages/game-state/src/index.ts`, possibly `apps/ipad-operator/src/App.tsx`.

---

## 🟢 Low Priority / Long-Term

### 9. Matchup Tracking
**What**: Track which defender is assigned to which offensive player each possession. Enables "their #23 is 4-for-4 against your zone" style insights.
**Complexity**: Requires operator workflow change — they'd need to log matchup assignments. New event type or annotation on existing events. Significant schema change.
**Files**: `packages/shared-schema/src/types.ts`, game-state, insight engine, operator UI.

### 10. Lineup +/- Tracking
**What**: Track net point differential while each 5-man lineup is on the court. 

**What's needed**: Game state needs to record when each lineup combination started and what the score was. Currently substitution events exist but differential per lineup isn't computed.
**Use case**: "Your starting lineup is +12 but your second unit is -8 — the gap is real."
**Files**: `packages/game-state/src/index.ts`, coach dashboard.

### 11. Timeout Budget Awareness
**What**: Currently timeouts-left is shown on the scoreboard. Missing: urgency scaling. With 2 timeouts left in Q4 down 6, one should be automatically flagged as "save it."
**Fix**: Add a timeout conservation rule to the insight engine that fires when timeouts fall below 2 in Q4/OT with the game within reach.
**Files**: `services/insight-engine/src/index.ts`.

### 12. Coach Dashboard — Insight Age Display
**What**: Insights show the message but not when they were generated. An insight about a scoring drought from 3 minutes ago may no longer be relevant.
**Fix**: Show relative time (`2m ago`) next to each insight. The `createdAtIso` field is already on every `LiveInsight`.
**Files**: `apps/coach-dashboard/src/App.tsx` — insight card render.

---

## Architecture Observations (Don't Change Without Discussion)

- **Don't add direct app-to-app imports.** All shared logic goes through `packages/*`. Currently clean — keep it that way.
- **Game state must stay deterministic.** `replayEvents` must produce identical output given identical input. No Date.now() or randomness in `applyEvent`.
- **GPT is additive, not authoritative.** Rules engine output always shows; GPT is a layer on top. If GPT fails, the rules engine fallback handles it cleanly. Never make the coach view dependent on a GPT response.
- **File-backed persistence is dev-only.** `services/realtime-api/.platform-data` is fine locally. Production requires `DATABASE_URL` for Postgres.
- **Vite ports are strict**: operator on 5174, dashboard on 5173. Both fail if occupied.
