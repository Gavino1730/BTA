# Pivot

Hybrid high school basketball stats + AI insights platform.

## Implemented Slices

- Shared schema package with strict event validation via Zod
- Deterministic game-state package with replay support
- Deterministic game-state package with replay support, possession counters, and active lineup tracking
- Deterministic game-state package with replay support, possession counters, active lineup tracking, and per-player box score stats
- Realtime API service with event ingest, state fanout, and websocket rooms
- Realtime API correction flow with event deletion and full state replay
- Insight engine service with rules-based live insight generation
- Video worker service for post-game upload metadata and timeline sync anchors
- Video worker service for post-game upload metadata, timeline sync anchors, and event-to-video timestamp resolution
- Coach dashboard web app for live score, event feed, and insight cards
- iPad operator web app with offline queue, reconnect sync, and event history
- iPad operator web app with offline queue, reconnect sync, event history, and quick substitution/possession controls
- File-backed persistence for realtime and video services under each service's `.pivot-data` directory

## Run

1. Install dependencies: `npm install`
2. Run tests: `npm test`
3. Run realtime API: `npm run dev:api`
4. Run video worker: `npm run dev:video`
5. Run coach dashboard: `npm run dev:coach`
6. Run operator app: `npm run dev:operator`
7. Run UI audit + screenshots: `npm run audit:ui`

## Key Ports

- Realtime API: 4000
- Video worker: 4100
- Coach dashboard: 5173
- Operator app: 5174

## Persistence

- Realtime API state persists to `services/realtime-api/.pivot-data/realtime-api.json`
- Video metadata persists to `services/video-worker/.pivot-data/video-worker.json`

## Correction Workflow

- Operators can delete a submitted event
- Operators can update submitted events in place (for example, toggling made/miss on a shot)
- The backend replays the remaining event stream to recompute score, fouls, and insights deterministically

## Lineup and Possession Tracking

- `possession_start` events increment team possession counts
- `substitution` events increment team substitution totals and update active lineup snapshots
- Coach dashboard score cards now show possessions, substitutions, and current active players
- Coach dashboard score cards now show possessions, substitutions, active players, top scorers, and foul leaders

## Event-to-Video Resolution

- Endpoint: `GET /games/:gameId/videos/:videoId/resolve?period=<number>&gameClockSeconds=<number>`
- Uses nearest sync anchor in the same period to estimate clip time
- Coach dashboard can resolve clip timestamps directly from recent events

## UI QA Artifacts

- Automated screenshots and audit reports are written to the `artifacts` directory
- Audit JSON includes viewport, overflow status, and touch-target checks for dashboard and operator UIs
- Latest UI audit report: `artifacts/ui-audit-2026-03-19T05-52-16-112Z.json`
- Latest UI audit report: `artifacts/ui-audit-2026-03-19T06-02-06-832Z.json`
- Latest UI audit report: `artifacts/ui-audit-2026-03-19T14-19-24-579Z.json`
