# BTA Platform — Improvements Backlog

Last updated: April 7, 2026.

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
1. **AI output safety filtering is minimal** — the 10–300 char length guard doesn't catch prompt injection in GPT responses displayed to coaches.

#### Architecture
2. **Roster sync testing checklist is entirely unchecked.** Cross-platform sync flow has never been formally verified end-to-end.

#### Operations
3. **No E2E tests in CI** — smoke test and UI audit both require all services running and aren't chained into the gate script.
4. **No OpenAI budget cap or cost alerting** — throttling (8 events / 45s) is in place but there's no documented behavior when the rate limit is hit mid-game, and no alerting on runaway cost.

#### UX / Reliability
5. **iOS Web Audio gesture unlock reliability** — if the AudioContext unlock isn't handled on every iOS browser resume, haptic/audio feedback silently fails and the operator loses confirmation cues under pressure.

---

### Pre-Production Blocklist (do not deploy without these)

| # | What | Why |
|---|------|-----|
| 1 | Set `DATABASE_URL` (Supabase) in Railway | File-backed data lost on dyno restart |
| 2 | Set `ALLOWED_ORIGINS` explicitly | Startup now rejects production without explicit frontend origins |
| 3 | Set `BTA_REQUIRE_TENANT=1` and `BTA_JWT_WRITE_REQUIRED=1` | Multi-org data isolation won't be enforced without these |
| 4 | Run and pass the roster sync checklist | Cross-platform sync flow has never been formally verified |
| 5 | Set `BTA_LOCAL_AUTH_SECRET` if using built-in email/password auth | Local auth token signing is intentionally decoupled from `BTA_API_KEY` |

### High Priority (should be done before first real game)
- Wire smoke test / UI audit into a staging CI step rather than manual-only.
- Document and test OpenAI rate limit behavior — coaches need to know if `[AI]` insights will go dark mid-game.

### Lower Priority (post-launch)
- Role-based access control (owner / coach / operator).
- Roster audit log.
- Per-client API key rotation.
- Prometheus push target + alerting rules for security metrics.
