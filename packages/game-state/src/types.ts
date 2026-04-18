import type { GameEvent } from "@bta/shared-schema";

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
  events: GameEvent[];
  lastSequence: number;
  /** Starting lineup by team for lineup-unit tracking. Preserved across event applications. */
  startingLineupByTeam?: Record<string, string[]>;
}
