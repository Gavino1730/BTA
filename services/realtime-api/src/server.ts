import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  createGame,
  deleteEvent,
  getGameEvents,
  getGameInsights,
  getGameState,
  ingestEvent,
  updateEvent
} from "./store.js";

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Optional API-key auth. Set PIVOT_API_KEY env var to enable.
// ---------------------------------------------------------------------------
const API_KEY = process.env.PIVOT_API_KEY;
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

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/games", requireApiKey, (req, res) => {
  const { gameId, homeTeamId, awayTeamId } = req.body ?? {};

  if (!gameId || !homeTeamId || !awayTeamId) {
    res.status(400).json({ error: "gameId, homeTeamId, awayTeamId are required" });
    return;
  }

  const state = createGame({
    gameId,
    homeTeamId,
    awayTeamId
  });

  io.to(gameId).emit("game:state", state);
  io.to(gameId).emit("game:insights", []);

  res.status(201).json(state);
});

app.get("/games/:gameId/state", requireApiKey, (req, res) => {
  const state = getGameState(req.params.gameId);

  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  res.json(state);
});

app.get("/games/:gameId/insights", requireApiKey, (req, res) => {
  const state = getGameState(req.params.gameId);
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  res.json(getGameInsights(req.params.gameId));
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

  socket.on("join:game", (gameId: string) => {
    if (!gameId) {
      return;
    }

    socket.join(gameId);
    const state = getGameState(gameId);
    if (state) {
      socket.emit("game:state", state);
      socket.emit("game:insights", getGameInsights(gameId));
    }
  });
});

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`Realtime API listening on port ${port}`);
});
