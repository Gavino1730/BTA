// Oregon 4A / NFHS rules: period values are Q1, Q2, Q3, Q4, OT1, OT2, ...
export type Period = "Q1" | "Q2" | "Q3" | "Q4" | `OT${number}`;
export const REGULAR_PERIODS = ["Q1", "Q2", "Q3", "Q4"] as const;
export type RegularPeriod = (typeof REGULAR_PERIODS)[number];

export const EVENT_TYPES = [
  "shot_attempt",
  "free_throw_attempt",
  "rebound",
  "turnover",
  "foul",
  "assist",
  "steal",
  "block",
  "substitution",
  "possession_start",
  "possession_end",
  "timeout",
  "period_transition"
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// Shot zones (field goals only — free throws use free_throw_attempt)
export const SHOT_ZONES = [
  "rim",
  "paint",
  "midrange",
  "corner_three",
  "above_break_three"
] as const;

export type ShotZone = (typeof SHOT_ZONES)[number];

// NFHS turnover types
export const TURNOVER_TYPES = [
  "traveling",
  "bad_pass",
  "offensive_foul",
  "out_of_bounds",
  "double_dribble",
  "steal",
  "other"
] as const;

export type TurnoverType = (typeof TURNOVER_TYPES)[number];

// NFHS foul types
export const FOUL_TYPES = [
  "personal",
  "shooting",
  "offensive",
  "technical",
  "flagrant"
] as const;

export type FoulType = (typeof FOUL_TYPES)[number];

// Timeouts — manual tracking per NFHS (exact counts vary by level)
export const TIMEOUT_TYPES = ["full", "short"] as const;

export type TimeoutType = (typeof TIMEOUT_TYPES)[number];

export interface GameEventBase {
  id: string;
  schoolId: string;
  gameId: string;
  sequence: number;
  timestampIso: string;
  // Period: Q1, Q2, Q3, Q4 for regulation; OT1, OT2, ... for overtime
  period: string;
  clockSecondsRemaining: number;
  teamId: string;
  operatorId: string;
  type: EventType;
}

// Field goal attempts only (2pt or 3pt). Free throws use free_throw_attempt.
export interface ShotAttemptEvent extends GameEventBase {
  type: "shot_attempt";
  playerId: string;
  made: boolean;
  points: 2 | 3;
  zone: ShotZone;
  assistedByPlayerId?: string;
}

// Individual free throw attempt — each FT is a separate event per NFHS rules
export interface FreeThrowAttemptEvent extends GameEventBase {
  type: "free_throw_attempt";
  playerId: string;
  made: boolean;
  // Which attempt in the set, e.g. 1 of 2
  attemptNumber: number;
  // Total FTs awarded: 2 for bonus/shooting 2pt, 3 for shooting 3pt, 1 for and-one
  totalAttempts: number;
}

export interface ReboundEvent extends GameEventBase {
  type: "rebound";
  playerId: string;
  offensive: boolean;
}

export interface TurnoverEvent extends GameEventBase {
  type: "turnover";
  playerId?: string;
  turnoverType: TurnoverType;
  forcedByPlayerId?: string;
}

export interface FoulEvent extends GameEventBase {
  type: "foul";
  playerId: string;
  foulType: FoulType;
  onPlayerId?: string;
  // For shooting fouls: points value of the shot attempt (determines free throw count)
  shootingFoulPoints?: 2 | 3;
  // True if made basket + foul (and-one: 1 additional free throw)
  andOne?: boolean;
}

export interface AssistEvent extends GameEventBase {
  type: "assist";
  playerId: string;
  scorerPlayerId: string;
}

export interface StealEvent extends GameEventBase {
  type: "steal";
  playerId: string;
  againstPlayerId?: string;
}

export interface BlockEvent extends GameEventBase {
  type: "block";
  playerId: string;
  againstPlayerId?: string;
}

export interface SubstitutionEvent extends GameEventBase {
  type: "substitution";
  playerOutId: string;
  playerInId: string;
}

export interface PossessionStartEvent extends GameEventBase {
  type: "possession_start";
  possessedByTeamId: string;
}

export interface PossessionEndEvent extends GameEventBase {
  type: "possession_end";
  possessedByTeamId: string;
  result:
    | "made_basket"
    | "def_rebound"
    | "turnover"
    | "foul_shots"
    | "end_of_period";
}

export interface TimeoutEvent extends GameEventBase {
  type: "timeout";
  timeoutType: TimeoutType;
}

// Marks the start of a new period — used for team foul reset logic
export interface PeriodTransitionEvent extends GameEventBase {
  type: "period_transition";
  // The period that is beginning (Q1, Q2, Q3, Q4, OT1, OT2, ...)
  newPeriod: string;
}

export type GameEvent =
  | ShotAttemptEvent
  | FreeThrowAttemptEvent
  | ReboundEvent
  | TurnoverEvent
  | FoulEvent
  | AssistEvent
  | StealEvent
  | BlockEvent
  | SubstitutionEvent
  | PossessionStartEvent
  | PossessionEndEvent
  | TimeoutEvent
  | PeriodTransitionEvent;

// ─────────────────────────────────────────────────────────────────────────
// Roster & Team Management
// ─────────────────────────────────────────────────────────────────────────

export interface RosterPlayer {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;
  grade?: string;
  role?: string;
  notes?: string;
}

export interface RosterTeam {
  id: string;
  schoolId?: string;
  name: string;
  abbreviation: string;
  season?: string;
  teamColor?: string;
  coachStyle?: string;
  playingStyle?: string;
  teamContext?: string;
  customPrompt?: string;
  focusInsights?: Array<
    "timeouts"
    | "substitutions"
    | "foul_management"
    | "momentum"
    | "shot_selection"
    | "ball_security"
    | "hot_hand"
    | "defense"
  >;
  players: RosterPlayer[];
}

export interface RosterSyncEvent {
  type: "team:created" | "team:updated" | "team:deleted" | "player:added" | "player:updated" | "player:deleted";
  teamId: string;
  team?: RosterTeam;
  playerId?: string;
  player?: RosterPlayer;
  timestamp: string;
}
