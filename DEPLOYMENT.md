# BTA Production Deployment Runbook

This runbook defines the minimum safe production configuration for multi-organization deployment.

## Pre-Deploy Validation

Run all checks from repo root:

- `npm run validate:env`
- `npm run test -w @bta/realtime-api`
- `npm run build`

Do not deploy if any command fails.

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

### Data Retention

- `BTA_DATA_RETENTION_DAYS` (default `180`)
- `BTA_RETENTION_PRUNE_INTERVAL_MINUTES` (default `1440`)

Set `BTA_DATA_RETENTION_DAYS` to `0` or negative to disable pruning.

### Metrics Export (Optional)

- `BTA_SECURITY_METRICS_PUSH_URL` (HTTP endpoint for Prometheus text payload pushes)
- `BTA_SECURITY_METRICS_PUSH_INTERVAL_MS` (default `10000`)

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

If `BTA_SECURITY_METRICS_PUSH_URL` is configured, counters are also pushed at a throttled interval after security events.

## Multi-Organization Safety Checklist

- Tenant scope required and enforced for all `/api`, `/teams`, `/config`, `/admin` routes.
- Write routes require authenticated write role (`admin`, `coach`, `operator`) when JWT auth is enabled.
- Socket handshake token scope and requested scope must match.
- Persistence layer normalizes and validates event `schoolId` and `gameId` before insert.
- Database event payload constraints and indexes are applied.
- Retention pruning is enabled with explicit retention policy.

## Rollout Sequence

1. Deploy backend with new env vars set and validated.
2. Verify `/health` and `npm run validate:env` in target environment.
3. Verify read APIs with tenant-scoped requests.
4. Verify write APIs with role-scoped JWT tokens.
5. Verify socket connect for matching tenant and rejection for mismatched tenant.
6. Verify `/admin/security-metrics` reports counters and increments on denied scenarios.
7. Verify retention policy logs appear on startup and at interval.
8. Verify Prometheus metrics endpoint returns expected counters and optional push target receives updates.

## Optional DB Integration Test Setup

To run live Postgres RLS integration coverage:

- Set `BTA_TEST_DATABASE_URL` to an isolated test database.
- Run `npm run test -w @bta/realtime-api`.

The RLS integration suite auto-skips when `BTA_TEST_DATABASE_URL` is not set.

## Rollback Guidance

If deployment is blocked by validation in production:

- Fix missing JWT or API key configuration.
- Ensure `BTA_REQUIRE_TENANT=1` remains enabled.
- Ensure `ALLOWED_ORIGINS` includes all intended frontend origins.
- If retention errors occur, temporarily set `BTA_DATA_RETENTION_DAYS=0` and investigate DB permissions.
