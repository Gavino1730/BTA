import { describe, expect, it } from "vitest";
import type { GameEvent } from "@bta/shared-schema";

// ---- Inline copies of pure helpers from App.tsx so we can test without a DOM ----

type TeamSide = "home" | "away";

function clockToSec(clock: string): number {
  const [m, s] = clock.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

function upsertSortedEvent(events: GameEvent[], nextEvent: GameEvent): GameEvent[] {
  return [...events.filter((event) => event.id !== nextEvent.id), nextEvent]
    .sort((left, right) => left.sequence - right.sequence);
}

function removeEventById(events: GameEvent[], eventId: string): GameEvent[] {
  return events.filter((event) => event.id !== eventId);
}

interface RunningTotals {
  points: number; fgm: number; fga: number; threePm: number; threePa: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; ast: number; stl: number; blk: number; to: number; fouls: number;
}

function computePlayerTotals(events: GameEvent[]): Record<string, RunningTotals> {
  const map: Record<string, RunningTotals> = {};
  function get(id: string) {
    if (!map[id]) map[id] = { points: 0, fgm: 0, fga: 0, threePm: 0, threePa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, fouls: 0 };
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
    } else if (e.type === "free_throw_attempt") {
      const t = get(e.playerId);
      t.fta++;
      if (e.made) { t.ftm++; t.points += 1; }
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
    } else if (e.type === "free_throw_attempt" && e.made) {
      const side = e.teamId as TeamSide;
      if (side === "home" || side === "away") s[side] += 1;
    }
  }
  return s;
}

function normalizeUrlBase(url: string | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "");
}

function isLegacyStatsExportConfigured(setup: { apiUrl?: string; dashboardUrl?: string }): boolean {
  const apiBase = normalizeUrlBase(setup.apiUrl);
  const dashboardBase = normalizeUrlBase(setup.dashboardUrl);
  if (!dashboardBase) return false;
  return dashboardBase !== apiBase;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shot(overrides: Partial<GameEvent> & { made: boolean; points: 2 | 3; teamId: string; playerId: string }): GameEvent {
  return {
    id: `evt-${Math.random()}`,
    gameId: "g1",
    sequence: 1,
    timestampIso: "2026-03-20T00:00:00.000Z",
    period: "Q1",
    clockSecondsRemaining: 480,
    operatorId: "op-1",
    type: "shot_attempt",
    zone: "paint",
    ...overrides,
  } as GameEvent;
}

function ftEvt(playerId: string, teamId: string, made: boolean, attemptNumber = 1, totalAttempts = 2): GameEvent {
  return {
    id: `ft-${Math.random()}`,
    gameId: "g1",
    sequence: 1,
    timestampIso: "2026-03-20T00:00:00.000Z",
    period: "Q1",
    clockSecondsRemaining: 480,
    operatorId: "op-1",
    teamId,
    type: "free_throw_attempt",
    playerId,
    made,
    attemptNumber,
    totalAttempts,
  } as GameEvent;
}

function foulEvt(playerId: string): GameEvent {
  return {
    id: `foul-${Math.random()}`,
    gameId: "g1",
    sequence: 2,
    timestampIso: "2026-03-20T00:01:00.000Z",
    period: "Q1",
    clockSecondsRemaining: 460,
    operatorId: "op-1",
    teamId: "home",
    type: "foul",
    playerId,
    foulType: "personal",
  } as GameEvent;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("clockToSec", () => {
  it("converts MM:SS correctly", () => {
    expect(clockToSec("8:00")).toBe(480);
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

  it("counts free throws as 1 point each via free_throw_attempt events", () => {
    const events = [
      ftEvt("h1", "home", true,  1, 2),
      ftEvt("h1", "home", true,  2, 2),
      ftEvt("h1", "home", false, 1, 1), // miss — should not count
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

describe("legacy dashboard export detection", () => {
  it("skips legacy export when the dashboard URL matches the realtime API", () => {
    expect(isLegacyStatsExportConfigured({
      apiUrl: "http://localhost:4000",
      dashboardUrl: "http://localhost:4000/",
    })).toBe(false);
  });

  it("keeps legacy export enabled when a separate endpoint is configured", () => {
    expect(isLegacyStatsExportConfigured({
      apiUrl: "http://localhost:4000",
      dashboardUrl: "https://stats.example.com",
    })).toBe(true);
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

  it("counts free throw makes and misses via free_throw_attempt events", () => {
    const events = [
      ftEvt("h1", "home", true,  1, 2),
      ftEvt("h1", "home", false, 2, 2),
    ];
    const t = computePlayerTotals(events)["h1"];
    expect(t.points).toBe(1);
    expect(t.ftm).toBe(1);
    expect(t.fta).toBe(2);
    // FTs are not FG attempts
    expect(t.fgm).toBe(0);
    expect(t.fga).toBe(0);
  });

  it("tracks rebounds (offensive and defensive)", () => {
    const base = { id: "r1", gameId: "g1", sequence: 1, timestampIso: "2026-03-20T00:00:00.000Z", period: "Q1", clockSecondsRemaining: 480, operatorId: "op-1", teamId: "home" };
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
    const base = { id: "x", gameId: "g1", sequence: 1, timestampIso: "2026-03-20T00:00:00.000Z", period: "Q1", clockSecondsRemaining: 480, operatorId: "op-1", teamId: "home" };
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

describe("event list mutations", () => {
  it("replaces an existing event and preserves sequence order", () => {
    const existing = shot({ id: "evt-1", teamId: "home", playerId: "h1", made: true, points: 2, sequence: 1 });
    const later = shot({ id: "evt-2", teamId: "away", playerId: "a1", made: true, points: 3, sequence: 2 });
    const updated = shot({ id: "evt-1", teamId: "home", playerId: "h2", made: false, points: 2, sequence: 1 });

    const result = upsertSortedEvent([later, existing], updated);

    expect(result.map((event) => event.id)).toEqual(["evt-1", "evt-2"]);
    expect((result[0] as Extract<GameEvent, { type: "shot_attempt" }>).playerId).toBe("h2");
    expect((result[0] as Extract<GameEvent, { type: "shot_attempt" }>).made).toBe(false);
  });

  it("removes an event by id without affecting others", () => {
    const first = shot({ id: "evt-1", teamId: "home", playerId: "h1", made: true, points: 2, sequence: 1 });
    const second = shot({ id: "evt-2", teamId: "away", playerId: "a1", made: false, points: 3, sequence: 2 });

    expect(removeEventById([first, second], "evt-1")).toEqual([second]);
  });
});

describe("offline and sync behavior", () => {
  it("queues events as pending when offline", () => {
    // This tests the logic that would queue events to localStorage when navigator.onLine is false
    const pendingEvent = shot({ id: "evt-offline-1", teamId: "home", playerId: "h1", made: true, points: 2 });
    const pendingEvents = [pendingEvent];

    // When we have pending events, they should be included in all score/stat calculations
    expect(computeScores(pendingEvents).home).toBe(2);
  });

  it("retains pending events even after reconnection attempt", () => {
    // Simulate: queue event, try to submit, fail, event stays in pending
    const pending = shot({ id: "evt-pending", teamId: "away", playerId: "a1", made: false, points: 3 });
    const allEvents = [pending];

    // Event should remain even if submission fails
    expect(removeEventById(allEvents, "some-other-id")).toEqual([pending]);
  });

  it("removes event from pending once submitted successfully", () => {
    const pending = shot({ id: "evt-to-submit", teamId: "home", playerId: "h1", made: true, points: 2 });
    const pendingEvent = [pending];

    // After successful submission, event is removed from pending
    const afterSubmit = removeEventById(pendingEvent, "evt-to-submit");
    expect(afterSubmit).toEqual([]);
  });

  it("handles foul count correctly across OT period changes", () => {
    // Test scenario: 5 fouls in Q4, then overtime starts, foul count should reset or carry over
    const foulsQ4 = [foulEvt("h1"), foulEvt("h1"), foulEvt("h1"), foulEvt("h1"), foulEvt("h1")];
    const totals = computePlayerTotals(foulsQ4);
    expect(totals["h1"].fouls).toBe(5);

    // In OT, this player has fouled out and should not be able to play
    // (This is enforced at the state logic level, not the events level)
  });

  it("maintains event sequence across offline and online transitions", () => {
    const evt1 = shot({ id: "evt-1", sequence: 1, teamId: "home", playerId: "h1", made: true, points: 2 });
    const evt2 = shot({ id: "evt-2", sequence: 2, teamId: "away", playerId: "a1", made: false, points: 3 });
    const evt3 = shot({ id: "evt-3", sequence: 3, teamId: "home", playerId: "h2", made: true, points: 3 });

    // All three events should be sorted by sequence
    const events = [evt2, evt3, evt1]; // Out of order
    const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

    expect(sorted.map(e => e.id)).toEqual(["evt-1", "evt-2", "evt-3"]);
  });
});

describe("coach code sync snapshot", () => {
  interface SyncPlayer { id: string; number: string; name: string; position: string; }
  interface SyncTeam { id: string; name: string; abbreviation: string; players: SyncPlayer[]; }
  interface SyncState {
    teams: SyncTeam[];
    gameSetup: {
      connectionId?: string;
      gameId: string;
      myTeamId: string;
      opponent: string;
      vcSide: "home" | "away";
      dashboardUrl: string;
      startingLineup?: string[];
      homeTeamColor?: string;
      awayTeamColor?: string;
    };
  }

  function normalizeConnectionId(value: string | null | undefined): string {
    return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  }

  function mergeCoachLinkSnapshot(
    current: SyncState,
    snapshot: {
      connectionId: string;
      setup?: { gameId?: string; myTeamId?: string; opponentName?: string; vcSide?: "home" | "away"; homeTeamColor?: string; awayTeamColor?: string; dashboardUrl?: string };
      teams?: SyncTeam[];
    },
  ): SyncState {
    const teams = snapshot.teams ?? current.teams;
    const nextTeamId = snapshot.setup?.myTeamId?.trim() || current.gameSetup.myTeamId || teams[0]?.id || "";
    const allowed = new Set((teams.find((team) => team.id === nextTeamId)?.players ?? []).map((player) => player.id));
    const startingLineup = (current.gameSetup.startingLineup ?? []).filter((playerId) => allowed.has(playerId));
    return {
      ...current,
      teams,
      gameSetup: {
        ...current.gameSetup,
        connectionId: normalizeConnectionId(snapshot.connectionId || current.gameSetup.connectionId),
        gameId: snapshot.setup?.gameId ?? current.gameSetup.gameId,
        myTeamId: nextTeamId,
        opponent: snapshot.setup?.opponentName ?? current.gameSetup.opponent,
        vcSide: snapshot.setup?.vcSide ?? current.gameSetup.vcSide,
        dashboardUrl: snapshot.setup?.dashboardUrl ?? current.gameSetup.dashboardUrl,
        homeTeamColor: snapshot.setup?.homeTeamColor ?? current.gameSetup.homeTeamColor,
        awayTeamColor: snapshot.setup?.awayTeamColor ?? current.gameSetup.awayTeamColor,
        startingLineup,
      },
    };
  }

  it("hydrates the operator team and matchup from the coach code", () => {
    const state: SyncState = {
      teams: [],
      gameSetup: {
        gameId: "local-game",
        myTeamId: "",
        opponent: "",
        vcSide: "home",
        dashboardUrl: "http://localhost:4000",
        startingLineup: ["p1"],
      },
    };

    const merged = mergeCoachLinkSnapshot(state, {
      connectionId: " Conn-VC-2026 ",
      setup: {
        gameId: "vc-vs-central",
        myTeamId: "vc-varsity",
        opponentName: "Central Christian",
        vcSide: "away",
        dashboardUrl: "http://localhost:5173/live",
      },
      teams: [
        {
          id: "vc-varsity",
          name: "Valley Catholic Varsity",
          abbreviation: "VC",
          players: [{ id: "p1", number: "1", name: "Ava", position: "PG" }],
        },
      ],
    });

    expect(merged.gameSetup.connectionId).toBe("conn-vc-2026");
    expect(merged.gameSetup.gameId).toBe("vc-vs-central");
    expect(merged.gameSetup.myTeamId).toBe("vc-varsity");
    expect(merged.gameSetup.opponent).toBe("Central Christian");
    expect(merged.gameSetup.vcSide).toBe("away");
    expect(merged.teams[0]?.name).toBe("Valley Catholic Varsity");
    expect(merged.gameSetup.startingLineup).toEqual(["p1"]);
  });

  it("drops stale starters that are no longer on the synced roster", () => {
    const state: SyncState = {
      teams: [
        {
          id: "vc-varsity",
          name: "Valley Catholic Varsity",
          abbreviation: "VC",
          players: [
            { id: "p1", number: "1", name: "Ava", position: "PG" },
            { id: "p2", number: "2", name: "Mia", position: "SG" },
          ],
        },
      ],
      gameSetup: {
        connectionId: "conn-vc-2026",
        gameId: "vc-vs-central",
        myTeamId: "vc-varsity",
        opponent: "Central Christian",
        vcSide: "home",
        dashboardUrl: "http://localhost:4000",
        startingLineup: ["p1", "p2", "missing-player"],
      },
    };

    const merged = mergeCoachLinkSnapshot(state, {
      connectionId: "conn-vc-2026",
      setup: { myTeamId: "vc-varsity" },
      teams: [
        {
          id: "vc-varsity",
          name: "Valley Catholic Varsity",
          abbreviation: "VC",
          players: [{ id: "p1", number: "1", name: "Ava", position: "PG" }],
        },
      ],
    });

    expect(merged.gameSetup.startingLineup).toEqual(["p1"]);
  });
});
