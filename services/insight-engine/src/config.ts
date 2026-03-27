/**
 * Insight Engine Configuration
 * 
 * Centralized thresholds and constants used by the insight engine.
 * Modify these values to tune insight generation behavior.
 */

export const INSIGHT_CONFIG = {
  /**
   * Personal foul thresholds for players
   */
  FOUL_THRESHOLDS: {
    /** Number of fouls at which a player is disqualified */
    FOUL_OUT: 5,
    /** Number of fouls at which foul trouble (danger) alert is shown */
    FOUL_DANGER: 4,
    /** Number of fouls at which early warning is shown */
    FOUL_WARNING: 2
  },

  /**
   * Team foul thresholds for bonus
   */
  TEAM_FOUL_THRESHOLDS: {
    /** Number of team fouls to enter bonus territory */
    BONUS_ENTRY: 5,
    /** Number of team fouls to enter penalty (two free throws) */
    PENALTY_ENTRY: 10 // Typically not used in high school
  },

  /**
   * Possession estimates based on rebounds, turnovers, etc
   */
  POSSESSION_ESTIMATE: {
    /** Weight for floor (FGA + 0.44 * FTA - ORB + TO) calculation */
    FTA_WEIGHT: 0.44
  },

  /**
   * Insight confidence levels
   */
  CONFIDENCE_LEVELS: {
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low"
  }
} as const;

/**
 * Get foul-related thresholds for a specific level
 */
export function getFoulThreshold(level: "foul_out" | "foul_danger" | "foul_warning"): number {
  const key = level.toUpperCase() as keyof typeof INSIGHT_CONFIG.FOUL_THRESHOLDS;
  return INSIGHT_CONFIG.FOUL_THRESHOLDS[key];
}

/**
 * Determine foul severity level
 */
export function getOrFoulSeverity(foulCount: number): "fouled_out" | "foul_danger" | "foul_warning" | "normal" {
  if (foulCount >= INSIGHT_CONFIG.FOUL_THRESHOLDS.FOUL_OUT) {
    return "fouled_out";
  } else if (foulCount >= INSIGHT_CONFIG.FOUL_THRESHOLDS.FOUL_DANGER) {
    return "foul_danger";
  } else if (foulCount >= INSIGHT_CONFIG.FOUL_THRESHOLDS.FOUL_WARNING) {
    return "foul_warning";
  }
  return "normal";
}
