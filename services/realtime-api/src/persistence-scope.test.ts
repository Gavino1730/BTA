import { describe, expect, it } from "vitest";
import type { GameEvent } from "@bta/shared-schema";
import { normalizeEventForPersistence } from "./persistence.js";

function sampleEvent(): GameEvent {
  return {
    id: "evt-1",
    schoolId: "alpha",
    gameId: "game-1",
    sequence: 1,
    timestampIso: "2026-03-30T12:00:00.000Z",
    period: "Q1",
    clockSecondsRemaining: 400,
    teamId: "home",
    operatorId: "op-1",
    type: "foul",
    playerId: "p1",
    foulType: "personal"
  };
}

describe("persistence event scope normalization", () => {
  it("normalizes event school and game to row scope", () => {
    const normalized = normalizeEventForPersistence(sampleEvent(), "alpha", "game-1");
    expect(normalized.schoolId).toBe("alpha");
    expect(normalized.gameId).toBe("game-1");
  });

  it("rejects cross-tenant event payload", () => {
    expect(() => normalizeEventForPersistence(sampleEvent(), "beta", "game-1"))
      .toThrow(/tenant mismatch/i);
  });
});
