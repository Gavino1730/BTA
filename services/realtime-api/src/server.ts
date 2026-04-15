import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
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
  readHeaderValue,
  resolveRequestTenant,
  resolveSocketTenant
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
import { createBillingEntitlementMiddleware } from "./middleware/billing-entitlement.js";
import { registerAdminRoutes, registerHealthRoute } from "./routes/system-routes.js";
import {
  getBillingStateByScope,
  saveBillingState,
  findBillingStateByStripeCustomerId,
  findBillingStateByStripeSubscriptionId,
  hasProcessedStripeWebhookEvent,
  markProcessedStripeWebhookEvent,
  trimProcessedStripeWebhookEvents,
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
} from "./helpers/tenant-helpers.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  const forwardedProto = readHeaderValue(req.headers["x-forwarded-proto"]);
  const isHttps = req.secure || forwardedProto === "https";
  if (isHttps) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
});

// CORS whitelist: allow only known app origins and explicitly configured deployments.
// Entries in ALLOWED_ORIGINS may use a single '*' wildcard (e.g. https://bta-coach-*.vercel.app).
const ALLOWED_ORIGINS = [
  "http://localhost:5173",      // iPad operator dev
  "http://localhost:5174",      // Coach dashboard dev
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];
const PROD_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
if (PROD_ORIGINS.length > 0) ALLOWED_ORIGINS.push(...PROD_ORIGINS);

function originAllowed(origin: string): boolean {
  for (const pattern of ALLOWED_ORIGINS) {
    if (!pattern.includes("*")) {
      if (origin === pattern) return true;
    } else {
      // Convert glob-style pattern (single * = any chars) to regex
      const re = new RegExp(
        "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".+") + "$"
      );
      if (re.test(origin)) return true;
    }
  }
  return false;
}

app.use(cors({
  origin: (origin, callback) => {
    // In development, allow localhost variants; in production use whitelist
    if (process.env.NODE_ENV !== "production") {
      callback(null, true);
    } else if (!origin || originAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`[realtime-api] CORS blocked origin: ${origin}`);
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true
}));
app.use(express.json());

// Simple rate limiter: scoped per route family and IP.
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

function resolveClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0]
      : undefined;

  const rawIp = (firstForwarded?.trim() || req.ip || req.socket.remoteAddress || "unknown").trim();
  if (!rawIp) {
    return "unknown";
  }

  return rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp;
}

function createRateLimitMiddleware(bucket: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = resolveClientIp(req);
    const now = Date.now();
    const key = `${bucket}:${ip}`;
    const limit = rateLimitState.get(key) ?? { count: 0, resetAt: now + windowMs };

    // Opportunistic cleanup so map size stays bounded under high IP churn.
    if (rateLimitState.size > 5000) {
      for (const [entryKey, value] of rateLimitState.entries()) {
        if (value.resetAt <= now) {
          rateLimitState.delete(entryKey);
        }
      }
    }

    if (now > limit.resetAt) {
      limit.count = 0;
      limit.resetAt = now + windowMs;
    }

    if (limit.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((limit.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    limit.count++;
    rateLimitState.set(key, limit);
    next();
  };
}
const eventRateLimiter = createRateLimitMiddleware("events", 100, 60000); // 100 events/min per IP
const authRateLimiter = createRateLimitMiddleware("auth", 20, 15 * 60 * 1000); // 20 auth attempts/15 min per IP
const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EXPOSE_PASSWORD_RESET_TOKEN = process.env.BTA_EXPOSE_PASSWORD_RESET_TOKEN === "1" || (process.env.NODE_ENV ?? "development") !== "production";
const EXPOSE_INVITATION_TOKEN = process.env.BTA_EXPOSE_INVITATION_TOKEN === "1" || (process.env.NODE_ENV ?? "development") !== "production";

interface PasswordResetTokenRecord {
  token: string;
  schoolId: string;
  accountId: string;
  email: string;
  expiresAt: number;
  createdAt: number;
}

interface InvitationTokenRecord {
  token: string;
  schoolId: string;
  memberId: string;
  email: string;
  fullName: string;
  role: OrganizationMember["role"];
  organizationName: string;
  expiresAt: number;
  createdAt: number;
}

const passwordResetTokens = new Map<string, PasswordResetTokenRecord>();
const invitationTokens = new Map<string, InvitationTokenRecord>();

function pruneExpiredPasswordResetTokens(now = Date.now()): void {
  for (const [token, record] of passwordResetTokens.entries()) {
    if (record.expiresAt <= now) {
      passwordResetTokens.delete(token);
    }
  }
}

function pruneExpiredInvitationTokens(now = Date.now()): void {
  for (const [token, record] of invitationTokens.entries()) {
    if (record.expiresAt <= now) {
      invitationTokens.delete(token);
    }
  }
}

function buildResetPath(schoolId: string, token: string): string {
  return `/reset-password?schoolId=${encodeURIComponent(schoolId)}&token=${encodeURIComponent(token)}`;
}

function buildInvitePath(schoolId: string, token: string): string {
  return `/setup?schoolId=${encodeURIComponent(schoolId)}&invite=${encodeURIComponent(token)}`;
}

function buildAbsoluteCoachUrl(req: Request, pathname: string): string {
  return new URL(pathname, `${resolveCoachRedirectOrigin(req)}/`).toString();
}

async function deliverPasswordResetEmail(
  req: Request,
  schoolId: string,
  account: LocalAuthAccount,
  token: string,
){
  const resetPath = buildResetPath(schoolId, token);
  const resetUrl = buildAbsoluteCoachUrl(req, resetPath);
  return sendTransactionalEmail({
    to: account.email,
    subject: "Reset your BTA coach password",
    text: [
      `Hi ${account.fullName || "Coach"},`,
      "",
      "We received a request to reset your BTA password.",
      `Use this link within 30 minutes: ${resetUrl}`,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      `<p>Hi ${account.fullName || "Coach"},</p>`,
      "<p>We received a request to reset your BTA password.</p>",
      `<p><a href=\"${resetUrl}\">Reset your password</a></p>`,
      "<p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>",
    ].join(""),
  });
}

async function deliverInvitationEmail(
  req: Request,
  invitation: InvitationTokenRecord,
){
  const invitePath = buildInvitePath(invitation.schoolId, invitation.token);
  const inviteUrl = buildAbsoluteCoachUrl(req, invitePath);
  return sendTransactionalEmail({
    to: invitation.email,
    subject: `You're invited to ${invitation.organizationName} on BTA`,
    text: [
      `Hi ${invitation.fullName || "Coach"},`,
      "",
      `You've been invited to join ${invitation.organizationName} on BTA as a ${invitation.role}.`,
      `Accept your invite here: ${inviteUrl}`,
      "",
      "If you already have a BTA login for this email, sign in from the same link and your membership will be activated.",
    ].join("\n"),
    html: [
      `<p>Hi ${invitation.fullName || "Coach"},</p>`,
      `<p>You've been invited to join <strong>${invitation.organizationName}</strong> on BTA as a ${invitation.role}.</p>`,
      `<p><a href=\"${inviteUrl}\">Accept your invite</a></p>`,
      "<p>If you already have a BTA login for this email, sign in from the same link and your membership will be activated.</p>",
    ].join(""),
  });
}

async function issueMemberInvitation(req: Request, schoolId: string, member: OrganizationMember) {
  pruneExpiredInvitationTokens();

  for (const [token, invitation] of invitationTokens.entries()) {
    if (invitation.schoolId === schoolId && invitation.memberId === member.memberId) {
      invitationTokens.delete(token);
    }
  }

  const now = Date.now();
  const inviteToken = randomBytes(24).toString("hex");
  const organizationName = sanitizeTextField(
    getOnboardingAccountStateByScope({ schoolId })?.organization.organizationName
      || getOrganizationProfileByScope({ schoolId })?.organizationName
      || "your organization",
    160,
  );

  const invitation: InvitationTokenRecord = {
    token: inviteToken,
    schoolId,
    memberId: member.memberId,
    email: member.email,
    fullName: member.fullName,
    role: member.role,
    organizationName,
    createdAt: now,
    expiresAt: now + INVITATION_TOKEN_TTL_MS,
  };

  invitationTokens.set(inviteToken, invitation);
  const invitePath = buildInvitePath(schoolId, inviteToken);
  const emailDelivery = await deliverInvitationEmail(req, invitation);

  return {
    inviteToken: EXPOSE_INVITATION_TOKEN ? inviteToken : undefined,
    invitePath,
    emailDelivery,
    warning: emailDelivery.delivered ? undefined : "Invitation email was not delivered. Share the invite link manually.",
  };
}
const TEAM_AI_FOCUS_OPTIONS = new Set<CoachAiSettings["focusInsights"][number]>([
  "timeouts",
  "substitutions",
  "foul_management",
  "momentum",
  "shot_selection",
  "ball_security",
  "hot_hand",
  "defense"
]);

function normalizePersonName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeNameKey(value: unknown): string {
  return normalizePersonName(value).toLowerCase();
}

function buildTeamAbbreviation(name: string): string {
  const compact = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return compact.slice(0, 4) || "TEAM";
}

function buildSchoolTeamId(name: string): string {
  const slug = buildOrganizationSlug(name);
  return `team-${slug || "team"}`;
}

function buildUniqueSchoolTeamId(name: string, teams: RosterTeam[]): string {
  const base = buildSchoolTeamId(name);
  const existing = new Set(teams.map((team) => team.id));
  if (!existing.has(base)) {
    return base;
  }

  let attempt = 2;
  while (existing.has(`${base}-${attempt}`)) {
    attempt += 1;
  }
  return `${base}-${attempt}`;
}

function buildOrganizationSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function resolveSchoolName(payload: Record<string, unknown>): string {
  return sanitizeTextField(
    payload.schoolName
    ?? payload.organizationName
    ?? payload.school,
    160,
  );
}

function resolveCoachName(payload: Record<string, unknown>): string {
  return sanitizeTextField(payload.coachName ?? payload.fullName, 120);
}

function resolveCoachEmail(payload: Record<string, unknown>): string {
  return sanitizeTextField(payload.coachEmail ?? payload.email, 160).toLowerCase();
}

function shouldSyncPrimaryCoachIdentity(role: OrganizationMember["role"]): boolean {
  return role === "owner" || role === "coach";
}

function defaultTeamAiSettings(): CoachAiSettings {
  return {
    playingStyle: "",
    teamContext: "",
    customPrompt: "",
    focusInsights: [
      "timeouts",
      "substitutions",
      "foul_management",
      "momentum",
      "shot_selection",
      "ball_security",
      "hot_hand",
      "defense"
    ]
  };
}

function sanitizeTextField(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashPassword(password: string, salt?: string): { passwordHash: string; passwordSalt: string } {
  const passwordSalt = salt ?? randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, passwordSalt, 64).toString("hex");
  return { passwordHash, passwordSalt };
}

function verifyPassword(password: string, passwordSalt: string, passwordHash: string): boolean {
  if (!password || !passwordSalt || !passwordHash) {
    return false;
  }

  try {
    const actual = scryptSync(password, passwordSalt, 64);
    const expected = Buffer.from(passwordHash, "hex");
    if (actual.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function buildAuthUserView(account: LocalAuthAccount, currentMember: OrganizationMember | null) {
  return {
    accountId: account.accountId,
    email: account.email,
    fullName: account.fullName,
    role: currentMember?.role ?? account.role,
    status: currentMember?.status ?? account.status,
    schoolId: account.schoolId,
    organizationId: currentMember?.organizationId ?? account.organizationId,
    lastLoginAtIso: account.lastLoginAtIso,
  };
}

function buildOnboardingCompletionSummary(schoolId: string) {
  const profile = buildOnboardingProfileView(schoolId);
  const account = getOnboardingAccountStateByScope({ schoolId });
  const { teams, team } = getPrimaryTeam(schoolId);
  return {
    completed: Boolean((account?.organization.onboardingCompletedAtIso || profile?.completedAtIso) && team?.name?.trim()),
    hasAccount: Boolean(account?.organization.organizationName && account?.primaryCoach.email),
    hasProfile: Boolean(profile),
    hasTeam: Boolean(team?.name?.trim()),
    teamCount: teams.length,
  };
}

function buildAuthSessionResponse(
  schoolId: string,
  account: LocalAuthAccount,
  currentMember: OrganizationMember | null,
  token?: string | null,
) {
  return {
    authenticated: true,
    token: token ?? null,
    user: buildAuthUserView(account, currentMember),
    currentMember,
    onboarding: buildOnboardingCompletionSummary(schoolId),
  };
}

function readAuthClaim(authContext: AuthContext | undefined, path: string): unknown {
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
  let current: unknown = authContext?.claims;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function buildSuggestedCoachIdentity(authContext: AuthContext | undefined): { coachName?: string; coachEmail?: string } | null {
  const coachEmail = sanitizeTextField(
    readAuthClaim(authContext, "email")
      ?? readAuthClaim(authContext, "user.email")
      ?? readAuthClaim(authContext, "preferred_username"),
    160,
  ).toLowerCase();

  const fullName = sanitizeTextField(
    readAuthClaim(authContext, "name")
      ?? [
        sanitizeTextField(readAuthClaim(authContext, "given_name"), 80),
        sanitizeTextField(readAuthClaim(authContext, "family_name"), 80),
      ].filter(Boolean).join(" ")
      ?? readAuthClaim(authContext, "user.name"),
    120,
  );

  if (!coachEmail && !fullName) {
    return null;
  }

  return {
    coachName: fullName || undefined,
    coachEmail: coachEmail || undefined,
  };
}

function resolveAuthSubject(authContext: AuthContext | undefined): string | undefined {
  const subject = sanitizeTextField(authContext?.subject, 120);
  return subject || undefined;
}

function resolveCurrentOrganizationMember(req: Request, schoolId: string): OrganizationMember | null {
  const authContext = (req as ScopedRequest).authContext;
  const subject = resolveAuthSubject(authContext);
  const email = sanitizeTextField(
    readAuthClaim(authContext, "email")
      ?? readAuthClaim(authContext, "user.email")
      ?? readAuthClaim(authContext, "preferred_username"),
    160,
  ).toLowerCase();
  const members = getOrganizationMembersByScope({ schoolId });
  return members.find((member) =>
    (subject && member.authSubject === subject)
    || (email && member.email === email)
  ) ?? null;
}

function activateKnownMemberForAccount(schoolId: string, account: LocalAuthAccount): OrganizationMember | null {
  const existing = getOrganizationMembersByScope({ schoolId }).find((member) =>
    member.authSubject === account.accountId
    || member.email === account.email
  ) ?? null;

  if (!existing) {
    return null;
  }

  return saveOrganizationMember({
    memberId: existing.memberId,
    organizationId: existing.organizationId,
    authSubject: account.accountId,
    fullName: account.fullName || existing.fullName,
    email: account.email,
    role: existing.role,
    status: "active",
    invitedAtIso: existing.invitedAtIso,
    joinedAtIso: existing.joinedAtIso || new Date().toISOString(),
  }, { schoolId });
}

function ensureAuthenticatedOrganizationMember(req: Request, schoolId: string): OrganizationMember | null {
  const authContext = (req as ScopedRequest).authContext;
  const subject = resolveAuthSubject(authContext);
  const suggested = buildSuggestedCoachIdentity(authContext);
  const email = sanitizeTextField(suggested?.coachEmail, 160).toLowerCase();
  if (!subject && !email) {
    return null;
  }

  const account = getOnboardingAccountStateByScope({ schoolId });
  if (!account) {
    return resolveCurrentOrganizationMember(req, schoolId);
  }

  const existing = resolveCurrentOrganizationMember(req, schoolId);
  if (existing?.status === "active" && existing.authSubject === subject) {
    return existing;
  }

  if (!existing) {
    return null;
  }

  return saveOrganizationMember({
    memberId: existing.memberId,
    organizationId: account.organization.organizationId,
    authSubject: subject,
    fullName: sanitizeTextField(suggested?.coachName ?? existing.fullName, 120),
    email: email || existing.email,
    role: existing.role,
    status: "active",
    invitedAtIso: existing.invitedAtIso,
    joinedAtIso: existing.joinedAtIso || new Date().toISOString(),
  }, { schoolId });
}

function ensureOwnerMembership(req: Request, schoolId: string, account: OnboardingAccountState): OrganizationMember {
  const payload = withSuggestedOnboardingIdentity(req, {});
  return saveOrganizationMember({
    organizationId: account.organization.organizationId,
    authSubject: resolveAuthSubject((req as ScopedRequest).authContext),
    fullName: sanitizeTextField(payload.coachName ?? account.primaryCoach.fullName, 120),
    email: sanitizeTextField(payload.coachEmail ?? account.primaryCoach.email, 160).toLowerCase(),
    role: "owner",
    status: "active",
    joinedAtIso: new Date().toISOString(),
  }, { schoolId });
}

function requireOrganizationOwner(req: Request, res: Response): OrganizationMember | null {
  const schoolId = getSchoolIdFromRequest(req);
  const currentMember = ensureAuthenticatedOrganizationMember(req, schoolId);
  if (!currentMember) {
    res.status(403).json({ error: "Organization membership required" });
    return null;
  }
  if (currentMember.role !== "owner") {
    res.status(403).json({ error: "Organization owner role required" });
    return null;
  }
  return currentMember;
}

function requireOrganizationManager(req: Request, res: Response): OrganizationMember | null {
  const schoolId = getSchoolIdFromRequest(req);
  const currentMember = ensureAuthenticatedOrganizationMember(req, schoolId);
  if (!currentMember) {
    res.status(403).json({ error: "Organization membership required" });
    return null;
  }

  if (currentMember.role === "player") {
    res.status(403).json({ error: "Organization manager role required" });
    return null;
  }

  return currentMember;
}

function normalizeMemberRole(value: unknown, fallback: OrganizationMember["role"] = "coach"): OrganizationMember["role"] {
  return value === "owner" || value === "coach" || value === "analyst" || value === "player"
    ? value
    : fallback;
}

function withSuggestedOnboardingIdentity(req: Request, payload: Record<string, unknown>): Record<string, unknown> {
  const authContext = (req as ScopedRequest).authContext;
  const suggested = buildSuggestedCoachIdentity(authContext);
  if (!suggested) {
    return payload;
  }

  return {
    ...payload,
    coachName: sanitizeTextField(payload.coachName, 120) || suggested.coachName,
    coachEmail: sanitizeTextField(payload.coachEmail, 160) || suggested.coachEmail,
  };
}

function buildOnboardingProfileView(schoolId: string): OrganizationProfile | null {
  const profile = getOrganizationProfileByScope({ schoolId });
  if (profile) {
    return profile;
  }

  const account = getOnboardingAccountStateByScope({ schoolId });
  if (!account) {
    return null;
  }

  return {
    schoolId,
    organizationName: account.organization.organizationName,
    organizationSlug: account.organization.organizationSlug,
    coachName: account.primaryCoach.fullName,
    coachEmail: account.primaryCoach.email,
    teamName: account.organization.teamName,
    season: account.organization.season,
    completedAtIso: account.organization.onboardingCompletedAtIso,
    createdAtIso: account.organization.createdAtIso,
    updatedAtIso: account.organization.updatedAtIso,
  };
}

function sanitizeFocusInsights(value: unknown): CoachAiSettings["focusInsights"] {
  if (!Array.isArray(value)) {
    return defaultTeamAiSettings().focusInsights;
  }

  const normalized = [...new Set(value
    .map((item) => String(item).trim().toLowerCase())
    .filter((item): item is CoachAiSettings["focusInsights"][number] => TEAM_AI_FOCUS_OPTIONS.has(item as CoachAiSettings["focusInsights"][number])))];

  return normalized.length > 0 ? normalized : defaultTeamAiSettings().focusInsights;
}

function extractTeamAiSettings(team?: RosterTeam | null): CoachAiSettings {
  const defaults = defaultTeamAiSettings();
  return {
    playingStyle: sanitizeTextField(team?.playingStyle, 500) || defaults.playingStyle,
    teamContext: sanitizeTextField(team?.teamContext, 1200) || defaults.teamContext,
    customPrompt: sanitizeTextField(team?.customPrompt, 1200) || defaults.customPrompt,
    focusInsights: sanitizeFocusInsights(team?.focusInsights)
  };
}

function buildPlayerId(teamId: string, playerName: string): string {
  const slug = normalizeNameKey(playerName).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${teamId}-${slug || Date.now().toString()}`;
}

function buildRosterPlayer(input: Record<string, unknown>, teamId: string, existingPlayer?: RosterPlayer): RosterPlayer | null {
  const name = normalizePersonName(input.name ?? existingPlayer?.name);
  if (!name) {
    return null;
  }

  return {
    id: existingPlayer?.id ?? buildPlayerId(teamId, name),
    number: sanitizeTextField(input.number ?? existingPlayer?.number, 8),
    name,
    position: sanitizeTextField(input.position ?? existingPlayer?.position, 24),
    height: sanitizeTextField(input.height ?? existingPlayer?.height, 32) || undefined,
    weight: sanitizeTextField(input.weight ?? existingPlayer?.weight, 32) || undefined,
    grade: sanitizeTextField(input.grade ?? existingPlayer?.grade, 16) || undefined,
    role: sanitizeTextField(input.role ?? existingPlayer?.role, 80) || undefined,
    notes: sanitizeTextField(input.notes ?? existingPlayer?.notes, 240) || undefined,
    email: sanitizeTextField(input.email ?? existingPlayer?.email, 200) || undefined,
    phone: sanitizeTextField(input.phone ?? existingPlayer?.phone, 30) || undefined,
  };
}

function persistSchoolTeams(schoolId: string, teams: RosterTeam[]): RosterTeam[] {
  const saved = saveRosterTeams(teams, { schoolId });
  io.to(schoolRoom(schoolId)).emit("roster:teams", saved);
  return saved;
}

function getPrimaryTeam(schoolId: string): { teams: RosterTeam[]; team: RosterTeam | null } {
  const teams = getRosterTeamsByScope({ schoolId });
  return { teams, team: teams[0] ?? null };
}

function upsertPrimaryTeam(schoolId: string, payload: Record<string, unknown>): RosterTeam[] {
  const { teams, team } = getPrimaryTeam(schoolId);
  const name = sanitizeTextField(payload.name ?? team?.name ?? "Team", 120) || "Team";
  const seededTeamId = sanitizeTextField(payload.teamId ?? payload.id, 80)
    || (buildOrganizationSlug(name) ? `team-${buildOrganizationSlug(name)}` : "");
  const nextTeam: RosterTeam = {
    id: team?.id ?? (seededTeamId || "primary-team"),
    schoolId,
    name,
    abbreviation: sanitizeTextField(payload.abbreviation ?? team?.abbreviation ?? buildTeamAbbreviation(name), 12) || buildTeamAbbreviation(name),
    season: sanitizeTextField(payload.season ?? team?.season, 40) || undefined,
    teamColor: normalizeTeamColor(payload.teamColor ?? team?.teamColor),
    coachStyle: sanitizeTextField(payload.coachStyle ?? team?.coachStyle, 500) || undefined,
    playingStyle: sanitizeTextField(payload.playingStyle ?? team?.playingStyle, 500) || undefined,
    teamContext: sanitizeTextField(payload.teamContext ?? team?.teamContext, 1200) || undefined,
    customPrompt: sanitizeTextField(payload.customPrompt ?? team?.customPrompt, 1200) || undefined,
    focusInsights: payload.focusInsights !== undefined ? sanitizeFocusInsights(payload.focusInsights) : team?.focusInsights,
    players: team?.players ?? []
  };

  return persistSchoolTeams(schoolId, [nextTeam, ...teams.slice(1)]);
}

function buildOrganizationProfilePayload(
  schoolId: string,
  payload: Record<string, unknown>,
  options?: { complete?: boolean },
): Partial<OrganizationProfile> {
  const organizationName = resolveSchoolName(payload);
  const coachName = resolveCoachName(payload);
  const coachEmail = resolveCoachEmail(payload);

  return {
    schoolId,
    organizationName,
    organizationSlug: buildOrganizationSlug(organizationName),
    coachName,
    coachEmail,
    teamName: sanitizeTextField(payload.teamName, 120) || undefined,
    season: sanitizeTextField(payload.season, 40) || undefined,
    completedAtIso: options?.complete ? new Date().toISOString() : undefined,
  };
}

function buildOnboardingAccountPayload(
  schoolId: string,
  payload: Record<string, unknown>,
  options?: { complete?: boolean },
): OnboardingAccountInput {
  const organizationName = resolveSchoolName(payload);
  const coachName = resolveCoachName(payload);
  const coachEmail = resolveCoachEmail(payload);

  return {
    organization: {
      schoolId,
      organizationName,
      organizationSlug: buildOrganizationSlug(organizationName),
      teamName: sanitizeTextField(payload.teamName, 120) || undefined,
      season: sanitizeTextField(payload.season, 40) || undefined,
      onboardingCompletedAtIso: options?.complete ? new Date().toISOString() : undefined,
    },
    primaryCoach: {
      schoolId,
      fullName: coachName,
      email: coachEmail,
      role: "owner",
      organizationId: "",
      accountId: "",
      createdAtIso: "",
      updatedAtIso: "",
    },
  };
}

function requireOnboardingIdentity(payload: Record<string, unknown>, res: Response): boolean {
  const organizationName = resolveSchoolName(payload);
  const coachName = resolveCoachName(payload);
  const coachEmail = resolveCoachEmail(payload);

  if (!organizationName || !coachName || !coachEmail) {
    res.status(400).json({ error: "schoolName, coachName, and coachEmail are required" });
    return false;
  }

  return true;
}

function findPlayerRecord(teams: RosterTeam[], playerName: string): { team: RosterTeam; player: RosterPlayer; playerIndex: number; teamIndex: number } | null {
  const targetKey = normalizeNameKey(playerName);
  for (const [teamIndex, team] of teams.entries()) {
    const playerIndex = team.players.findIndex((player) => normalizeNameKey(player.name) === targetKey);
    if (playerIndex >= 0) {
      return { team, player: team.players[playerIndex]!, playerIndex, teamIndex };
    }
  }

  return null;
}


// ---------------------------------------------------------------------------
// Optional API-key auth. Set BTA_API_KEY env var to enable.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Optional API-key auth. Set BTA_API_KEY env var to enable.
// ---------------------------------------------------------------------------
const API_KEY = process.env.BTA_API_KEY?.trim() || undefined;
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const DEFAULT_SCHOOL_ID = String(process.env.BTA_DEFAULT_SCHOOL_ID ?? "default").trim().toLowerCase() || "default";
const REQUIRE_TENANT = process.env.BTA_REQUIRE_TENANT !== "0";
const JWT_WRITE_REQUIRED = process.env.BTA_JWT_WRITE_REQUIRED !== "0";
const BILLING_PAYWALL_ENABLED = process.env.BTA_PAYWALL_ENABLED !== "0";
const BILLING_STRIPE_TEST_MODE = process.env.BTA_STRIPE_TEST_MODE !== "0";
const BILLING_STRIPE_SECRET_KEY = process.env.BTA_STRIPE_SECRET_KEY?.trim() || undefined;
const BILLING_STRIPE_WEBHOOK_SECRET = process.env.BTA_STRIPE_WEBHOOK_SECRET?.trim() || undefined;
const BILLING_STRIPE_PRICE_ID_MONTHLY = process.env.BTA_STRIPE_PRICE_ID_MONTHLY?.trim() || undefined;
const BILLING_STRIPE_PRICE_ID_YEARLY = process.env.BTA_STRIPE_PRICE_ID_YEARLY?.trim() || undefined;
const SECURITY_METRICS_PUSH_URL = process.env.BTA_SECURITY_METRICS_PUSH_URL?.trim();
const METRICS_PUSH_MIN_INTERVAL_MS = Number(process.env.BTA_SECURITY_METRICS_PUSH_INTERVAL_MS ?? 10000);

type SecurityMetricKey =
  | "requestTenantMismatch"
  | "socketTenantMismatch"
  | "missingTenantScope"
  | "unauthorizedHttp"
  | "unauthorizedSocket"
  | "forbiddenWriteRole";

const securityTelemetry: Record<SecurityMetricKey, number> = {
  requestTenantMismatch: 0,
  socketTenantMismatch: 0,
  missingTenantScope: 0,
  unauthorizedHttp: 0,
  unauthorizedSocket: 0,
  forbiddenWriteRole: 0
};

let metricsPushTimer: ReturnType<typeof setTimeout> | null = null;

function renderPrometheusSecurityMetrics(): string {
  return [
    "# HELP bta_security_request_tenant_mismatch_total Request tenant mismatch denials.",
    "# TYPE bta_security_request_tenant_mismatch_total counter",
    `bta_security_request_tenant_mismatch_total ${securityTelemetry.requestTenantMismatch}`,
    "# HELP bta_security_socket_tenant_mismatch_total Socket tenant mismatch denials.",
    "# TYPE bta_security_socket_tenant_mismatch_total counter",
    `bta_security_socket_tenant_mismatch_total ${securityTelemetry.socketTenantMismatch}`,
    "# HELP bta_security_missing_tenant_scope_total Missing tenant scope denials.",
    "# TYPE bta_security_missing_tenant_scope_total counter",
    `bta_security_missing_tenant_scope_total ${securityTelemetry.missingTenantScope}`,
    "# HELP bta_security_unauthorized_http_total Unauthorized HTTP attempts.",
    "# TYPE bta_security_unauthorized_http_total counter",
    `bta_security_unauthorized_http_total ${securityTelemetry.unauthorizedHttp}`,
    "# HELP bta_security_unauthorized_socket_total Unauthorized socket attempts.",
    "# TYPE bta_security_unauthorized_socket_total counter",
    `bta_security_unauthorized_socket_total ${securityTelemetry.unauthorizedSocket}`,
    "# HELP bta_security_forbidden_write_role_total Forbidden write role attempts.",
    "# TYPE bta_security_forbidden_write_role_total counter",
    `bta_security_forbidden_write_role_total ${securityTelemetry.forbiddenWriteRole}`,
    ""
  ].join("\n");
}

async function pushSecurityMetrics(): Promise<void> {
  if (!SECURITY_METRICS_PUSH_URL) {
    return;
  }

  try {
    await fetch(SECURITY_METRICS_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain; version=0.0.4" },
      body: renderPrometheusSecurityMetrics()
    });
  } catch (error) {
    console.warn("[realtime-api] Failed to push security metrics", error);
  }
}

function scheduleMetricsPush(): void {
  if (!SECURITY_METRICS_PUSH_URL || metricsPushTimer) {
    return;
  }

  const interval = Number.isFinite(METRICS_PUSH_MIN_INTERVAL_MS)
    ? Math.max(Math.floor(METRICS_PUSH_MIN_INTERVAL_MS), 1000)
    : 10000;

  metricsPushTimer = setTimeout(() => {
    metricsPushTimer = null;
    void pushSecurityMetrics();
  }, interval);
}

function trackSecurityEvent(event: SecurityMetricKey, details: Record<string, unknown>): void {
  securityTelemetry[event] += 1;
  scheduleMetricsPush();
  console.warn("[realtime-api] security", {
    event,
    ...details
  });
}

type AuthedRequest = Request & { authContext?: AuthContext };
type ScopedRequest = AuthedRequest & { tenantSchoolId?: string };

function resolveRequestSchoolId(
  req: Request,
  options?: { suppressMissingScopeTelemetry?: boolean }
): { schoolId?: string; error?: string; status?: number } {
  const scopedReq = req as ScopedRequest;
  if (scopedReq.tenantSchoolId) {
    return { schoolId: scopedReq.tenantSchoolId };
  }

  const result = resolveRequestTenant({
    authSchoolId: scopedReq.authContext?.schoolId,
    headerSchoolId: readHeaderValue(req.headers["x-school-id"]),
    querySchoolId: req.query.schoolId,
    requireTenant: REQUIRE_TENANT,
    defaultSchoolId: DEFAULT_SCHOOL_ID
  });

  if (result.error?.includes("mismatch")) {
    trackSecurityEvent("requestTenantMismatch", {
      authSchoolId: normalizeSchoolId(scopedReq.authContext?.schoolId),
      requestedSchoolId: normalizeSchoolId(readHeaderValue(req.headers["x-school-id"]) ?? req.query.schoolId),
      path: req.path,
      method: req.method
    });
  }

  if (result.error === "schoolId is required" && !options?.suppressMissingScopeTelemetry) {
    trackSecurityEvent("missingTenantScope", {
      path: req.path,
      method: req.method
    });
  }

  return result;
}

function resolveSocketSchoolId(socket: {
  handshake: { auth?: unknown; headers?: Record<string, unknown> };
  data?: { authContext?: AuthContext };
}): { schoolId?: string; error?: string } {
  const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
  const result = resolveSocketTenant({
    authSchoolId: socket.data?.authContext?.schoolId,
    handshakeSchoolId: auth.schoolId ?? readHeaderValue(socket.handshake.headers?.["x-school-id"]),
    requireTenant: REQUIRE_TENANT,
    defaultSchoolId: DEFAULT_SCHOOL_ID
  });

  if (result.error?.includes("mismatch")) {
    const authSchoolId = normalizeSchoolId(socket.data?.authContext?.schoolId);
    const requestedSchoolId = normalizeSchoolId(auth.schoolId ?? readHeaderValue(socket.handshake.headers?.["x-school-id"]));
    trackSecurityEvent("socketTenantMismatch", {
      authSchoolId,
      requestedSchoolId
    });
  }

  if (result.error === "schoolId is required") {
    trackSecurityEvent("missingTenantScope", { transport: "socket" });
  }

  return result;
}

function isPublicAuthBootstrapRequest(req: Request): boolean {
  return req.method === "POST"
    && (req.path.endsWith("/auth/register") || req.path.endsWith("/auth/login"));
}

function isOperatorBootstrapRequest(req: Request): boolean {
  return req.method === "GET" && /^\/operator-links\/[a-z0-9_-]+$/i.test(req.path);
}

function isOptionalTenantScopeRequest(req: Request): boolean {
  if (isPublicAuthBootstrapRequest(req) || isOperatorBootstrapRequest(req)) {
    return true;
  }

  if (req.method === "GET" && (req.path === "/auth/session" || req.path === "/onboarding/state")) {
    return true;
  }

  // Billing webhook and bootstrap checkout are server-to-server or public marketing flows.
  if (req.method === "POST" && (req.path === "/billing/webhook" || req.path === "/billing/bootstrap-checkout-session")) {
    return true;
  }

  return false;
}

function shouldSuppressMissingTenantTelemetry(req: Request): boolean {
  // Some clients probe roster config before account/school bootstrap completes.
  // Keep strict tenant enforcement (request still fails) but avoid noisy logs.
  if (req.method === "GET" && req.path === "/roster-teams") {
    return true;
  }
  // Billing entitlement is probed without full school scope during checkout flow.
  // Keep enforcement but suppress the telemetry noise.
  if (req.path === "/billing/entitlement") {
    return true;
  }
  return false;
}

function buildBootstrapSchoolSeed(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const raw = sanitizeTextField(candidate, 120);
    if (!raw) {
      continue;
    }

    const source = raw.includes("@") ? (raw.split("@")[0] ?? raw) : raw;
    const seed = normalizeSchoolId(buildOrganizationSlug(source));
    if (seed && seed !== DEFAULT_SCHOOL_ID) {
      return seed;
    }
  }

  return "";
}

function schoolScopeHasData(schoolId: string): boolean {
  return Boolean(
    getLocalAuthAccountsByScope({ schoolId }).length
    || getOnboardingAccountStateByScope({ schoolId })
    || getOrganizationProfileByScope({ schoolId })
    || getOrganizationMembersByScope({ schoolId }).length
    || getPrimaryTeam(schoolId).teams.length
  );
}

function allocateBootstrapSchoolId(seed: string): string {
  const base = normalizeSchoolId(seed) || `school-${randomBytes(3).toString("hex")}`;
  let candidate = base;
  let attempt = 1;

  while (schoolScopeHasData(candidate)) {
    const suffix = String(attempt);
    candidate = `${base.slice(0, Math.max(1, 64 - suffix.length - 1))}-${suffix}`;
    attempt += 1;
  }

  return candidate;
}

function resolveAuthSchoolId(
  req: Request,
  payload: Record<string, unknown>,
  email: string,
): { schoolId?: string; error?: string; status?: number } {
  const resolved = resolveRequestSchoolId(req, { suppressMissingScopeTelemetry: true });
  if (resolved.schoolId) {
    return { schoolId: resolved.schoolId };
  }

  if (!isPublicAuthBootstrapRequest(req)) {
    return resolved;
  }

  const matches = getLocalAuthAccountsByEmailAcrossSchools(email);
  if (req.path.endsWith("/auth/login")) {
    if (matches.length === 1) {
      return { schoolId: matches[0]?.schoolId };
    }
    if (matches.length > 1) {
      return {
        status: 409,
        error: "Multiple workspaces match this email. Reopen your school link or include schoolId.",
      };
    }
    return { status: 401, error: "Invalid email or password" };
  }

  if (matches.length > 0) {
    return { status: 409, error: "An account with that email already exists. Sign in instead." };
  }

  return {
    schoolId: allocateBootstrapSchoolId(buildBootstrapSchoolSeed(
      payload.schoolId,
      payload.schoolName,
      payload.organizationName,
      payload.teamName,
      email,
    ))
  };
}

function getSchoolIdFromRequest(req: Request): string {
  const resolved = resolveRequestSchoolId(req);
  if (!resolved.schoolId) {
    throw new Error(resolved.error ?? "schoolId is required");
  }
  return resolved.schoolId;
}

function getSchoolIdFromSocket(socket: {
  handshake: { auth?: unknown; headers?: Record<string, unknown> };
  data?: { authContext?: AuthContext };
}): string | null {
  const resolved = resolveSocketSchoolId(socket);
  return resolved.schoolId ?? null;
}

function schoolRoom(schoolId: string): string {
  return `school:${schoolId}`;
}

function gameRoom(schoolId: string, gameId: string): string {
  return `school:${schoolId}:game:${gameId}`;
}

function deviceRoom(schoolId: string, deviceId: string): string {
  return `school:${schoolId}:device:${deviceId}`;
}

function connectionRoom(schoolId: string, connectionId: string): string {
  return `school:${schoolId}:connection:${connectionId}`;
}

function hasValidApiKeyRequest(req: Request): boolean {
  const provided = req.headers["x-api-key"] ?? req.query.apiKey;
  const candidate = Array.isArray(provided) ? provided[0] : provided;
  return Boolean(API_KEY && candidate === API_KEY);
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

  if (!API_KEY && !isJwtAuthEnabled()) {
    next();
    return;
  }

  if (hasValidApiKeyRequest(req)) {
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
  if (!isJwtAuthEnabled()) {
    next();
    return;
  }

  if (hasValidApiKeyRequest(req)) {
    next();
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
  isJwtAuthEnabled,
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
  databaseUrl: DATABASE_URL,
  apiKey: API_KEY,
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
  console.warn("[realtime-api] WARNING: BTA_API_KEY not set. Event ingest endpoints are open to anyone.");
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

  return new Promise<number>((resolve) => {
    httpServer.listen(port, host, () => {
      serverStarted = true;
      const addr = httpServer.address();
      const boundPort = (typeof addr === "object" && addr !== null)
        ? (addr as { port: number }).port
        : port;
      logger.info("startup.server_listening", { port: boundPort, host });
      logger.info("startup.api_key_auth", { enabled: Boolean(API_KEY) });
      logger.info("startup.persistence_backend", { backend: DATABASE_URL ? "postgresql" : "file_snapshot" });
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
