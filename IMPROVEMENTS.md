# BTA Courtside — Improvements Backlog

This is the canonical improvements and architecture notes tracker for the BTA platform.

Last updated: April 14, 2026.

---

## Architecture Observations (Don't Change Without Discussion)

- **Don't add direct app-to-app imports.** All shared logic goes through `packages/*`. Currently clean — keep it that way.
- **Game state must stay deterministic.** `replayEvents` must produce identical output given identical input. No Date.now() or randomness in `applyEvent`.
- **GPT is additive, not authoritative.** Rules engine output always shows; GPT is a layer on top. If GPT fails, the rules engine fallback handles it cleanly. Never make the coach view dependent on a GPT response.
- **File-backed persistence is dev-only.** `services/realtime-api/.platform-data` is fine locally. Production requires `DATABASE_URL` for Postgres.
- **Vite ports are strict**: operator on 5174, dashboard on 5173. Both fail if occupied.

---

## Known Flaws

#### Security
1. ~~**AI output safety filtering is minimal**~~ **Done** — `hasUnsafeAiInsightText` now rejects HTML tags, JavaScript URL schemes, event-handler attributes (`on*=`), and an expanded set of prompt-injection phrases. AI chat responses (`answerGameAiChat`) are also gated through the same filter; unsafe answers return null and log `ai.chat_safety_filter`. Both the insight and chat safety paths have passing tests.

#### Architecture
2. **Roster sync testing checklist is entirely unchecked.** Cross-platform sync flow has never been formally verified end-to-end.

#### Operations
3. ~~**No E2E tests in CI**~~ **Done** — A new `e2e` job in `ci.yml` (runs after `build-and-test`, master-only) installs Playwright + chromium, builds all packages and the API, starts all three services via `npm run dev:all`, waits for API + both Vite apps to be healthy, then runs `e2e/fake-game-flow.spec.ts`. Playwright artifacts (screenshots, traces, video) are uploaded on failure. Chaos and reliability specs remain manual-only to avoid flaky CI gates.
4. ~~**No OpenAI budget cap or cost alerting**~~ **Done** — `recordAiUsage` now calls `updateAiBudgetWarning` after each AI response; when token or cost consumption crosses 80% of `BTA_OPENAI_MAX_TOKENS_PER_GAME` / `BTA_OPENAI_MAX_COST_PER_GAME_USD`, a `budgetWarning` string is set on `GameAiStatus` and logged as `ai.budget_warning`. The coach dashboard's `fetchAiHealthMessage` surfaces it as a yellow warning even while AI generation is still running. 27 store tests pass.

#### UX / Reliability
5. ~~**iOS Web Audio gesture unlock reliability**~~ **Done** — `triggerFeedback` now checks `ctx.state === "running"` alongside `unlockedRef` to detect iOS re-suspensions; `visibilitychange`/`pageshow` handlers reset the unlock flag so the next user tap re-unlocks within a proper gesture. Three tests pass.

---

### Production Configuration Requirements

These items must be confirmed active in the deployed environment. The platform is live — these are not blockers but operational verifications.

| # | What | Why |
|---|------|-----|
| 1 | `DATABASE_URL` (Supabase) set in Railway | File-backed data lost on dyno restart |
| 2 | `ALLOWED_ORIGINS` explicitly set | Production startup rejects wildcard/missing origin |
| 3 | `BTA_REQUIRE_TENANT=1` and `BTA_JWT_WRITE_REQUIRED=1` | Multi-org data isolation enforcement |
| 4 | Roster sync cross-platform flow verified end-to-end | Has never been formally verified |
| 5 | `BTA_LOCAL_AUTH_SECRET` set if using built-in email/password auth | Local auth token signing decoupled from `BTA_API_KEY` |

### High Priority (should be done before first real game)
- ~~Wire smoke test / UI audit into a staging CI step rather than manual-only.~~ **Done** — `ci.yml` now fires on `master` (was `main`, so CI was never running). A separate `smoke-test` job starts the API and runs the smoke test automatically on every push to `master` (requires `BTA_API_KEY` and `BTA_JWT_SECRET` GitHub secrets).
- OpenAI rate limit behavior is handled: the dashboard shows "AI generation is rate-limited. Rules-based insights are still active." when a 429 is returned, and the last successful AI insights remain visible. Throttle defaults: 8 events per refresh, 45 s minimum interval (`BTA_LIVE_INSIGHT_REFRESH_EVERY_EVENTS`, `BTA_LIVE_INSIGHT_MIN_INTERVAL_MS`). Per-game budget caps are configurable via `BTA_MAX_AI_TOKENS_PER_GAME` and `BTA_MAX_AI_COST_PER_GAME_USD`. No alerting on runaway cost is still outstanding.

### Lower Priority (post-launch)
- Role-based access control (owner / coach / operator).
- Roster audit log.
- Per-client API key rotation.
- ~~Prometheus push target + alerting rules for security metrics.~~ **Done** — `GET /admin/security-metrics/prometheus` now includes four new AI budget gauges: `bta_ai_budget_exceeded_total`, `bta_ai_budget_warning_total`, `bta_ai_chat_safety_filter_total`, `bta_ai_status_degraded_total`. Warning thresholds are configurable via `BTA_AI_ALERT_TOKENS_THRESHOLD` and `BTA_AI_ALERT_COST_USD_THRESHOLD` (both documented in the release checklist) instead of the previous hardcoded 80%. All 27 store tests pass; realtime-api type-checks clean.
