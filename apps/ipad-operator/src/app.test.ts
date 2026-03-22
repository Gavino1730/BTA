import { describe, expect, it } from "vitest";
import type { GameEvent } from "@pivot/shared-schema";

// ---- Inline copies of pure helpers from App.tsx so we can test without a DOM ----

type TeamSide = "home" | "away";

function clockToSec(clock: string): number {
  const [m, s] = clock.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

interface RunningTotals {
  points: number; fgm: number; fga: number; threePm: number; threePa: number;
  oreb: number; dreb: number; ast: number; stl: number; blk: number; to: number; fouls: number;
}

function computePlayerTotals(events: GameEvent[]): Record<string, RunningTotals> {
  const map: Record<string, RunningTotals> = {};
  function get(id: string) {
    if (!map[id]) map[id] = { points: 0, fgm: 0, fga: 0, threePm: 0, threePa: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, fouls: 0 };
    return map[id];
  }
  for (const e of events) {
    if (e.type === "shot_attempt") {
      const t = get(e.playerId);
      t.fga++;
      if (e.points === 3) t.threePa++;
      if (e.made) {
        t.fgm++;
        t.points += e.points;
        if (e.points === 3) t.threePm++;
      }
    } else if (e.type === "rebound") {
      const t = get(e.playerId);
      if (e.offensive) t.oreb++; else t.dreb++;
    } else if (e.type === "assist") {
      get(e.playerId).ast++;
    } else if (e.type === "steal") {
      get(e.playerId).stl++;
    } else if (e.type === "block") {
      get(e.playerId).blk++;
    } else if (e.type === "turnover") {
      if (e.playerId) get(e.playerId).to++;
    } else if (e.type === "foul") {
      get(e.playerId).fouls++;
    }
  }
  return map;
}

function computeScores(events: GameEvent[]) {
  const s = { home: 0, away: 0 };
  for (const e of events) {
    if (e.type === "shot_attempt" && e.made) {
      const side = e.teamId as TeamSide;
      if (side === "home" || side === "away") s[side] += e.points;
    }
  }
  return s;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shot(overrides: Partial<GameEvent> & { made: boolean; points: 1 | 2 | 3; teamId: string; playerId: string }): GameEvent {
  return {
    id: `evt-${Math.random()}`,
    gameId: "g1",
    sequence: 1,
    timestampIso: "2026-03-20T00:00:00.000Z",
    period: 1,
    clockSecondsRemaining: 600,
    operatorId: "op-1",
    type: "shot_attempt",
    zone: "paint",
    ...overrides,
  } as GameEvent;
}

function foulEvt(playerId: string): GameEvent {
  return {
    id: `foul-${Math.random()}`,
    gameId: "g1",
    sequence: 2,
    timestampIso: "2026-03-20T00:01:00.000Z",
    period: 1,
    clockSecondsRemaining: 580,
    operatorId: "op-1",
    teamId: "home",
    type: "foul",
    playerId,
    foulType: "reaching",
  } as GameEvent;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("clockToSec", () => {
  it("converts MM:SS correctly", () => {
    expect(clockToSec("12:00")).toBe(720);
    expect(clockToSec("0:30")).toBe(30);
    expect(clockToSec("5:45")).toBe(345);
  });

  it("handles missing seconds part", () => {
    expect(clockToSec("10")).toBe(600);
  });

  it("handles 0:00", () => {
    expect(clockToSec("0:00")).toBe(0);
  });
});

describe("computeScores", () => {
  it("counts made shots per team", () => {
    const events = [
      shot({ teamId: "home", playerId: "h1", made: true,  points: 2 }),
      shot({ teamId: "home", playerId: "h1", made: true,  points: 3 }),
      shot({ teamId: "away", playerId: "a1", made: true,  points: 2 }),
      shot({ teamId: "home", playerId: "h1", made: false, points: 2 }), // miss: should not count
    ];
    const scores = computeScores(events);
    expect(scores.home).toBe(5);
    expect(scores.away).toBe(2);
  });

  it("returns zero scores with no events", () => {
    expect(computeScores([])).toEqual({ home: 0, away: 0 });
  });

  it("counts free throws as 1 point each", () => {
    const events = [
      shot({ teamId: "home", playerId: "h1", made: true, points: 1 }),
      shot({ teamId: "home", playerId: "h1", made: true, points: 1 }),
    ];
    expect(computeScores(events).home).toBe(2);
  });

  it("ignores non-shot events", () => {
    const events: GameEvent[] = [foulEvt("h1")];
    expect(computeScores(events)).toEqual({ home: 0, away: 0 });
  });

  it("includes pending (offline) events in score", () => {
    // This verifies that computeScores doesn't filter by submitted status —
    // it just takes whatever array is given (app passes allEventObjs including pending).
    const pending = shot({ teamId: "home", playerId: "h1", made: true, points: 3 });
    expect(computeScores([pending]).home).toBe(3);
  });
});

describe("computePlayerTotals", () => {
  it("tracks points, FGM/FGA correctly", () => {
    const events = [
      shot({ teamId: "home", playerId: "h1", made: true,  points: 2 }),
      shot({ teamId: "home", playerId: "h1", made: false, points: 2 }),
      shot({ teamId: "home", playerId: "h1", made: true,  points: 3 }),
    ];
    const totals = computePlayerTotals(events);
    const h1 = totals["h1"];
    expect(h1.points).toBe(5);
    expect(h1.fgm).toBe(2);
    expect(h1.fga).toBe(3);
    expect(h1.threePm).toBe(1);
    expect(h1.threePa).toBe(1);
    expect(h1.fouls).toBe(0);
  });

  it("tracks fouls separately", () => {
    const events: GameEvent[] = [foulEvt("h1"), foulEvt("h1"), foulEvt("h2")];
    const totals = computePlayerTotals(events);
    expect(totals["h1"].fouls).toBe(2);
    expect(totals["h2"].fouls).toBe(1);
  });

  it("returns empty map for no events", () => {
    expect(computePlayerTotals([])).toEqual({});
  });

  it("tracks multiple players independently", () => {
    const events = [
      shot({ teamId: "home", playerId: "h1", made: true,  points: 2 }),
      shot({ teamId: "away", playerId: "a1", made: true,  points: 3 }),
      shot({ teamId: "home", playerId: "h1", made: true,  points: 2 }),
    ];
    const totals = computePlayerTotals(events);
    expect(totals["h1"].points).toBe(4);
    expect(totals["a1"].points).toBe(3);
    expect(totals["a1"].threePm).toBe(1);
  });

  it("counts free throw makes and misses", () => {
    const events = [
      shot({ teamId: "home", playerId: "h1", made: true,  points: 1 }),
      shot({ teamId: "home", playerId: "h1", made: false, points: 1 }),
    ];
    const t = computePlayerTotals(events)["h1"];
    expect(t.points).toBe(1);
    expect(t.fgm).toBe(1);
    expect(t.fga).toBe(2);
    expect(t.threePm).toBe(0);
    expect(t.threePa).toBe(0);
  });

  it("tracks rebounds (offensive and defensive)", () => {
    const base = { id: "r1", gameId: "g1", sequence: 1, timestampIso: "2026-03-20T00:00:00.000Z", period: 1, clockSecondsRemaining: 500, operatorId: "op-1", teamId: "home" };
    const events: GameEvent[] = [
      { ...base, id: "r1", type: "rebound", playerId: "h1", offensive: true  } as GameEvent,
      { ...base, id: "r2", type: "rebound", playerId: "h1", offensive: false } as GameEvent,
      { ...base, id: "r3", type: "rebound", playerId: "h1", offensive: false } as GameEvent,
    ];
    const t = computePlayerTotals(events)["h1"];
    expect(t.oreb).toBe(1);
    expect(t.dreb).toBe(2);
  });

  it("tracks assists, steals, blocks, turnovers", () => {
    const base = { id: "x", gameId: "g1", sequence: 1, timestampIso: "2026-03-20T00:00:00.000Z", period: 1, clockSecondsRemaining: 500, operatorId: "op-1", teamId: "home" };
    const events: GameEvent[] = [
      { ...base, id: "a1", type: "assist",   playerId: "h1", scorerPlayerId: "h2" } as GameEvent,
      { ...base, id: "a2", type: "assist",   playerId: "h1", scorerPlayerId: "h2" } as GameEvent,
      { ...base, id: "s1", type: "steal",    playerId: "h1" } as GameEvent,
      { ...base, id: "b1", type: "block",    playerId: "h1" } as GameEvent,
      { ...base, id: "t1", type: "turnover", playerId: "h1", turnoverType: "bad_pass" } as GameEvent,
    ];
    const t = computePlayerTotals(events)["h1"];
    expect(t.ast).toBe(2);
    expect(t.stl).toBe(1);
    expect(t.blk).toBe(1);
    expect(t.to).toBe(1);
  });
});
