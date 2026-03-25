import { describe, expect, it } from "vitest";
import { createInitialGameState, replayEvents } from "@bta/game-state";
import type { GameEvent } from "@bta/shared-schema";
import { generateInsights } from "./index.js";

describe("insight engine", () => {
  it("emits foul trouble insight at 3 fouls", () => {
    // Build 5+ events so the pre-game guard (events.length < 5 && score === 0) is bypassed.
    // h1 gets 3 personal fouls; two padding fouls on the away team precede them.
    const paddingFouls: GameEvent[] = [1, 2].map((sequence) => ({
      id: `pad-foul-${sequence}`,
      gameId: "game-1",
      sequence,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 480 - sequence,
      teamId: "away",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "a1",
      foulType: "personal" as const
    }));

    const foulEvents: GameEvent[] = [3, 4, 5].map((sequence) => ({
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

    const events = [...paddingFouls, ...foulEvents];
    const state = replayEvents(createInitialGameState("game-1", "home", "away"), events);
    const insights = generateInsights({ state, latestEvent: foulEvents[2] });

    // 3 fouls on a player now emits "foul_warning"; 4+ fouls emits "foul_trouble"
    expect(insights.some((insight) => insight.type === "foul_warning" || insight.type === "foul_trouble")).toBe(true);
  });

  it("uses explicit fouled-out wording at 5 fouls", () => {
    const paddingFouls: GameEvent[] = [1, 2].map((sequence) => ({
      id: `pad-fo-${sequence}`,
      gameId: "game-fo",
      sequence,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 480 - sequence,
      teamId: "away",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "a1",
      foulType: "personal" as const
    }));

    const foulEvents: GameEvent[] = [3, 4, 5, 6, 7].map((sequence) => ({
      id: `fo-${sequence}`,
      gameId: "game-fo",
      sequence,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 430 - sequence,
      teamId: "home",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "h1",
      foulType: "personal" as const
    }));

    const events = [...paddingFouls, ...foulEvents];
    const state = replayEvents(createInitialGameState("game-fo", "home", "away"), events);
    const insights = generateInsights({ state, latestEvent: foulEvents[4] });

    expect(insights.some((insight) => insight.message.includes("FOULED OUT"))).toBe(true);
    expect(
      insights.some(
        (insight) => insight.type === "foul_trouble" && insight.message.includes("foul-out risk")
      )
    ).toBe(false);
  });
});
