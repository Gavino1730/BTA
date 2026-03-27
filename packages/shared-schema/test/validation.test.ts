import { describe, expect, it } from "vitest";
import { getPeriodDefaultClock, getPeriodDurationSeconds, isGameEvent, isOvertimePeriod, parseGameEvent, validateEventSequence } from "../src/index.js";
import type { GameEvent } from "../src/index.js";

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

  it("detects overtime period strings", () => {
    expect(isOvertimePeriod("OT1")).toBe(true);
    expect(isOvertimePeriod("Q4")).toBe(false);

  describe("semantic validation", () => {
  });
});

describe("semantic validation", () => {
  const base = {
      gameId: "g1", timestampIso: "2026-03-18T20:00:00.000Z",
      teamId: "home", operatorId: "op-1",
  };

  it("rejects period_transition where newPeriod equals current period", () => {
      expect(
        isGameEvent({
          ...base, id: "pt-same", sequence: 1, period: "Q1",
          clockSecondsRemaining: 0, type: "period_transition", newPeriod: "Q1"
        })
      ).toBe(false);
    });

  it("accepts period_transition where newPeriod differs", () => {
      expect(
        isGameEvent({
          ...base, id: "pt-ok", sequence: 1, period: "Q1",
          clockSecondsRemaining: 0, type: "period_transition", newPeriod: "Q2"
        })
      ).toBe(true);
    });

  it("validateEventSequence returns no errors for correctly ordered events", () => {
      const events: GameEvent[] = [1, 2, 3].map((seq) => parseGameEvent({
        ...base, id: `e${seq}`, sequence: seq, period: "Q1",
        clockSecondsRemaining: 480 - seq * 10,
        type: "shot_attempt", playerId: "p1", made: false, points: 2, zone: "paint"
      }));
      expect(validateEventSequence(events)).toEqual([]);
    });

  it("validateEventSequence detects out-of-order sequence", () => {
      const events: GameEvent[] = [
        parseGameEvent({ ...base, id: "e1", sequence: 1, period: "Q1", clockSecondsRemaining: 460, type: "shot_attempt", playerId: "p1", made: false, points: 2, zone: "paint" }),
        parseGameEvent({ ...base, id: "e3", sequence: 3, period: "Q1", clockSecondsRemaining: 440, type: "shot_attempt", playerId: "p1", made: false, points: 2, zone: "paint" }),
        parseGameEvent({ ...base, id: "e2", sequence: 2, period: "Q1", clockSecondsRemaining: 450, type: "shot_attempt", playerId: "p1", made: false, points: 2, zone: "paint" }),
      ];
      const errors = validateEventSequence(events);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/sequence 2.*not greater than.*3|sequence.*2.*not greater/i);
    });

  it("validateEventSequence detects clock exceeding period maximum", () => {
      const events: GameEvent[] = [
        parseGameEvent({ ...base, id: "e1", sequence: 1, period: "Q1", clockSecondsRemaining: 480, type: "shot_attempt", playerId: "p1", made: false, points: 2, zone: "paint" }),
        parseGameEvent({ ...base, id: "e2", sequence: 2, period: "OT1", clockSecondsRemaining: 241, type: "shot_attempt", playerId: "p1", made: false, points: 2, zone: "paint" }),
      ];
      const errors = validateEventSequence(events);
      expect(errors.length).toBe(1);
      expect(errors[0]).toMatch(/OT1.*241|241.*max 240/i);
    });
  });
  });
