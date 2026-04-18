import { randomBytes } from "node:crypto";
import type { Express, RequestHandler, Request } from "express";
import type { Server } from "socket.io";
import {
  answerGameAiChat,
  createGame,
  deleteGame,
  deleteEvent,
  getActiveGameState,
  getGameAiContext,
  getGameAiPromptPreview,
  getGameAiSettings,
  getGameEvents,
  getGameInsights,
  getGameOverrideMap,
  getGameState,
  getLiveContext,
  getRosterPlayers,
  getRosterTeamsByScope,
  getSeasonGames,
  getSeasonPlayers,
  getSeasonTeamStats,
  getSchoolRecord,
  getTeamById,
  getUserWorkspaceProfile,
  getActivityEventsByScope,
  getLiveGameSessionsByScope,
  getLocalAuthAccountByEmail,
  getLocalAuthAccountsByEmailAcrossSchools,
  getLocalAuthAccountsByScope,
  getOnboardingAccountStateByScope,
  getOperatorSessionByLiveSession,
  getOrganizationMembersByScope,
  getOrganizationProfileByScope,
  ingestEvent,
  isGameSubmitted,
  createLiveGameSessionRecord,
  getLiveGameSessionById,
  deleteOrganizationMember,
  deleteSchoolMembership,
  deleteTeamMembership,
  getSchoolMembershipsByScope,
  getTeamMembershipsByScope,
  listSchoolMembershipsForUser,
  listTeamMembershipsForUser,
  patchGameLineup,
  recordLocalAuthLogin,
  refreshGameAiInsights,
  resetAllData,
  saveActivityEvent,
  saveLocalAuthAccount,
  saveOperatorSessionRecord,
  saveOrganizationProfile,
  saveSchoolMembership,
  saveSchoolRecord,
  saveTeamMembership,
  saveUserWorkspaceProfile,
  setGameOverride,
  submitGame,
  updateEvent,
  updateGameAiContext,
  updateGameAiSettings,
  getBillingStateByScope,
  saveBillingState,
  findBillingStateByStripeCustomerId,
  findBillingStateByStripeSubscriptionId,
  hasProcessedStripeWebhookEvent,
  markProcessedStripeWebhookEvent,
  trimProcessedStripeWebhookEvents,
  saveOrganizationMember,
  saveRosterTeams,
  saveOnboardingAccountState,
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
  TEAM_AI_FOCUS_OPTIONS,
  normalizePersonName,
  normalizeNameKey,
  buildOrganizationSlug,
  buildTeamAbbreviation,
  buildSchoolTeamId,
  buildUniqueSchoolTeamId,
  sanitizeTextField,
  isValidEmail,
  shouldSyncPrimaryCoachIdentity,
  defaultTeamAiSettings,
  hashPassword,
  verifyPassword,
  extractTeamAiSettings,
  buildPlayerId,
  buildRosterPlayer,
  findPlayerRecord,
  buildOrganizationProfilePayload,
  buildOnboardingAccountPayload,
  requireOnboardingIdentity,
} from "../helpers/string-helpers.js";
import {
  type ScopedRequest,
  schoolRoom,
  gameRoom,
  deviceRoom,
  connectionRoom,
  resolveRequestSchoolId,
  getSchoolIdFromRequest,
  getSchoolIdFromSocket,
  resolveAuthSchoolId,
  allocateBootstrapSchoolId,
  buildBootstrapSchoolSeed,
} from "../helpers/tenant-helpers.js";
import {
  securityTelemetry,
  renderPrometheusSecurityMetrics,
} from "../helpers/metrics-helpers.js";
import { isJwtAuthEnabled, issueLocalAuthToken, type AuthContext } from "../auth.js";
import { hasWriteRole, normalizeSchoolId } from "../tenant-guards.js";
import { normalizeTeamColor, sanitizePromptText } from "@bta/shared-schema";
import { createBillingEntitlementMiddleware } from "../middleware/billing-entitlement.js";
import { logger } from "../logger.js";
import { registerAuthCoreRoutes } from "../routes/auth-core-routes.js";
import { registerAuthAccountRoutes } from "../routes/auth-account-routes.js";
import { registerWorkspaceRoutes } from "../routes/workspace-routes.js";
import { registerOnboardingRoutes } from "../routes/onboarding-routes.js";
import { registerOrgMembersRoutes } from "../routes/org-members-routes.js";
import { registerTeamConfigRoutes } from "../routes/team-config-routes.js";
import { registerPlayerRoutes } from "../routes/player-routes.js";
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
import { registerBillingRoutes } from "../routes/billing-routes.js";
import { registerAdminRoutes } from "../routes/system-routes.js";
import { registerRealtimeConnectionHandlers } from "../sockets/realtime-connection.js";
import type { createAuthSessionBootstrap } from "./auth-session.js";
import type { createOperatorPresenceManager } from "../sockets/operator-presence-manager.js";
import type { createGameBroadcastManager } from "../sockets/game-broadcast-manager.js";
import type { createTenantCompositionHelpers } from "./tenant-composition.js";
import type { EmailDeliveryResult } from "../email.js";

type AuthSessionBootstrap = ReturnType<typeof createAuthSessionBootstrap>;
type OperatorPresenceManager = ReturnType<typeof createOperatorPresenceManager>;
type GameBroadcastManager = ReturnType<typeof createGameBroadcastManager>;
type TenantCompositionHelpers = ReturnType<typeof createTenantCompositionHelpers>;

export type RegisterRoutesOptions = AuthSessionBootstrap
  & OperatorPresenceManager
  & GameBroadcastManager
  & TenantCompositionHelpers
  & {
    requireApiKey: RequestHandler;
    requireWriteRole: RequestHandler;
    authRateLimiter: RequestHandler;
    eventRateLimiter: RequestHandler;
    getAuthUserFromContext: (authContext: AuthContext | undefined) => { userId?: string; email?: string; fullName?: string };
    issueWorkspaceInvitation: (req: Request, input: {
      schoolId: string;
      membershipId: string;
      email: string;
      fullName: string;
      roleLabel: string;
    }) => Promise<{
      inviteToken?: string;
      invitePath: string;
      emailDelivery: EmailDeliveryResult;
      warning?: string;
    }>;
    resolveCoachRedirectOrigin: (req: Request) => string;
    API_KEY: string | undefined;
    WRITE_API_KEY: string | undefined;
    JWT_WRITE_REQUIRED: boolean;
    BILLING_PAYWALL_ENABLED: boolean;
    BILLING_STRIPE_TEST_MODE: boolean;
    BILLING_STRIPE_SECRET_KEY: string | undefined;
    BILLING_STRIPE_WEBHOOK_SECRET: string | undefined;
    BILLING_STRIPE_PRICE_ID_MONTHLY: string | undefined;
    BILLING_STRIPE_PRICE_ID_YEARLY: string | undefined;
    EXPOSE_PASSWORD_RESET_TOKEN: boolean;
    ENABLE_LEGACY_LOCAL_AUTH: boolean;
  };

export function registerAllRoutes(
  app: Express,
  io: Server,
  opts: RegisterRoutesOptions,
): void {
  const {
    requireApiKey,
    requireWriteRole,
    authRateLimiter,
    eventRateLimiter,
    getAuthUserFromContext,
    issueWorkspaceInvitation,
    resolveCoachRedirectOrigin,
    API_KEY,
    WRITE_API_KEY,
    JWT_WRITE_REQUIRED,
    BILLING_PAYWALL_ENABLED,
    BILLING_STRIPE_TEST_MODE,
    BILLING_STRIPE_SECRET_KEY,
    BILLING_STRIPE_WEBHOOK_SECRET,
    BILLING_STRIPE_PRICE_ID_MONTHLY,
    BILLING_STRIPE_PRICE_ID_YEARLY,
    EXPOSE_PASSWORD_RESET_TOKEN,
    ENABLE_LEGACY_LOCAL_AUTH,
    // auth session bootstrap
    passwordResetTokens,
    invitationTokens,
    passwordResetTokenTtlMs,
    buildResetPath,
    buildInvitePath,
    pruneExpiredPasswordResetTokens,
    pruneExpiredInvitationTokens,
    deliverPasswordResetEmail,
    issueMemberInvitation,
    // operator presence manager
    operatorPresenceBySocketId,
    operatorPresenceByDeviceId,
    normalizeConnectionKey,
    listSchoolIdsForConnection,
    getOperatorsByConnectionId,
    refreshOperatorConnectionIndex,
    buildConnectionPresencePayload,
    getOperatorLinkSetup,
    setOperatorLinkSetup,
    getLatestOperatorLinkSetup,
    clearOperatorLinksForSchool,
    emitPresenceForDevice,
    emitPresenceForConnection,
    // game broadcast manager
    emitToGameRooms,
    broadcastGameStateWithDebounce,
    // tenant composition helpers
    getPrimaryTeam,
    persistSchoolTeams,
    upsertPrimaryTeam,
    buildOnboardingProfileView,
    buildOnboardingCompletionSummary,
    buildAuthSessionResponse,
    buildSuggestedCoachIdentity,
    resolveCurrentOrganizationMember,
    ensureAuthenticatedOrganizationMember,
    ensureOwnerMembership,
    requireOrganizationManager,
    normalizeMemberRole,
    withSuggestedOnboardingIdentity,
    activateKnownMemberForAccount,
  } = opts;

  async function refreshAndBroadcastInsights(schoolId: string, gameId: string): Promise<void> {
    const insights = await refreshGameAiInsights(gameId, undefined, { schoolId });
    if (insights) {
      emitToGameRooms(schoolId, gameId, "game:insights", insights);
    }
  }

  registerAuthCoreRoutes(app, {
    authRateLimiter,
    resolveRequestSchoolId,
    getSchoolIdFromRequest,
    getAuthContextFromRequest: (req) => (req as ScopedRequest).authContext,
    buildOnboardingCompletionSummary,
    buildSuggestedCoachIdentity,
    resolveCurrentOrganizationMember,
    getLocalAuthAccountByEmail,
    getLocalAuthAccountsByEmailAcrossSchools,
    buildAuthSessionResponse,
    getUserWorkspaceProfile,
    listSchoolMembershipsForUser,
    sanitizeTextField,
    resolveAuthSchoolId,
    pruneExpiredInvitationTokens,
    invitationTokens,
    isValidEmail,
    hashPassword,
    getOrganizationMembersByScope,
    saveLocalAuthAccount,
    activateKnownMemberForAccount,
    shouldSyncPrimaryCoachIdentity,
    saveOnboardingAccountState,
    issueLocalAuthToken,
    buildInvitePath,
    verifyPassword,
    recordLocalAuthLogin,
    pruneExpiredPasswordResetTokens,
    passwordResetTokens,
    generatePasswordResetToken: () => randomBytes(24).toString("hex"),
    passwordResetTokenTtlMs,
    deliverPasswordResetEmail,
    buildResetPath,
    exposePasswordResetToken: EXPOSE_PASSWORD_RESET_TOKEN,
    getLocalAuthAccountsByScope,
    billingGuardBeforeRegister: undefined,
    enableLegacyLocalAuth: ENABLE_LEGACY_LOCAL_AUTH,
  });

  registerAuthAccountRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    requireOrganizationManager,
    sanitizeTextField,
    normalizePersonName,
    isValidEmail,
    hashPassword,
    getLocalAuthAccountByEmail,
    saveLocalAuthAccount,
    getRosterTeamsByScope,
    findPlayerRecord,
    saveOrganizationMember,
    persistSchoolTeams,
    generatePassword: () => randomBytes(12).toString("base64url"),
    saveBillingState,
    normalizeMemberRole,
    enableLegacyLocalAuth: ENABLE_LEGACY_LOCAL_AUTH,
  });

  registerWorkspaceRoutes(app, {
    paywallEnabled: BILLING_PAYWALL_ENABLED,
    requireApiKey,
    requireWriteRole,
    getAuthUser: (req) => getAuthUserFromContext((req as ScopedRequest).authContext),
    sanitizeTextField,
    buildUniqueSchoolTeamId,
    normalizeTeamColor,
    getSchoolRecord,
    saveSchoolRecord,
    getUserWorkspaceProfile,
    saveUserWorkspaceProfile,
    getSchoolMembershipsByScope,
    saveSchoolMembership,
    deleteSchoolMembership,
    getTeamMembershipsByScope,
    saveTeamMembership,
    deleteTeamMembership,
    listSchoolMembershipsForUser,
    listTeamMembershipsForUser,
    getRosterTeamsByScope,
    saveRosterTeams,
    getTeamById,
    getActivityEventsByScope,
    saveActivityEvent,
    getLiveGameSessionsByScope,
    createLiveGameSessionRecord,
    getLiveGameSessionById,
    saveOperatorSessionRecord,
    getOperatorSessionByLiveSession,
    issueLocalAuthToken,
    getBillingStateByScope,
    saveBillingState,
    createGame,
    setOperatorLinkSetup,
    issueWorkspaceInvitation,
    emitTeamDeleted: (schoolId, teamId) => {
      io.to(schoolRoom(schoolId)).emit("team:deleted", { teamId });
    },
  });

  registerOnboardingRoutes(app, {
    requireApiKey,
    requireWriteRole,
    resolveRequestSchoolId,
    getSchoolIdFromRequest,
    getSuggestedCoachIdentity: (req) => buildSuggestedCoachIdentity((req as ScopedRequest).authContext),
    buildOnboardingProfileView,
    getOnboardingAccountStateByScope,
    getPrimaryTeam,
    withSuggestedOnboardingIdentity,
    requireOnboardingIdentity,
    saveOnboardingAccountState,
    buildOnboardingAccountPayload,
    ensureAuthenticatedOrganizationMember,
    ensureOwnerMembership,
    saveOrganizationProfile,
    buildOrganizationProfilePayload,
    buildOrganizationSlug,
    normalizeNameKey,
    buildRosterPlayer,
    upsertPrimaryTeam,
    persistSchoolTeams,
    sanitizeTextField,
    buildTeamAbbreviation,
  });

  registerOrgMembersRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getOnboardingAccountStateByScope,
    ensureAuthenticatedOrganizationMember,
    requireOrganizationManager,
    getOrganizationMembersByScope,
    sanitizeTextField,
    isValidEmail,
    normalizeMemberRole,
    saveOrganizationMember,
    deleteOrganizationMember,
    issueMemberInvitation,
  });

  registerTeamConfigRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getRosterTeamsByScope,
    defaultTeamAiSettings,
    getPrimaryTeam,
    extractTeamAiSettings,
    upsertPrimaryTeam,
    persistSchoolTeams,
    normalizeNameKey,
    buildRosterPlayer,
    buildTeamAbbreviation,
    sanitizeTextField,
  });

  registerPlayerRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getSeasonPlayers,
    getRosterPlayers,
    normalizeNameKey,
    normalizePersonName,
    getPrimaryTeam,
    buildRosterPlayer,
    findPlayerRecord,
    getRosterTeamsByScope,
    persistSchoolTeams,
    sanitizeTextField,
    isValidEmail,
    getOnboardingAccountStateByScope,
    getOrganizationMembersByScope,
    saveOrganizationMember,
    issueMemberInvitation,
  });

  registerGameManagementRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getRosterTeamsByScope,
    getGameState,
    getSeasonTeamStats,
    buildGamesPayload,
    getGameOverrideMap,
    sanitizeTextField,
    resolveGameResult,
    setGameOverride,
    deleteGame,
    emitToGameRooms,
    submitGame,
    resetAllData,
  });

  // ---------------------------------------------------------------------------
  // Billing paywall middleware for premium feature endpoints.
  // Applied as app.use() guards before the relevant route registrations.
  // ---------------------------------------------------------------------------
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

  // Wire paywall to premium endpoints
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

  registerLiveInsightsRoutes(app, {
    getSchoolIdFromRequest,
    getLiveContext,
    buildLeaderboardsPayload,
    buildTeamTrendsPayload,
    normalizePersonName,
    buildPlayerTrendsPayload,
    buildPlayerComparisonPayload,
  });

  registerAdvancedInsightsRoutes(app, {
    getSchoolIdFromRequest,
    buildTeamAdvancedPayload,
    buildPlayerAdvancedPayload,
    buildVolatilityPayload,
    buildComprehensiveInsightsPayload,
  });

  registerAiCompatibilityRoutes(app, {
    requireApiKey,
    getSchoolIdFromRequest,
    sanitizeTextField,
    buildAiSafetyMetadata,
    getSeasonGames,
    answerGameAiChat,
    buildTeamSummaryText,
    buildPlayerInsightsText,
    buildGameAnalysisText,
    buildSeasonAnalysisPayload,
    seasonAnalysisBySchool,
    playerAnalysisCacheBySchool,
    buildPlayerAnalysisPayload,
  });

  registerAdvancedLegacyRoutes(app, {
    getSchoolIdFromRequest,
    buildGamesPayload,
    roundStat,
    buildComprehensiveInsightsPayload,
    buildTeamAdvancedPayload,
    buildVolatilityPayload,
  });

  registerRosterConfigRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getRosterTeamsByScope,
    saveRosterTeams,
    emitRosterTeams: (schoolId, teams) => {
      io.to(schoolRoom(schoolId)).emit("roster:teams", teams);
    },
  });

  registerOperatorLinkRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    normalizeConnectionKey,
    resolveRequestSchoolId,
    listSchoolIdsForConnection,
    getOperatorLinkSetup,
    setOperatorLinkSetup,
    issueLocalAuthToken,
    getRosterTeamsByScope,
    sanitizeTextField,
    normalizeTeamColor,
    emitOperatorLinkUpdated: (schoolId, connectionId, response) => {
      io.to(connectionRoom(schoolId, connectionId)).emit("operator:link:updated", response);
    },
  });

  registerTeamManagementRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getRosterTeamsByScope,
    saveRosterTeams,
    sanitizeTextField,
    normalizeTeamColor,
    buildUniqueSchoolTeamId,
    emitRosterTeams: (schoolId, teams) => {
      io.to(schoolRoom(schoolId)).emit("roster:teams", teams);
    },
    emitTeamCreated: (schoolId, team) => {
      io.to(schoolRoom(schoolId)).emit("team:created", { team });
    },
    emitTeamUpdated: (schoolId, team) => {
      io.to(schoolRoom(schoolId)).emit("team:updated", { team });
    },
    emitTeamDeleted: (schoolId, teamId) => {
      io.to(schoolRoom(schoolId)).emit("team:deleted", { teamId });
    },
    emitPlayerAdded: (schoolId, teamId, player) => {
      io.to(schoolRoom(schoolId)).emit("player:added", { teamId, player });
    },
    emitPlayerUpdated: (schoolId, teamId, player) => {
      io.to(schoolRoom(schoolId)).emit("player:updated", { teamId, player });
    },
    emitPlayerDeleted: (schoolId, teamId, playerId) => {
      io.to(schoolRoom(schoolId)).emit("player:deleted", { teamId, playerId });
    },
  });

  registerGameSessionRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getRosterTeamsByScope,
    getGameState,
    getActiveGameState,
    createGame,
    emitToGameRooms,
    getLatestOperatorLinkSetup,
    patchGameLineup,
  });

  registerGameAiRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getGameState,
    refreshGameAiInsights,
    getGameInsights,
    getGameAiSettings,
    updateGameAiSettings,
    emitGameInsights: (schoolId, gameId, insights) => {
      emitToGameRooms(schoolId, gameId, "game:insights", insights);
    },
    getGameAiContext,
    updateGameAiContext,
    getGameAiPromptPreview,
    sanitizePromptText,
    answerGameAiChat,
  });

  registerGameEventRoutes(app, {
    requireApiKey,
    requireWriteRole,
    eventRateLimiter,
    getSchoolIdFromRequest,
    getRosterTeamsByScope,
    getGameState,
    getGameEvents,
    ingestEvent,
    emitToGameRooms,
    broadcastGameStateWithDebounce,
    refreshAndBroadcastInsights,
    deleteEvent,
    updateEvent,
  });

  registerRealtimeConnectionHandlers(io, {
    getSchoolIdFromSocket,
    schoolRoom,
    normalizeConnectionKey,
    apiKey: API_KEY,
    writeApiKey: WRITE_API_KEY,
    isJwtAuthEnabled,
    jwtWriteRequired: JWT_WRITE_REQUIRED,
    hasWriteRole,
    getOperatorsByConnectionId,
    operatorPresenceBySocketId,
    operatorPresenceByDeviceId,
    refreshOperatorConnectionIndex,
    gameRoom,
    deviceRoom,
    emitPresenceForDevice,
    connectionRoom,
    emitPresenceForConnection,
    patchGameLineup,
    emitToGameRooms,
    isGameSubmitted,
    getGameState,
    getGameInsights,
    refreshAndBroadcastInsights,
    buildConnectionPresencePayload,
  });

  registerAdminRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSecurityTelemetry: () => securityTelemetry,
    renderPrometheusSecurityMetrics,
    getSchoolIdFromRequest,
    resetAllData,
    clearOperatorLinksForSchool,
  });

  registerBillingRoutes(app, {
    paywallEnabled: BILLING_PAYWALL_ENABLED,
    stripeTestMode: BILLING_STRIPE_TEST_MODE,
    stripeSecretKey: BILLING_STRIPE_SECRET_KEY,
    stripeWebhookSecret: BILLING_STRIPE_WEBHOOK_SECRET,
    stripePriceIdMonthly: BILLING_STRIPE_PRICE_ID_MONTHLY,
    stripePriceIdYearly: BILLING_STRIPE_PRICE_ID_YEARLY,
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    sanitizeTextField,
    isValidEmail,
    allocateBootstrapSchoolId,
    buildBootstrapSchoolSeed,
    normalizeSchoolId,
    resolveCoachRedirectOrigin,
    getBillingStateByScope,
    saveBillingState,
    findBillingStateByStripeCustomerId,
    findBillingStateByStripeSubscriptionId,
    hasProcessedStripeWebhookEvent,
    markProcessedStripeWebhookEvent,
    trimProcessedStripeWebhookEvents,
    getOrganizationProfileByScope,
    saveOrganizationProfile,
    loggerInfo: (message, context) => logger.info(message, context),
    loggerWarn: (message, context) => logger.warn(message, context),
    loggerError: (message, context) => logger.error(message, context),
  });
}
