import { describe, expect, it } from "vitest";
import { buildPeriodLabels, getPeriodDefaultClock, getPeriodDurationSeconds, isGameEvent, isOvertimePeriod, parseGameEvent } from "../src/index.js";

describe("gameEventSchema", () => {
  it("parses a valid shot attempt event", () => {
    const parsed = parseGameEvent({
      id: "evt-1",
      gameId: "game-1",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
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

  it("parses a valid free throw attempt event", () => {
    const parsed = parseGameEvent({
      id: "evt-ft",
      gameId: "game-1",
      sequence: 2,
      timestampIso: "2026-03-18T20:00:10.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "free_throw_attempt",
      playerId: "p1",
      made: true,
      attemptNumber: 1,
      totalAttempts: 2
    });

    expect(parsed.type).toBe("free_throw_attempt");
  });

  it("parses overtime period values", () => {
    const parsed = parseGameEvent({
      id: "evt-ot",
      gameId: "game-1",
      sequence: 3,
      timestampIso: "2026-03-18T21:00:00.000Z",
      period: "OT1",
      clockSecondsRemaining: 240,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt",
      playerId: "p1",
      made: true,
      points: 2,
      zone: "paint"
    });

    expect(parsed.period).toBe("OT1");
  });

  it("rejects an invalid event (bad points value)", () => {
    expect(
      isGameEvent({
        id: "evt-2",
        gameId: "game-1",
        sequence: 2,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q1",
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

  it("rejects shot_attempt with points: 1 (use free_throw_attempt instead)", () => {
    expect(
      isGameEvent({
        id: "evt-3",
        gameId: "game-1",
        sequence: 3,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 470,
        teamId: "home",
        operatorId: "op-1",
        type: "shot_attempt",
        playerId: "p1",
        made: true,
        points: 1,
        zone: "rim"
      })
    ).toBe(false);
  });

  it("rejects events with numeric period", () => {
    expect(
      isGameEvent({
        id: "evt-4",
        gameId: "game-1",
        sequence: 4,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: 1,
        clockSecondsRemaining: 470,
        teamId: "home",
        operatorId: "op-1",
        type: "shot_attempt",
        playerId: "p1",
        made: true,
        points: 2,
        zone: "paint"
      })
    ).toBe(false);
  });
});

describe("period helpers", () => {
  it("uses 8:00 for regulation and 4:00 for overtime", () => {
    expect(getPeriodDurationSeconds("Q1")).toBe(480);
    expect(getPeriodDurationSeconds("OT1")).toBe(240);
    expect(getPeriodDefaultClock("Q4")).toBe("8:00");
    expect(getPeriodDefaultClock("OT2")).toBe("4:00");
  });

  it("builds period labels through overtime", () => {
    expect(buildPeriodLabels(0)).toEqual(["Q1", "Q2", "Q3", "Q4", "OT1"]);
    expect(buildPeriodLabels(2)).toEqual(["Q1", "Q2", "Q3", "Q4", "OT1", "OT2", "OT3"]);
  });

  it("detects overtime period strings", () => {
    expect(isOvertimePeriod("OT1")).toBe(true);
    expect(isOvertimePeriod("Q4")).toBe(false);
  });
});
