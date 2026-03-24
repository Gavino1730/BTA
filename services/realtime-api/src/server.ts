import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  createGame,
  deleteGame,
  deleteEvent,
  getGameEvents,
  getGameInsights,
  getRosterTeams,
  getGameState,
  ingestEvent,
  refreshGameAiInsights,
  saveRosterTeams,
  updateEvent
} from "./store.js";

const app = express();
app.use(cors());
app.use(express.json());

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
  res.json({ teams: saved });
});

app.post("/games", requireApiKey, (req, res) => {
  const { gameId, homeTeamId, awayTeamId, opponentName, opponentTeamId } = req.body ?? {};

  if (!gameId || !homeTeamId || !awayTeamId) {
    res.status(400).json({ error: "gameId, homeTeamId, awayTeamId are required" });
    return;
  }

  const state = createGame({
    gameId,
    homeTeamId,
    awayTeamId,
    opponentName,
    opponentTeamId
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

  const insights = await refreshGameAiInsights(req.params.gameId);
  res.json(insights ?? getGameInsights(req.params.gameId));
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
