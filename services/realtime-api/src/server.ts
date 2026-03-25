import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  answerGameAiChat,
  type CoachAiChatResponse,
  type AiPromptPreview,
  type GameAiContext,
  type CoachAiSettings,
  createGame,
  deleteGame,
  deleteEvent,
  getGameAiContext,
  getGameAiPromptPreview,
  getGameAiSettings,
  getGameEvents,
  getGameInsights,
  getRosterTeams,
  getGameState,
  ingestEvent,
  refreshGameAiInsights,
  saveRosterTeams,
  updateGameAiContext,
  updateGameAiSettings,
  updateEvent
} from "./store.js";

const app = express();
app.use(cors());
app.use(express.json());

const STATS_DASHBOARD_BASE = (process.env.STATS_DASHBOARD_BASE ?? "http://localhost:5000").replace(/\/+$/, "");

function normalizeTeamColor(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return /^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/.test(normalized) ? normalized : undefined;
}

function buildStatsSyncHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  }
  return headers;
}

function syncRosterTeamsToStatsDashboard(teams: unknown[]): void {
  const preferredTeamId = typeof teams[0] === "object" && teams[0] !== null && "id" in teams[0]
    ? String((teams[0] as { id?: unknown }).id ?? "")
    : "";

  void fetch(`${STATS_DASHBOARD_BASE}/api/roster-sync`, {
    method: "PUT",
    headers: buildStatsSyncHeaders(),
    body: JSON.stringify({ teams, preferredTeamId })
  })
    .then((response) => {
      if (!response.ok) {
        console.warn("[realtime-api] stats roster-sync returned non-OK", response.status);
      }
    })
    .catch((error: unknown) => {
      console.warn("[realtime-api] stats roster-sync request failed", error);
    });
}

// ---------------------------------------------------------------------------
// Optional API-key auth. Set BTA_API_KEY env var to enable.
// ---------------------------------------------------------------------------
const API_KEY = process.env.BTA_API_KEY;
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!API_KEY) { next(); return; }                       // key not configured → open
  const provided = req.headers["x-api-key"] ?? req.query.apiKey;
  if (provided === API_KEY) { next(); return; }
  res.status(401).json({ error: "Unauthorized — invalid or missing x-api-key" });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

interface OperatorPresence {
  deviceId: string;
  gameId: string;
  socketId: string;
  connectedAtIso: string;
  lastSeenIso: string;
}

const operatorPresenceBySocketId = new Map<string, OperatorPresence>();

function getOperatorByDeviceId(deviceId: string): OperatorPresence | null {
  for (const operator of operatorPresenceBySocketId.values()) {
    if (operator.deviceId === deviceId) {
      return operator;
    }
  }

  return null;
}

function emitPresence(deviceId: string): void {
  const operator = getOperatorByDeviceId(deviceId);
  const payload = {
    deviceId,
    online: Boolean(operator),
    gameId: operator?.gameId ?? null,
    lastSeenIso: operator?.lastSeenIso ?? null
  };

  io.to(`device:${deviceId}`).emit("presence:status", payload);
}

async function refreshAndBroadcastInsights(gameId: string): Promise<void> {
  const insights = await refreshGameAiInsights(gameId);
  if (insights) {
    io.to(gameId).emit("game:insights", insights);
  }
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/config/roster-teams", requireApiKey, (_req, res) => {
  res.json({ teams: getRosterTeams() });
});

app.put("/config/roster-teams", requireApiKey, (req, res) => {
  const teams = req.body?.teams;
  if (!Array.isArray(teams)) {
    res.status(400).json({ error: "teams array is required" });
    return;
  }

  const saved = saveRosterTeams(teams);
  io.emit("roster:teams", saved);
  syncRosterTeamsToStatsDashboard(saved);
  res.json({ teams: saved });
});

// ─────────────────────────────────────────────────────────────────────────
// Team Management Routes
// ─────────────────────────────────────────────────────────────────────────

app.get("/teams", requireApiKey, (_req, res) => {
  res.json({ teams: getRosterTeams() });
});

app.post("/teams", requireApiKey, (req, res) => {
  const { name, abbreviation } = req.body ?? {};
  const teamColor = normalizeTeamColor(req.body?.teamColor);
  if (!name || !abbreviation) {
    res.status(400).json({ error: "name and abbreviation are required" });
    return;
  }

  const teams = getRosterTeams();
  const id = `team-${Date.now()}`;
  const newTeam = {
    id,
    name,
    abbreviation,
    teamColor,
    players: []
  };
  
  teams.push(newTeam);
  saveRosterTeams(teams);
  io.emit("roster:teams", teams);
  io.emit("team:created", { team: newTeam });
  syncRosterTeamsToStatsDashboard(teams);
  
  res.status(201).json({ team: newTeam });
});

app.put("/teams/:teamId", requireApiKey, (req, res) => {
  const { name, abbreviation } = req.body ?? {};
  const teamColor = normalizeTeamColor(req.body?.teamColor);
  const teams = getRosterTeams();
  const team = teams.find(t => t.id === req.params.teamId);
  
  if (!team) {
    res.status(404).json({ error: "team not found" });
    return;
  }
  
  if (name) team.name = name;
  if (abbreviation) team.abbreviation = abbreviation;
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "teamColor")) {
    team.teamColor = teamColor;
  }
  
  saveRosterTeams(teams);
  io.emit("roster:teams", teams);
  io.emit("team:updated", { team });
  syncRosterTeamsToStatsDashboard(teams);
  
  res.json({ team });
});

app.delete("/teams/:teamId", requireApiKey, (req, res) => {
  const teams = getRosterTeams();
  const idx = teams.findIndex(t => t.id === req.params.teamId);
  
  if (idx < 0) {
    res.status(404).json({ error: "team not found" });
    return;
  }
  
  const deleted = teams.splice(idx, 1)[0];
  saveRosterTeams(teams);
  io.emit("roster:teams", teams);
  io.emit("team:deleted", { teamId: deleted.id });
  syncRosterTeamsToStatsDashboard(teams);
  
  res.json({ teamId: deleted.id });
});

app.post("/teams/:teamId/players", requireApiKey, (req, res) => {
  const { number, name, position, height, grade } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const teams = getRosterTeams();
  const team = teams.find(t => t.id === req.params.teamId);
  
  if (!team) {
    res.status(404).json({ error: "team not found" });
    return;
  }
  
  const playerId = `${req.params.teamId}-${Date.now()}`;
  const player = {
    id: playerId,
    number: String(number || ""),
    name,
    position: String(position || ""),
    height: height ? String(height) : undefined,
    grade: grade ? String(grade) : undefined
  };
  
  team.players.push(player);
  saveRosterTeams(teams);
  io.emit("roster:teams", teams);
  io.emit("player:added", { teamId: req.params.teamId, player });
  syncRosterTeamsToStatsDashboard(teams);
  
  res.status(201).json({ player });
});

app.put("/teams/:teamId/players/:playerId", requireApiKey, (req, res) => {
  const { number, name, position, height, grade } = req.body ?? {};
  const teams = getRosterTeams();
  const team = teams.find(t => t.id === req.params.teamId);
  
  if (!team) {
    res.status(404).json({ error: "team not found" });
    return;
  }
  
  const player = team.players.find(p => p.id === req.params.playerId);
  if (!player) {
    res.status(404).json({ error: "player not found" });
    return;
  }
  
  if (number !== undefined) player.number = String(number);
  if (name !== undefined) player.name = name;
  if (position !== undefined) player.position = String(position);
  if (height !== undefined) player.height = height ? String(height) : undefined;
  if (grade !== undefined) player.grade = grade ? String(grade) : undefined;
  
  saveRosterTeams(teams);
  io.emit("roster:teams", teams);
  io.emit("player:updated", { teamId: req.params.teamId, player });
  syncRosterTeamsToStatsDashboard(teams);
  
  res.json({ player });
});

app.delete("/teams/:teamId/players/:playerId", requireApiKey, (req, res) => {
  const teams = getRosterTeams();
  const team = teams.find(t => t.id === req.params.teamId);
  
  if (!team) {
    res.status(404).json({ error: "team not found" });
    return;
  }
  
  const idx = team.players.findIndex(p => p.id === req.params.playerId);
  if (idx < 0) {
    res.status(404).json({ error: "player not found" });
    return;
  }
  
  const deleted = team.players.splice(idx, 1)[0];
  saveRosterTeams(teams);
  io.emit("roster:teams", teams);
  io.emit("player:deleted", { teamId: req.params.teamId, playerId: deleted.id });
  syncRosterTeamsToStatsDashboard(teams);
  
  res.json({ playerId: deleted.id });
});

app.post("/games", requireApiKey, (req, res) => {
  const {
    gameId,
    homeTeamId,
    awayTeamId,
    opponentName,
    opponentTeamId,
    startingLineupByTeam,
    aiContext
  } = req.body ?? {};

  if (!gameId || !homeTeamId || !awayTeamId) {
    res.status(400).json({ error: "gameId, homeTeamId, awayTeamId are required" });
    return;
  }

  const state = createGame({
    gameId,
    homeTeamId,
    awayTeamId,
    opponentName,
    opponentTeamId,
    startingLineupByTeam,
    aiContext
  });

  io.to(gameId).emit("game:state", state);
  io.to(gameId).emit("game:insights", []);

  res.status(201).json(state);
});

app.delete("/games/:gameId", requireApiKey, (req, res) => {
  const removed = deleteGame(req.params.gameId);
  if (!removed) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  io.to(req.params.gameId).emit("game:deleted", { gameId: req.params.gameId });
  res.json({ gameId: req.params.gameId, deleted: true });
});

app.get("/games/:gameId/state", requireApiKey, (req, res) => {
  const state = getGameState(req.params.gameId);

  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  res.json(state);
});

app.get("/games/:gameId/insights", requireApiKey, async (req, res) => {
  const state = getGameState(req.params.gameId);
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const forceRefresh = req.query.force === "1" || req.query.force === "true";
  const insights = await refreshGameAiInsights(req.params.gameId, { force: forceRefresh });
  res.json(insights ?? getGameInsights(req.params.gameId));
});

app.get("/games/:gameId/ai-settings", requireApiKey, (req, res) => {
  const state = getGameState(req.params.gameId);
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const settings = getGameAiSettings(req.params.gameId);
  res.json(settings);
});

app.put("/games/:gameId/ai-settings", requireApiKey, async (req, res) => {
  const state = getGameState(req.params.gameId);
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const payload = (req.body ?? {}) as Partial<CoachAiSettings>;
  const updated = updateGameAiSettings(req.params.gameId, payload);
  if (!updated) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const insights = await refreshGameAiInsights(req.params.gameId);
  if (insights) {
    io.to(req.params.gameId).emit("game:insights", insights);
  }

  res.json(updated);
});

app.get("/games/:gameId/ai-context", requireApiKey, (req, res) => {
  const state = getGameState(req.params.gameId);
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const context = getGameAiContext(req.params.gameId);
  res.json(context);
});

app.put("/games/:gameId/ai-context", requireApiKey, async (req, res) => {
  const state = getGameState(req.params.gameId);
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const payload = (req.body ?? {}) as Partial<GameAiContext>;
  const updated = updateGameAiContext(req.params.gameId, payload);
  if (!updated) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const insights = await refreshGameAiInsights(req.params.gameId, { force: true });
  if (insights) {
    io.to(req.params.gameId).emit("game:insights", insights);
  }

  res.json(updated);
});

app.get("/games/:gameId/ai-prompt-preview", requireApiKey, (req, res) => {
  const state = getGameState(req.params.gameId);
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const preview = getGameAiPromptPreview(req.params.gameId);
  if (!preview) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  res.json(preview as AiPromptPreview);
});

app.post("/games/:gameId/ai-chat", requireApiKey, async (req, res) => {
  const state = getGameState(req.params.gameId);
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const question = typeof req.body?.question === "string" ? req.body.question : "";
  if (!question.trim()) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  const response = await answerGameAiChat(req.params.gameId, question, req.body?.history);
  if (!response) {
    res.status(503).json({ error: "ai chat unavailable" });
    return;
  }

  res.json(response as CoachAiChatResponse);
});

app.get("/games/:gameId/events", requireApiKey, (req, res) => {
  const state = getGameState(req.params.gameId);
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  res.json(getGameEvents(req.params.gameId));
});

app.post("/games/:gameId/events", requireApiKey, (req, res) => {
  try {
    const payload = {
      ...(req.body ?? {}),
      gameId: req.params.gameId
    };

    const { event, state, insights } = ingestEvent(payload);

    io.to(event.gameId).emit("game:event", event);
    io.to(event.gameId).emit("game:state", state);
    io.to(event.gameId).emit("game:insights", insights);
    void refreshAndBroadcastInsights(event.gameId);

    res.status(201).json({ event, state, insights });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "invalid event" });
  }
});

app.delete("/games/:gameId/events/:eventId", requireApiKey, (req, res) => {
  try {
    const { state, insights } = deleteEvent(req.params.gameId, req.params.eventId);

    io.to(req.params.gameId).emit("game:event:deleted", { eventId: req.params.eventId });
    io.to(req.params.gameId).emit("game:state", state);
    io.to(req.params.gameId).emit("game:insights", insights);
    void refreshAndBroadcastInsights(req.params.gameId);

    res.json({ state, insights });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "delete failed" });
  }
});

app.put("/games/:gameId/events/:eventId", requireApiKey, (req, res) => {
  try {
    const { event, state, insights } = updateEvent(
      req.params.gameId,
      req.params.eventId,
      req.body ?? {}
    );

    io.to(req.params.gameId).emit("game:event:updated", event);
    io.to(req.params.gameId).emit("game:state", state);
    io.to(req.params.gameId).emit("game:insights", insights);
    void refreshAndBroadcastInsights(req.params.gameId);

    res.json({ event, state, insights });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "update failed" });
  }
});

io.on("connection", (socket) => {
  // Validate API key on socket connection when auth is enabled
  if (API_KEY) {
    const provided = (socket.handshake.auth as Record<string, unknown>)?.apiKey as string | undefined
      ?? socket.handshake.headers["x-api-key"] as string | undefined;
    if (provided !== API_KEY) {
      socket.emit("error", { message: "Unauthorized — invalid or missing apiKey" });
      socket.disconnect(true);
      return;
    }
  }

  function registerOperator(rawPayload: unknown): void {
    const payload = (rawPayload ?? {}) as Record<string, unknown>;
    const deviceId = typeof payload.deviceId === "string" ? payload.deviceId.trim() : "";
    const gameId = typeof payload.gameId === "string" ? payload.gameId.trim() : "";

    if (!deviceId || !gameId) {
      return;
    }

    const now = new Date().toISOString();
    const existing = operatorPresenceBySocketId.get(socket.id);

    operatorPresenceBySocketId.set(socket.id, {
      deviceId,
      gameId,
      socketId: socket.id,
      connectedAtIso: existing?.connectedAtIso ?? now,
      lastSeenIso: now
    });

    socket.join(gameId);
    socket.join(`device:${deviceId}`);
    emitPresence(deviceId);
  }

  socket.on("operator:register", (payload: unknown) => {
    registerOperator(payload);
  });

  socket.on("operator:heartbeat", (payload: unknown) => {
    registerOperator(payload);
  });

  socket.on("join:game", (gameId: string) => {
    if (!gameId) {
      return;
    }

    socket.join(gameId);
    const state = getGameState(gameId);
    if (state) {
      socket.emit("game:state", state);
      socket.emit("game:insights", getGameInsights(gameId));
      void refreshAndBroadcastInsights(gameId);
    }
  });

  socket.on("join:coach", (rawPayload: unknown) => {
    const payload = (rawPayload ?? {}) as Record<string, unknown>;
    const gameId = typeof payload.gameId === "string" ? payload.gameId.trim() : "";
    const deviceId = typeof payload.deviceId === "string" ? payload.deviceId.trim() : "";

    if (gameId) {
      socket.join(gameId);
      const state = getGameState(gameId);
      if (state) {
        socket.emit("game:state", state);
        socket.emit("game:insights", getGameInsights(gameId));
        void refreshAndBroadcastInsights(gameId);
      }
    }

    if (deviceId) {
      socket.join(`device:${deviceId}`);
      const operator = getOperatorByDeviceId(deviceId);
      socket.emit("presence:status", {
        deviceId,
        online: Boolean(operator),
        gameId: operator?.gameId ?? null,
        lastSeenIso: operator?.lastSeenIso ?? null
      });
    }
  });

  socket.on("disconnect", () => {
    const operator = operatorPresenceBySocketId.get(socket.id);
    if (!operator) {
      return;
    }

    operatorPresenceBySocketId.delete(socket.id);
    emitPresence(operator.deviceId);
  });
});

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
httpServer.listen(port, host, () => {
  console.log(`Realtime API listening on http://${host}:${port}`);
});
