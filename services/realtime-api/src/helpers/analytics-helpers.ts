// Barrel re-exporter — implementation split into sub-modules for file-size compliance.
// All public API is unchanged; consumers import from this file as before.

export {
  type AiSafetyMetadata,
  buildAiSafetyMetadata,
  roundStat,
  resolveGameResult,
  getRosterPlayerByIdForSchool,
  getOurTeamId,
  buildDefaultGamePlayerStats,
  buildGamesPayload,
} from "./analytics-core.js";

export {
  playerAnalysisCacheBySchool,
  buildPlayerAdvancedPayload,
  buildPlayerTrendsPayload,
  buildPlayerComparisonPayload,
  buildPlayerInsightsText,
  buildPlayerAnalysisPayload,
} from "./analytics-player.js";

export {
  seasonAnalysisBySchool,
  buildLeaderboardsPayload,
  buildTeamTrendsPayload,
  buildTeamAdvancedPayload,
  buildVolatilityPayload,
  buildTeamSummaryText,
  buildGameAnalysisText,
  buildComprehensiveInsightsPayload,
  buildSeasonAnalysisPayload,
} from "./analytics-season.js";