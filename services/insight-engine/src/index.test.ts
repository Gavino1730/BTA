import { describe, expect, it } from "vitest";
import { createInitialGameState, replayEvents } from "@pivot/game-state";
import type { GameEvent } from "@pivot/shared-schema";
import { generateInsights } from "./index.js";

describe("insight engine", () => {
  it("emits foul trouble insight at 3 fouls", () => {
    const events: GameEvent[] = [1, 2, 3].map((sequence) => ({
      id: `foul-${sequence}`,
      gameId: "game-1",
      sequence,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 400 - sequence,
      teamId: "home",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "h1",
      foulType: "personal" as const
    }));

    const state = replayEvents(createInitialGameState("game-1", "home", "away"), events);
    const insights = generateInsights({ state, latestEvent: events[2] });

    expect(insights.some((insight) => insight.type === "foul_trouble")).toBe(true);
  });
});
