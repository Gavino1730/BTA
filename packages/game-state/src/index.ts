import type { GameEvent } from "@pivot/shared-schema";

export interface TeamShootingStats {
  attempts: number;
  made: number;
  points: number;
}

export interface TeamStats {
  reboundsOff: number;
  reboundsDef: number;
  turnovers: number;
  fouls: number;
  substitutions: number;
  shooting: TeamShootingStats;
}

export interface PlayerStats {
  playerId: string;
  teamId: string;
  points: number;
  shotAttempts: number;
  shotsMade: number;
  reboundsOff: number;
  reboundsDef: number;
  turnovers: number;
  fouls: number;
  assists: number;
  steals: number;
  blocks: number;
}

export interface GameState {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  scoreByTeam: Record<string, number>;
  possessionsByTeam: Record<string, number>;
  activeLineupsByTeam: Record<string, string[]>;
  teamStats: Record<string, TeamStats>;
  playerStatsByTeam: Record<string, Record<string, PlayerStats>>;
  playerFouls: Record<string, number>;
  events: GameEvent[];
  lastSequence: number;
}

const emptyTeamStats = (): TeamStats => ({
  reboundsOff: 0,
  reboundsDef: 0,
  turnovers: 0,
  fouls: 0,
  substitutions: 0,
  shooting: {
    attempts: 0,
    made: 0,
    points: 0
  }
});

function cloneTeamStats(teamStats: Record<string, TeamStats>): Record<string, TeamStats> {
  return Object.fromEntries(
    Object.entries(teamStats).map(([teamId, stats]) => [
      teamId,
      {
        ...stats,
        shooting: {
          ...stats.shooting
        }
      }
    ])
  );
}

function emptyPlayerStats(playerId: string, teamId: string): PlayerStats {
  return {
    playerId,
    teamId,
    points: 0,
    shotAttempts: 0,
    shotsMade: 0,
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
  awayTeamId: string
): GameState {
  return {
    gameId,
    homeTeamId,
    awayTeamId,
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
    events: [],
    lastSequence: 0
  };
}

function ensureTeamState(state: GameState, teamId: string): TeamStats {
  if (!state.teamStats[teamId]) {
    state.teamStats[teamId] = emptyTeamStats();
    state.scoreByTeam[teamId] = state.scoreByTeam[teamId] ?? 0;
    state.possessionsByTeam[teamId] = state.possessionsByTeam[teamId] ?? 0;
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
    scoreByTeam: { ...current.scoreByTeam },
    possessionsByTeam: { ...current.possessionsByTeam },
    activeLineupsByTeam: Object.fromEntries(
      Object.entries(current.activeLineupsByTeam).map(([teamId, players]) => [teamId, [...players]])
    ),
    teamStats: cloneTeamStats(current.teamStats),
    playerStatsByTeam: clonePlayerStatsByTeam(current.playerStatsByTeam),
    playerFouls: { ...current.playerFouls },
    events: [...current.events, event],
    lastSequence: event.sequence
  };

  const teamStats = ensureTeamState(state, event.teamId);

  switch (event.type) {
    case "shot_attempt": {
      const playerStats = ensurePlayerStats(state, event.teamId, event.playerId);
      teamStats.shooting.attempts += 1;
      playerStats.shotAttempts += 1;
      if (event.made) {
        teamStats.shooting.made += 1;
        teamStats.shooting.points += event.points;
        state.scoreByTeam[event.teamId] += event.points;
        playerStats.shotsMade += 1;
        playerStats.points += event.points;
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
      teamStats.substitutions += 1;
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
