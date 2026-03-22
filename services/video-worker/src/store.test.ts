import { describe, expect, it } from "vitest";
import {
  addAnchor,
  addVideo,
  listAnchors,
  listVideos,
  resolveVideoSecond
} from "./store.js";

describe("video-worker store", () => {
  it("tracks uploaded videos and sync anchors", () => {
    addVideo({ id: "vid-1", gameId: "game-1", filename: "full-game.mp4" });

    addAnchor({
      id: "anchor-1",
      gameId: "game-1",
      videoId: "vid-1",
      eventType: "tipoff",
      period: 1,
      gameClockSeconds: 480,
      videoSecond: 18
    });

    const videos = listVideos("game-1");
    const anchors = listAnchors("game-1");

    expect(videos).toHaveLength(1);
    expect(videos[0].status).toBe("synced");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].eventType).toBe("tipoff");
  });

  it("resolves event clock to video second", () => {
    addVideo({ id: "vid-2", gameId: "game-2", filename: "q1.mp4" });

    addAnchor({
      id: "anchor-tipoff",
      gameId: "game-2",
      videoId: "vid-2",
      eventType: "tipoff",
      period: 1,
      gameClockSeconds: 480,
      videoSecond: 12
    });

    addAnchor({
      id: "anchor-mid",
      gameId: "game-2",
      videoId: "vid-2",
      eventType: "quarter_start",
      period: 1,
      gameClockSeconds: 360,
      videoSecond: 132
    });

    const result = resolveVideoSecond("game-2", "vid-2", 1, 350);

    expect(result).not.toBeNull();
    expect(result?.anchorId).toBe("anchor-mid");
    expect(result?.resolvedVideoSecond).toBe(142);
  });
});
