# BTA Courtside Canonical Release Checklist

This is the single source of truth for production release execution.

Use this checklist for go/no-go decisions, rollout verification, and rollback.

## 1. Preflight (Required)

Run from repo root:

- `npm run validate:env`
- `npm run test -w @bta/realtime-api`
- `npm run build`

Do not promote a release if any command fails.

## 2. Required Production Environment

Set and verify before deployment:

- `NODE_ENV=production`
- `BTA_REQUIRE_TENANT=1`
- `BTA_JWT_WRITE_REQUIRED=1`
- `ALLOWED_ORIGINS=<explicit comma-separated production origins>`
- `DATABASE_URL=<durable Postgres connection>`

Authentication path:

- JWT (recommended): `BTA_JWT_ISSUER`, `BTA_JWT_AUDIENCE`, `BTA_JWT_JWKS_URI`
- Or API key fallback: `BTA_API_KEY`

AI controls and alerting (optional but recommended):

- `BTA_OPENAI_MAX_TOKENS_PER_GAME`
- `BTA_OPENAI_MAX_COST_PER_GAME_USD`
- `BTA_AI_ALERT_TOKENS_THRESHOLD`
- `BTA_AI_ALERT_COST_USD_THRESHOLD`

## 3. Rollout Verification

After deployment, verify in this order:

1. `GET /health` responds OK.
2. Tenant-scoped read APIs succeed.
3. Write APIs succeed for `admin/coach/operator` roles and fail for forbidden roles.
4. Socket tenant matching is enforced (match succeeds, mismatch denied).
5. `GET /admin/security-metrics` and `GET /admin/security-metrics/prometheus` return expected counters/gauges.
6. AI insights and AI chat both respond under normal conditions.
7. AI degraded mode is safe:
   - Simulate AI outage or remove `OPENAI_API_KEY` in staging.
   - Confirm rules-based insights remain available.
   - Confirm coach receives explicit AI error states.
8. Persistence survives restart with expected game/session data.

## 4. AI Degradation Rollback Matrix

Goal: keep gameplay workflows operating with rules-based insights while reducing AI risk.

### Trigger Conditions

Start rollback actions if any of the following are observed:

- sustained `429`/`503`/`504` AI failures in coach UI
- rapid growth in `bta_ai_budget_exceeded_total`
- `bta_ai_total_estimated_cost_usd` or token usage exceeding expected run rate
- model output instability or malformed payload incidents

### Immediate Safe Mode (No App Downtime)

1. Keep rules engine authoritative (already default behavior).
2. Temporarily disable OpenAI calls by removing or rotating `OPENAI_API_KEY`.
3. Confirm coach UI still shows rules-based insights and clear degraded messaging.
4. Communicate to coaches: "AI guidance temporarily unavailable; rules-based calls remain active."

### Cost Containment Mode

If AI must stay partially enabled:

1. Lower `BTA_OPENAI_MAX_TOKENS_PER_GAME`.
2. Lower `BTA_OPENAI_MAX_COST_PER_GAME_USD`.
3. Set conservative alert thresholds:
   - `BTA_AI_ALERT_TOKENS_THRESHOLD`
   - `BTA_AI_ALERT_COST_USD_THRESHOLD`
4. Re-check metrics and ensure no runaway trend remains.

### Recovery to Normal Mode

1. Restore validated AI configuration.
2. Verify AI refresh and chat responses in staging-like traffic.
3. Confirm metrics stabilize:
   - no sustained budget-exceeded spikes
   - expected cost/token slope per game
4. Resume normal AI operations.

## 5. Sign-off

A release is complete only when:

- Preflight passed
- Rollout verification passed
- AI degraded-mode rollback path was validated this cycle
- On-call owner confirms metrics and logs are healthy
