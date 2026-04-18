// Re-export all public API from sub-modules
export {
  FOUL_OUT_THRESHOLD,
  BONUS_FOUL_THRESHOLD,
  type TeamShootingStats,
  type TeamStats,
  type PlayerStats,
  type GameState,
} from "./types.js";

export {
  createInitialGameState,
  applyEvent,
  replayEvents,
  isPlayerFouledOut,
} from "./state-machine.js";

export {
  type LineupSegment,
  type LineupUnitStats,
  computeLineupSegments,
  aggregateLineupStats,
} from "./lineup.js";