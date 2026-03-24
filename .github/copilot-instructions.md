# Copilot Instructions for Basketball Platform

## Purpose
This monorepo powers a high school basketball platform with:
- Live event capture on operator device
- Realtime fanout to coach dashboard
- Deterministic game-state replay
- Season analytics and AI insights in a Flask app

Prioritize safe, minimal, test-backed changes that preserve live game reliability.

## Repo Map
- apps/coach-dashboard: React + Vite live coach UI
- operator app: React + Vite operator stat entry (offline-capable)
- apps/stats-dashboard: Flask app for season stats, ingest, and AI insights
- packages/shared-schema: Canonical Zod event schema and shared types
- packages/game-state: Deterministic game state engine and replay logic
- services/realtime-api: Express + Socket.io ingest/fanout service
- services/insight-engine: Rules-based live insight generator (TypeScript)
- services/video-worker: Video upload/timestamp sync service

## Canonical Commands
Run commands from repo root unless noted.

- Install JS deps: npm install
- Build all TS workspaces: npm run build
- Test all JS/TS workspaces: npm run test
- Dev realtime API: npm run dev:api
- Dev operator app: npm run dev:operator
- Dev coach dashboard: npm run dev:coach
- Dev video worker: npm run dev:video
- Dev Flask stats service: npm run dev:stats
- Test Flask stats app: npm run test:stats
- Start all apps/services: npm run dev:all
- Smoke checks: npm run smoke-test
- UI audit: npm run audit:ui

Stats Dashboard (Python) from repo root:
- Create venv: python -m venv .venv
- Activate on Windows: .venv\Scripts\Activate.ps1
- Install deps: pip install -r requirements.txt
- Run tests: npm run test:stats

## Architecture Boundaries
- Treat packages/shared-schema as source of truth for event contracts.
- Validate incoming events using shared-schema before state mutation.
- Keep game-state deterministic: prefer replay-safe updates over ad hoc mutation.
- Do not create direct app-to-app imports; share through packages/*.
- Keep insight-engine rules-based and deterministic unless explicitly adding model-backed logic.
- Keep realtime-api concerns separated from stats-dashboard concerns:
  - realtime-api: low-latency ingest, corrections, websocket fanout
  - stats-dashboard: persistence, season analytics, slower AI routes

## Code Conventions
- TypeScript uses ESM and strict mode from tsconfig.base.json.
- Keep public APIs small and stable in packages/*.
- Prefer explicit types in shared contracts; avoid widening event shapes.
- For Flask routes, use config from apps/stats-dashboard/src/config.py and preserve existing API response patterns.
- Add tests with each behavior change:
  - TS: vitest tests near changed package/service/app
  - Python: pytest under apps/stats-dashboard/test

## Reliability and Ops Notes
- Vite uses strict ports (5173 and 5174); dev start fails if occupied.
- Realtime persistence is file-backed in services/realtime-api/.platform-data.
- Stats dashboard can run JSON-only locally; DATABASE_URL is required for durable production storage.
- Season analysis endpoints may be slow on first run due to AI generation and caching.
- Windows scripts assume backslash venv paths; preserve this in npm scripts.

## Working Style for This Repo
- Prefer minimal diffs; avoid broad refactors unless requested.
- Preserve existing route names, event types, and payload shapes.
- If changing ingest, replay, foul, period, or lineup logic, run relevant tests and inspect for regression risk.
- If changing API payloads, update both producers and consumers in the same change.
- Avoid committing generated data artifacts unless the task explicitly requires fixture/data updates.
- Treat `apps/stats-dashboard` as a monorepo app: prefer root-level scripts/config over app-local repo metadata.

## Link, Do Not Duplicate
Use these docs for detailed procedures instead of repeating them in code comments or instructions:
- Root overview and runbook: README.md
- Stats deployment: apps/stats-dashboard/docs/DEPLOY.md
- Production deployment detail: apps/stats-dashboard/docs/DEPLOYMENT.md
- Stats output contract: apps/stats-dashboard/docs/OUTPUT_STRUCTURE.md
- Stats project structure: apps/stats-dashboard/docs/guide/STRUCTURE.md
- Stats testing guide: apps/stats-dashboard/docs/guide/TESTING_GUIDE.md
- DB troubleshooting: apps/stats-dashboard/docs/guide/DATABASE_TROUBLESHOOTING.md
- Production timeout/cache fixes: apps/stats-dashboard/docs/PRODUCTION_FIXES.md

## High-Value Files to Inspect Before Major Changes
- packages/shared-schema/src/types.ts
- packages/shared-schema/src/validation.ts
- packages/game-state/src/index.ts
- services/realtime-api/src/server.ts
- services/realtime-api/src/store.ts
- services/insight-engine/src/index.ts
- apps/stats-dashboard/src/app.py
- apps/stats-dashboard/src/config.py
