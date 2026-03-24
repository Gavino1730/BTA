import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Period } from "@bta/shared-schema";
import {
  addAnchor,
  addVideo,
  listAnchors,
  listVideos,
  resolveVideoSecond
} from "./store.js";

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Optional API-key auth. Set BTA_API_KEY env var to enable.
// ---------------------------------------------------------------------------
const API_KEY = process.env.BTA_API_KEY;
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!API_KEY) { next(); return; }
  const provided = req.headers["x-api-key"] ?? req.query.apiKey;
  if (provided === API_KEY) { next(); return; }
  res.status(401).json({ error: "Unauthorized — invalid or missing x-api-key" });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/games/:gameId/videos", requireApiKey, (req, res) => {
  const { id, filename } = req.body ?? {};

  if (!id || !filename) {
    res.status(400).json({ error: "id and filename are required" });
    return;
  }

  const video = addVideo({
    id,
    gameId: req.params.gameId,
    filename
  });

  res.status(201).json(video);
});

app.get("/games/:gameId/videos", requireApiKey, (req, res) => {
  res.json(listVideos(req.params.gameId));
});

app.post("/games/:gameId/sync-anchors", requireApiKey, (req, res) => {
  const { id, videoId, eventType, period, gameClockSeconds, videoSecond } = req.body ?? {};

  if (!id || !videoId || !eventType) {
    res.status(400).json({ error: "id, videoId, and eventType are required" });
    return;
  }

  const anchor = addAnchor({
    id,
    gameId: req.params.gameId,
    videoId,
    eventType,
    period: String(period ?? "Q1") as Period,
    gameClockSeconds: Number(gameClockSeconds ?? 0),
    videoSecond: Number(videoSecond ?? 0)
  });

  res.status(201).json(anchor);
});

app.get("/games/:gameId/sync-anchors", requireApiKey, (req, res) => {
  res.json(listAnchors(req.params.gameId));
});

app.get("/games/:gameId/videos/:videoId/resolve", requireApiKey, (req, res) => {
  const period = String(req.query.period ?? "Q1") as Period;
  const gameClockSeconds = Number(req.query.gameClockSeconds ?? 0);

  const resolution = resolveVideoSecond(
    req.params.gameId,
    req.params.videoId,
    period,
    gameClockSeconds
  );

  if (!resolution) {
    res.status(404).json({ error: "no sync anchors found for video and period" });
    return;
  }

  res.json(resolution);
});

const port = Number(process.env.VIDEO_PORT ?? 4100);
const host = process.env.HOST ?? "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Video worker listening on http://${host}:${port}`);
});
