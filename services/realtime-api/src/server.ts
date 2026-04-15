import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "node:http";
import path from "path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  normalizeTeamColor,
  sanitizePromptText,
} from "@bta/shared-schema";
import {
  answerGameAiChat,
  type CoachAiChatResponse,
  type AiPromptPreview,
  type GameAiContext,
  type CoachAiSettings,
  type OnboardingAccountInput,
  type OnboardingAccountState,
  type OrganizationMember,
  type OrganizationProfile,
  type RosterPlayer,
  type RosterTeam,
  createGame,
  deleteGame,
  submitGame,
  isGameSubmitted,
  deleteEvent,
  getGameAiContext,
  getGameAiPromptPreview,
  getGameAiSettings,
  getGameEvents,
  getGameInsights,
  getActiveGameState,
  getLiveContext,
  getRosterPlayers,
  getRosterTeamsByScope,
  getSeasonGames,
  getSeasonPlayers,
  getSeasonTeamStats,
  getGameState,
  ingestEvent,
  patchGameLineup,
  refreshGameAiInsights,
  saveRosterTeams,
  saveOrganizationProfile,
  updateGameAiContext,
  updateGameAiSettings,
  updateEvent,
  resetAllData,
  initializeStore,
  getOrganizationProfileByScope,
  getOnboardingAccountStateByScope,
  saveOnboardingAccountState,
  getOrganizationMembersByScope,
  getLocalAuthAccountByEmail,
  getLocalAuthAccountsByEmailAcrossSchools,
  getLocalAuthAccountsByScope,
  saveLocalAuthAccount,
  recordLocalAuthLogin,
  saveOrganizationMember,
  deleteOrganizationMember,
  type LocalAuthAccount,
  getGameOverrideMap,
  setGameOverride
} from "./store.js";
import {
  extractBearerToken,
  isJwtAuthEnabled,
  isLocalTokenAuthEnabled,
  issueLocalAuthToken,
  verifyBearerToken,
  type AuthContext
} from "./auth.js";
import { assertRuntimeConfig, readRuntimeConfig } from "./config-validation.js";
import { sendTransactionalEmail } from "./email.js";
import {
  hasWriteRole,
  normalizeSchoolId,
} from "./tenant-guards.js";
import { registerOnboardingRoutes } from "./routes/onboarding-routes.js";
import { registerOrgMembersRoutes } from "./routes/org-members-routes.js";
import { registerTeamConfigRoutes } from "./routes/team-config-routes.js";
import { registerPlayerRoutes } from "./routes/player-routes.js";
import { registerGameManagementRoutes } from "./routes/game-management-routes.js";
import { registerLiveInsightsRoutes } from "./routes/live-insights-routes.js";
import { registerAdvancedInsightsRoutes } from "./routes/advanced-insights-routes.js";
import { registerAiCompatibilityRoutes } from "./routes/ai-compat-routes.js";
import { registerAdvancedLegacyRoutes } from "./routes/advanced-legacy-routes.js";
import { registerRosterConfigRoutes } from "./routes/roster-config-routes.js";
import { registerOperatorLinkRoutes } from "./routes/operator-link-routes.js";
import { registerTeamManagementRoutes } from "./routes/team-management-routes.js";
import { registerGameSessionRoutes } from "./routes/game-session-routes.js";
import { registerGameAiRoutes } from "./routes/game-ai-routes.js";
import { registerGameEventRoutes } from "./routes/game-event-routes.js";
import { registerAuthCoreRoutes } from "./routes/auth-core-routes.js";
import { registerAuthAccountRoutes } from "./routes/auth-account-routes.js";
import { registerBillingRoutes } from "./routes/billing-routes.js";
import { logger } from "./logger.js";
import { createAuthzMiddleware } from "./middleware/authz.js";
import { createBillingEntitlementMiddleware } from "./middleware/billing-entitlement.js";
import {
  applySecurityHeaders,
  buildAllowedOrigins,
  createCorsOriginHandler,
  createOriginAllowChecker,
} from "./middleware/security-bootstrap.js";
import { registerAdminRoutes, registerHealthRoute } from "./routes/system-routes.js";
import {
  getBillingStateByScope,
  saveBillingState,
  findBillingStateByStripeCustomerId,
  findBillingStateByStripeSubscriptionId,
  hasProcessedStripeWebhookEvent,
  markProcessedStripeWebhookEvent,
  trimProcessedStripeWebhookEvents,
  getPersistenceStatus,
} from "./store.js";
import {
  seasonAnalysisBySchool,
  playerAnalysisCacheBySchool,
  roundStat,
  resolveGameResult,
  getRosterPlayerByIdForSchool,
  getOurTeamId,
  buildDefaultGamePlayerStats,
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
} from "./helpers/analytics-helpers.js";
import { createOperatorPresenceManager } from "./sockets/operator-presence-manager.js";
import { createGameBroadcastManager } from "./sockets/game-broadcast-manager.js";
import { registerSocketAuth } from "./sockets/socket-auth.js";
import { registerRealtimeConnectionHandlers } from "./sockets/realtime-connection.js";
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
  resolveSchoolName,
  resolveCoachName,
  resolveCoachEmail,
  shouldSyncPrimaryCoachIdentity,
  defaultTeamAiSettings,
  hashPassword,
  verifyPassword,
  sanitizeFocusInsights,
  extractTeamAiSettings,
  buildPlayerId,
  buildRosterPlayer,
  findPlayerRecord,
  buildOrganizationProfilePayload,
  buildOnboardingAccountPayload,
  requireOnboardingIdentity,
} from "./helpers/string-helpers.js";
import {
  type SecurityMetricKey,
  securityTelemetry,
  renderPrometheusSecurityMetrics,
  trackSecurityEvent,
} from "./helpers/metrics-helpers.js";
import {
  type AuthedRequest,
  type ScopedRequest,
  schoolRoom,
  gameRoom,
  deviceRoom,
  connectionRoom,
  isPublicAuthBootstrapRequest,
  isOperatorBootstrapRequest,
  isOptionalTenantScopeRequest,
  shouldSuppressMissingTenantTelemetry,
  resolveRequestSchoolId,
  resolveSocketSchoolId,
  getSchoolIdFromRequest,
  getSchoolIdFromSocket,
  resolveAuthSchoolId,
  allocateBootstrapSchoolId,
  buildBootstrapSchoolSeed,
} from "./helpers/tenant-helpers.js";
import { createRealtimeApiRateLimiters } from "./bootstrap/request-rate-limit.js";
import { createTenantCompositionHelpers } from "./bootstrap/tenant-composition.js";
import { createAuthSessionBootstrap } from "./bootstrap/auth-session.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.disable("x-powered-by");
const ALLOWED_ORIGINS = buildAllowedOrigins(process.env.ALLOWED_ORIGINS);
const originAllowed = createOriginAllowChecker(ALLOWED_ORIGINS);

app.use(applySecurityHeaders);

app.use(cors({
  origin: createCorsOriginHandler({
    nodeEnv: process.env.NODE_ENV,
    isOriginAllowed: originAllowed,
    loggerWarn: (message, context) => logger.warn(message, context),
  }),
  credentials: true
}));
app.use(express.json());
const { eventRateLimiter, authRateLimiter } = createRealtimeApiRateLimiters();

const tenantComposition = createTenantCompositionHelpers({
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
  requireOrganizationOwner,
  requireOrganizationManager,
  normalizeMemberRole,
  withSuggestedOnboardingIdentity,
  activateKnownMemberForAccount,
});
  ioEmitRosterTeams: (schoolId, teams) => {
    io.to(schoolRoom(schoolId)).emit("roster:teams", teams);
  },
  getRosterTeamsByScope,
  saveRosterTeams,
  sanitizeTextField,
  buildOrganizationSlug,
  buildTeamAbbreviation,
  normalizeTeamColor,
  sanitizeFocusInsights,
  getOrganizationProfileByScope,
  getOnboardingAccountStateByScope,
  getOrganizationMembersByScope,
  saveOrganizationMember,
  getSchoolIdFromRequest,
});

// ---------------------------------------------------------------------------
// Optional API-key auth. Set BTA_API_KEY env var to enable.
// ---------------------------------------------------------------------------
const API_KEY = process.env.BTA_API_KEY?.trim() || undefined;
const WRITE_API_KEY = process.env.BTA_WRITE_API_KEY?.trim() || undefined;
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const DEFAULT_SCHOOL_ID = String(process.env.BTA_DEFAULT_SCHOOL_ID ?? "default").trim().toLowerCase() || "default";
const REQUIRE_TENANT = process.env.BTA_REQUIRE_TENANT !== "0";
const JWT_WRITE_REQUIRED = process.env.BTA_JWT_WRITE_REQUIRED !== "0";
const FAIL_CLOSED_ON_AUTH_MISCONFIG = process.env.BTA_FAIL_CLOSED_ON_MISCONFIG === "1";
const ALLOW_UNCONFIGURED_AUTH_IN_TESTS = !FAIL_CLOSED_ON_AUTH_MISCONFIG && (process.env.NODE_ENV ?? "development") === "test";
const BILLING_PAYWALL_ENABLED = process.env.BTA_PAYWALL_ENABLED?.trim()
  ? process.env.BTA_PAYWALL_ENABLED !== "0"
  : (process.env.NODE_ENV ?? "development") !== "test";
const BILLING_STRIPE_TEST_MODE = process.env.BTA_STRIPE_TEST_MODE !== "0";
const BILLING_STRIPE_SECRET_KEY = process.env.BTA_STRIPE_SECRET_KEY?.trim() || undefined;
const BILLING_STRIPE_WEBHOOK_SECRET = process.env.BTA_STRIPE_WEBHOOK_SECRET?.trim() || undefined;
const BILLING_STRIPE_PRICE_ID_MONTHLY = process.env.BTA_STRIPE_PRICE_ID_MONTHLY?.trim() || undefined;
const BILLING_STRIPE_PRICE_ID_YEARLY = process.env.BTA_STRIPE_PRICE_ID_YEARLY?.trim() || undefined;

function hasValidApiKeyRequest(req: Request): boolean {
  const provided = req.headers["x-api-key"] ?? req.query.apiKey;
  const candidate = Array.isArray(provided) ? provided[0] : provided;
  return Boolean(API_KEY && candidate === API_KEY);
}

function hasValidWriteApiKeyRequest(req: Request): boolean {
  const provided = req.headers["x-api-key"] ?? req.query.apiKey;
  const candidate = Array.isArray(provided) ? provided[0] : provided;
  return Boolean(WRITE_API_KEY && candidate === WRITE_API_KEY);
}

function hasConfiguredHttpAuthPath(): boolean {
  return Boolean(API_KEY || WRITE_API_KEY || isJwtAuthEnabled());
}

function hasConfiguredWriteAuthPath(): boolean {
  return Boolean(WRITE_API_KEY || isJwtAuthEnabled());
}

function isReadOnlyRequest(req: Request): boolean {
  return req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
}

async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const scopedReq = req as ScopedRequest;
  if (scopedReq.authContext) {
    next();
    return;
  }

  if (isJwtAuthEnabled() && JWT_WRITE_REQUIRED && isReadOnlyRequest(req)) {
    next();
    return;
  }

  if (!hasConfiguredHttpAuthPath()) {
    if (ALLOW_UNCONFIGURED_AUTH_IN_TESTS) {
      next();
      return;
    }
    trackSecurityEvent("unauthorizedHttp", { reason: "auth-misconfigured", path: req.path, method: req.method });
    res.status(503).json({ error: "Authentication is not configured for this protected route" });
    return;
  }

  if (hasValidApiKeyRequest(req) || hasValidWriteApiKeyRequest(req)) {
    next();
    return;
  }

  const reason = isJwtAuthEnabled() && JWT_WRITE_REQUIRED && !isReadOnlyRequest(req)
    ? "jwt-write-required"
    : "missing-valid-credentials";
  trackSecurityEvent("unauthorizedHttp", { reason, path: req.path, method: req.method });
  res.status(401).json({ error: "Unauthorized — provide a valid bearer token or x-api-key" });
}

async function attachAuthContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const scopedReq = req as ScopedRequest;
  if (scopedReq.authContext) {
    next();
    return;
  }

  const token = extractBearerToken(req.headers, undefined);
  if (!token) {
    next();
    return;
  }

  const authContext = await verifyBearerToken(token);
  if (authContext) {
    scopedReq.authContext = authContext;
  }

  next();
}

function requireTenantScope(req: Request, res: Response, next: NextFunction): void {
  const scopedReq = req as ScopedRequest;
  const optionalTenantScope = isOptionalTenantScopeRequest(req);
  const suppressMissingScopeTelemetry = optionalTenantScope || shouldSuppressMissingTenantTelemetry(req);
  const resolved = resolveRequestSchoolId(req, {
    suppressMissingScopeTelemetry,
  });

  if (optionalTenantScope && resolved.error === "schoolId is required") {
    next();
    return;
  }

  if (!resolved.schoolId) {
    res.status(resolved.status ?? 400).json({ error: resolved.error ?? "schoolId is required" });
    return;
  }

  scopedReq.tenantSchoolId = resolved.schoolId;
  next();
}

function requireWriteRole(req: Request, res: Response, next: NextFunction): void {
  if (hasValidWriteApiKeyRequest(req)) {
    next();
    return;
  }

  if (!hasConfiguredWriteAuthPath()) {
    if (ALLOW_UNCONFIGURED_AUTH_IN_TESTS) {
      next();
      return;
    }
    trackSecurityEvent("forbiddenWriteRole", { path: req.path, method: req.method, role: null, reason: "write-auth-misconfigured" });
    res.status(503).json({ error: "Write authorization is not configured for this protected route" });
    return;
  }

  if (!isJwtAuthEnabled()) {
    trackSecurityEvent("forbiddenWriteRole", { path: req.path, method: req.method, role: null, reason: "missing-write-credential" });
    res.status(403).json({ error: "Insufficient role for write access" });
    return;
  }

  const scopedReq = req as ScopedRequest;
  const role = scopedReq.authContext?.role?.trim().toLowerCase();
  if (!hasWriteRole(role)) {
    trackSecurityEvent("forbiddenWriteRole", { path: req.path, method: req.method, role: role ?? null });
    res.status(403).json({ error: "Insufficient role for write access" });
    return;
  }

  next();
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: process.env.NODE_ENV !== "production" 
    ? { origin: true, credentials: true }
    : { origin: ALLOWED_ORIGINS, credentials: true },
  // Give sleeping devices (iPad screen-off, background tabs) more time before
  // the server declares them disconnected. Defaults are 25s/20s which is too
  // aggressive for iOS Safari's background network suspension.
  pingInterval: 30000,   // how often the server pings (ms)
  pingTimeout: 90000,    // how long to wait for a pong before disconnecting (ms)
});

registerSocketAuth(io, {
  extractBearerToken,
  verifyBearerToken,
  resolveSocketSchoolId,
  apiKey: API_KEY,
  writeApiKey: WRITE_API_KEY,
  isJwtAuthEnabled,
  allowAnonymousWhenUnconfigured: ALLOW_UNCONFIGURED_AUTH_IN_TESTS,
  trackSecurityEvent: (event, details) => {
    trackSecurityEvent(event, details);
  },
});

const {
  operatorPresenceBySocketId,
  operatorPresenceByDeviceId,
  normalizeConnectionKey,
  getOperatorsByConnectionId,
  refreshOperatorConnectionIndex,
  buildConnectionPresencePayload,
  getOperatorLinkSetup,
  setOperatorLinkSetup,
  getLatestOperatorLinkSetup,
  clearOperatorLinksForSchool,
  listSchoolIdsForConnection,
  emitPresenceForDevice,
  emitPresenceForConnection,
} = createOperatorPresenceManager({
  io,
  deviceRoom,
  connectionRoom,
});


const {
  emitToGameRooms,
  broadcastGameStateWithDebounce,
} = createGameBroadcastManager({
  io,
  gameRoom,
});
const {
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
  requireOrganizationOwner,
  requireOrganizationManager,
  normalizeMemberRole,
  withSuggestedOnboardingIdentity,
  activateKnownMemberForAccount,
} = tenantComposition;

async function refreshAndBroadcastInsights(schoolId: string, gameId: string): Promise<void> {
  const insights = await refreshGameAiInsights(gameId, undefined, { schoolId });
  if (insights) {
    emitToGameRooms(schoolId, gameId, "game:insights", insights);
  }
}

// Serve the built coach-dashboard SPA from the same origin.
const COACH_DIST = path.join(__dirname, "..", "..", "..", "apps", "coach-dashboard", "dist");
const LEGACY_COACH_ROUTE_REDIRECTS: Record<string, string> = {
  "/games": "/stats/games",
  "/players": "/stats/players",
  "/trends": "/stats/trends",
  "/ai-insights": "/stats/insights",
  "/analysis": "/stats/insights",
  "/settings": "/stats/settings",
};

function resolveCoachRedirectOrigin(req: Request): string {
  const configured = process.env.COACH_DASHBOARD_ORIGIN?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if ((process.env.NODE_ENV ?? "development") === "production") {
    return `${req.protocol}://${req.get("host") ?? ""}`.replace(/\/$/, "");
  }
  return "http://localhost:5173";
}

const {
  passwordResetTokens,
  invitationTokens,
  passwordResetTokenTtlMs,
  buildResetPath,
  buildInvitePath,
  pruneExpiredPasswordResetTokens,
  pruneExpiredInvitationTokens,
  deliverPasswordResetEmail,
  issueMemberInvitation,
} = createAuthSessionBootstrap({
  resolveCoachRedirectOrigin,
  sendTransactionalEmail,
  sanitizeTextField,
  getOnboardingAccountStateByScope,
  getOrganizationProfileByScope,
});

app.use(express.static(COACH_DIST, { index: false }));
app.get(Object.keys(LEGACY_COACH_ROUTE_REDIRECTS), (req, res) => {
  const targetPath = LEGACY_COACH_ROUTE_REDIRECTS[req.path];
  if (!targetPath) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.redirect(302, `${resolveCoachRedirectOrigin(req)}${targetPath}`);
});

registerHealthRoute(app, {
  persistenceStatus: getPersistenceStatus(),
  apiKey: API_KEY,
  writeApiKey: WRITE_API_KEY,
  isJwtAuthEnabled,
});

// Keep /api probe tenant-agnostic so platform health checks can use it.
app.get("/api", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(attachAuthContext);
app.use("/api", requireTenantScope);
app.use("/teams", requireTenantScope);
app.use("/config", requireTenantScope);
app.use("/admin", requireTenantScope);

registerAuthCoreRoutes(app, {
  authRateLimiter,
  resolveRequestSchoolId,
  getSchoolIdFromRequest,
  getAuthContextFromRequest: (req) => (req as ScopedRequest).authContext,
  buildOnboardingCompletionSummary,
  buildSuggestedCoachIdentity,
  resolveCurrentOrganizationMember,
  getLocalAuthAccountByEmail,
  buildAuthSessionResponse,
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
  passwordResetTokenTtlMs: PASSWORD_RESET_TOKEN_TTL_MS,
  deliverPasswordResetEmail,
  buildResetPath,
  exposePasswordResetToken: EXPOSE_PASSWORD_RESET_TOKEN,
  getLocalAuthAccountsByScope,
  billingGuardBeforeRegister: BILLING_PAYWALL_ENABLED
    ? (schoolId: string) => {
        const billingState = getBillingStateByScope({ schoolId });
        if (!billingState || (billingState.status !== "active" && billingState.status !== "trialing")) {
          return { allowed: false, error: "Complete checkout before creating your account", status: 402 };
        }
        return { allowed: true };
      }
    : undefined,
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

// SPA fallback: serve index.html for any non-API route not matched above.
app.get("*", (_req, res) => {
  const requestPath = _req.path || "";
  const looksLikeStaticAsset = requestPath.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(requestPath);
  if (looksLikeStaticAsset) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }

  res.sendFile(path.join(COACH_DIST, "index.html"), (err) => {
    if (err) {
      res.status(404).json({ error: "Not found" });
    }
  });
});

let serverStarted = false;

// Warn if API key not set in production
const NODE_ENV = process.env.NODE_ENV ?? "development";
if (NODE_ENV === "production" && !API_KEY) {
  console.warn("[realtime-api] WARNING: BTA_API_KEY not set. Read-protected API-key routes require JWT or BTA_WRITE_API_KEY.");
}

/**
 * Start the HTTP server. Accepts an optional port override (pass 0 for an
 * OS-assigned ephemeral port — useful in tests to avoid EADDRINUSE conflicts).
 * Returns the actual bound port number.
 */
export async function startServer(overridePort?: number): Promise<number> {
  if (serverStarted) {
    const addr = httpServer.address();
    const boundPort = (typeof addr === "object" && addr !== null)
      ? (addr as { port: number }).port
      : (overridePort ?? Number(process.env.PORT ?? 4000));
    return boundPort;
  }

  assertRuntimeConfig(readRuntimeConfig(isJwtAuthEnabled()));

  const strictPersistenceInit = process.env.BTA_PERSISTENCE_STARTUP_STRICT === "1";
  try {
    await initializeStore();
  } catch (error) {
    logger.error("startup.store_initialize_failed", {
      strictPersistenceInit,
      error,
    });
    if (strictPersistenceInit) {
      throw error;
    }
  }

  const port = overridePort ?? Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";
  const persistenceStatus = getPersistenceStatus();

  return new Promise<number>((resolve) => {
    httpServer.listen(port, host, () => {
      serverStarted = true;
      const addr = httpServer.address();
      const boundPort = (typeof addr === "object" && addr !== null)
        ? (addr as { port: number }).port
        : port;
      logger.info("startup.server_listening", { port: boundPort, host });
      logger.info("startup.api_key_auth", { enabled: Boolean(API_KEY) });
      logger.info("startup.write_api_key_auth", { enabled: Boolean(WRITE_API_KEY) });
      logger.info("startup.persistence_backend", { backend: persistenceStatus.backend, durable: persistenceStatus.durable });
      if (persistenceStatus.warning) {
        logger.warn("startup.persistence_degraded", {
          backend: persistenceStatus.backend,
          warning: persistenceStatus.warning,
          dataFile: persistenceStatus.dataFile,
        });
      }
      if (!isJwtAuthEnabled() && !WRITE_API_KEY) {
        logger.warn("startup.write_auth_degraded", {
          warning: "No write-capable auth path configured; protected write routes will return 503 until JWT auth or BTA_WRITE_API_KEY is configured.",
        });
      }
      if (isJwtAuthEnabled()) {
        logger.info("startup.jwt_auth", { enabled: true });
      }
      logger.info("startup.local_token_auth", { enabled: isLocalTokenAuthEnabled() });
      logger.info("startup.tenant_strict_mode", { enabled: REQUIRE_TENANT });
      logger.info("startup.cors_origins", { origins: ALLOWED_ORIGINS });
      resolve(boundPort);
    });
  });
}

export async function stopServer(): Promise<void> {
  if (!serverStarted) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      serverStarted = false;
      resolve();
    });
  });
}

let shutdownInProgress = false;

async function handleShutdownSignal(signal: NodeJS.Signals): Promise<void> {
  if (shutdownInProgress) {
    return;
  }

  shutdownInProgress = true;
  console.log(`[realtime-api] Received ${signal}, shutting down gracefully...`);
  try {
    await stopServer();
    process.exit(0);
  } catch (error) {
    console.error("[realtime-api] Graceful shutdown failed", error);
    process.exit(1);
  }
}

if (!process.env.VITEST) {
  process.once("SIGTERM", () => {
    void handleShutdownSignal("SIGTERM");
  });
  process.once("SIGINT", () => {
    void handleShutdownSignal("SIGINT");
  });
  void startServer();
}
