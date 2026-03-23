import { describe, expect, it } from "vitest";
import {
  createGame,
  deleteEvent,
  getGameEvents,
  getGameState,
  ingestEvent,
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
});
