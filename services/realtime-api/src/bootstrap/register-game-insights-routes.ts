import type { Express } from "express";
import type { Server } from "socket.io";
import {
  getBillingStateByScope,
  getRosterTeamsByScope,
  saveRosterTeams,
  getGameState,
  getActiveGameState,
  createGame,
  getSeasonTeamStats,
  getGameOverrideMap,
  setGameOverride,
  deleteGame,
  submitGame,
  resetAllData,
  getGameEvents,
  ingestEvent,
  deleteEvent,
  updateEvent,
  patchGameLineup,
  getLiveContext,
  getGameInsights,
  refreshGameAiInsights,
  getGameAiSettings,
  updateGameAiSettings,
  getGameAiContext,
  updateGameAiContext,
  getGameAiPromptPreview,
  answerGameAiChat,
  getSeasonGames,
} from "../store.js";
import {
  seasonAnalysisBySchool,
  playerAnalysisCacheBySchool,
  roundStat,
  resolveGameResult,
  buildGamesPayload,
  buildLeaderboardsPayload,
  buildTeamTrendsPayload,
  buildTeamAdvancedPayload,
  buildPlayerAdvancedPayload,
  buildPlayerTrendsPayload,
  buildPlayerComparisonPayload,
  buildVolatilityPayload,
  buildComprehensiveInsightsPayload,
  buildAiSafetyMetadata,
  buildTeamSummaryText,
  buildGameAnalysisText,
  buildPlayerInsightsText,
  buildSeasonAnalysisPayload,
  buildPlayerAnalysisPayload,
} from "../helpers/analytics-helpers.js";
import {
  sanitizeTextField,
  buildUniqueSchoolTeamId,
  normalizePersonName,
} from "../helpers/string-helpers.js";
import {
  schoolRoom,
  connectionRoom,
  resolveRequestSchoolId,
  getSchoolIdFromRequest,
} from "../helpers/tenant-helpers.js";
import { issueLocalAuthToken } from "../auth.js";
import { normalizeTeamColor, sanitizePromptText } from "@bta/shared-schema";
import { createBillingEntitlementMiddleware } from "../middleware/billing-entitlement.js";
import { logger } from "../logger.js";
import { registerGameManagementRoutes } from "../routes/game-management-routes.js";
import { registerLiveInsightsRoutes } from "../routes/live-insights-routes.js";
import { registerAdvancedInsightsRoutes } from "../routes/advanced-insights-routes.js";
import { registerAiCompatibilityRoutes } from "../routes/ai-compat-routes.js";
import { registerAdvancedLegacyRoutes } from "../routes/advanced-legacy-routes.js";
import { registerRosterConfigRoutes } from "../routes/roster-config-routes.js";
import { registerOperatorLinkRoutes } from "../routes/operator-link-routes.js";
import { registerTeamManagementRoutes } from "../routes/team-management-routes.js";
import { registerGameSessionRoutes } from "../routes/game-session-routes.js";
import { registerGameAiRoutes } from "../routes/game-ai-routes.js";
import { registerGameEventRoutes } from "../routes/game-event-routes.js";
import type { RegisterRoutesOptions } from "./register-routes.js";
import type { createGameBroadcastManager } from "../sockets/game-broadcast-manager.js";
import type { createOperatorPresenceManager } from "../sockets/operator-presence-manager.js";

export interface RegisterGameInsightsRoutesExtra {
  requireApiKey: RegisterRoutesOptions["requireApiKey"];
  requireWriteRole: RegisterRoutesOptions["requireWriteRole"];
  eventRateLimiter: RegisterRoutesOptions["eventRateLimiter"];
  BILLING_PAYWALL_ENABLED: boolean;
  emitToGameRooms: ReturnType<typeof createGameBroadcastManager>["emitToGameRooms"];
  broadcastGameStateWithDebounce: ReturnType<typeof createGameBroadcastManager>["broadcastGameStateWithDebounce"];
  refreshAndBroadcastInsights: (schoolId: string, gameId: string) => Promise<void>;
  normalizeConnectionKey: ReturnType<typeof createOperatorPresenceManager>["normalizeConnectionKey"];
  setOperatorLinkSetup: ReturnType<typeof createOperatorPresenceManager>["setOperatorLinkSetup"];
  getOperatorLinkSetup: ReturnType<typeof createOperatorPresenceManager>["getOperatorLinkSetup"];
  getLatestOperatorLinkSetup: ReturnType<typeof createOperatorPresenceManager>["getLatestOperatorLinkSetup"];
  listSchoolIdsForConnection: ReturnType<typeof createOperatorPresenceManager>["listSchoolIdsForConnection"];
}

export function registerGameAndInsightsRoutes(
  app: Express,
  io: Server,
  _opts: RegisterRoutesOptions,
  extra: RegisterGameInsightsRoutesExtra,
): void {
  const {
    requireApiKey, requireWriteRole, eventRateLimiter,
    BILLING_PAYWALL_ENABLED,
    emitToGameRooms, broadcastGameStateWithDebounce, refreshAndBroadcastInsights,
    normalizeConnectionKey, setOperatorLinkSetup, getOperatorLinkSetup, getLatestOperatorLinkSetup,
    listSchoolIdsForConnection,
  } = extra;

  const { requireActiveBillingEntitlement } = createBillingEntitlementMiddleware({
    paywallEnabled: BILLING_PAYWALL_ENABLED,
    getSchoolIdFromRequest,
    buildBillingEntitlement: (schoolId: string) => {
      const state = getBillingStateByScope({ schoolId });
      if (!BILLING_PAYWALL_ENABLED) {
        return { accessActive: true, status: "active", reason: "billing_disabled" };
      }
      if (!state) {
        return { accessActive: false, status: "incomplete", reason: "inactive_subscription" };
      }
      if (state.status === "active" || state.status === "trialing") {
        return { accessActive: true, status: state.status, reason: "subscription_active" };
      }
      return { accessActive: false, status: state.status || "incomplete", reason: "inactive_subscription" };
    },
    loggerWarn: (message, context) => logger.warn(message, context),
  });

  app.use("/api/season-stats", requireActiveBillingEntitlement);
  app.use("/api/season-analysis", requireActiveBillingEntitlement);
  app.use("/api/notifications", requireActiveBillingEntitlement);
  app.use("/api/live-context", requireActiveBillingEntitlement);
  app.use("/api/leaderboards", requireActiveBillingEntitlement);
  app.use("/api/team-trends", requireActiveBillingEntitlement);
  app.use("/api/player-trends", requireActiveBillingEntitlement);
  app.use("/api/player-comparison", requireActiveBillingEntitlement);
  app.use("/api/advanced", requireActiveBillingEntitlement);
  app.use("/api/comprehensive-insights", requireActiveBillingEntitlement);
  app.use("/api/ai", requireActiveBillingEntitlement);

  registerGameManagementRoutes(app, {
    requireApiKey, requireWriteRole, getSchoolIdFromRequest, getRosterTeamsByScope,
    getGameState, getSeasonTeamStats, buildGamesPayload, getGameOverrideMap,
    sanitizeTextField, resolveGameResult, setGameOverride, deleteGame,
    emitToGameRooms, submitGame, resetAllData,
  });

  registerLiveInsightsRoutes(app, {
    getSchoolIdFromRequest, getLiveContext, buildLeaderboardsPayload,
    buildTeamTrendsPayload, normalizePersonName, buildPlayerTrendsPayload,
    buildPlayerComparisonPayload,
  });

  registerAdvancedInsightsRoutes(app, {
    getSchoolIdFromRequest, buildTeamAdvancedPayload, buildPlayerAdvancedPayload,
    buildVolatilityPayload, buildComprehensiveInsightsPayload,
  });

  registerAiCompatibilityRoutes(app, {
    requireApiKey, getSchoolIdFromRequest, sanitizeTextField,
    buildAiSafetyMetadata, getSeasonGames, answerGameAiChat,
    buildTeamSummaryText, buildPlayerInsightsText, buildGameAnalysisText,
    buildSeasonAnalysisPayload, seasonAnalysisBySchool, playerAnalysisCacheBySchool,
    buildPlayerAnalysisPayload,
  });

  registerAdvancedLegacyRoutes(app, {
    getSchoolIdFromRequest, buildGamesPayload, roundStat,
    buildComprehensiveInsightsPayload, buildTeamAdvancedPayload, buildVolatilityPayload,
  });

  registerRosterConfigRoutes(app, {
    requireApiKey, requireWriteRole, getSchoolIdFromRequest, getRosterTeamsByScope,
    saveRosterTeams,
    emitRosterTeams: (schoolId, teams) => { io.to(schoolRoom(schoolId)).emit("roster:teams", teams); },
  });

  registerOperatorLinkRoutes(app, {
    requireApiKey, requireWriteRole, getSchoolIdFromRequest, normalizeConnectionKey,
    resolveRequestSchoolId, listSchoolIdsForConnection, getOperatorLinkSetup,
    setOperatorLinkSetup, issueLocalAuthToken, getRosterTeamsByScope, sanitizeTextField,
    normalizeTeamColor,
    emitOperatorLinkUpdated: (schoolId, connectionId, response) => {
      io.to(connectionRoom(schoolId, connectionId)).emit("operator:link:updated", response);
    },
  });

  registerTeamManagementRoutes(app, {
    requireApiKey, requireWriteRole, getSchoolIdFromRequest, getRosterTeamsByScope,
    saveRosterTeams, sanitizeTextField, normalizeTeamColor, buildUniqueSchoolTeamId,
    emitRosterTeams: (schoolId, teams) => { io.to(schoolRoom(schoolId)).emit("roster:teams", teams); },
    emitTeamCreated: (schoolId, team) => { io.to(schoolRoom(schoolId)).emit("team:created", { team }); },
    emitTeamUpdated: (schoolId, team) => { io.to(schoolRoom(schoolId)).emit("team:updated", { team }); },
    emitTeamDeleted: (schoolId, teamId) => { io.to(schoolRoom(schoolId)).emit("team:deleted", { teamId }); },
    emitPlayerAdded: (schoolId, teamId, player) => { io.to(schoolRoom(schoolId)).emit("player:added", { teamId, player }); },
    emitPlayerUpdated: (schoolId, teamId, player) => { io.to(schoolRoom(schoolId)).emit("player:updated", { teamId, player }); },
    emitPlayerDeleted: (schoolId, teamId, playerId) => { io.to(schoolRoom(schoolId)).emit("player:deleted", { teamId, playerId }); },
  });

  registerGameSessionRoutes(app, {
    requireApiKey, requireWriteRole, getSchoolIdFromRequest, getRosterTeamsByScope,
    getGameState, getActiveGameState, createGame, emitToGameRooms,
    getLatestOperatorLinkSetup, patchGameLineup,
  });

  registerGameAiRoutes(app, {
    requireApiKey, requireWriteRole, getSchoolIdFromRequest, getGameState,
    refreshGameAiInsights, getGameInsights, getGameAiSettings, updateGameAiSettings,
    emitGameInsights: (schoolId, gameId, insights) => { emitToGameRooms(schoolId, gameId, "game:insights", insights); },
    getGameAiContext, updateGameAiContext, getGameAiPromptPreview, sanitizePromptText, answerGameAiChat,
  });

  registerGameEventRoutes(app, {
    requireApiKey, requireWriteRole, eventRateLimiter, getSchoolIdFromRequest,
    getRosterTeamsByScope, getGameState, getGameEvents, ingestEvent, emitToGameRooms,
    broadcastGameStateWithDebounce, refreshAndBroadcastInsights, deleteEvent, updateEvent,
  });
}
