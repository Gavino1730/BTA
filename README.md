# BTA Platform (Basketball Intelligence Platform)

This repo is a small monorepo that powers a basketball coaching workflow:

- **Realtime API** (`services/realtime-api`): Express + Socket.IO server that maintains live game state, persists sessions/rosters, and produces *rule-based* (and optionally *AI-based*) insights.
- **Operator Console** (`apps/ipad-operator`): UI used during a game to register the operator/device and submit play-by-play events.
- **Coach Dashboard** (`apps/coach-dashboard`): UI used during a game to watch the live feed (state + insights) and run coach tools (lineups, AI chat/insights when enabled).
- **Stats Dashboard**: served as static assets by the realtime API (see routes in `services/realtime-api`).

## What to run locally

### 1) Install dependencies

From the repo root:

```bash
npm install
```

### 2) Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

Then set what you need:

- **AI insights (optional)**: set `OPENAI_API_KEY`
- **Backend auth (optional / recommended)**: set `BTA_API_KEY` (enables `x-api-key` auth for write endpoints)
- **PostgreSQL persistence (optional)**: set `DATABASE_URL` (otherwise the realtime API uses a local JSON snapshot)

If you are running front-ends on a phone/tablet via Wi-Fi hotspot and need a non-`localhost` backend URL, also update:

- `apps/ipad-operator/.env.local` (create if missing) and set `VITE_API=http://<your-lan-ip>:4000`
- `apps/coach-dashboard/.env.local` and set `VITE_API=http://<your-lan-ip>:4000`

### 3) Start everything (recommended)

```bash
npm run dev:all
```

This starts:

- Realtime API: `http://localhost:4000`
- Coach Dashboard: `http://localhost:5173`
- Operator Console: `http://localhost:5174`

### Start individually

```bash
npm run dev:api       # realtime API only
npm run dev:coach     # coach dashboard only
npm run dev:operator  # operator console only
npm run dev:stats     # alias for dev:api (API also serves stats pages)
```

## API and realtime behavior (high level)

- The API publishes live updates to Socket.IO rooms and also exposes REST endpoints.
- The operator sends events (shots, fouls, turnovers, substitutions, etc.). The backend updates the in-memory `GameState` and broadcasts:
  - `game:state` (live state)
  - `game:insights` (alerts/insights)
- The coach dashboard shows the presence status and joins the appropriate game room using `deviceId` + `gameId`.

The concrete REST endpoints and event formats are defined in `services/realtime-api/src/server.ts` (and validated in `@bta/shared-schema`).

## Smoke test

There’s a PowerShell smoke test that:
1. hits `/health`
2. creates a game
3. ingests a small set of events
4. checks score/state/events/insights endpoints

If you have PowerShell Core installed (`pwsh`), run:

```bash
pwsh -File scripts/smoke-test.ps1
```

Or, to start the API and run the test together:

```bash
pwsh -File scripts/smoke-test.ps1 -StartApi
```

There’s also a “game day launcher” script that starts `dev:all` and prints local LAN IPs:

```bash
pwsh -File scripts/game-day.ps1
```

## Tests

```bash
npm test
```

## Notes / troubleshooting

- **Port conflicts**: the dev server uses strict ports (5173/5174 for UIs, 4000 for API). If these are in use, stop the other processes or edit `vite.config.ts` / `.env.example`.
- **No AI output?** If `OPENAI_API_KEY` is not set, the AI-related endpoints will not be able to call OpenAI. The rule-based insights should still work.
- **Auth failures?** If you set `BTA_API_KEY`, the server expects `x-api-key` (or a bearer token when JWT auth is enabled).
- **Persistence**:
  - Without `DATABASE_URL`, the backend uses a local snapshot file.
  - With `DATABASE_URL`, it persists and restores sessions/rosters from PostgreSQL.

