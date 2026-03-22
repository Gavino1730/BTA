import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { resolve } from "node:path";

export interface VideoAsset {
  id: string;
  gameId: string;
  uploadedAtIso: string;
  filename: string;
  status: "uploaded" | "synced";
}

export interface SyncAnchor {
  id: string;
  gameId: string;
  videoId: string;
  eventType: "tipoff" | "quarter_start" | "buzzer";
  period: number;
  gameClockSeconds: number;
  videoSecond: number;
  createdAtIso: string;
}

export interface VideoResolution {
  videoId: string;
  period: number;
  gameClockSeconds: number;
  resolvedVideoSecond: number;
  anchorId: string;
}

const videos = new Map<string, VideoAsset[]>();
const anchors = new Map<string, SyncAnchor[]>();
const persistenceEnabled = !process.env.VITEST && process.env.NODE_ENV !== "test";
const dataDirectory = resolve(process.cwd(), ".pivot-data");
const dataFile = resolve(dataDirectory, "video-worker.json");

interface PersistedVideoStore {
  videos: Array<[string, VideoAsset[]]>;
  anchors: Array<[string, SyncAnchor[]]>;
}

function persistStore() {
  if (!persistenceEnabled) {
    return;
  }

  mkdirSync(dataDirectory, { recursive: true });
  const payload: PersistedVideoStore = {
    videos: [...videos.entries()],
    anchors: [...anchors.entries()]
  };

  writeFileSync(dataFile, JSON.stringify(payload, null, 2), "utf8");
}

function restoreStore() {
  if (!persistenceEnabled || !existsSync(dataFile)) {
    return;
  }

  const payload = JSON.parse(readFileSync(dataFile, "utf8")) as PersistedVideoStore;
  payload.videos.forEach(([gameId, gameVideos]) => videos.set(gameId, gameVideos));
  payload.anchors.forEach(([gameId, gameAnchors]) => anchors.set(gameId, gameAnchors));
}

restoreStore();

export function addVideo(input: Omit<VideoAsset, "status" | "uploadedAtIso">): VideoAsset {
  const next: VideoAsset = {
    ...input,
    status: "uploaded",
    uploadedAtIso: new Date().toISOString()
  };

  const existing = videos.get(input.gameId) ?? [];
  videos.set(input.gameId, [next, ...existing]);
  persistStore();

  return next;
}

export function listVideos(gameId: string): VideoAsset[] {
  return videos.get(gameId) ?? [];
}

export function addAnchor(input: Omit<SyncAnchor, "createdAtIso">): SyncAnchor {
  const next: SyncAnchor = {
    ...input,
    createdAtIso: new Date().toISOString()
  };

  const existing = anchors.get(input.gameId) ?? [];
  anchors.set(input.gameId, [next, ...existing]);

  const gameVideos = videos.get(input.gameId) ?? [];
  const updated = gameVideos.map((video) =>
    video.id === input.videoId ? { ...video, status: "synced" as const } : video
  );
  videos.set(input.gameId, updated);
  persistStore();

  return next;
}

export function listAnchors(gameId: string): SyncAnchor[] {
  return anchors.get(gameId) ?? [];
}

export function resolveVideoSecond(
  gameId: string,
  videoId: string,
  period: number,
  gameClockSeconds: number
): VideoResolution | null {
  const gameAnchors = (anchors.get(gameId) ?? []).filter(
    (anchor) => anchor.videoId === videoId && anchor.period === period
  );

  if (gameAnchors.length === 0) {
    return null;
  }

  const nearest = gameAnchors.reduce((best, anchor) => {
    const bestDistance = Math.abs(best.gameClockSeconds - gameClockSeconds);
    const currentDistance = Math.abs(anchor.gameClockSeconds - gameClockSeconds);
    return currentDistance < bestDistance ? anchor : best;
  });

  const delta = nearest.gameClockSeconds - gameClockSeconds;
  const resolvedVideoSecond = Math.max(0, Math.round(nearest.videoSecond + delta));

  return {
    videoId,
    period,
    gameClockSeconds,
    resolvedVideoSecond,
    anchorId: nearest.id
  };
}
