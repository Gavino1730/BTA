import { describe, expect, it, vi } from "vitest";
import {
  createGame,
  deleteEvent,
  getGameEvents,
  getGameInsights,
  getGameState,
  ingestEvent,
  refreshGameAiInsights,
  updateEvent
} from "./store.js";

describe("store", () => {
  it("creates a game and ingests event idempotently", () => {
    createGame({
      gameId: "game-1",
      homeTeamId: "home",
      awayTeamId: "away"
    });

    const payload = {
      id: "evt-1",
      gameId: "game-1",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt",
      playerId: "h1",
      made: true,
      points: 2,
      zone: "paint"
    };

    const first = ingestEvent(payload);
    const second = ingestEvent(payload);

    expect(first.state.scoreByTeam.home).toBe(2);
    expect(second.state.scoreByTeam.home).toBe(2);
    expect(second.state.events.length).toBe(1);
  });

  it("returns null for unknown game", () => {
    expect(getGameState("missing")).toBeNull();
  });

  it("recomputes state after deleting an event", () => {
    createGame({
      gameId: "game-2",
      homeTeamId: "home",
      awayTeamId: "away"
    });

    ingestEvent({
      id: "evt-a",
      gameId: "game-2",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt",
      playerId: "h1",
      made: true,
      points: 2,
      zone: "paint"
    });

    ingestEvent({
      id: "evt-b",
      gameId: "game-2",
      sequence: 2,
      timestampIso: "2026-03-18T20:01:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 460,
      teamId: "away",
      operatorId: "op-1",
      type: "foul",
      playerId: "a1",
      foulType: "personal"
    });

    const result = deleteEvent("game-2", "evt-a");

    expect(result.state.scoreByTeam.home).toBe(0);
    expect(getGameEvents("game-2")).toHaveLength(1);
    expect(result.state.teamStats.away.fouls).toBe(1);
  });

  it("recomputes state after updating an event", () => {
    createGame({
      gameId: "game-3",
      homeTeamId: "home",
      awayTeamId: "away"
    });

    ingestEvent({
      id: "evt-shot",
      gameId: "game-3",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt",
      playerId: "h1",
      made: true,
      points: 3,
      zone: "above_break_three"
    });

    const result = updateEvent("game-3", "evt-shot", {
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt",
      playerId: "h1",
      made: false,
      points: 3,
      zone: "above_break_three"
    });

    expect(result.state.scoreByTeam.home).toBe(0);
    expect(result.state.teamStats.home.shooting.fgMade).toBe(0);
    expect(getGameEvents("game-3")[0].id).toBe("evt-shot");
  });

  it("rejects update sequence conflicts", () => {
    createGame({
      gameId: "game-4",
      homeTeamId: "home",
      awayTeamId: "away"
    });

    ingestEvent({
      id: "evt-1",
      gameId: "game-4",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt",
      playerId: "h1",
      made: true,
      points: 2,
      zone: "paint"
    });

    ingestEvent({
      id: "evt-2",
      gameId: "game-4",
      sequence: 2,
      timestampIso: "2026-03-18T20:01:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 460,
      teamId: "away",
      operatorId: "op-1",
      type: "turnover",
      playerId: "a1",
      turnoverType: "bad_pass"
    });

    expect(() =>
      updateEvent("game-4", "evt-1", {
        sequence: 2,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 470,
        teamId: "home",
        operatorId: "op-1",
        type: "shot_attempt",
        playerId: "h1",
        made: true,
        points: 2,
        zone: "paint"
      })
    ).toThrow(/already belongs/);
  });

  it("adds ai coaching insights when OpenAI is configured", async () => {
    const originalFetch = global.fetch;
    const originalApiKey = process.env.OPENAI_API_KEY;

    process.env.OPENAI_API_KEY = "test-openai-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                insights: [
                  {
                    message: "home needs stronger paint pressure",
                    explanation: "Recent possessions settled early; attack downhill before the help is set.",
                    relatedTeamId: "home",
                    confidence: "medium"
                  }
                ]
              })
            }
          }
        ]
      })
    }) as typeof fetch;

    try {
      createGame({
        gameId: "game-ai",
        homeTeamId: "home",
        awayTeamId: "away"
      });

      for (const [sequence, teamId] of ["home", "away", "home", "away"].map((team, index) => [index + 1, team] as const)) {
        ingestEvent({
          id: `evt-ai-${sequence}`,
          gameId: "game-ai",
          sequence,
          timestampIso: `2026-03-18T20:0${sequence}:00.000Z`,
          period: "Q1",
          clockSecondsRemaining: 480 - sequence,
          teamId,
          operatorId: "op-1",
          type: "shot_attempt",
          playerId: `${teamId}-${sequence}`,
          made: sequence % 2 === 1,
          points: 2,
          zone: "paint"
        });
      }

      const refreshed = await refreshGameAiInsights("game-ai");

      expect(refreshed?.some((insight) => insight.type === "ai_coaching")).toBe(true);
      expect(getGameInsights("game-ai").some((insight) => insight.type === "ai_coaching")).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      global.fetch = originalFetch;
    }
  });
});
