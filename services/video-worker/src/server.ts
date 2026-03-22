import cors from "cors";
import express from "express";
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

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/games/:gameId/videos", (req, res) => {
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

app.get("/games/:gameId/videos", (req, res) => {
  res.json(listVideos(req.params.gameId));
});

app.post("/games/:gameId/sync-anchors", (req, res) => {
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
    period: Number(period ?? 1),
    gameClockSeconds: Number(gameClockSeconds ?? 0),
    videoSecond: Number(videoSecond ?? 0)
  });

  res.status(201).json(anchor);
});

app.get("/games/:gameId/sync-anchors", (req, res) => {
  res.json(listAnchors(req.params.gameId));
});

app.get("/games/:gameId/videos/:videoId/resolve", (req, res) => {
  const period = Number(req.query.period ?? 1);
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
app.listen(port, () => {
  console.log(`Video worker listening on port ${port}`);
});
