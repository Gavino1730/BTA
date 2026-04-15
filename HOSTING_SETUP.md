# BTA Courtside Hosting Setup

Canonical release execution checklist: `RELEASE_CHECKLIST.md`.
Use that file for preflight, rollout verification, and rollback procedures.

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

Optional AI budget controls:
- `BTA_OPENAI_MAX_TOKENS_PER_GAME`
- `BTA_OPENAI_MAX_COST_PER_GAME_USD`
- `BTA_AI_ALERT_TOKENS_THRESHOLD`
- `BTA_AI_ALERT_COST_USD_THRESHOLD`

## 3. Vercel — Coach Dashboard

Create a Vercel project for the repo and point the root directory to:
- `apps/coach-dashboard`

Then add env vars from:
- `apps/coach-dashboard/.env.production.example`

Minimum coach Vercel env vars:
- `VITE_API=https://api.btaintel.com`
- `VITE_OPERATOR_CONSOLE=https://operator.btaintel.com`
- `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-anon-key>`
- Optional fallback during API-key rollout: `VITE_API_KEY=<same as Railway BTA_API_KEY>`

The included `vercel.json` already handles:
- monorepo install/build
- SPA rewrites to `index.html`

## 4. Vercel — iPad Operator

Create another Vercel project and point the root directory to:
- `apps/ipad-operator`

Then add env vars from:
- `apps/ipad-operator/.env.production.example`

Minimum operator Vercel env vars:
- `VITE_API=https://api.btaintel.com`
- `VITE_COACH_DASHBOARD=https://dashboard.btaintel.com`
- `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-anon-key>`
- Optional fallback during API-key rollout: `VITE_API_KEY=<same as Railway BTA_API_KEY>`
- Optional explicit tenant scope default (recommended to leave unset): `VITE_SCHOOL_ID=<school-id>`

## 4b. Vercel — Marketing Site

Create a Vercel project for `apps/marketing-site` and set:

- `NEXT_PUBLIC_SITE_URL=https://btaintel.com`
- `NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.btaintel.com`
- `NEXT_PUBLIC_API_BASE=https://api.btaintel.com`

You can bootstrap values from:
- `apps/marketing-site/.env.example`

The included `vercel.json` already handles:
- monorepo install/build
- Next.js output routing
- no-cache headers for `service-worker.js`

## 5. Domain layout

Recommended:
- `api.btaintel.com` -> Railway
- `btaintel.com` -> Vercel marketing site
- `dashboard.btaintel.com` -> Vercel coach app
- `operator.btaintel.com` -> Vercel operator app

## 6. Final validation

Run the full preflight and rollout verification in `RELEASE_CHECKLIST.md` sections 1 and 3.
Use `RELEASE_CHECKLIST.md` section 4 for AI degradation rollback actions.

## Gym use note

This setup is correct for internet-backed live scorekeeping in a gym. For best reliability, use stable Wi-Fi or a hotspot on the operator device.
