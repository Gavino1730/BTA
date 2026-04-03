import { describe, expect, it } from "vitest";
import { createInitialGameState, replayEvents } from "@bta/game-state";
import type { GameEvent } from "@bta/shared-schema";
import { generateInsights } from "./index.js";

describe("insight engine", () => {
  it("emits foul trouble insight at 3 fouls", () => {
    // Build 5+ events so the pre-game guard (events.length < 5 && score === 0) is bypassed.
    // h1 gets 3 personal fouls; two padding fouls on the away team precede them.
    const paddingFouls: GameEvent[] = [1, 2].map((sequence) => ({
      id: `pad-foul-${sequence}`,
      schoolId: "test-school",
      gameId: "game-1",
      sequence,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 480 - sequence,
      teamId: "away",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "a1",
      foulType: "personal" as const
    }));

    const foulEvents: GameEvent[] = [3, 4, 5].map((sequence) => ({
      id: `foul-${sequence}`,
      schoolId: "test-school",
      gameId: "game-1",
      sequence,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 400 - sequence,
      teamId: "home",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "h1",
      foulType: "personal" as const
    }));

    const events = [...paddingFouls, ...foulEvents];
    const state = replayEvents(createInitialGameState("game-1", "home", "away"), events);
    const insights = generateInsights({ state, latestEvent: foulEvents[2] });

    // 3 fouls on a player now emits "foul_warning"; 4+ fouls emits "foul_trouble"
    expect(insights.some((insight) => insight.type === "foul_warning" || insight.type === "foul_trouble")).toBe(true);
  });

  it("uses explicit fouled-out wording at 5 fouls", () => {
    const paddingFouls: GameEvent[] = [1, 2].map((sequence) => ({
      id: `pad-fo-${sequence}`,
      schoolId: "test-school",
      gameId: "game-fo",
      sequence,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 480 - sequence,
      teamId: "away",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "a1",
      foulType: "personal" as const
    }));

    const foulEvents: GameEvent[] = [3, 4, 5, 6, 7].map((sequence) => ({
      id: `fo-${sequence}`,
      schoolId: "test-school",
      gameId: "game-fo",
      sequence,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 430 - sequence,
      teamId: "home",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "h1",
      foulType: "personal" as const
    }));

    const events = [...paddingFouls, ...foulEvents];
    const state = replayEvents(createInitialGameState("game-fo", "home", "away"), events);
    const insights = generateInsights({ state, latestEvent: foulEvents[4] });

    expect(insights.some((insight) => insight.message.includes("FOULED OUT"))).toBe(true);
    expect(
      insights.some(
        (insight) => insight.type === "foul_trouble" && insight.message.includes("foul-out risk")
      )
    ).toBe(false);
  });

  it("emits scoring_drought after 6 consecutive missed field goals", () => {
    // Use opponentTeamId so ourTeamId resolves to "home"
    const BASE = createInitialGameState("game-drought", "home", "away", "Away", "away");

    const missEvents: GameEvent[] = Array.from({ length: 6 }, (_, i) => ({
      id: `miss-${i + 1}`,
      schoolId: "test-school",
      gameId: "game-drought",
      sequence: i + 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q2" as const,
      clockSecondsRemaining: 400 - i,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt" as const,
      playerId: `h${i + 1}`,
      made: false,
      points: 2 as const,
      zone: "midrange" as const,
    }));

    const state = replayEvents(BASE, missEvents);
    const insights = generateInsights({ state, latestEvent: missEvents[5] });

    expect(insights.some((i) => i.type === "scoring_drought")).toBe(true);
  });

  it("does NOT emit scoring_drought if the team hit a field goal in the last 6 attempts", () => {
    const BASE = createInitialGameState("game-no-drought", "home", "away", "Away", "away");

    const events: GameEvent[] = Array.from({ length: 6 }, (_, i) => ({
      id: `shot-${i + 1}`,
      schoolId: "test-school",
      gameId: "game-no-drought",
      sequence: i + 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q2" as const,
      clockSecondsRemaining: 400 - i,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt" as const,
      playerId: "h1",
      made: i === 0, // first shot is made
      points: 2 as const,
      zone: "rim" as const,
    }));

    const state = replayEvents(BASE, events);
    const insights = generateInsights({ state, latestEvent: events[5] });

    expect(insights.some((i) => i.type === "scoring_drought")).toBe(false);
  });

  it("emits depth_warning when 2 or more active players have 3+ fouls", () => {
    const BASE = createInitialGameState("game-depth", "home", "away", "Away", "away");

    // Sub in two home players first
    const subEvents: GameEvent[] = [
      {
        id: "sub-1",
        schoolId: "test-school",
        gameId: "game-depth",
        sequence: 1,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q1" as const,
        clockSecondsRemaining: 480,
        teamId: "home",
        operatorId: "op-1",
        type: "substitution" as const,
        playerOutId: "nobody",
        playerInId: "h1",
      },
      {
        id: "sub-2",
        schoolId: "test-school",
        gameId: "game-depth",
        sequence: 2,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q1" as const,
        clockSecondsRemaining: 479,
        teamId: "home",
        operatorId: "op-1",
        type: "substitution" as const,
        playerOutId: "nobody2",
        playerInId: "h2",
      },
    ];

    // Give h1 and h2 each 3 fouls
    const foulEvents: GameEvent[] = Array.from({ length: 6 }, (_, i) => ({
      id: `depth-foul-${i + 1}`,
      schoolId: "test-school",
      gameId: "game-depth",
      sequence: i + 3,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q2" as const,
      clockSecondsRemaining: 400 - i,
      teamId: "home",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: i < 3 ? "h1" : "h2",
      foulType: "personal" as const,
    }));

    const state = replayEvents(BASE, [...subEvents, ...foulEvents]);
    const insights = generateInsights({ state, latestEvent: foulEvents[5] });

    expect(insights.some((i) => i.type === "depth_warning")).toBe(true);
  });

  it("emits efficiency insight when opponent PPP exceeds ours by 0.25+", () => {
    // home = ourTeam, away = opponent
    const BASE = createInitialGameState("game-eff", "home", "away", "Away", "away");

    // Build 15 possessions for each team using possession_start events
    const possEvents: GameEvent[] = Array.from({ length: 30 }, (_, i) => ({
      id: `poss-${i + 1}`,
      schoolId: "test-school",
      gameId: "game-eff",
      sequence: i + 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q2" as const,
      clockSecondsRemaining: 400 - i,
      teamId: i % 2 === 0 ? "home" : "away",
      operatorId: "op-1",
      type: "possession_start" as const,
      possessedByTeamId: i % 2 === 0 ? "home" : "away",
    }));

    // Give opponent (away) two 3-pointers (6 pts / 15 poss = 0.4 PPP), home 0 pts (0.0 PPP), gap = 0.4
    const scoreEvents: GameEvent[] = [
      {
        id: "opp-score-1",
        schoolId: "test-school",
        gameId: "game-eff",
        sequence: 31,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q2" as const,
        clockSecondsRemaining: 300,
        teamId: "away",
        operatorId: "op-1",
        type: "shot_attempt" as const,
        playerId: "a1",
        made: true,
        points: 3 as const,
        zone: "above_break_three" as const,
      },
      {
        id: "opp-score-2",
        schoolId: "test-school",
        gameId: "game-eff",
        sequence: 32,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q2" as const,
        clockSecondsRemaining: 290,
        teamId: "away",
        operatorId: "op-1",
        type: "shot_attempt" as const,
        playerId: "a1",
        made: true,
        points: 3 as const,
        zone: "above_break_three" as const,
      },
      {
        id: "home-score-1",
        schoolId: "test-school",
        gameId: "game-eff",
        sequence: 33,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q2" as const,
        clockSecondsRemaining: 280,
        teamId: "home",
        operatorId: "op-1",
        type: "shot_attempt" as const,
        playerId: "h1",
        made: false,
        points: 2 as const,
        zone: "midrange" as const,
      },
    ];

    const state = replayEvents(BASE, [...possEvents, ...scoreEvents]);
    const insights = generateInsights({ state, latestEvent: scoreEvents[2] });

    expect(insights.some((i) => i.type === "efficiency")).toBe(true);
  });

  it("emits leverage insight in final 18 seconds of Q1", () => {
    const BASE = createInitialGameState("game-lev", "home", "away", "Away", "away");

    // Padding events so isPreGameState guard is bypassed (score > 0 or events >= 5)
    const padEvents: GameEvent[] = Array.from({ length: 4 }, (_, i) => ({
      id: `pad-lev-${i + 1}`,
      schoolId: "test-school",
      gameId: "game-lev",
      sequence: i + 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1" as const,
      clockSecondsRemaining: 400 - i,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt" as const,
      playerId: "h1",
      made: false,
      points: 2 as const,
      zone: "midrange" as const,
    }));

    const finalEvent: GameEvent = {
      id: "lev-event",
      schoolId: "test-school",
      gameId: "game-lev",
      sequence: 5,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1" as const,
      clockSecondsRemaining: 12,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt" as const,
      playerId: "h1",
      made: false,
      points: 2 as const,
      zone: "midrange" as const,
    };

    const state = replayEvents(BASE, [...padEvents, finalEvent]);
    const insights = generateInsights({ state, latestEvent: finalEvent });

    expect(insights.some((i) => i.type === "leverage")).toBe(true);
  });

  it("emits timeout_suggestion when timeout budget drops below 2 in Q4", () => {
    const BASE = createInitialGameState("game-timeout-budget", "home", "away", "Away", "away");

    const events: GameEvent[] = [
      {
        id: "tb-pad-1",
        schoolId: "test-school",
        gameId: "game-timeout-budget",
        sequence: 1,
        timestampIso: "2026-03-18T20:00:00.000Z",
        period: "Q4" as const,
        clockSecondsRemaining: 95,
        teamId: "away",
        operatorId: "op-1",
        type: "shot_attempt" as const,
        playerId: "a1",
        made: true,
        points: 2 as const,
        zone: "paint" as const,
      },
      {
        id: "tb-timeout-1",
        schoolId: "test-school",
        gameId: "game-timeout-budget",
        sequence: 2,
        timestampIso: "2026-03-18T20:00:05.000Z",
        period: "Q4" as const,
        clockSecondsRemaining: 92,
        teamId: "home",
        operatorId: "op-1",
        type: "timeout" as const,
        timeoutType: "full" as const,
      },
      {
        id: "tb-timeout-2",
        schoolId: "test-school",
        gameId: "game-timeout-budget",
        sequence: 3,
        timestampIso: "2026-03-18T20:00:10.000Z",
        period: "Q4" as const,
        clockSecondsRemaining: 89,
        teamId: "home",
        operatorId: "op-1",
        type: "timeout" as const,
        timeoutType: "full" as const,
      },
      {
        id: "tb-timeout-3",
        schoolId: "test-school",
        gameId: "game-timeout-budget",
        sequence: 4,
        timestampIso: "2026-03-18T20:00:15.000Z",
        period: "Q4" as const,
        clockSecondsRemaining: 86,
        teamId: "home",
        operatorId: "op-1",
        type: "timeout" as const,
        timeoutType: "short" as const,
      },
      {
        id: "tb-timeout-4",
        schoolId: "test-school",
        gameId: "game-timeout-budget",
        sequence: 5,
        timestampIso: "2026-03-18T20:00:20.000Z",
        period: "Q4" as const,
        clockSecondsRemaining: 84,
        teamId: "home",
        operatorId: "op-1",
        type: "timeout" as const,
        timeoutType: "short" as const,
      },
    ];

    const state = replayEvents(BASE, events);
    const insights = generateInsights({ state, latestEvent: events[4] });

    expect(insights.some((i) => i.id.includes("timeout-budget") && i.type === "timeout_suggestion")).toBe(true);
  });

  it("emits matchup_exploitation when a defender with an active assignment picks up foul trouble", () => {
    // Set up: h3 is assigned to guard opp-22, then h3 accumulates 3 fouls.
    const matchupEvent: GameEvent = {
      id: "mqp-assign-1",
      schoolId: "test-school",
      gameId: "game-mqp",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 480,
      teamId: "home",
      operatorId: "op-1",
      type: "matchup_assignment" as const,
      defenderPlayerId: "h3",
      offensivePlayerId: "opp-22",
    };

    const paddingFoul: GameEvent = {
      id: "mqp-pad-foul",
      schoolId: "test-school",
      gameId: "game-mqp",
      sequence: 2,
      timestampIso: "2026-03-18T20:00:02.000Z",
      period: "Q1",
      clockSecondsRemaining: 475,
      teamId: "away",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "a1",
      foulType: "personal" as const,
    };

    const paddingScore: GameEvent = {
      id: "mqp-pad-score",
      schoolId: "test-school",
      gameId: "game-mqp",
      sequence: 3,
      timestampIso: "2026-03-18T20:00:04.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt" as const,
      playerId: "h1",
      made: true,
      points: 2 as const,
      zone: "paint" as const,
    };

    const foulEvents: GameEvent[] = [4, 5, 6].map((seq) => ({
      id: `mqp-foul-${seq}`,
      schoolId: "test-school",
      gameId: "game-mqp",
      sequence: seq,
      timestampIso: "2026-03-18T20:00:10.000Z",
      period: "Q1",
      clockSecondsRemaining: 400 - seq,
      teamId: "home",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "h3",
      foulType: "personal" as const,
    }));

    const allEvents = [matchupEvent, paddingFoul, paddingScore, ...foulEvents];
    const state = replayEvents(createInitialGameState("game-mqp", "home", "away"), allEvents);
    state.opponentTeamId = "away";

    const insights = generateInsights({ state, latestEvent: foulEvents[2] });
    const mqpInsight = insights.find((i) => i.type === "matchup_exploitation");
    expect(mqpInsight).toBeDefined();
    expect(mqpInsight?.message).toContain("22");
    expect(mqpInsight?.relatedPlayerId).toBe("h3");
  });

  it("emits team_foul_warning only when the 5th foul crosses the bonus threshold", () => {
    // 4 away fouls → no bonus alert; 5th foul → alert fires exactly once
    const makeFoul = (seq: number): GameEvent => ({
      id: `bn-foul-${seq}`,
      schoolId: "test-school",
      gameId: "game-bonus",
      sequence: seq,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q2" as const,
      clockSecondsRemaining: 480 - seq * 10,
      teamId: "away",
      operatorId: "op-1",
      type: "foul" as const,
      playerId: "a1",
      foulType: "personal" as const,
    });
    // padding score so pre-game guard is bypassed
    const paddingScore: GameEvent = {
      id: "bn-pad-score",
      schoolId: "test-school",
      gameId: "game-bonus",
      sequence: 0,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q2" as const,
      clockSecondsRemaining: 490,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt" as const,
      playerId: "h1",
      made: true,
      points: 2 as const,
      zone: "paint" as const,
    };
    const fourFouls = [1, 2, 3, 4].map(makeFoul);
    const state4 = replayEvents(createInitialGameState("game-bonus", "home", "away"), [paddingScore, ...fourFouls]);
    state4.opponentTeamId = "away";
    // 4 fouls — no bonus alert yet
    const insights4 = generateInsights({ state: state4, latestEvent: fourFouls[3] });
    expect(insights4.some((i) => i.type === "team_foul_warning")).toBe(false);

    // 5th foul — bonus threshold crossed → alert should fire
    const fifthFoul = makeFoul(5);
    const state5 = replayEvents(createInitialGameState("game-bonus", "home", "away"), [paddingScore, ...fourFouls, fifthFoul]);
    state5.opponentTeamId = "away";
    const insights5 = generateInsights({ state: state5, latestEvent: fifthFoul });
    expect(insights5.some((i) => i.type === "team_foul_warning")).toBe(true);
  });

  it("emits three_point_streak when opponent hits 3 of last 6 three-pointers", () => {
    const make3 = (seq: number, made: boolean): GameEvent => ({
      id: `tp-${seq}`,
      schoolId: "test-school",
      gameId: "game-3pt",
      sequence: seq,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q2" as const,
      clockSecondsRemaining: 400 - seq,
      teamId: "away",
      operatorId: "op-1",
      type: "shot_attempt" as const,
      playerId: "a1",
      made,
      points: 3 as const,
      zone: "above_break_three" as const,
    });
    // padding score so pre-game guard is bypassed
    const paddingScore: GameEvent = {
      id: "tp-pad",
      schoolId: "test-school",
      gameId: "game-3pt",
      sequence: 0,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q2" as const,
      clockSecondsRemaining: 490,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt" as const,
      playerId: "h1",
      made: true,
      points: 2 as const,
      zone: "paint" as const,
    };
    // 3 makes + 3 misses = 3/6 = exactly at threshold
    const events = [paddingScore, make3(1, true), make3(2, false), make3(3, true), make3(4, false), make3(5, true), make3(6, false)];
    const state = replayEvents(createInitialGameState("game-3pt", "home", "away"), events);
    state.opponentTeamId = "away";
    const insights = generateInsights({ state, latestEvent: events[events.length - 1] });
    expect(insights.some((i) => i.type === "three_point_streak")).toBe(true);
  });

  it("emits foul_to_give in late Q4 when our team has fouls remaining before bonus", () => {
    const scoreEvent: GameEvent = {
      id: "ftg-score",
      schoolId: "test-school",
      gameId: "game-ftg",
      sequence: 1,
      timestampIso: "2026-03-18T20:00:00.000Z",
      period: "Q4" as const,
      clockSecondsRemaining: 44,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt" as const,
      playerId: "h1",
      made: true,
      points: 2 as const,
      zone: "paint" as const,
    };
    const prevEvent: GameEvent = {
      ...scoreEvent,
      id: "ftg-prev",
      sequence: 0,
      clockSecondsRemaining: 60, // was outside the window
    };
    const state = replayEvents(createInitialGameState("game-ftg", "home", "away"), [prevEvent, scoreEvent]);
    state.opponentTeamId = "away";
    const insights = generateInsights({ state, latestEvent: scoreEvent, clockEnabled: true });
    expect(insights.some((i) => i.type === "foul_to_give")).toBe(true);
  });
});
