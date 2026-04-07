import type { FoulType, GameEvent, ShotZone, TurnoverType } from "@bta/shared-schema";

// ─── Stat tracking ──────────────────────────────────────────────────────
export const OPPONENT_TRACK_STAT_OPTIONS = [
  "points",
  "free_throws",
  "def_reb",
  "off_reb",
  "turnover",
  "steal",
  "assist",
  "block",
  "foul",
] as const;
export type OpponentTrackStat = (typeof OPPONENT_TRACK_STAT_OPTIONS)[number];
export const DEFAULT_OPPONENT_TRACK_STATS: OpponentTrackStat[] = [...OPPONENT_TRACK_STAT_OPTIONS];

// ─── Shot / foul / turnover option arrays ───────────────────────────────
export const TWO_POINT_ZONES = ["rim", "paint", "midrange"] as const;
export const THREE_POINT_ZONES = ["corner_three", "above_break_three"] as const;
export const FOUL_TYPE_OPTIONS: readonly FoulType[] = ["personal", "shooting", "offensive", "technical", "flagrant"] as const;
export const TURNOVER_TYPE_OPTIONS: readonly TurnoverType[] = ["bad_pass", "traveling", "double_dribble", "out_of_bounds", "offensive_foul", "steal", "other"] as const;

export const TEAM_COLOR_OPTIONS = [
  "#4f8cff",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
] as const;

// ─── Side / navigation ──────────────────────────────────────────────────
export type TeamSide = "home" | "away";
export type SettingsView = "menu" | "game-setup" | "ipad-tips";
export type FeedbackTone = "event" | "undo" | "warning";
export type NoticeTone = "info" | "success" | "warning" | "error";

// ─── Data model ─────────────────────────────────────────────────────────
export interface Player {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;
  grade?: string;
}

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  teamColor?: string;
  players: Player[];
}

export interface GameSetup {
  gameId: string;
  connectionId?: string;
  syncedConnectionId?: string;
  myTeamId: string;
  apiUrl: string;
  apiKey?: string;
  schoolId?: string;
  opponent: string;
  vcSide: "home" | "away";
  dashboardUrl: string;
  clockVisible?: boolean;
  clockEnabled?: boolean;
  trackClock?: boolean;
  trackPossession?: boolean;
  trackTimeouts?: boolean;
  opponentTrackStats?: OpponentTrackStat[];
  homeTeamColor?: string;
  awayTeamColor?: string;
  statsGameId?: number;
  startingLineup?: string[];
  /** @deprecated use myTeamId + vcSide instead */
  homeTeamId?: string;
  /** @deprecated use myTeamId + vcSide instead */
  awayTeamId?: string;
}

export interface AppData {
  teams: Team[];
  gameSetup: GameSetup;
}

export interface OperatorLinkResponse {
  connectionId: string;
  operatorToken?: string;
  setup?: {
    gameId?: string;
    myTeamId?: string;
    myTeamName?: string;
    opponentName?: string;
    vcSide?: "home" | "away";
    homeTeamColor?: string;
    awayTeamColor?: string;
    dashboardUrl?: string;
    startingLineup?: string[];
    updatedAtIso?: string;
  } | null;
  teams?: import("@bta/shared-schema").RosterTeam[];
}

// ─── Player / event stats ───────────────────────────────────────────────
export interface RunningTotals {
  points: number; fgm: number; fga: number; threePm: number; threePa: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; ast: number; stl: number; blk: number; to: number; fouls: number;
}

export interface DashboardPlayerStat {
  number: number; name: string;
  height?: string; grade?: string;
  fg_made: number; fg_att: number; fg_pct: string;
  fg3_made: number; fg3_att: number; fg3_pct: string;
  ft_made: number; ft_att: number; ft_pct: string;
  oreb: number; dreb: number; fouls: number;
  stl: number; to: number; blk: number; asst: number;
  pts: number; plus_minus: number;
}

export interface SharedLiveInsight {
  id: string;
  type: string;
  message: string;
  explanation: string;
  confidence: "low" | "medium" | "high";
  relatedTeamId?: string;
  relatedPlayerId?: string;
}

// ─── UI model types ─────────────────────────────────────────────────────
export interface EventEditContext {
  eventId: string;
  originalEvent: GameEvent;
  pending: boolean;
}

export interface FeedEventSelection {
  event: GameEvent;
  pending: boolean;
}

export interface InlineNotice {
  id: number;
  tone: NoticeTone;
  message: string;
}

export interface OperatorAlert {
  id: string;
  type: string;
  priority: "urgent" | "important" | "info";
  message: string;
  explanation: string;
}

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "default" | "danger";
  resolve: (value: boolean) => void;
}

// ─── Modal types ────────────────────────────────────────────────────────
export type Modal =
  | { kind: "shot"; teamId: TeamSide; points: 2 | 3; made: boolean; zone: ShotZone; editContext?: EventEditContext }
  | { kind: "freeThrow"; teamId: TeamSide; made: boolean; editContext?: EventEditContext }
  | {
      kind: "stat";
      stat: "def_reb" | "off_reb" | "turnover" | "steal" | "assist" | "block" | "foul";
      teamId: TeamSide;
      foulType?: FoulType;
      turnoverType?: TurnoverType;
      editContext?: EventEditContext;
    }
  | { kind: "assist2"; teamId: TeamSide; assistPlayerId: string }
  | { kind: "assist3"; teamId: TeamSide; assistPlayerId: string; scorerPlayerId: string }
  | { kind: "sub1"; teamId: TeamSide; playerOutId?: string; playerInId?: string; editContext?: EventEditContext }
  | { kind: "sub2"; teamId: TeamSide; playerOutId: string; editContext?: EventEditContext }
  | { kind: "assistEdit"; teamId: TeamSide; assistPlayerId: string; scorerPlayerId: string; editContext: EventEditContext }
  | { kind: "timeoutEdit"; teamId: TeamSide; timeoutType: "full" | "short"; editContext: EventEditContext }
  | { kind: "possessionEdit"; teamId: TeamSide; editContext: EventEditContext }
  | { kind: "periodTransitionEdit"; newPeriod: string; editContext: EventEditContext }
  | { kind: "chain-assist"; teamId: TeamSide; scorerPlayerId: string };

export type ChainPrompt =
  | { kind: "after-made-shot"; forTeam: TeamSide; points: 2 | 3; scorerPlayerId: string }
  | { kind: "after-missed-shot"; forTeam: TeamSide }
  | { kind: "after-turnover"; fromTeam: TeamSide }
  | { kind: "after-ft-miss"; forTeam: TeamSide };
