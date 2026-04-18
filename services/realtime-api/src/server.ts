import cors from "cors";
import express, { type Request } from "express";
import { createServer } from "node:http";
import path from "path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { registerAllRoutes } from "./bootstrap/register-routes.js";
import { normalizeTeamColor } from "@bta/shared-schema";
import {
  getOrganizationProfileByScope,
  getOnboardingAccountStateByScope,
  getOrganizationMembersByScope,
  saveOrganizationMember,
  getRosterTeamsByScope,
  saveRosterTeams,
  getPersistenceStatus,
} from "./store.js";
import {
  extractBearerToken,
  isJwtAuthEnabled,
  verifyBearerToken,
} from "./auth.js";
import { sendTransactionalEmail } from "./email.js";
import { registerHealthRoute } from "./routes/system-routes.js";
import { logger } from "./logger.js";
import {
  applySecurityHeaders,
  buildAllowedOrigins,
  createCorsOriginHandler,
  createOriginAllowChecker,
} from "./middleware/security-bootstrap.js";
import { createOperatorPresenceManager } from "./sockets/operator-presence-manager.js";
import { createGameBroadcastManager } from "./sockets/game-broadcast-manager.js";
import { registerSocketAuth } from "./sockets/socket-auth.js";
import {
  sanitizeTextField,
  buildOrganizationSlug,
  buildTeamAbbreviation,
  sanitizeFocusInsights,
} from "./helpers/string-helpers.js";
import { trackSecurityEvent } from "./helpers/metrics-helpers.js";
import {
  schoolRoom,
  gameRoom,
  deviceRoom,
  connectionRoom,
  resolveSocketSchoolId,
  getSchoolIdFromRequest,
} from "./helpers/tenant-helpers.js";
import { createRealtimeApiRateLimiters } from "./bootstrap/request-rate-limit.js";
import { createTenantCompositionHelpers } from "./bootstrap/tenant-composition.js";
import { createAuthSessionBootstrap } from "./bootstrap/auth-session.js";
import { createServerMiddleware } from "./bootstrap/server-middleware.js";
import { createWorkspaceInvitationHandler, registerPasswordResetEmailRoute } from "./bootstrap/server-invite.js";
import { createServerLifecycle } from "./bootstrap/server-lifecycle.js";

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
const { eventRateLimiter, authRateLimiter } = createRealtimeApiRateLimiters({
  disableRateLimit: process.env.BTA_AUTH_TEST_MODE === "1",
});

const tenantComposition = createTenantCompositionHelpers({
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

const API_KEY = process.env.BTA_API_KEY?.trim() || undefined;
const WRITE_API_KEY = process.env.BTA_WRITE_API_KEY?.trim() || undefined;
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
const EXPOSE_PASSWORD_RESET_TOKEN = process.env.BTA_EXPOSE_PASSWORD_RESET_TOKEN === "1" || (process.env.NODE_ENV ?? "development") !== "production";
const ENABLE_LEGACY_LOCAL_AUTH = process.env.BTA_ENABLE_LEGACY_LOCAL_AUTH?.trim()
  ? process.env.BTA_ENABLE_LEGACY_LOCAL_AUTH !== "0"
  : ((process.env.NODE_ENV ?? "development") === "test" || !isJwtAuthEnabled());

const {
  requireApiKey,
  requireWriteRole,
  attachAuthContext,
  requireTenantScope,
  getAuthUserFromContext,
  resolvePasswordResetRedirect,
} = createServerMiddleware({
  API_KEY,
  WRITE_API_KEY,
  JWT_WRITE_REQUIRED,
  ALLOW_UNCONFIGURED_AUTH_IN_TESTS,
  resolveCoachRedirectOrigin,
});

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
  loggerWarn: (message, context) => {
    logger.warn(message, context);
  },
});

const operatorPresence = createOperatorPresenceManager({
  io,
  deviceRoom,
  connectionRoom,
});

const gameBroadcast = createGameBroadcastManager({
  io,
  gameRoom,
});

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

const authSession = createAuthSessionBootstrap({
  resolveCoachRedirectOrigin,
  sendTransactionalEmail,
  sanitizeTextField,
  getOnboardingAccountStateByScope,
  getOrganizationProfileByScope,
});

const issueWorkspaceInvitation = createWorkspaceInvitationHandler({
  invitationTokens: authSession.invitationTokens,
  pruneExpiredInvitationTokens: authSession.pruneExpiredInvitationTokens,
  buildInvitePath: authSession.buildInvitePath,
  resolveCoachRedirectOrigin,
  sendTransactionalEmail,
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

registerPasswordResetEmailRoute(app, { authRateLimiter, resolvePasswordResetRedirect, sendTransactionalEmail });

app.use(attachAuthContext);
app.use("/api", requireTenantScope);
app.use("/teams", requireTenantScope);
app.use("/config", requireTenantScope);
app.use("/admin", requireTenantScope);

registerAllRoutes(app, io, {
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
  ...authSession,
  ...operatorPresence,
  ...gameBroadcast,
  ...tenantComposition,
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

// Warn if API key not set in production
if ((process.env.NODE_ENV ?? "development") === "production" && !API_KEY) {
  logger.warn("startup.api_key_missing_warning", { message: "BTA_API_KEY not set. Read-protected API-key routes require JWT or BTA_WRITE_API_KEY." });
}

const { startServer, stopServer, registerShutdownHandlers } = createServerLifecycle({
  httpServer,
  API_KEY,
  WRITE_API_KEY,
  REQUIRE_TENANT,
  ALLOWED_ORIGINS,
});

export { startServer, stopServer };

if (!process.env.VITEST) {
  registerShutdownHandlers();
  void startServer();
}
