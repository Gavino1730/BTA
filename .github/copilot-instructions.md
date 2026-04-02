# Copilot Instructions for Basketball Platform

## Purpose
This monorepo powers a high school basketball platform with:
- Live event capture on operator device
- Realtime fanout to coach dashboard
- Deterministic game-state replay
- Season analytics and AI insights served by the realtime API

Prioritize safe, minimal, test-backed changes that preserve live game reliability.

## Repo Map
- apps/coach-dashboard: React + Vite live coach UI plus stats and analytics pages
- apps/ipad-operator: React + Vite operator stat entry (offline-capable)
- packages/shared-schema: Canonical Zod event schema and shared types
- packages/game-state: Deterministic game state engine and replay logic
- services/realtime-api: Express + Socket.io ingest/fanout service
- services/insight-engine: Rules-based live insight generator (TypeScript)

## Canonical Commands
Run commands from repo root unless noted.

- Install JS deps: npm install
- Build all TS workspaces: npm run build
- Test all JS/TS workspaces: npm run test
- Dev realtime API: npm run dev:api
- Dev operator app: npm run dev:operator
- Dev coach dashboard: npm run dev:coach
- Dev stats routes/pages: npm run dev:stats (compatibility alias of dev:coach)
- Start all apps/services: npm run dev:all
- Smoke checks: npm run smoke-test
- UI audit: npm run audit:ui

## Architecture Boundaries
- Treat packages/shared-schema as source of truth for event contracts.
- Validate incoming events using shared-schema before state mutation.
- Keep game-state deterministic: prefer replay-safe updates over ad hoc mutation.
- Do not create direct app-to-app imports; share through packages/*.
- Keep insight-engine rules-based and deterministic unless explicitly adding model-backed logic.
- Keep realtime-api concerns separated from UI concerns:
  - realtime-api: low-latency ingest, corrections, websocket fanout, auth, persistence
  - coach-dashboard / ipad-operator: rendering, workflow, local UI state

## Code Conventions
- TypeScript uses ESM and strict mode from tsconfig.base.json.
- Keep public APIs small and stable in packages/*.
- Prefer explicit types in shared contracts; avoid widening event shapes.
- Add tests with each behavior change:
  - TS: vitest tests near changed package/service/app

## Reliability and Ops Notes
- Vite uses strict ports (5173 and 5174); dev start fails if occupied.
- Realtime persistence is file-backed in services/realtime-api/.platform-data.
- Local development can use file-backed API persistence; DATABASE_URL is required for durable production storage.
- Season analysis endpoints may be slow on first run due to AI generation and caching.

## Working Style for This Repo
- Prefer minimal diffs; avoid broad refactors unless requested.
- Preserve existing route names, event types, and payload shapes.
- If changing ingest, replay, foul, period, or lineup logic, run relevant tests and inspect for regression risk.
- If changing API payloads, update both producers and consumers in the same change.
- Avoid committing generated data artifacts unless the task explicitly requires fixture/data updates.
- Treat the coach dashboard as the home for current stats routes/pages; prefer root-level scripts/config over duplicate app-local docs.

## Link, Do Not Duplicate
Use these docs for detailed procedures instead of repeating them in code comments or instructions:
- Production deployment runbook: `DEPLOYMENT.md`
- Hosting setup quickstart: `HOSTING_SETUP.md`

## High-Value Files to Inspect Before Major Changes
- packages/shared-schema/src/types.ts
- packages/shared-schema/src/validation.ts
- packages/game-state/src/index.ts
- services/realtime-api/src/server.ts
- services/realtime-api/src/store.ts
- services/insight-engine/src/index.ts
