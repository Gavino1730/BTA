# BTA Platform

Realtime basketball platform for high school programs, with deterministic game-state replay, live operator capture, coach-facing dashboards, and rules-based AI insights.

## What this repo includes

- `apps/coach-dashboard`: Coach UI for live game tracking, trends, and AI insights.
- `apps/ipad-operator`: Operator entry app for game events and live capture.
- `packages/shared-schema`: Canonical Zod event schema and shared contracts.
- `packages/game-state`: Deterministic game-state engine and replay logic.
- `services/realtime-api`: Express + Socket.io ingest/fanout backend.
- `services/insight-engine`: Rules-based insight generation.

## Tech stack

- TypeScript (strict mode)
- React + Vite
- Express + Socket.io
- Zod for schema validation
- Vitest for tests
- npm workspaces monorepo

## Prerequisites

- Node.js 20+
- npm 10+

## Quick start

```bash
npm install
npm run build
npm run test
```

Run development services:

```bash
npm run dev:api
npm run dev:operator
npm run dev:coach
```

Or run all at once:

```bash
npm run dev:all
```

## Common scripts

- `npm run build`: Build all packages/apps/services
- `npm run test`: Run tests across workspaces
- `npm run dev:api`: Start realtime API in watch mode
- `npm run start:api`: Start built realtime API
- `npm run dev:coach`: Start coach dashboard (port 5173)
- `npm run dev:operator`: Start iPad operator app (port 5174)
- `npm run smoke-test`: Run smoke test script
- `npm run audit:ui`: Run UI audit script
- `npm run validate:env`: Validate API environment configuration

## Reliability guardrails

- Shared event contracts must originate from `packages/shared-schema`.
- Game state updates must remain deterministic and replay-safe.
- API ingress should validate event payloads before mutation.
- UI apps should not import directly from each other; share through `packages/*`.

## Production and hosting docs

- Deployment runbook: `DEPLOYMENT.md`
- Hosting setup quickstart: `HOSTING_SETUP.md`

## Contributing

Please read `CONTRIBUTING.md` before opening pull requests.

## Security

Please report vulnerabilities per `SECURITY.md`.

## Support

Support channels and issue filing guidance are in `SUPPORT.md`.
