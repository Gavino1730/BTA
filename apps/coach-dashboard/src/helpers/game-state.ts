import type { PlayerStats, TeamStats } from "@bta/game-state";
import type { GameEvent, Period } from "@bta/shared-schema";

export interface GameState {
  gameId: string;
  opponentName?: string;
  opponentTeamId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  currentPeriod: Period;
  scoreByTeam: Record<string, number>;
  bonusByTeam: Record<string, boolean>;
  possessionsByTeam: Record<string, number>;
  activeLineupsByTeam: Record<string, string[]>;
  teamStats: Record<string, TeamStats>;
  playerStatsByTeam: Record<string, Record<string, PlayerStats>>;
  timeoutsByTeam: Record<string, number>;
  teamFoulsByPeriod: Record<string, Record<string, number>>;
  events: GameEvent[];
  startingLineupByTeam?: Record<string, string[]>;
}

export interface BoxScoreTeamTotals {
  points: number;
  fgMade: number;
  fgAttempts: number;
  ftMade: number;
  ftAttempts: number;
  reboundsOff: number;
  reboundsDef: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
}

export interface BoxScorePlayerLine extends BoxScoreTeamTotals {
  playerId: string;
  teamId: string;
}

export type BoxScoreFilter = string[];

export function emptyTeamStats(): TeamStats {
  return {
    shooting: {
      fgAttempts: 0,
      fgMade: 0,
      fgAttempts3: 0,
      fgMade3: 0,
      ftAttempts: 0,
      ftMade: 0,
      points: 0,
    },
    turnovers: 0,
    fouls: 0,
    reboundsOff: 0,
    reboundsDef: 0,
    substitutions: 0,
  };
}

export function mergeTeamStats(target: TeamStats, source?: TeamStats): TeamStats {
  if (!source) {
    return target;
  }

  target.shooting.fgAttempts += source.shooting.fgAttempts;
  target.shooting.fgMade += source.shooting.fgMade;
  target.shooting.fgAttempts3 += source.shooting.fgAttempts3;
  target.shooting.fgMade3 += source.shooting.fgMade3;
  target.shooting.ftAttempts += source.shooting.ftAttempts;
  target.shooting.ftMade += source.shooting.ftMade;
  target.shooting.points += source.shooting.points;
  target.turnovers += source.turnovers;
  target.fouls += source.fouls;
  target.reboundsOff += source.reboundsOff;
  target.reboundsDef += source.reboundsDef;
  target.substitutions += source.substitutions;

  return target;
}

export function mergePlayerStats(
  target: Record<string, PlayerStats>,
  source?: Record<string, PlayerStats>
): Record<string, PlayerStats> {
  if (!source) {
    return target;
  }

  for (const player of Object.values(source)) {
    const existing = target[player.playerId] ?? {
      ...player,
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
      blocks: 0,
    };

    existing.teamId = player.teamId;
    existing.points += player.points;
    existing.fgAttempts += player.fgAttempts;
    existing.fgMade += player.fgMade;
    existing.ftAttempts += player.ftAttempts;
    existing.ftMade += player.ftMade;
    existing.reboundsOff += player.reboundsOff;
    existing.reboundsDef += player.reboundsDef;
    existing.turnovers += player.turnovers;
    existing.fouls += player.fouls;
    existing.assists += player.assists;
    existing.steals += player.steals;
    existing.blocks += player.blocks;

    target[player.playerId] = existing;
  }

  return target;
}

export function mergeByTeamKeys<T>(
  previous: Record<string, T> | undefined,
  incoming: Record<string, T> | undefined
): Record<string, T> {
  return {
    ...(previous ?? {}),
    ...(incoming ?? {}),
  };
}

export function mergeLineupsByTeam(
  previous: Record<string, string[]> | undefined,
  incoming: Record<string, string[]> | undefined
): Record<string, string[]> {
  const merged: Record<string, string[]> = mergeByTeamKeys(previous, incoming);
  for (const teamId of Object.keys(merged)) {
    merged[teamId] = [...new Set(merged[teamId] ?? [])].filter(Boolean);
  }
  return merged;
}

export function mergeGameState(previous: GameState | null, incoming: GameState): GameState {
  if (!previous || previous.gameId !== incoming.gameId) {
    return incoming;
  }

  return {
    ...previous,
    ...incoming,
    scoreByTeam: mergeByTeamKeys(previous.scoreByTeam, incoming.scoreByTeam),
    bonusByTeam: mergeByTeamKeys(previous.bonusByTeam, incoming.bonusByTeam),
    possessionsByTeam: mergeByTeamKeys(previous.possessionsByTeam, incoming.possessionsByTeam),
    activeLineupsByTeam: mergeLineupsByTeam(previous.activeLineupsByTeam, incoming.activeLineupsByTeam),
    teamStats: mergeByTeamKeys(previous.teamStats, incoming.teamStats),
    playerStatsByTeam: mergeByTeamKeys(previous.playerStatsByTeam, incoming.playerStatsByTeam),
  };
}

export function emptyBoxScoreTotals(): BoxScoreTeamTotals {
  return {
    points: 0,
    fgMade: 0,
    fgAttempts: 0,
    ftMade: 0,
    ftAttempts: 0,
    reboundsOff: 0,
    reboundsDef: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0,
  };
}
