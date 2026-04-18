import cors from "cors";
import express, { type Request } from "express";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import path from "path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { registerAllRoutes } from "./bootstrap/register-routes.js";
import { normalizeTeamColor } from "@bta/shared-schema";
import {
  initializeStore,
  getOrganizationProfileByScope,
  getOnboardingAccountStateByScope,
  getOrganizationMembersByScope,
  saveOrganizationMember,
  getRosterTeamsByScope,
  saveRosterTeams,
  getPersistenceStatus,
  getSchoolRecord,
} from "./store.js";
import {
  extractBearerToken,
  isJwtAuthEnabled,
  isLocalTokenAuthEnabled,
  verifyBearerToken,
} from "./auth.js";
import { assertRuntimeConfig, readRuntimeConfig } from "./config-validation.js";
import { sendTransactionalEmail } from "./email.js";
import { sendSupabasePasswordResetEmail } from "./supabase-auth-email.js";
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
  isValidEmail,
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

async function issueWorkspaceInvitation(req: Request, input: {
  schoolId: string;
  membershipId: string;
  email: string;
  fullName: string;
  roleLabel: string;
}) {
  pruneExpiredInvitationTokens();

  for (const [token, invitation] of invitationTokens.entries()) {
    if (invitation.schoolId === input.schoolId && invitation.memberId === input.membershipId) {
      invitationTokens.delete(token);
    }
  }

  const inviteToken = randomBytes(24).toString("hex");
  const now = Date.now();
  const schoolName = sanitizeTextField(
    getSchoolRecord(input.schoolId)?.name
      || getOnboardingAccountStateByScope({ schoolId: input.schoolId })?.organization.organizationName
      || getOrganizationProfileByScope({ schoolId: input.schoolId })?.organizationName
      || "your school",
    160,
  );
  const invitePath = buildInvitePath(input.schoolId, inviteToken);
  const inviteUrl = new URL(invitePath, `${resolveCoachRedirectOrigin(req)}/`).toString();

  invitationTokens.set(inviteToken, {
    token: inviteToken,
    schoolId: input.schoolId,
    memberId: input.membershipId,
    email: input.email,
    fullName: input.fullName,
    role: "coach",
    organizationName: schoolName,
    createdAt: now,
    expiresAt: now + (7 * 24 * 60 * 60 * 1000),
  });

  const emailDelivery = await sendTransactionalEmail({
    to: input.email,
    subject: `You're invited to ${schoolName} on BTA`,
    text: [
      `Hi ${input.fullName || "Coach"},`,
      "",
      `You've been invited to join ${schoolName} on BTA as ${input.roleLabel}.`,
      `Accept your invite here: ${inviteUrl}`,
      "",
      "If you already have a BTA login for this email, sign in from the same link and your workspace access will be activated.",
    ].join("\n"),
    html: [
      `<p>Hi ${input.fullName || "Coach"},</p>`,
      `<p>You've been invited to join <strong>${schoolName}</strong> on BTA as ${input.roleLabel}.</p>`,
      `<p><a href="${inviteUrl}">Accept your invite</a></p>`,
      "<p>If you already have a BTA login for this email, sign in from the same link and your workspace access will be activated.</p>",
    ].join(""),
  });

  return {
    inviteToken: (process.env.BTA_EXPOSE_INVITATION_TOKEN === "1" || (process.env.NODE_ENV ?? "development") !== "production") ? inviteToken : undefined,
    invitePath,
    emailDelivery,
    warning: emailDelivery.delivered ? undefined : "Invitation email was not delivered. Share the invite link manually.",
  };
}

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

app.post("/api/auth/password-reset/email", authRateLimiter, async (req, res) => {
  const payload = (req.body ?? {}) as Record<string, unknown>;
  const email = sanitizeTextField(payload.email, 160).toLowerCase();
  if (!isValidEmail(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const redirectTo = resolvePasswordResetRedirect(
    req,
    typeof payload.redirectTo === "string" ? payload.redirectTo : undefined,
  );
  const emailDelivery = await sendSupabasePasswordResetEmail({
    email,
    redirectTo,
    sendEmail: sendTransactionalEmail,
  });

  if (emailDelivery.delivered) {
    res.json({
      message: "If this email exists, a password reset link has been sent.",
      emailDelivery,
    });
    return;
  }

  if (emailDelivery.skipped) {
    logger.warn("auth.password_reset_email_unavailable", {
      email,
      reason: emailDelivery.reason,
      redirectTo,
    });
    res.status(503).json({
      error: emailDelivery.reason || "Password reset email is not configured.",
      emailDelivery,
    });
    return;
  }

  logger.warn("auth.password_reset_email_failed", {
    email,
    reason: emailDelivery.reason,
    redirectTo,
  });
  res.status(502).json({
    error: emailDelivery.reason || "Could not send password reset email.",
    emailDelivery,
  });
});

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
  passwordResetTokens,
  invitationTokens,
  passwordResetTokenTtlMs,
  buildResetPath,
  buildInvitePath,
  pruneExpiredPasswordResetTokens,
  pruneExpiredInvitationTokens,
  deliverPasswordResetEmail,
  issueMemberInvitation,
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
  emitToGameRooms,
  broadcastGameStateWithDebounce,
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

let serverStarted = false;

// Warn if API key not set in production
const NODE_ENV = process.env.NODE_ENV ?? "development";
if (NODE_ENV === "production" && !API_KEY) {
  logger.warn("startup.api_key_missing_warning", { message: "BTA_API_KEY not set. Read-protected API-key routes require JWT or BTA_WRITE_API_KEY." });
}

/**
 * Start the HTTP server. Accepts an optional port override (pass 0 for an
 * OS-assigned ephemeral port â€” useful in tests to avoid EADDRINUSE conflicts).
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
  logger.info("shutdown.signal_received", { signal });
  try {
    await stopServer();
    process.exit(0);
  } catch (error) {
    logger.error("shutdown.graceful_failed", { error });
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
