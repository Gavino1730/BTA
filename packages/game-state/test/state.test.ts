import { describe, expect, it } from "vitest";
import type { GameEvent } from "@pivot/shared-schema";
import { applyEvent, createInitialGameState, replayEvents } from "../src/index.js";

describe("game-state", () => {
  it("applies shot and foul events", () => {
    const initial = createInitialGameState("game-1", "home", "away");

    const shot: GameEvent = {
      id: "evt-1",
      gameId: "game-1",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: 1,
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
      period: 1,
      clockSecondsRemaining: 460,
      teamId: "away",
      operatorId: "op-1",
      type: "foul",
      playerId: "a1",
      foulType: "reaching"
    };

    const afterShot = applyEvent(initial, shot);
    const final = applyEvent(afterShot, foul);

    expect(final.scoreByTeam.home).toBe(2);
    expect(final.teamStats.home.shooting.made).toBe(1);
    expect(final.playerStatsByTeam.home.h1.points).toBe(2);
    expect(final.playerStatsByTeam.home.h1.shotsMade).toBe(1);
    expect(final.teamStats.away.fouls).toBe(1);
    expect(final.playerFouls.a1).toBe(1);
    expect(final.playerStatsByTeam.away.a1.fouls).toBe(1);
  });

  it("replays in sequence order", () => {
    const initial = createInitialGameState("game-1", "home", "away");
    const events: GameEvent[] = [
      {
        id: "evt-2",
        gameId: "game-1",
        sequence: 2,
        timestampIso: "2026-03-18T20:01:00.000Z",
        period: 1,
        clockSecondsRemaining: 460,
        teamId: "away",
        operatorId: "op-1",
        type: "foul",
        playerId: "a1",
        foulType: "reaching"
      },
      {
        id: "evt-1",
        gameId: "game-1",
        sequence: 1,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: 1,
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
      period: 1,
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
      period: 1,
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
        period: 1,
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
        period: 1,
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
        period: 1,
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
