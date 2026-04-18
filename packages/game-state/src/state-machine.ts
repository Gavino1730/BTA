import type { GameEvent } from "@bta/shared-schema";
import { isOvertimePeriod } from "@bta/shared-schema";
import {
  FOUL_OUT_THRESHOLD,
  BONUS_FOUL_THRESHOLD,
  type TeamStats,
  type PlayerStats,
  type GameState,
} from "./types.js";

// ---------------------------------------------------------------------------
// Internal factory helpers
// ---------------------------------------------------------------------------

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
    [homeTeamId]: awayFouls >= BONUS_FOUL_THRESHOLD,
    [awayTeamId]: homeFouls >= BONUS_FOUL_THRESHOLD,
  };
}

// ---------------------------------------------------------------------------
// Internal state-ensure helpers
// ---------------------------------------------------------------------------

function ensureTeamState(state: GameState, teamId: string): TeamStats {
  if (!state.teamStats[teamId]) {
    state.teamStats[teamId] = emptyTeamStats();
    state.scoreByTeam[teamId] = state.scoreByTeam[teamId] ?? 0;
    state.possessionsByTeam[teamId] = state.possessionsByTeam[teamId] ?? 0;
    state.teamFoulsByPeriod[teamId] = state.teamFoulsByPeriod[teamId] ?? {};
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
    events: [],
    lastSequence: 0
  };
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
    events: [...current.events, event],
    lastSequence: event.sequence
  };

  const teamStats = ensureTeamState(state, event.teamId);

  switch (event.type) {
    case "shot_attempt": {
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

      const byPeriod = state.teamFoulsByPeriod[event.teamId] ?? {};
      byPeriod[event.period] = (byPeriod[event.period] ?? 0) + 1;
      state.teamFoulsByPeriod[event.teamId] = byPeriod;

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
      if (activeLineup.length === 0) {
        const teamPlayerStats = Object.values(state.playerStatsByTeam[event.teamId] ?? {});
        const byActivity = teamPlayerStats
          .sort((a, b) => {
            const sa = a.points + a.fgAttempts + a.ftAttempts + a.reboundsOff + a.reboundsDef + a.assists + a.steals + a.blocks + a.turnovers + a.fouls;
            const sb = b.points + b.fgAttempts + b.ftAttempts + b.reboundsOff + b.reboundsDef + b.assists + b.steals + b.blocks + b.turnovers + b.fouls;
            return sb - sa;
          })
          .map(p => p.playerId);
        const seed = [event.playerOutId, ...byActivity.filter(id => id !== event.playerOutId && id !== event.playerInId)];
        for (const pid of seed.slice(0, 5)) {
          activeLineup.push(pid);
        }
      }
      const withoutOutgoing = activeLineup.filter((playerId) => playerId !== event.playerOutId);
      if (!withoutOutgoing.includes(event.playerInId)) {
        withoutOutgoing.push(event.playerInId);
      }
      state.activeLineupsByTeam[event.teamId] = withoutOutgoing;
      teamStats.substitutions += 1;
      break;
    }
    case "period_transition": {
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
