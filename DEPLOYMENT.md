# BTA Courtside Production Deployment Runbook

This runbook defines the minimum safe production configuration for multi-organization deployment.

Canonical release execution checklist: `RELEASE_CHECKLIST.md`.
Use that file for preflight, rollout verification, and rollback procedures.

## Pre-Deploy Validation

See `RELEASE_CHECKLIST.md` section 1.

## Recommended Hosting Split

Use the stack as follows for live gym scorekeeping and coach fanout:

- `services/realtime-api` -> **Railway**
- `apps/coach-dashboard` -> **Vercel**
- `apps/ipad-operator` -> **Vercel**
- `DATABASE_URL` + JWT auth -> **Supabase**

### Platform-specific notes

- **Railway**: deploy from the repo root and start the API with `npm run start:api` after `npm run build`.
- **Vercel (Coach)**: set the root directory to `apps/coach-dashboard` and configure `VITE_API` to the Railway API URL. If you use the API-key fallback for live writes, also set `VITE_API_KEY` to the same value as Railway `BTA_API_KEY`.
- **Vercel (Operator)**: set the root directory to `apps/ipad-operator` and configure `VITE_API` plus `VITE_COACH_DASHBOARD`. If you use the API-key fallback for live writes, also set `VITE_API_KEY` to the same value as Railway `BTA_API_KEY`.
- **Supabase**: use the project Postgres connection string for `DATABASE_URL` and the auth issuer/JWKS values for JWT verification.

## Required Environment Contract (Production)

### Tenant and Auth

- `NODE_ENV=production`
- `BTA_REQUIRE_TENANT=1`
- `BTA_JWT_WRITE_REQUIRED=1`
- `BTA_PERSISTENCE_STARTUP_STRICT=1`

Choose at least one authentication path:

- JWT path (recommended):
  - `BTA_JWT_ISSUER`
  - `BTA_JWT_AUDIENCE`
  - `BTA_JWT_JWKS_URI`
  - Optional claim overrides:
    - `BTA_JWT_SCHOOL_CLAIM`
    - `BTA_JWT_ROLE_CLAIM`
- API key fallback:
  - `BTA_API_KEY`

### Network and Persistence

- `ALLOWED_ORIGINS` must be explicitly set to production UI origins.
- `DATABASE_URL` should be set for durable multi-instance persistence.
- On Railway, prefer the Supabase **Session/Connection Pooler** / IPv4-compatible `DATABASE_URL`; direct IPv6-only database hosts can surface `ENETUNREACH` during startup.

### Onboarding Email Delivery (Recommended)

To ensure organization invites and onboarding account emails are actually delivered:

- `RESEND_API_KEY`
- `BTA_EMAIL_FROM` (recommended: `BTA Courtside <no-reply@btaintel.com>`)
- Optional: `BTA_EMAIL_REPLY_TO` (recommended: `support@btaintel.com`)
- Optional but recommended for invite links: `BTA_COACH_APP_URL`

Without these values, invite/member onboarding still creates records, but transactional emails are reported as disabled.

### Data Retention

- `BTA_DATA_RETENTION_DAYS` (default `180`)
- `BTA_RETENTION_PRUNE_INTERVAL_MINUTES` (default `1440`)

Set `BTA_DATA_RETENTION_DAYS` to `0` or negative to disable pruning.

### Metrics Export (Optional)

- `BTA_SECURITY_METRICS_PUSH_URL` (HTTP endpoint for Prometheus text payload pushes)
- `BTA_SECURITY_METRICS_PUSH_INTERVAL_MS` (default `10000`)

### AI Budget Controls (Optional)

- `BTA_OPENAI_MAX_TOKENS_PER_GAME` (hard cap for total model tokens used per game session)
- `BTA_OPENAI_MAX_COST_PER_GAME_USD` (hard cap for estimated OpenAI spend per game session)
- `BTA_AI_ALERT_TOKENS_THRESHOLD` (alert threshold for per-game token usage; emits telemetry and pushes metrics)
- `BTA_AI_ALERT_COST_USD_THRESHOLD` (alert threshold for per-game estimated cost; emits telemetry and pushes metrics)

## AI Degraded-Mode Contract (Coach-Facing)

The live coaching experience is designed so AI is additive, not required.

- Rules-based insights remain authoritative and continue to render even if OpenAI fails.
- AI refresh failures do not blank the panel; the API keeps existing AI insights (if any) and always returns combined fallback insights.
- Coach chat/refresh surfaces explicit status messages for common failures:
  - `429`: AI temporarily rate-limited or game budget exhausted. Retry later or continue with rules-based calls.
  - `503`: AI service unavailable or network/runtime error.
  - `504`: upstream timeout.
  - `401/403`: auth/role scope mismatch.
- API tracks game-scoped AI health (`healthy`, `lastErrorCode`, `lastErrorStatus`, `lastErrorMessage`) and logs degraded events for operations triage.

Operational expectations:

- During incidents or spend throttling, coaches should continue to use rules-based calls and scoreboard/box score data without interruption.
- Treat AI as best-effort guidance; no gameplay-critical workflow should depend on successful model responses.

## Security Observability

The API tracks security counters in memory and exposes them via:

- `GET /admin/security-metrics`
- `GET /admin/security-metrics/prometheus`

This endpoint requires auth and write role access.

Monitor these counters for abuse/misconfiguration signals:

- request tenant mismatch
- socket tenant mismatch
- missing tenant scope
- unauthorized HTTP attempts
- unauthorized socket attempts
- forbidden write role attempts

Also monitor AI spend telemetry:

- `bta_ai_budget_exceeded_total`
- `bta_ai_alert_cost_threshold_exceeded_total`
- `bta_ai_alert_tokens_threshold_exceeded_total`
- `bta_ai_total_tokens_used`
- `bta_ai_total_estimated_cost_usd`

If `BTA_SECURITY_METRICS_PUSH_URL` is configured, counters are also pushed at a throttled interval after security events.

## Multi-Organization Safety Checklist

- Tenant scope required and enforced for all `/api`, `/teams`, `/config`, `/admin` routes.
- Write routes require authenticated write role (`admin`, `coach`, `operator`) when JWT auth is enabled.
- Socket handshake token scope and requested scope must match.
- Persistence layer normalizes and validates event `schoolId` and `gameId` before insert.
- Database event payload constraints and indexes are applied.
- Retention pruning is enabled with explicit retention policy.

## Rollout Sequence

Use the ordered rollout verification in `RELEASE_CHECKLIST.md` section 3.

## Hosted Verification Runner

Use the hosted verifier to attach repeatable durability evidence to each release:

- `npm run verify:hosted -- --environment staging`
- `npm run verify:hosted -- --environment production`

Required environment variables:

- `BTA_HOSTED_API_URL`
- `BTA_HOSTED_COACH_URL`
- `BTA_HOSTED_OPERATOR_URL`
- staging only: `BTA_HOSTED_RESTART_COMMAND`

Artifacts are written to `artifacts/hosted-verification/<timestamp>/`.

## Optional DB Integration Test Setup

To run live Postgres RLS integration coverage:

- Set `BTA_TEST_DATABASE_URL` to an isolated test database.
- Run `npm run test -w @bta/realtime-api`.

The RLS integration suite auto-skips when `BTA_TEST_DATABASE_URL` is not set.

## Rollback Guidance

Use `RELEASE_CHECKLIST.md` section 4 for AI degradation rollback matrix and section 5 for release sign-off.

## Robots.txt Policy for SEO

- The correct robots.txt is now selected at build time for Vercel deploys:
  - Production: `robots.txt` (allows indexing)
  - Preview: `robots-preview.txt` (disallows all, noindex)
- The script `scripts/deploy-robots.mjs` copies the correct file based on `VERCEL_ENV` or `BTA_ROBOTS_PREVIEW`.
- To override in local/dev, set `BTA_ROBOTS_PREVIEW=1` before build.
- See also: `apps/coach-dashboard/package.json` (postbuild), `public/robots.txt`, `public/robots-preview.txt`.

### Robots.txt Test

To verify which robots.txt is active and its contents, run:

    node scripts/test-robots.mjs

You can override the mode locally:

    # Preview mode (should Disallow all)
    set BTA_ROBOTS_PREVIEW=1 ; npm run build -w @bta/coach-dashboard ; node scripts/test-robots.mjs

    # Production mode (should Allow all)
    set BTA_ROBOTS_PREVIEW=0 ; npm run build -w @bta/coach-dashboard ; node scripts/test-robots.mjs

The script prints the detected environment and the contents of public/robots.txt.
