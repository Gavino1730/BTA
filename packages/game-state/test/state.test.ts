import { describe, expect, it } from "vitest";
import type { GameEvent } from "@pivot/shared-schema";
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
});
