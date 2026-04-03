import { describe, expect, it, vi } from "vitest";
import {
  answerGameAiChat,
  createGame,
  deleteEvent,
  getGameEvents,
  getGameInsights,
  getGameState,
  ingestEvent,
  patchGameLineup,
  refreshGameAiInsights,
  updateEvent
} from "./store.js";

describe("store", () => {
  it("seeds active lineup when provided at game creation", () => {
    const state = createGame({
      schoolId: "default",
      gameId: "game-seeded-lineup",
      homeTeamId: "home",
      awayTeamId: "away",
      startingLineupByTeam: {
        home: ["h1", "h2", "h3", "h4", "h5", "h6"],
        away: ["a1", "a2", "a3", "a4", "a5"],
        other: ["x1", "x2"]
      }
    });

    expect(state.activeLineupsByTeam.home).toEqual(["h1", "h2", "h3", "h4", "h5"]);
    expect(state.activeLineupsByTeam.away).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(state.activeLineupsByTeam).not.toHaveProperty("other");
    expect(state.startingLineupByTeam).toEqual({
      home: ["h1", "h2", "h3", "h4", "h5"],
      away: ["a1", "a2", "a3", "a4", "a5"]
    });
  });

  it("fills missing lineup slots without replacing existing active players", () => {
    createGame({
      schoolId: "default",
      gameId: "game-lineup-patch",
      homeTeamId: "home",
      awayTeamId: "away",
      startingLineupByTeam: {
        home: ["h1", "h2", "h3"]
      }
    });

    const patched = patchGameLineup("game-lineup-patch", {
      home: ["h3", "h4", "h5", "h6"]
    });

    expect(patched?.activeLineupsByTeam.home).toEqual(["h1", "h2", "h3", "h4", "h5"]);
  });

  it("creates a game and ingests event idempotently", () => {
    createGame({
      schoolId: "default",
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

  it("rejects duplicate event ids with conflicting payload", () => {
    createGame({
      schoolId: "default",
      gameId: "game-1-conflict",
      homeTeamId: "home",
      awayTeamId: "away"
    });

    ingestEvent({
      id: "evt-conflict-1",
      gameId: "game-1-conflict",
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

    expect(() =>
      ingestEvent({
        id: "evt-conflict-1",
        gameId: "game-1-conflict",
        sequence: 1,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 470,
        teamId: "home",
        operatorId: "op-1",
        type: "shot_attempt",
        playerId: "h1",
        made: false,
        points: 2,
        zone: "paint"
      })
    ).toThrow(/already exists with different payload/);
  });

  it("returns null for unknown game", () => {
    expect(getGameState("missing")).toBeNull();
  });

  it("recomputes state after deleting an event", () => {
    createGame({
      schoolId: "default",
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
      schoolId: "default",
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
      schoolId: "default",
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

  it("rejects createGame when payload and scope schoolIds differ", () => {
    expect(() =>
      createGame({
        schoolId: "alpha",
        gameId: "game-mismatch-create",
        homeTeamId: "home",
        awayTeamId: "away"
      }, { schoolId: "beta" })
    ).toThrow(/Tenant schoolId mismatch/i);
  });

  it("rejects ingestEvent when payload and scope schoolIds differ", () => {
    createGame({
      schoolId: "alpha",
      gameId: "game-mismatch-ingest",
      homeTeamId: "home",
      awayTeamId: "away"
    });

    expect(() =>
      ingestEvent({
        id: "evt-mismatch-1",
        schoolId: "beta",
        gameId: "game-mismatch-ingest",
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
      }, { schoolId: "alpha" })
    ).toThrow(/Tenant schoolId mismatch/i);
  });

  it("rejects updateEvent when payload and scope schoolIds differ", () => {
    createGame({
      schoolId: "alpha",
      gameId: "game-mismatch-update",
      homeTeamId: "home",
      awayTeamId: "away"
    });

    ingestEvent({
      id: "evt-mismatch-update",
      schoolId: "alpha",
      gameId: "game-mismatch-update",
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

    expect(() =>
      updateEvent("game-mismatch-update", "evt-mismatch-update", {
        schoolId: "beta",
        sequence: 1,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 470,
        teamId: "home",
        operatorId: "op-1",
        type: "shot_attempt",
        playerId: "h1",
        made: false,
        points: 2,
        zone: "paint"
      }, { schoolId: "alpha" })
    ).toThrow(/Tenant schoolId mismatch/i);
  });

  it("adds ai coaching insights when OpenAI is configured", async () => {
    const originalFetch = global.fetch;
    const originalApiKey = process.env.OPENAI_API_KEY;

    process.env.OPENAI_API_KEY = "test-openai-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/season-stats")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            wins: 12,
            losses: 5,
            ppg: 62.4,
            opp_ppg: 54.8,
            fg_pct: 0.45,
            fg3_pct: 0.34,
            to_avg: 11.3
          })
        });
      }
      if (url.includes("/api/games")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { gameId: 1, opponent: "Team A", vc_score: 64, opp_score: 58 },
            { gameId: 2, opponent: "Team B", vc_score: 55, opp_score: 60 }
          ]
        });
      }
      return Promise.resolve({
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
      });
    }) as unknown as typeof fetch;

    try {
      createGame({
        schoolId: "default",
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

  it("forces ai coaching refresh on demand even without new events", async () => {
    const originalFetch = global.fetch;
    const originalApiKey = process.env.OPENAI_API_KEY;

    process.env.OPENAI_API_KEY = "test-openai-key";
    let openAiCallCount = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/season-stats")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ wins: 10, losses: 4, ppg: 60.1, opp_ppg: 52.2, fg_pct: 0.44, fg3_pct: 0.33, to_avg: 10.9 })
        });
      }
      if (url.includes("/api/games")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { gameId: 1, opponent: "Team C", vc_score: 58, opp_score: 52 },
            { gameId: 2, opponent: "Team D", vc_score: 49, opp_score: 51 }
          ]
        });
      }
      if (url.includes("/api/players")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { name: "A Player", full_name: "A Player", number: "2", ppg: 13.4, rpg: 4.2, apg: 3.1, fg_pct: 48.7, efg_pct: 53.2, ts_pct: 56.4, fpg: 2.0 },
            { name: "B Player", full_name: "B Player", number: "5", ppg: 9.8, rpg: 3.8, apg: 1.9, fg_pct: 42.1, efg_pct: 45.3, ts_pct: 49.5, fpg: 1.7 }
          ]
        });
      }

      openAiCallCount += 1;
      const message = openAiCallCount === 1 ? "First bench call" : "Second bench call";
      const explanation = openAiCallCount === 1 ? "First refresh payload." : "Forced refresh payload.";
      const confidence = openAiCallCount === 1 ? "medium" : "high";

      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  insights: [
                    {
                      message,
                      explanation,
                      relatedTeamId: "home",
                      confidence
                    }
                  ]
                })
              }
            }
          ]
        })
      });
    }) as unknown as typeof fetch;

    try {
      createGame({
        schoolId: "default",
        gameId: "game-ai-force",
        homeTeamId: "home",
        awayTeamId: "away"
      });

      for (const [sequence, teamId] of ["home", "away", "home", "away"].map((team, index) => [index + 1, team] as const)) {
        ingestEvent({
          id: `evt-ai-force-${sequence}`,
          gameId: "game-ai-force",
          sequence,
          timestampIso: `2026-03-18T20:1${sequence}:00.000Z`,
          period: "Q1",
          clockSecondsRemaining: 470 - sequence,
          teamId,
          operatorId: "op-1",
          type: "shot_attempt",
          playerId: `${teamId}-${sequence}`,
          made: sequence % 2 === 0,
          points: 2,
          zone: "paint"
        });
      }

      const firstRefresh = await refreshGameAiInsights("game-ai-force");
      const forcedRefresh = await refreshGameAiInsights("game-ai-force", { force: true });

      expect(firstRefresh?.some((insight) => insight.message === "[AI] First bench call")).toBe(true);
      expect(forcedRefresh?.some((insight) => insight.message === "[AI] Second bench call")).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      global.fetch = originalFetch;
    }
  });

  it("answers in-game ai chat with live and historical context", async () => {
    const originalFetch = global.fetch;
    const originalApiKey = process.env.OPENAI_API_KEY;

    process.env.OPENAI_API_KEY = "test-openai-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/season-stats")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ wins: 14, losses: 6, ppg: 64.2, opp_ppg: 55.1, fg_pct: 0.47, fg3_pct: 0.36, to_avg: 10.4 })
        });
      }
      if (url.includes("/api/games")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { gameId: 10, opponent: "Team E", vc_score: 61, opp_score: 54 },
            { gameId: 11, opponent: "Team F", vc_score: 58, opp_score: 62 }
          ]
        });
      }
      if (url.includes("/api/players")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { name: "A Player", full_name: "A Player", number: "2", ppg: 15.2, rpg: 5.1, apg: 3.4, fg_pct: 49.3, efg_pct: 55.1, ts_pct: 58.8, fpg: 2.2 },
            { name: "B Player", full_name: "B Player", number: "5", ppg: 10.4, rpg: 4.0, apg: 2.1, fg_pct: 44.0, efg_pct: 47.2, ts_pct: 50.4, fpg: 1.8 }
          ]
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Keep A Player on the floor and run another touch for them. They are scoring efficiently and the current game sample supports staying with them.",
                  suggestions: [
                    "Who should we sub if A Player picks up a fourth foul?",
                    "Are we in danger of bonus trouble next quarter?"
                  ]
                })
              }
            }
          ]
        })
      });
    }) as unknown as typeof fetch;

    try {
      createGame({
        schoolId: "default",
        gameId: "game-ai-chat",
        homeTeamId: "home",
        awayTeamId: "away",
        opponentTeamId: "away"
      });

      ingestEvent({
        id: "evt-chat-1",
        gameId: "game-ai-chat",
        sequence: 1,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 420,
        teamId: "home",
        operatorId: "op-1",
        type: "shot_attempt",
        playerId: "A Player",
        made: true,
        points: 2,
        zone: "paint"
      });

      ingestEvent({
        id: "evt-chat-2",
        gameId: "game-ai-chat",
        sequence: 2,
        timestampIso: "2026-03-18T20:01:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 398,
        teamId: "home",
        operatorId: "op-1",
        type: "assist",
        playerId: "B Player",
        scorerPlayerId: "A Player"
      });

      const response = await answerGameAiChat("game-ai-chat", "Who is playing best right now?", [
        { role: "user", content: "How are we handling fouls so far?" },
        { role: "assistant", content: "No serious foul trouble yet." }
      ]);

      expect(response?.answer).toContain("A Player");
      expect(response?.suggestions).toHaveLength(2);
      expect(response?.usedHistoricalContext).toBe(true);
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
