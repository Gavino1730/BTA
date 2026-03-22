import { describe, expect, it } from "vitest";
import { isGameEvent, parseGameEvent } from "../src/index.js";

describe("gameEventSchema", () => {
  it("parses a valid shot attempt event", () => {
    const parsed = parseGameEvent({
      id: "evt-1",
      gameId: "game-1",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: 1,
      clockSecondsRemaining: 480,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt",
      playerId: "p1",
      made: true,
      points: 3,
      zone: "above_break_three"
    });

    expect(parsed.type).toBe("shot_attempt");
    if (parsed.type === "shot_attempt") {
      expect(parsed.points).toBe(3);
    }
  });

  it("rejects an invalid event", () => {
    expect(
      isGameEvent({
        id: "evt-2",
        gameId: "game-1",
        sequence: 2,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: 1,
        clockSecondsRemaining: 470,
        teamId: "home",
        operatorId: "op-1",
        type: "shot_attempt",
        playerId: "p1",
        made: true,
        points: 4,
        zone: "rim"
      })
    ).toBe(false);
  });
});
