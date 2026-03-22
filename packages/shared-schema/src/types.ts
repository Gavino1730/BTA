export const EVENT_TYPES = [
  "shot_attempt",
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
  "period_start",
  "period_end"
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const SHOT_ZONES = [
  "rim",
  "paint",
  "midrange",
  "corner_three",
  "above_break_three",
  "free_throw"
] as const;

export type ShotZone = (typeof SHOT_ZONES)[number];

export const TURNOVER_TYPES = [
  "bad_pass",
  "travel",
  "double_dribble",
  "offensive_foul",
  "shot_clock",
  "lost_ball",
  "other"
] as const;

export type TurnoverType = (typeof TURNOVER_TYPES)[number];

export const FOUL_TYPES = [
  "shooting",
  "offensive",
  "blocking",
  "reaching",
  "technical",
  "loose_ball",
  "other"
] as const;

export type FoulType = (typeof FOUL_TYPES)[number];

export const TIMEOUT_TYPES = ["full", "short"] as const;

export type TimeoutType = (typeof TIMEOUT_TYPES)[number];

export interface GameEventBase {
  id: string;
  gameId: string;
  sequence: number;
  timestampIso: string;
  period: number;
  clockSecondsRemaining: number;
  teamId: string;
  operatorId: string;
  type: EventType;
}

export interface ShotAttemptEvent extends GameEventBase {
  type: "shot_attempt";
  playerId: string;
  made: boolean;
  points: 1 | 2 | 3;
  zone: ShotZone;
  assistedByPlayerId?: string;
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

export interface PeriodStartEvent extends GameEventBase {
  type: "period_start";
  period: number;
}

export interface PeriodEndEvent extends GameEventBase {
  type: "period_end";
  period: number;
}

export type GameEvent =
  | ShotAttemptEvent
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
  | PeriodStartEvent
  | PeriodEndEvent;
