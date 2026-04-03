import { describe, expect, it } from "vitest";
import type { GameEvent } from "@bta/shared-schema";
import { applyEvent, createInitialGameState, isPlayerFouledOut, replayEvents } from "../src/index.js";

describe("game-state", () => {
  it("applies shot and foul events", () => {
    const initial = createInitialGameState("game-1", "home", "away");

    const shot: GameEvent = {
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


      describe("replay integration", () => {
        const buildMixedEvents = (gameId: string): GameEvent[] => [
          {
            id: "r-shot-1", gameId, sequence: 1,
            timestampIso: "2026-03-18T20:00:00.000Z", period: "Q1",
            clockSecondsRemaining: 480, teamId: "home", operatorId: "op-1",
            type: "shot_attempt", playerId: "h1", made: true, points: 2, zone: "paint"
          },
          {
            id: "r-foul-1", gameId, sequence: 2,
            timestampIso: "2026-03-18T20:00:10.000Z", period: "Q1",
            clockSecondsRemaining: 470, teamId: "home", operatorId: "op-1",
            type: "foul", playerId: "h2", foulType: "personal"
          },
          {
            id: "r-shot-2", gameId, sequence: 3,
            timestampIso: "2026-03-18T20:01:00.000Z", period: "Q1",
            clockSecondsRemaining: 420, teamId: "away", operatorId: "op-1",
            type: "shot_attempt", playerId: "a1", made: true, points: 3, zone: "above_break_three"
          },
          {
            id: "r-ft-1", gameId, sequence: 4,
            timestampIso: "2026-03-18T20:02:00.000Z", period: "Q1",
            clockSecondsRemaining: 400, teamId: "home", operatorId: "op-1",
            type: "free_throw_attempt", playerId: "h1", made: true, attemptNumber: 1, totalAttempts: 2
          },
          {
            id: "r-ft-2", gameId, sequence: 5,
            timestampIso: "2026-03-18T20:02:05.000Z", period: "Q1",
            clockSecondsRemaining: 398, teamId: "home", operatorId: "op-1",
            type: "free_throw_attempt", playerId: "h1", made: false, attemptNumber: 2, totalAttempts: 2
          }
        ];

        it("is deterministic: applying same events twice produces identical state", () => {
          const events = buildMixedEvents("game-det");
          const stateA = replayEvents(createInitialGameState("game-det", "home", "away"), events);
          const stateB = replayEvents(createInitialGameState("game-det", "home", "away"), events);
          expect(stateA.scoreByTeam).toEqual(stateB.scoreByTeam);
          expect(stateA.teamStats).toEqual(stateB.teamStats);
          expect(stateA.playerStatsByTeam).toEqual(stateB.playerStatsByTeam);
          expect(stateA.playerFouls).toEqual(stateB.playerFouls);
          expect(stateA.lastSequence).toBe(stateB.lastSequence);
        });

        it("replay from beginning equals incremental applyEvent result", () => {
          const events = buildMixedEvents("game-inc");
          let incremental = createInitialGameState("game-inc", "home", "away");
          for (const evt of events) {
            incremental = applyEvent(incremental, evt);
          }
          const replayed = replayEvents(createInitialGameState("game-inc", "home", "away"), events);
          expect(replayed.scoreByTeam).toEqual(incremental.scoreByTeam);
          expect(replayed.teamStats).toEqual(incremental.teamStats);
          expect(replayed.playerStatsByTeam).toEqual(incremental.playerStatsByTeam);
          expect(replayed.lastSequence).toBe(incremental.lastSequence);
        });

        it("player foul-out persists after period transition", () => {
          const fouls: GameEvent[] = [1, 2, 3, 4].map((seq) => ({
            id: `fo-q1-${seq}`, gameId: "game-persist", sequence: seq,
            timestampIso: "2026-03-18T20:00:00.000Z", period: "Q1",
            clockSecondsRemaining: 480 - seq * 10, teamId: "home", operatorId: "op-1",
            type: "foul" as const, playerId: "h1", foulType: "personal" as const
          }));

          const periodTransition: GameEvent = {
            id: "pt-q2", gameId: "game-persist", sequence: 5,
            timestampIso: "2026-03-18T20:10:00.000Z", period: "Q2",
            clockSecondsRemaining: 480, teamId: "home", operatorId: "op-1",
            type: "period_transition", newPeriod: "Q2"
          };

          const fifthFoul: GameEvent = {
            id: "fo-q2-5", gameId: "game-persist", sequence: 6,
            timestampIso: "2026-03-18T20:10:05.000Z", period: "Q2",
            clockSecondsRemaining: 475, teamId: "home", operatorId: "op-1",
            type: "foul", playerId: "h1", foulType: "personal"
          };

          const final = replayEvents(
            createInitialGameState("game-persist", "home", "away"),
            [...fouls, periodTransition, fifthFoul]
          );

          expect(final.playerFouls.h1).toBe(5);
          expect(isPlayerFouledOut(final, "h1")).toBe(true);
          // Fouls from Q1 still recorded
          expect(final.teamFoulsByPeriod.home.Q1).toBe(4);
          // Q2 foul also recorded
          expect(final.teamFoulsByPeriod.home.Q2).toBe(1);
        });
      });
    const foul: GameEvent = {
      id: "evt-2",
      gameId: "game-1",
      sequence: 2,
      timestampIso: "2026-03-18T20:01:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 460,
      teamId: "away",
      operatorId: "op-1",
      type: "foul",
      playerId: "a1",
      foulType: "personal"
    };

    const afterShot = applyEvent(initial, shot);
    const final = applyEvent(afterShot, foul);

    expect(final.scoreByTeam.home).toBe(2);
    expect(final.teamStats.home.shooting.fgMade).toBe(1);
    expect(final.playerStatsByTeam.home.h1.points).toBe(2);
    expect(final.playerStatsByTeam.home.h1.fgMade).toBe(1);
    expect(final.teamStats.away.fouls).toBe(1);
    expect(final.playerFouls.a1).toBe(1);
    expect(final.playerStatsByTeam.away.a1.fouls).toBe(1);
  });

  it("tracks free throw attempts separately from field goals", () => {
    const initial = createInitialGameState("game-1", "home", "away");
    const ft1: GameEvent = {
      id: "ft-1",
      gameId: "game-1",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "free_throw_attempt",
      playerId: "h1",
      made: true,
      attemptNumber: 1,
      totalAttempts: 2
    };
    const ft2: GameEvent = {
      id: "ft-2",
      gameId: "game-1",
      sequence: 2,
      timestampIso: "2026-03-18T20:00:05.000Z",
      period: "Q1",
      clockSecondsRemaining: 465,
      teamId: "home",
      operatorId: "op-1",
      type: "free_throw_attempt",
      playerId: "h1",
      made: false,
      attemptNumber: 2,
      totalAttempts: 2
    };

    const final = replayEvents(initial, [ft1, ft2]);
    expect(final.scoreByTeam.home).toBe(1);
    expect(final.teamStats.home.shooting.ftMade).toBe(1);
    expect(final.teamStats.home.shooting.ftAttempts).toBe(2);
    expect(final.playerStatsByTeam.home.h1.ftMade).toBe(1);
    expect(final.playerStatsByTeam.home.h1.ftAttempts).toBe(2);
    // FTs should not count as field goals
    expect(final.teamStats.home.shooting.fgAttempts).toBe(0);
  });

  it("tracks bonus: home team in bonus when away has 5+ period fouls (NFHS)", () => {
    const initial = createInitialGameState("game-bonus", "home", "away");
    const fouls: GameEvent[] = [1, 2, 3, 4, 5].map((seq) => ({
      id: `foul-${seq}`,
      gameId: "game-bonus",
      sequence: seq,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 480 - seq * 10,
      teamId: "away",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: `a${seq}`,
      foulType: "personal" as const
    }));

    const final = replayEvents(initial, fouls);
    // Home team is in bonus (away has 5 fouls in Q1)
    expect(final.bonusByTeam.home).toBe(true);
    // Away team is NOT in bonus (home has 0 fouls)
    expect(final.bonusByTeam.away).toBe(false);
    expect(final.teamFoulsByPeriod.away.Q1).toBe(5);
  });

  it("team fouls reset between quarters but not in OT (NFHS)", () => {
    const initial = createInitialGameState("game-ot", "home", "away");

    // 5 away fouls in Q4
    const q4Fouls: GameEvent[] = [1, 2, 3, 4, 5].map((seq) => ({
      id: `q4-foul-${seq}`,
      gameId: "game-ot",
      sequence: seq,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q4",
      clockSecondsRemaining: 480 - seq * 10,
      teamId: "away",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: `a${seq}`,
      foulType: "personal" as const
    }));

    // Period transition to OT1
    const otTransition: GameEvent = {
      id: "period-ot1",
      gameId: "game-ot",
      sequence: 6,
      timestampIso: "2026-03-18T21:00:00.000Z",
      period: "OT1",
      clockSecondsRemaining: 240,
      teamId: "home",
      operatorId: "op-1",
      type: "period_transition",
      newPeriod: "OT1"
    };

    const final = replayEvents(initial, [...q4Fouls, otTransition]);
    // Home team should still be in bonus in OT1 (Q4 fouls carry over)
    expect(final.bonusByTeam.home).toBe(true);
    // Q4 fouls preserved on away team
    expect(final.teamFoulsByPeriod.away.Q4).toBe(5);
  });

  it("player fouls out at 5 personal fouls (NFHS)", () => {
    const initial = createInitialGameState("game-fo", "home", "away");
    const fouls: GameEvent[] = [1, 2, 3, 4, 5].map((seq) => ({
      id: `pf-${seq}`,
      gameId: "game-fo",
      sequence: seq,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q2",
      clockSecondsRemaining: 480 - seq * 10,
      teamId: "home",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "h1",
      foulType: "personal" as const
    }));

    const final = replayEvents(initial, fouls);
    expect(final.playerFouls.h1).toBe(5);
    expect(isPlayerFouledOut(final, "h1")).toBe(true);
    expect(isPlayerFouledOut(final, "h2")).toBe(false);
  });

  it("replays in sequence order", () => {
    const initial = createInitialGameState("game-1", "home", "away");
    const events: GameEvent[] = [
      {
        id: "evt-2",
        gameId: "game-1",
        sequence: 2,
        timestampIso: "2026-03-18T20:01:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 460,
        teamId: "away",
        operatorId: "op-1",
        type: "foul",
        playerId: "a1",
        foulType: "personal"
      },
      {
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
        points: 3,
        zone: "above_break_three"
      }
    ];

    const final = replayEvents(initial, events);

    expect(final.lastSequence).toBe(2);
    expect(final.scoreByTeam.home).toBe(3);
    expect(final.playerStatsByTeam.home.h1.points).toBe(3);
    expect(final.teamStats.away.fouls).toBe(1);
  });

  it("tracks possessions and substitutions", () => {
    const initial = createInitialGameState("game-1", "home", "away");
    const possessionStart: GameEvent = {
      id: "evt-pos-1",
      gameId: "game-1",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "possession_start",
      possessedByTeamId: "home"
    };

    const sub: GameEvent = {
      id: "evt-sub-1",
      gameId: "game-1",
      sequence: 2,
      timestampIso: "2026-03-18T20:00:30.000Z",
      period: "Q1",
      clockSecondsRemaining: 440,
      teamId: "home",
      operatorId: "op-1",
      type: "substitution",
      playerOutId: "h1",
      playerInId: "h6"
    };

    const withPossession = applyEvent(initial, possessionStart);
    const withSub = applyEvent(withPossession, sub);

    expect(withSub.possessionsByTeam.home).toBe(1);
    expect(withSub.teamStats.home.substitutions).toBe(1);
    expect(withSub.activeLineupsByTeam.home).toContain("h6");
    expect(withSub.activeLineupsByTeam.home).not.toContain("h1");
  });

  it("tracks active matchup assignments by defending team", () => {
    const initial = createInitialGameState("game-matchup", "home", "away");
    const matchup: GameEvent = {
      id: "evt-matchup-1",
      gameId: "game-matchup",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "matchup_assignment",
      defenderPlayerId: "h3",
      offensivePlayerId: "a1"
    };

    const final = applyEvent(initial, matchup);
    expect(final.activeMatchupsByTeam.home.h3).toBe("a1");
  });

  it("clears outgoing defender matchup assignment on substitution", () => {
    const initial = createInitialGameState("game-matchup-sub", "home", "away");
    const events: GameEvent[] = [
      {
        id: "evt-matchup-1",
        gameId: "game-matchup-sub",
        sequence: 1,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 470,
        teamId: "home",
        operatorId: "op-1",
        type: "matchup_assignment",
        defenderPlayerId: "h3",
        offensivePlayerId: "a1"
      },
      {
        id: "evt-sub-1",
        gameId: "game-matchup-sub",
        sequence: 2,
        timestampIso: "2026-03-18T20:00:10.000Z",
        period: "Q1",
        clockSecondsRemaining: 460,
        teamId: "home",
        operatorId: "op-1",
        type: "substitution",
        playerOutId: "h3",
        playerInId: "h6"
      }
    ];

    const final = replayEvents(initial, events);
    expect(final.activeMatchupsByTeam.home.h3).toBeUndefined();
  });

  it("tracks assists, steals, and blocks per player", () => {
    const initial = createInitialGameState("game-1", "home", "away");
    const events: GameEvent[] = [
      {
        id: "assist-1",
        gameId: "game-1",
        sequence: 1,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 470,
        teamId: "home",
        operatorId: "op-1",
        type: "assist",
        playerId: "h2",
        scorerPlayerId: "h1"
      },
      {
        id: "steal-1",
        gameId: "game-1",
        sequence: 2,
        timestampIso: "2026-03-18T20:00:05.000Z",
        period: "Q1",
        clockSecondsRemaining: 465,
        teamId: "away",
        operatorId: "op-1",
        type: "steal",
        playerId: "a3"
      },
      {
        id: "block-1",
        gameId: "game-1",
        sequence: 3,
        timestampIso: "2026-03-18T20:00:10.000Z",
        period: "Q1",
        clockSecondsRemaining: 460,
        teamId: "home",
        operatorId: "op-1",
        type: "block",
        playerId: "h4"
      }
    ];

    const final = replayEvents(initial, events);

    expect(final.playerStatsByTeam.home.h2.assists).toBe(1);
    expect(final.playerStatsByTeam.away.a3.steals).toBe(1);
    expect(final.playerStatsByTeam.home.h4.blocks).toBe(1);
  });

  describe("replay integration", () => {
    const buildMixedEvents = (gameId: string): GameEvent[] => [
      {
        id: "r-shot-1", gameId, sequence: 1,
        timestampIso: "2026-03-18T20:00:00.000Z", period: "Q1",
        clockSecondsRemaining: 480, teamId: "home", operatorId: "op-1",
        type: "shot_attempt", playerId: "h1", made: true, points: 2, zone: "paint"
      },
      {
        id: "r-foul-1", gameId, sequence: 2,
        timestampIso: "2026-03-18T20:00:10.000Z", period: "Q1",
        clockSecondsRemaining: 470, teamId: "home", operatorId: "op-1",
        type: "foul", playerId: "h2", foulType: "personal"
      },
      {
        id: "r-shot-2", gameId, sequence: 3,
        timestampIso: "2026-03-18T20:01:00.000Z", period: "Q1",
        clockSecondsRemaining: 420, teamId: "away", operatorId: "op-1",
        type: "shot_attempt", playerId: "a1", made: true, points: 3, zone: "above_break_three"
      },
      {
        id: "r-ft-1", gameId, sequence: 4,
        timestampIso: "2026-03-18T20:02:00.000Z", period: "Q1",
        clockSecondsRemaining: 400, teamId: "home", operatorId: "op-1",
        type: "free_throw_attempt", playerId: "h1", made: true, attemptNumber: 1, totalAttempts: 2
      },
      {
        id: "r-ft-2", gameId, sequence: 5,
        timestampIso: "2026-03-18T20:02:05.000Z", period: "Q1",
        clockSecondsRemaining: 398, teamId: "home", operatorId: "op-1",
        type: "free_throw_attempt", playerId: "h1", made: false, attemptNumber: 2, totalAttempts: 2
      }
    ];

    it("is deterministic: applying same events twice produces identical state", () => {
      const events = buildMixedEvents("game-det");
      const stateA = replayEvents(createInitialGameState("game-det", "home", "away"), events);
      const stateB = replayEvents(createInitialGameState("game-det", "home", "away"), events);
      expect(stateA.scoreByTeam).toEqual(stateB.scoreByTeam);
      expect(stateA.teamStats).toEqual(stateB.teamStats);
      expect(stateA.playerStatsByTeam).toEqual(stateB.playerStatsByTeam);
      expect(stateA.playerFouls).toEqual(stateB.playerFouls);
      expect(stateA.lastSequence).toBe(stateB.lastSequence);
    });

    it("replay from beginning equals incremental applyEvent result", () => {
      const events = buildMixedEvents("game-inc");
      let incremental = createInitialGameState("game-inc", "home", "away");
      for (const evt of events) {
        incremental = applyEvent(incremental, evt);
      }
      const replayed = replayEvents(createInitialGameState("game-inc", "home", "away"), events);
      expect(replayed.scoreByTeam).toEqual(incremental.scoreByTeam);
      expect(replayed.teamStats).toEqual(incremental.teamStats);
      expect(replayed.playerStatsByTeam).toEqual(incremental.playerStatsByTeam);
      expect(replayed.lastSequence).toBe(incremental.lastSequence);
    });

    it("player foul-out persists after period transition", () => {
      const fouls: GameEvent[] = [1, 2, 3, 4].map((seq) => ({
        id: `fo-q1-${seq}`, gameId: "game-persist", sequence: seq,
        timestampIso: "2026-03-18T20:00:00.000Z", period: "Q1",
        clockSecondsRemaining: 480 - seq * 10, teamId: "home", operatorId: "op-1",
        type: "foul" as const, playerId: "h1", foulType: "personal" as const
      }));

      const periodTransition: GameEvent = {
        id: "pt-q2", gameId: "game-persist", sequence: 5,
        timestampIso: "2026-03-18T20:10:00.000Z", period: "Q2",
        clockSecondsRemaining: 480, teamId: "home", operatorId: "op-1",
        type: "period_transition", newPeriod: "Q2"
      };

      const fifthFoul: GameEvent = {
        id: "fo-q2-5", gameId: "game-persist", sequence: 6,
        timestampIso: "2026-03-18T20:10:05.000Z", period: "Q2",
        clockSecondsRemaining: 475, teamId: "home", operatorId: "op-1",
        type: "foul", playerId: "h1", foulType: "personal"
      };

      const final = replayEvents(
        createInitialGameState("game-persist", "home", "away"),
        [...fouls, periodTransition, fifthFoul]
      );

      expect(final.playerFouls.h1).toBe(5);
      expect(isPlayerFouledOut(final, "h1")).toBe(true);
      expect(final.teamFoulsByPeriod.home.Q1).toBe(4);
      expect(final.teamFoulsByPeriod.home.Q2).toBe(1);
    });
  });
});
