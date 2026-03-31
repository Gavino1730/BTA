# BTA Hosting Setup

Use this hosting split for production:

- `services/realtime-api` -> **Railway**
- `apps/coach-dashboard` -> **Vercel**
- `apps/ipad-operator` -> **Vercel**
- Postgres + JWT auth -> **Supabase**

## 1. Supabase

1. Create a new project.
2. Copy the Postgres connection string into `DATABASE_URL`.
3. Copy the auth values into:
   - `BTA_JWT_ISSUER`
   - `BTA_JWT_AUDIENCE`
   - `BTA_JWT_JWKS_URI`
4. If you store school and role in JWT app metadata, use:
   - `BTA_JWT_SCHOOL_CLAIM=app_metadata.schoolId`
   - `BTA_JWT_ROLE_CLAIM=app_metadata.role`

## 2. Railway

Create one service for `services/realtime-api`.

Recommended settings:
- Repo root: project root
- Build command: from `railway.json`
- Start command: from `railway.json`
- Health check path: `/health`

Paste the values from `.env.production.example` into Railway.

## 3. Vercel — Coach Dashboard

Create a Vercel project for the repo and point the root directory to:
- `apps/coach-dashboard`

Then add env vars from:
- `apps/coach-dashboard/.env.production.example`

The included `vercel.json` already handles:
- monorepo install/build
- SPA rewrites to `index.html`

## 4. Vercel — iPad Operator

Create another Vercel project and point the root directory to:
- `apps/ipad-operator`

Then add env vars from:
- `apps/ipad-operator/.env.production.example`

The included `vercel.json` already handles:
- monorepo install/build
- SPA rewrites to `index.html`
- no-cache headers for `service-worker.js`

## 5. Domain layout

Recommended:
- `api.yourdomain.com` -> Railway
- `coach.yourdomain.com` -> Vercel coach app
- `operator.yourdomain.com` -> Vercel operator app

## 6. Final validation

Run these before or after go-live:

```bash
npm run validate:env
npm run build
npm run test -w @bta/realtime-api
```

Then verify:
1. `GET /health` returns OK
2. operator app can submit an event
3. coach dashboard updates live
4. data persists to Supabase

## Gym use note

This setup is correct for internet-backed live scorekeeping in a gym. For best reliability, use stable Wi-Fi or a hotspot on the operator device.
