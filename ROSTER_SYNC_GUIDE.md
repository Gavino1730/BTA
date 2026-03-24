# Roster & Team Syncing System

## Overview

The BTA basketball platform now includes a rebuilt roster, team, and player syncing system that automatically keeps rosters consistent across all platforms in real-time:

- **Coach Dashboard** — Create, edit, and delete teams/rosters
- **iPad Operator Console** — Accesses teams and automatically syncs changes
- **Stats Dashboard** — Manages players and receives roster updates
- **Realtime API** — Central hub for roster state and broadcasts changes via WebSocket

## Architecture

### Data Flow

```
Coach Dashboard (creates/edits teams)
         ↓
Realtime API (/teams, /config/roster-teams)
         ↓ (broadcasts via socket.io)
iPad Operator Console + Stats Dashboard (receive updates)
```

### Central Source of Truth

The **Realtime API** (`services/realtime-api`) holds the source of truth for all rosters via in-memory storage, persisted to `.platform-data/realtime-api.json`. When any app makes a change:

1. The change is sent to Realtime API via REST endpoint
2. Realtime API broadcasts the update to all connected clients via Socket.IO
3. All apps (Coach, Operator, Stats) receive the update and sync their local state

## API Endpoints

### Realtime API Roster Endpoints

#### Get all teams
```bash
GET /config/roster-teams
```
Response:
```json
{
  "teams": [
    {
      "id": "team-1",
      "name": "Eagles",
      "abbreviation": "EAG",
      "players": [
        {
          "id": "team-1-1",
          "number": "1",
          "name": "John Doe",
          "position": "PG",
          "height": "6'0\"",
          "grade": "11"
        }
      ]
    }
  ]
}
```

#### Create a team
```bash
POST /teams
Content-Type: application/json

{
  "name": "Eagles",
  "abbreviation": "EAG"
}
```

#### Update a team
```bash
PUT /teams/:teamId
Content-Type: application/json

{
  "name": "New Team Name",
  "abbreviation": "NEW"
}
```

#### Delete a team
```bash
DELETE /teams/:teamId
```

#### Add a player to a team
```bash
POST /teams/:teamId/players
Content-Type: application/json

{
  "number": "1",
  "name": "John Doe",
  "position": "PG",
  "height": "6'0\"",
  "grade": "11"
}
```

#### Update a player
```bash
PUT /teams/:teamId/players/:playerId
Content-Type: application/json

{
  "position": "SG",
  "height": "6'1\""
}
```

#### Delete a player
```bash
DELETE /teams/:teamId/players/:playerId
```

### Stats Dashboard Roster Endpoints

#### Get all teams (includes stats)
```bash
GET /api/teams
```

#### Get all players (with season stats)
```bash
GET /api/players
```

#### Create team
```bash
POST /api/team
```

#### Add/update player
```bash
POST /api/player/:playerName
```

#### Delete player
```bash
DELETE /api/player/:playerName
```

#### Sync roster (from other sources)
```bash
PUT /api/roster-sync
Content-Type: application/json

{
  "teams": [
    {
      "id": "team-1",
      "name": "Eagles",
      "players": [...]
    }
  ],
  "preferredTeamId": "team-1"
}
```

## Socket.IO Events

When rosters change, the Realtime API broadcasts events to all connected clients:

### Broadcast Events (all apps receive)

- `roster:teams` — Full roster list updated
  ```json
  [
    {
      "id": "team-1",
      "name": "Eagles",
      "abbreviation": "EAG",
      "players": [...]
    }
  ]
  ```

- `team:created` — New team created
  ```json
  {
    "team": {
      "id": "team-2",
      "name": "Hawks",
      "abbreviation": "HAW",
      "players": []
    }
  }
  ```

- `team:updated` — Team info updated
  ```json
  {
    "team": {
      "id": "team-1",
      "name": "Eagles (Updated)",
      "abbreviation": "EAG"
    }
  }
  ```

- `team:deleted` — Team removed
  ```json
  {
    "teamId": "team-1"
  }
  ```

- `player:added` — Player added to team
  ```json
  {
    "teamId": "team-1",
    "player": {
      "id": "team-1-1",
      "number": "1",
      "name": "Jane Smith",
      "position": "SG"
    }
  }
  ```

- `player:updated` — Player attributes changed
  ```json
  {
    "teamId": "team-1",
    "player": {
      "id": "team-1-1",
      "number": "1",
      "name": "Jane Smith",
      "position": "SF"
    }
  }
  ```

- `player:deleted` — Player removed from team
  ```json
  {
    "teamId": "team-1",
    "playerId": "team-1-1"
  }
  ```

## Using the Sync Helpers

### Coach Dashboard

```typescript
import { 
  syncRosterToRealtime,
  createTeamViaRealtime,
  addPlayerViaRealtime,
} from "./roster-sync";

// Sync a roster to the realtime API
await syncRosterToRealtime(
  "http://localhost:4000",
  teams,
  apiKey // optional
);

// Create a team
const team = await createTeamViaRealtime(
  "http://localhost:4000",
  "Eagles",
  "EAG",
  apiKey
);

// Add a player
await addPlayerViaRealtime(
  "http://localhost:4000",
  teamId,
  {
    number: "1",
    name: "John Doe",
    position: "PG"
  },
  apiKey
);
```

### iPad Operator Console

```typescript
import { 
  fetchTeamsFromRealtime,
  subscribeToRosterUpdates,
  addPlayerViaRealtime,
} from "./roster-sync";

// Fetch teams from API
const teams = await fetchTeamsFromRealtime(
  "http://localhost:4000",
  apiKey
);

// Subscribe to roster updates
const unsubscribe = subscribeToRosterUpdates(
  socket,
  (teams) => {
    // Handle roster update
  }
);

// Add a player
await addPlayerViaRealtime(
  "http://localhost:4000",
  teamId,
  player,
  apiKey
);
```

## Automatic Player Addition to Stats Dashboard

When a game is submitted from the iPad Operator:

1. **Player is added automatically** — The stats dashboard receives the player roster
2. **Player shows up in stats dashboard** — Even with zero games played
3. **Roster syncs back** — If operators add/delete players, stats dashboard receives the update

## API Authentication

If the Realtime API has `BTA_API_KEY` environment variable set, all requests must include:

```
x-api-key: <your-api-key>
```

Or as a query parameter:
```
?apiKey=<your-api-key>
```

## Error Handling

All API endpoints return JSON errors:

```json
{
  "error": "team not found"
}
```

Sync helper functions return `null` or `false` on error and log to console. Apps should:

1. Check return values
2. Provide user feedback (e.g., "Failed to add player")
3. Optionally retry or alert the user

## Example Workflow: Adding a Player from Coach Dashboard

1. Coach opens "Teams & Rosters" in Settings
2. Selects a team and clicks "Add Player"
3. Enters player info (name, number, position, etc.)
4. Clicks "Save"
5. **Coach Dashboard** calls `addPlayerViaRealtime()`
6. **Realtime API** adds player to team and broadcasts `player:added` event
7. **iPad Operator** receives event, updates local teams list
8. **Stats Dashboard** receives event, shows player in roster
9. Player now appears on all platforms in real-time

## Example Workflow: Deleting a Player from iPad Operator

1. Operator opens "Settings" → "Teams & Rosters" (synced from Realtime API)
2. Selects a team, finds a player, clicks "Delete"
3. Confirms deletion
4. **iPad Operator** calls `deletePlayerViaRealtime()`
5. **Realtime API** removes player and broadcasts `player:deleted` event
6. **Coach Dashboard** receives event, updates roster display
7. **Stats Dashboard** receives event, removes player from roster
8. Player deletion is instantly reflected across all platforms

## Persistence

- **Realtime API**: Roster state persists to `.platform-data/realtime-api.json`
- **Stats Dashboard**: Roster information synced to `apps/stats-dashboard/data/roster.json`
- **Coach/Operator**: Teams stored in local storage (fallback only; Realtime API is source of truth)

## Testing

To test the sync system in development:

```bash
# Terminal 1: Start Realtime API
npm run dev:api

# Terminal 2: Start Coach Dashboard
npm run dev:coach

# Terminal 3: Start iPad Operator
npm run dev:operator

# Terminal 4: Start Stats Dashboard
npm run dev:stats
```

Then:

1. Open Coach Dashboard → Settings → Teams & Rosters
2. Create a team and add players
3. Open iPad Operator → Settings → Game Setup → Roster
   - You should see your team in the roster automatically synced
4. Open Stats Dashboard → Players
   - Your players should appear even with zero games

Make changes in one app and watch them appear instantly in the others.

## Troubleshooting

### Teams not syncing to iPad Operator

- Check that `apiUrl` is correct (default: `http://localhost:4000`)
- Ensure Realtime API is running
- Check browser console for CORS or connection errors
- Verify API key is set correctly if `BTA_API_KEY` env var is set

### Players not appearing in Stats Dashboard

- Confirm `/api/players` endpoint returns players
- Check `apps/stats-dashboard/data/roster.json` is updated
- Verify Flask app reloaded data (`/api/reload-data`)
- Check stats dashboard logs for sync errors

### Changes not broadcasting to other apps

- Verify Socket.IO connections are active
- Check that apps are connected to the same Realtime API URL
- Ensure firewall/proxy is not blocking WebSocket connections
- Check for any proxy that might strip `x-api-key` headers

## Summary

This rebuilt roster system provides:

✅ **Real-time synchronization** across all platforms  
✅ **Centralized roster management** via Realtime API  
✅ **Automatic player additions** to stats dashboard  
✅ **Bidirectional sync** — changes from any app update all others  
✅ **No manual roster entry** on multiple platforms  
✅ **Persistent storage** with fallback to local storage  
