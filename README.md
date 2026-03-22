# Pivot — Valley Catholic Basketball Platform

Hybrid high school basketball stats + AI insights platform. The iPad operator app takes live stats during a game; data flows to the realtime API for live coach dashboards and to the Stats Dashboard for season-long analytics, advanced stats, and AI insights.

---

## Project Structure

```
apps/
  coach-dashboard/      # Live coach view (scores, insights, lineups)
  ipad-operator/        # iPad stat-taking app (offline-capable)
packages/
  game-state/           # Deterministic game state engine (TypeScript)
  shared-schema/        # Zod-validated event types (TypeScript)
services/
  realtime-api/         # WebSocket + REST event ingest & fanout (Node)
  insight-engine/       # Rules-based live insight generation (Node)
  video-worker/         # Post-game video upload & timestamp sync (Node)
  stats-dashboard/      # Season stats, advanced metrics & AI analytics (Python/Flask)
```

---

## Quick Start

### 1 — Install Node dependencies (monorepo)
```bash
npm install
```

### 2 — Set up the Stats Dashboard (Python)
```bash
cd services/stats-dashboard
python -m venv .venv

# Windows
.venv\Scripts\Activate.ps1

# Mac/Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # then fill in your OPENAI_API_KEY
```

### 3 — Run everything

| Service | Command | Port |
|---|---|---|
| Realtime API | `npm run dev:api` | 4000 |
| Video Worker | `npm run dev:video` | 4100 |
| Coach Dashboard | `npm run dev:coach` | 5173 |
| iPad Operator | `npm run dev:operator` | 5174 |
| Stats Dashboard | `npm run dev:stats` | 5000 |

Or run all Node services together:
```bash
npm run dev:all
```

---

## Workflow

1. **Before a game** — Open iPad Operator, go to Settings → Teams and set up rosters. Set opponent name and VC Home/Away in Game Setup.
2. **During a game** — Use the iPad Operator to record every event (shots, rebounds, assists, steals, blocks, turnovers, fouls, subs). Stats are queued offline if connection drops and synced when back online. The Coach Dashboard shows live scores and AI insights.
3. **After a game** — Tap **⬆ Send to Dashboard** in the iPad Operator. All player and team stats are instantly saved to the Stats Dashboard, season averages update automatically, and the AI generates new insights.

---

## Key Services

### Stats Dashboard (`services/stats-dashboard/`)
- Flask app with full season stats, per-game logs, and player/team leaderboards
- Advanced metrics: eFG%, TS%, PER, usage rate, AST/TO ratio, defensive rating, consistency score
- AI-generated insights powered by OpenAI GPT-4o-mini
- **Ingest endpoint** — `POST /api/ingest-game` receives game data from the iPad app
- Deploy to Railway/Heroku via the included `Procfile` and `nixpacks.toml`

### Realtime API (`services/realtime-api/`)
- Express + Socket.io for live event streaming to the coach dashboard
- Full event correction: delete or update any past event and state replays deterministically
- Persists to `services/realtime-api/.pivot-data/realtime-api.json`

### iPad Operator (`apps/ipad-operator/`)
- Offline-first stat tracker with local queue and sync
- Records: shots (2pt/3pt/FT), rebounds (off/def), assists, steals, blocks, turnovers, fouls, substitutions
- Sends completed games to the Stats Dashboard with one tap

### Coach Dashboard (`apps/coach-dashboard/`)
- Live score, event feed, insight cards, active lineups, and foul leaders

---

## Key Ports

| Service | Port |
|---|---|
| Stats Dashboard | **5000** |
| Realtime API | **4000** |
| Video Worker | **4100** |
| Coach Dashboard | **5173** |
| iPad Operator | **5174** |

---

## Environment Variables

### Stats Dashboard (`services/stats-dashboard/.env`)
| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Required for AI insights |
| `DATABASE_URL` | PostgreSQL URL (optional; SQLite used locally) |
| `FLASK_DEBUG` | Set to `True` for development |

---

## Persistence

- Realtime API → `services/realtime-api/.pivot-data/realtime-api.json`
- Video metadata → `services/video-worker/.pivot-data/video-worker.json`
- Season stats → `services/stats-dashboard/data/vc_stats_output.json`
- Roster → `services/stats-dashboard/data/roster.json`

---

## Deployment

The Stats Dashboard includes Railway/Heroku deployment config (`Procfile`, `nixpacks.toml`). See `services/stats-dashboard/docs/DEPLOY.md` for full instructions.


## UI QA Artifacts

- Automated screenshots and audit reports are written to the `artifacts` directory
- Audit JSON includes viewport, overflow status, and touch-target checks for dashboard and operator UIs
- Latest UI audit report: `artifacts/ui-audit-2026-03-19T05-52-16-112Z.json`
- Latest UI audit report: `artifacts/ui-audit-2026-03-19T06-02-06-832Z.json`
- Latest UI audit report: `artifacts/ui-audit-2026-03-19T14-19-24-579Z.json`
