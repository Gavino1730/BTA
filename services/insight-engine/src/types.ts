import type { GameState } from "@bta/game-state";
import type { GameEvent } from "@bta/shared-schema";

export type InsightType =
  | "ai_coaching"
  | "run_detection"
  | "foul_trouble"
  | "foul_warning"
  | "sub_suggestion"
  | "timeout_suggestion"
  | "turnover_pressure"
  | "shot_profile"
  | "hot_hand"
  | "team_foul_warning"
  | "ot_awareness"
  | "pre_game"
  | "scoring_drought"
  | "depth_warning"
  | "efficiency"
  | "leverage"
  | "three_point_streak"
  | "foul_to_give"
  | "opponent_hot_hand"
  | "cold_shooter"
  | "transition_momentum";

export interface LiveInsight {
  id: string;
  gameId: string;
  type: InsightType;
  /** Urgency tier: urgent = needs immediate action, important = act soon, info = situational awareness */
  priority: "urgent" | "important" | "info";
  createdAtIso: string;
  confidence: "high" | "medium";
  message: string;
  explanation: string;
  relatedTeamId?: string;
  relatedPlayerId?: string;
}

export interface InsightContext {
  state: GameState;
  latestEvent: GameEvent;
  /** Whether the operator has clock tracking enabled (undefined = unknown = treat as enabled) */
  clockEnabled?: boolean;
  /**
   * Optional roster player list so insights can display "#5 Marcus Johnson" instead of raw player IDs.
   * Pass the players for the home team (our team). Format: [{id, number, name}]
   */
  rosterPlayers?: Array<{ id: string; number?: string; name: string }>;
}
