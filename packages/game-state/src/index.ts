import type { GameEvent } from "@bta/shared-schema";
import { isOvertimePeriod } from "@bta/shared-schema";

// NFHS rules constants
/** Players foul out after 5 personal fouls (tracked game-wide including OT) */
export const FOUL_OUT_THRESHOLD = 5;
/** Bonus awarded when opposing team reaches 5 team fouls in a period. Always 2 FTs — no 1-and-1. */
export const BONUS_FOUL_THRESHOLD = 5;

export interface TeamShootingStats {
  fgAttempts: number;  // field goal attempts (2pt + 3pt only)
  fgMade: number;
  fgAttempts3: number; // 3-point attempts (subset of fgAttempts)
  fgMade3: number;     // 3-point makes (subset of fgMade)
  ftAttempts: number;  // free throw attempts
  ftMade: number;
  points: number;
}

export interface TeamStats {
  reboundsOff: number;
  reboundsDef: number;
  turnovers: number;
  fouls: number;       // total fouls committed (all periods)
  substitutions: number;
  shooting: TeamShootingStats;
}

export interface PlayerStats {
  playerId: string;
  teamId: string;
  points: number;
  fgAttempts: number;  // field goals attempted (2pt + 3pt)
  fgMade: number;
  ftAttempts: number;
  ftMade: number;
  reboundsOff: number;
  reboundsDef: number;
  turnovers: number;
  fouls: number;
  assists: number;
  steals: number;
  blocks: number;
}

/**
 * Compute bonus status per NFHS rules:
 * - Q1–Q4: bonus when opposing team reaches 5 team fouls in that period
 * - OT: fouls carry over from Q4; no reset between OT periods.
 *   Bonus based on Q4 fouls + all OT fouls (combined running total).
 */
function computeBonusByTeam(
  teamFoulsByPeriod: Record<string, Record<string, number>>,
  currentPeriod: string,
  homeTeamId: string,
  awayTeamId: string
): Record<string, boolean> {
  function periodFoulsForTeam(teamId: string): number {
    const byPeriod = teamFoulsByPeriod[teamId] ?? {};
    if (isOvertimePeriod(currentPeriod)) {
      // Carry Q4 fouls into all OT periods; accumulate across all OT periods
      const q4Fouls = byPeriod["Q4"] ?? 0;
      const otFouls = Object.entries(byPeriod)
        .filter(([p]) => isOvertimePeriod(p))
        .reduce((sum, [, c]) => sum + c, 0);
      return q4Fouls + otFouls;
    }
    return byPeriod[currentPeriod] ?? 0;
  }

  const homeFouls = periodFoulsForTeam(homeTeamId);
  const awayFouls = periodFoulsForTeam(awayTeamId);

  return {
    // Home team is in bonus when away team has 5+ period fouls
    [homeTeamId]: awayFouls >= BONUS_FOUL_THRESHOLD,
    // Away team is in bonus when home team has 5+ period fouls
    [awayTeamId]: homeFouls >= BONUS_FOUL_THRESHOLD,
  };
}

export interface GameState {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  /** Opponent team name displayed on scoreboard */
  opponentName?: string;
  /** Opponent team ID ("home" or "away") for identifying which side is the opponent */
  opponentTeamId?: string;
  /** Current period (Q1, Q2, Q3, Q4, OT1, OT2, ...), updated by period_transition events */
  currentPeriod: string;
  scoreByTeam: Record<string, number>;
  possessionsByTeam: Record<string, number>;
  activeLineupsByTeam: Record<string, string[]>;
  teamStats: Record<string, TeamStats>;
  playerStatsByTeam: Record<string, Record<string, PlayerStats>>;
  /** Personal fouls per player across the entire game (foul out at 5) */
  playerFouls: Record<string, number>;
  /** Team fouls indexed by teamId → period → count. Used for bonus calculation. */
  teamFoulsByPeriod: Record<string, Record<string, number>>;
  /** Whether each team is currently in bonus (opposing team has 5+ period fouls) */
  bonusByTeam: Record<string, boolean>;
  /** Total timeouts used per team across the game */
  timeoutsByTeam: Record<string, number>;
  /** Active defender -> offensive player matchup assignments by defending team */
  activeMatchupsByTeam: Record<string, Record<string, string>>;
  events: GameEvent[];
  lastSequence: number;
  /** Starting lineup by team for lineup-unit tracking. Preserved across event applications. */
  startingLineupByTeam?: Record<string, string[]>;
}

const emptyTeamStats = (): TeamStats => ({
  reboundsOff: 0,
  reboundsDef: 0,
  turnovers: 0,
  fouls: 0,
  substitutions: 0,
  shooting: {
    fgAttempts: 0,
    fgMade: 0,
    fgAttempts3: 0,
    fgMade3: 0,
    ftAttempts: 0,
    ftMade: 0,
    points: 0
  }
});

function cloneTeamStats(teamStats: Record<string, TeamStats>): Record<string, TeamStats> {
  return Object.fromEntries(
    Object.entries(teamStats).map(([teamId, stats]) => [
      teamId,
      {
        ...stats,
        shooting: { ...stats.shooting }
      }
    ])
  );
}

function emptyPlayerStats(playerId: string, teamId: string): PlayerStats {
  return {
    playerId,
    teamId,
    points: 0,
    fgAttempts: 0,
    fgMade: 0,
    ftAttempts: 0,
    ftMade: 0,
    reboundsOff: 0,
    reboundsDef: 0,
    turnovers: 0,
    fouls: 0,
    assists: 0,
    steals: 0,
    blocks: 0
  };
}

function clonePlayerStatsByTeam(
  playerStatsByTeam: Record<string, Record<string, PlayerStats>>
): Record<string, Record<string, PlayerStats>> {
  return Object.fromEntries(
    Object.entries(playerStatsByTeam).map(([teamId, playerStats]) => [
      teamId,
      Object.fromEntries(
        Object.entries(playerStats).map(([playerId, stats]) => [playerId, { ...stats }])
      )
    ])
  );
}

export function createInitialGameState(
  gameId: string,
  homeTeamId: string,
  awayTeamId: string,
  opponentName?: string,
  opponentTeamId?: string
): GameState {
  return {
    gameId,
    homeTeamId,
    awayTeamId,
    opponentName,
    opponentTeamId,
    currentPeriod: "Q1",
    scoreByTeam: {
      [homeTeamId]: 0,
      [awayTeamId]: 0
    },
    possessionsByTeam: {
      [homeTeamId]: 0,
      [awayTeamId]: 0
    },
    activeLineupsByTeam: {
      [homeTeamId]: [],
      [awayTeamId]: []
    },
    teamStats: {
      [homeTeamId]: emptyTeamStats(),
      [awayTeamId]: emptyTeamStats()
    },
    playerStatsByTeam: {
      [homeTeamId]: {},
      [awayTeamId]: {}
    },
    playerFouls: {},
    teamFoulsByPeriod: {
      [homeTeamId]: {},
      [awayTeamId]: {}
    },
    bonusByTeam: {
      [homeTeamId]: false,
      [awayTeamId]: false
    },
    timeoutsByTeam: {
      [homeTeamId]: 0,
      [awayTeamId]: 0
    },
    activeMatchupsByTeam: {
      [homeTeamId]: {},
      [awayTeamId]: {}
    },
    events: [],
    lastSequence: 0
  };
}

function ensureTeamState(state: GameState, teamId: string): TeamStats {
  if (!state.teamStats[teamId]) {
    state.teamStats[teamId] = emptyTeamStats();
    state.scoreByTeam[teamId] = state.scoreByTeam[teamId] ?? 0;
    state.possessionsByTeam[teamId] = state.possessionsByTeam[teamId] ?? 0;
    state.teamFoulsByPeriod[teamId] = state.teamFoulsByPeriod[teamId] ?? {};
    state.activeMatchupsByTeam[teamId] = state.activeMatchupsByTeam[teamId] ?? {};
  }

  return state.teamStats[teamId];
}

function ensurePlayerTeamState(
  state: GameState,
  teamId: string
): Record<string, PlayerStats> {
  if (!state.playerStatsByTeam[teamId]) {
    state.playerStatsByTeam[teamId] = {};
  }

  return state.playerStatsByTeam[teamId];
}

function ensurePlayerStats(state: GameState, teamId: string, playerId: string): PlayerStats {
  const teamPlayers = ensurePlayerTeamState(state, teamId);
  if (!teamPlayers[playerId]) {
    teamPlayers[playerId] = emptyPlayerStats(playerId, teamId);
  }

  return teamPlayers[playerId];
}

function ensureLineupState(state: GameState, teamId: string): string[] {
  if (!state.activeLineupsByTeam[teamId]) {
    state.activeLineupsByTeam[teamId] = [];
  }

  return state.activeLineupsByTeam[teamId];
}

export function applyEvent(current: GameState, event: GameEvent): GameState {
  if (event.sequence <= current.lastSequence) {
    return current;
  }

  const state: GameState = {
    ...current,
    currentPeriod: event.period,
    scoreByTeam: { ...current.scoreByTeam },
    possessionsByTeam: { ...current.possessionsByTeam },
    activeLineupsByTeam: Object.fromEntries(
      Object.entries(current.activeLineupsByTeam).map(([teamId, players]) => [teamId, [...players]])
    ),
    teamStats: cloneTeamStats(current.teamStats),
    playerStatsByTeam: clonePlayerStatsByTeam(current.playerStatsByTeam),
    playerFouls: { ...current.playerFouls },
    teamFoulsByPeriod: Object.fromEntries(
      Object.entries(current.teamFoulsByPeriod).map(([teamId, periods]) => [teamId, { ...periods }])
    ),
    bonusByTeam: { ...current.bonusByTeam },
    timeoutsByTeam: { ...current.timeoutsByTeam },
    activeMatchupsByTeam: Object.fromEntries(
      Object.entries(current.activeMatchupsByTeam ?? {}).map(([teamId, entries]) => [teamId, { ...entries }])
    ),
    events: [...current.events, event],
    lastSequence: event.sequence
  };

  const teamStats = ensureTeamState(state, event.teamId);

  switch (event.type) {
    case "shot_attempt": {
      // Field goals only (2pt and 3pt)
      const playerStats = ensurePlayerStats(state, event.teamId, event.playerId);
      teamStats.shooting.fgAttempts += 1;
      playerStats.fgAttempts += 1;
      if (event.points === 3) {
        teamStats.shooting.fgAttempts3 += 1;
      }
      if (event.made) {
        teamStats.shooting.fgMade += 1;
        teamStats.shooting.points += event.points;
        state.scoreByTeam[event.teamId] += event.points;
        playerStats.fgMade += 1;
        playerStats.points += event.points;
        if (event.points === 3) {
          teamStats.shooting.fgMade3 += 1;
        }
      }
      break;
    }
    case "free_throw_attempt": {
      // Each free throw is a separate event per NFHS rules
      const playerStats = ensurePlayerStats(state, event.teamId, event.playerId);
      teamStats.shooting.ftAttempts += 1;
      playerStats.ftAttempts += 1;
      if (event.made) {
        teamStats.shooting.ftMade += 1;
        teamStats.shooting.points += 1;
        state.scoreByTeam[event.teamId] += 1;
        playerStats.ftMade += 1;
        playerStats.points += 1;
      }
      break;
    }
    case "rebound": {
      const playerStats = ensurePlayerStats(state, event.teamId, event.playerId);
      if (event.offensive) {
        teamStats.reboundsOff += 1;
        playerStats.reboundsOff += 1;
      } else {
        teamStats.reboundsDef += 1;
        playerStats.reboundsDef += 1;
      }
      break;
    }
    case "turnover": {
      teamStats.turnovers += 1;
      if (event.playerId) {
        const playerStats = ensurePlayerStats(state, event.teamId, event.playerId);
        playerStats.turnovers += 1;
      }
      break;
    }
    case "foul": {
      const playerStats = ensurePlayerStats(state, event.teamId, event.playerId);
      teamStats.fouls += 1;
      playerStats.fouls += 1;
      state.playerFouls[event.playerId] = (state.playerFouls[event.playerId] ?? 0) + 1;

      // Track team fouls per period for NFHS bonus calculation
      const byPeriod = state.teamFoulsByPeriod[event.teamId] ?? {};
      byPeriod[event.period] = (byPeriod[event.period] ?? 0) + 1;
      state.teamFoulsByPeriod[event.teamId] = byPeriod;

      // Recompute bonus after every foul
      state.bonusByTeam = computeBonusByTeam(
        state.teamFoulsByPeriod,
        state.currentPeriod,
        state.homeTeamId,
        state.awayTeamId
      );
      break;
    }
    case "assist": {
      const playerStats = ensurePlayerStats(state, event.teamId, event.playerId);
      playerStats.assists += 1;
      break;
    }
    case "steal": {
      const playerStats = ensurePlayerStats(state, event.teamId, event.playerId);
      playerStats.steals += 1;
      break;
    }
    case "block": {
      const playerStats = ensurePlayerStats(state, event.teamId, event.playerId);
      playerStats.blocks += 1;
      break;
    }
    case "possession_start": {
      state.possessionsByTeam[event.possessedByTeamId] =
        (state.possessionsByTeam[event.possessedByTeamId] ?? 0) + 1;
      break;
    }
    case "substitution": {
      const activeLineup = ensureLineupState(state, event.teamId);
      const withoutOutgoing = activeLineup.filter((playerId) => playerId !== event.playerOutId);
      if (!withoutOutgoing.includes(event.playerInId)) {
        withoutOutgoing.push(event.playerInId);
      }
      state.activeLineupsByTeam[event.teamId] = withoutOutgoing;
      if (!state.activeMatchupsByTeam[event.teamId]) {
        state.activeMatchupsByTeam[event.teamId] = {};
      }
      // Outgoing defender no longer has an active on-court assignment.
      delete state.activeMatchupsByTeam[event.teamId][event.playerOutId];
      teamStats.substitutions += 1;
      break;
    }
    case "period_transition": {
      // Update tracked period; bonus recomputes based on new period context
      state.currentPeriod = event.newPeriod;
      state.bonusByTeam = computeBonusByTeam(
        state.teamFoulsByPeriod,
        state.currentPeriod,
        state.homeTeamId,
        state.awayTeamId
      );
      break;
    }
    case "timeout": {
      state.timeoutsByTeam[event.teamId] = (state.timeoutsByTeam[event.teamId] ?? 0) + 1;
      break;
    }
    case "matchup_assignment": {
      if (!state.activeMatchupsByTeam[event.teamId]) {
        state.activeMatchupsByTeam[event.teamId] = {};
      }
      state.activeMatchupsByTeam[event.teamId][event.defenderPlayerId] = event.offensivePlayerId;
      break;
    }
    default: {
      break;
    }
  }

  state.teamStats[event.teamId] = teamStats;

  return state;
}

export function replayEvents(initial: GameState, events: GameEvent[]): GameState {
  return events
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .reduce((state, event) => applyEvent(state, event), initial);
}

/** Returns true if the player has fouled out (5 personal fouls per NFHS rules) */
export function isPlayerFouledOut(state: GameState, playerId: string): boolean {
  return (state.playerFouls[playerId] ?? 0) >= FOUL_OUT_THRESHOLD;
}

/**
 * A contiguous stint where the same 5-man unit was on the floor together.
 * Segments are created for myTeam only; a new segment starts on every substitution.
 */
export interface LineupSegment {
  playerIds: string[];   // sorted player IDs in this unit
  lineupKey: string;     // playerIds.join('+')
  pointsFor: number;     // points scored by myTeam during this stint
  pointsAgainst: number; // points scored by opponent during this stint
  plusMinus: number;     // pointsFor - pointsAgainst
}

/** Aggregated stats per unique 5-man lineup unit across all their stints. */
export interface LineupUnitStats {
  lineupKey: string;
  playerIds: string[];
  pointsFor: number;
  pointsAgainst: number;
  plusMinus: number;
  segments: number; // number of stints this unit appeared in
}

/**
 * Splits events into lineup stints for myTeam and tallies +/- per stint.
 * @param events     All game events in any order.
 * @param myTeamId   The team whose lineup is being tracked.
 * @param opponentTeamId  The opposing team ID (for pointsAgainst).
 * @param startingLineup Player IDs on the floor at tip-off.
 */
export function computeLineupSegments(
  events: GameEvent[],
  myTeamId: string,
  opponentTeamId: string,
  startingLineup: string[] = []
): LineupSegment[] {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const segments: LineupSegment[] = [];
  let currentLineup = [...startingLineup];

  function makeKey(ids: string[]): string {
    return [...ids].sort().join('+');
  }

  let current: LineupSegment = {
    playerIds: [...currentLineup].sort(),
    lineupKey: makeKey(currentLineup),
    pointsFor: 0,
    pointsAgainst: 0,
    plusMinus: 0,
  };

  for (const event of sorted) {
    if (event.type === 'substitution' && event.teamId === myTeamId) {
      // Close the current stint and start a new one
      if (current.playerIds.length > 0) segments.push(current);
      currentLineup = currentLineup.filter(id => id !== event.playerOutId);
      if (!currentLineup.includes(event.playerInId)) currentLineup.push(event.playerInId);
      current = {
        playerIds: [...currentLineup].sort(),
        lineupKey: makeKey(currentLineup),
        pointsFor: 0,
        pointsAgainst: 0,
        plusMinus: 0,
      };
    } else if (
      (event.type === 'shot_attempt' && event.made) ||
      (event.type === 'free_throw_attempt' && event.made)
    ) {
      const pts = event.type === 'shot_attempt' ? event.points : 1;
      if (event.teamId === myTeamId) {
        current.pointsFor += pts;
      } else if (event.teamId === opponentTeamId) {
        current.pointsAgainst += pts;
      }
      current.plusMinus = current.pointsFor - current.pointsAgainst;
    }
  }

  // Push the final open stint
  segments.push(current);

  return segments.filter(s => s.playerIds.length > 0);
}

/**
 * Aggregates lineup segments into per-unit totals, sorted by +/- descending.
 */
export function aggregateLineupStats(segments: LineupSegment[]): LineupUnitStats[] {
  const map = new Map<string, LineupUnitStats>();
  for (const seg of segments) {
    const existing = map.get(seg.lineupKey);
    if (existing) {
      existing.pointsFor += seg.pointsFor;
      existing.pointsAgainst += seg.pointsAgainst;
      existing.plusMinus = existing.pointsFor - existing.pointsAgainst;
      existing.segments++;
    } else {
      map.set(seg.lineupKey, {
        lineupKey: seg.lineupKey,
        playerIds: seg.playerIds,
        pointsFor: seg.pointsFor,
        pointsAgainst: seg.pointsAgainst,
        plusMinus: seg.plusMinus,
        segments: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.plusMinus - a.plusMinus);
}


