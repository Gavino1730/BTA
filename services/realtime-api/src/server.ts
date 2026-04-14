import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
import { registerAdminRoutes, registerHealthRoute } from "./routes/system-routes.js";
import { registerSocketAuth } from "./sockets/socket-auth.js";
import { registerRealtimeConnectionHandlers } from "./sockets/realtime-connection.js";

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


const seasonAnalysisBySchool = new Map<string, { generated_at: string; season_summary: string; per_game_analysis: unknown[] }>();
const playerAnalysisCacheBySchool = new Map<string, Map<string, unknown>>();

function roundStat(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function resolveGameResult(vcScore: number, oppScore: number): "W" | "L" | "T" {
  if (vcScore > oppScore) {
    return "W";
  }
  if (vcScore < oppScore) {
    return "L";
  }
  return "T";
}

function getRosterPlayerByIdForSchool(schoolId: string): Map<string, { name: string; number?: string }> {
  const map = new Map<string, { name: string; number?: string }>();
  for (const team of getRosterTeamsByScope({ schoolId })) {
    for (const player of team.players) {
      map.set(player.id, { name: player.name, number: player.number });
    }
  }
  return map;
}

function buildDefaultGamePlayerStats(schoolId: string, gameId: string): Array<Record<string, unknown>> {
  const state = getGameState(gameId, { schoolId });
  if (!state) {
    return [];
  }

  const rosterTeamIds = new Set(getRosterTeamsByScope({ schoolId }).map((team) => team.id));
  const ourTeamId = getOurTeamId(state, rosterTeamIds);
  const playerStatsByTeam = state.playerStatsByTeam[ourTeamId] ?? {};
  const rosterPlayerById = getRosterPlayerByIdForSchool(schoolId);
  const threePointByPlayer = new Map<string, { made: number; attempts: number }>();

  for (const event of getGameEvents(gameId, { schoolId })) {
    if (event.type !== "shot_attempt" || event.teamId !== ourTeamId || event.points !== 3) {
      continue;
    }

    const current = threePointByPlayer.get(event.playerId) ?? { made: 0, attempts: 0 };
    current.attempts += 1;
    if (event.made) {
      current.made += 1;
    }
    threePointByPlayer.set(event.playerId, current);
  }

  return Object.values(playerStatsByTeam).map((stats) => {
    const rosterInfo = rosterPlayerById.get(stats.playerId);
    const threePoint = threePointByPlayer.get(stats.playerId) ?? { made: 0, attempts: 0 };
    const firstName = (rosterInfo?.name ?? stats.playerId).split(" ")[0] ?? (rosterInfo?.name ?? stats.playerId);
    return {
      name: rosterInfo?.name ?? stats.playerId,
      first_name: firstName,
      number: rosterInfo?.number ?? "",
      fg_made: stats.fgMade,
      fg_att: stats.fgAttempts,
      fg3_made: threePoint.made,
      fg3_att: threePoint.attempts,
      ft_made: stats.ftMade,
      ft_att: stats.ftAttempts,
      oreb: stats.reboundsOff,
      dreb: stats.reboundsDef,
      asst: stats.assists,
      stl: stats.steals,
      blk: stats.blocks,
      to: stats.turnovers,
      fouls: stats.fouls,
      plus_minus: 0,
      pts: stats.points
    };
  });
}

function buildGamesPayload(schoolId: string): Array<Record<string, unknown>> {
  const overrides = getGameOverrideMap(schoolId);
  const rosterPlayerById = getRosterPlayerByIdForSchool(schoolId);
  return getSeasonGames({ schoolId }).map((game) => {
    const base = {
      gameId: game.gameId,
      date: game.date,
      opponent: game.opponent,
      location: game.location,
      vc_score: game.vc_score,
      opp_score: game.opp_score,
      result: game.result,
      team_stats: game.team_stats,
      player_stats: buildDefaultGamePlayerStats(schoolId, game.gameId)
    };

    const override = overrides.get(game.gameId);
    if (!override) {
      return base;
    }

    // Normalize override player_stats to canonical field names
    const rawStats = override.player_stats as Array<Record<string, unknown>> | undefined;
    const normalizedPlayerStats = rawStats?.map((p) => {
      const rosterInfo = p.playerId ? rosterPlayerById.get(String(p.playerId)) : undefined;
      const fgMade = Number(p.fg_made ?? p.fg ?? 0);
      const fgAtt = Number(p.fg_att ?? p.fga ?? 0);
      const fg3Made = Number(p.fg3_made ?? p.fg3 ?? 0);
      const fg3Att = Number(p.fg3_att ?? p.fg3a ?? 0);
      const ftMade = Number(p.ft_made ?? p.ft ?? 0);
      const ftAtt = Number(p.ft_att ?? p.fta ?? 0);
      const oreb = Number(p.oreb ?? 0);
      const dreb = Number(p.dreb ?? 0);
      const nameStr = String(p.name ?? rosterInfo?.name ?? p.playerId ?? "Unknown");
      const firstName = nameStr.split(" ")[0] ?? nameStr;
      return {
        playerId: p.playerId ?? undefined,
        name: nameStr,
        first_name: firstName,
        number: p.number ?? rosterInfo?.number ?? "",
        fg_made: fgMade,
        fg_att: fgAtt,
        fg3_made: fg3Made,
        fg3_att: fg3Att,
        ft_made: ftMade,
        ft_att: ftAtt,
        oreb,
        dreb,
        asst: Number(p.asst ?? p.ast ?? 0),
        stl: Number(p.stl ?? 0),
        blk: Number(p.blk ?? 0),
        to: Number(p.to ?? 0),
        fouls: Number(p.fouls ?? p.pf ?? 0),
        plus_minus: Number(p.plus_minus ?? 0),
        pts: Number(p.pts ?? (fgMade - fg3Made) * 2 + fg3Made * 3 + ftMade),
      };
    });

    return {
      ...base,
      ...override,
      ...(normalizedPlayerStats ? { player_stats: normalizedPlayerStats } : {}),
    };
  });
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function getSchoolAnalyticsContext(schoolId: string) {
  const teams = getRosterTeamsByScope({ schoolId });
  const teamIds = new Set(teams.map((team) => team.id));
  const seasonGames = getSeasonGames({ schoolId })
    .slice()
    .sort((left, right) => {
      const leftNumeric = Number(left.gameId);
      const rightNumeric = Number(right.gameId);
      const leftIsNumeric = Number.isFinite(leftNumeric);
      const rightIsNumeric = Number.isFinite(rightNumeric);

      if (leftIsNumeric && rightIsNumeric) {
        return leftNumeric - rightNumeric;
      }

      return left.gameId.localeCompare(right.gameId);
    });
  const playerIdsByName = new Map<string, string[]>();

  for (const team of teams) {
    for (const player of team.players) {
      const key = normalizeNameKey(player.name);
      const ids = playerIdsByName.get(key) ?? [];
      ids.push(player.id);
      playerIdsByName.set(key, ids);
    }
  }

  return { teams, teamIds, seasonGames, playerIdsByName };
}

function getOurTeamId(state: NonNullable<ReturnType<typeof getGameState>>, teamIds: Set<string>): string {
  if (teamIds.has(state.homeTeamId)) {
    return state.homeTeamId;
  }

  if (teamIds.has(state.awayTeamId)) {
    return state.awayTeamId;
  }

  return state.homeTeamId;
}

function buildLeaderboardsPayload(schoolId: string) {
  const players = getSeasonPlayers({ schoolId }).map((player) => ({
    ...player,
    first_name: player.first_name || player.name.split(" ")[0] || "Unknown"
  }));

  return {
    pts: [...players].sort((left, right) => right.pts - left.pts).slice(0, 10),
    reb: [...players].sort((left, right) => right.reb - left.reb).slice(0, 10),
    asst: [...players].sort((left, right) => right.asst - left.asst).slice(0, 10),
    fg_pct: players.filter((player) => player.fga > 0).sort((left, right) => right.fg_pct - left.fg_pct).slice(0, 10),
    fg3_pct: players.filter((player) => player.fg3a > 0).sort((left, right) => right.fg3_pct - left.fg3_pct).slice(0, 10),
    ft_pct: players.filter((player) => player.fta > 0).sort((left, right) => right.ft_pct - left.ft_pct).slice(0, 10),
    stl: [...players].sort((left, right) => right.stl - left.stl).slice(0, 10),
    blk: [...players].sort((left, right) => right.blk - left.blk).slice(0, 10)
  };
}

function buildTeamTrendsPayload(schoolId: string) {
  const { seasonGames } = getSchoolAnalyticsContext(schoolId);
  return {
    games: seasonGames.map((game) => game.gameId),
    opponents: seasonGames.map((game) => game.opponent),
    dates: seasonGames.map((game) => game.date),
    vc_score: seasonGames.map((game) => game.vc_score),
    opp_score: seasonGames.map((game) => game.opp_score),
    fg_pct: seasonGames.map((game) => roundStat((game.team_stats.fga > 0 ? (game.team_stats.fg / game.team_stats.fga) * 100 : 0), 1)),
    fg3_pct: seasonGames.map((game) => roundStat((game.team_stats.fg3a > 0 ? (game.team_stats.fg3 / game.team_stats.fg3a) * 100 : 0), 1)),
    asst: seasonGames.map((game) => game.team_stats.asst),
    to: seasonGames.map((game) => game.team_stats.to),
    reb: seasonGames.map((game) => game.team_stats.reb),
    oreb: seasonGames.map((game) => game.team_stats.oreb),
    dreb: seasonGames.map((game) => game.team_stats.dreb),
    stl: seasonGames.map((game) => game.team_stats.stl),
    blk: seasonGames.map((game) => game.team_stats.blk),
    ft: seasonGames.map((game) => game.team_stats.ft),
    fta: seasonGames.map((game) => game.team_stats.fta)
  };
}

function buildTeamAdvancedPayload(schoolId: string) {
  const seasonStats = getSeasonTeamStats({ schoolId });
  const gamesPlayed = Math.max(seasonStats.win + seasonStats.loss, 1);
  const totalPoints = seasonStats.ppg * gamesPlayed;
  const possessions = Math.max(seasonStats.fga - seasonStats.oreb + seasonStats.to + (0.44 * seasonStats.fta), 1);
  const efgPct = seasonStats.fga > 0 ? ((seasonStats.fg + 0.5 * seasonStats.fg3) / seasonStats.fga) * 100 : 0;
  const tsPct = (seasonStats.fga > 0 || seasonStats.fta > 0)
    ? (totalPoints / (2 * Math.max(seasonStats.fga + (0.44 * seasonStats.fta), 1))) * 100
    : 0;

  return {
    scoring_efficiency: {
      efg_pct: roundStat(efgPct, 1),
      ts_pct: roundStat(tsPct, 1),
      ppp: roundStat(totalPoints / possessions, 2)
    },
    ball_movement: {
      assisted_scoring_rate: roundStat(seasonStats.fg > 0 ? (seasonStats.asst / seasonStats.fg) * 100 : 0, 1)
    }
  };
}

function buildPlayerAdvancedPayload(schoolId: string, playerName: string) {
  const targetKey = normalizeNameKey(playerName);
  const player = getSeasonPlayers({ schoolId }).find((entry) => normalizeNameKey(entry.name) === targetKey || normalizeNameKey(entry.full_name) === targetKey);
  if (!player) {
    return null;
  }

  const efgPct = player.fga > 0 ? ((player.fg + 0.5 * player.fg3) / player.fga) * 100 : 0;
  const tsPct = (player.fga > 0 || player.fta > 0)
    ? (player.pts / (2 * Math.max(player.fga + (0.44 * player.fta), 1))) * 100
    : 0;
  const pointsPerShot = player.fga > 0 ? player.pts / player.fga : 0;
  const totalUsage = Math.max(player.fga + player.fta + player.to, 1);
  const seasonTotals = getSeasonTeamStats({ schoolId });
  const gamesPlayed = Math.max(seasonTotals.win + seasonTotals.loss, 1);
  const totalTeamPoints = seasonTotals.ppg * gamesPlayed;
  const totalTeamShots = Math.max(seasonTotals.fga + seasonTotals.fta + seasonTotals.to, 1);
  const per = roundStat((player.ppg * 1.5) + (player.rpg * 1.2) + (player.apg * 1.5) + (player.spg * 2) + (player.bpg * 2) - player.tpg, 1);
  const usageProxy = roundStat((totalUsage / totalTeamShots) * 100, 1);
  const scoringShare = roundStat(totalTeamPoints > 0 ? (player.pts / totalTeamPoints) * 100 : 0, 1);
  const shotVolumeShare = roundStat(seasonTotals.fga > 0 ? (player.fga / seasonTotals.fga) * 100 : 0, 1);
  const toRate = roundStat(totalUsage > 0 ? (player.to / totalUsage) * 100 : 0, 1);
  const astToRatio = roundStat(player.to > 0 ? player.asst / player.to : player.asst, 1);
  const reboundShare = roundStat(seasonTotals.reb > 0 ? (player.reb / seasonTotals.reb) * 100 : 0, 1);
  const defensiveRating = roundStat(100 - (player.spg * 6) - (player.bpg * 5) + (player.fpg * 2), 1);
  const efficiencyGrade = per >= 20 ? "A" : per >= 15 ? "B" : per >= 10 ? "C" : "D";

  return {
    scoring_efficiency: {
      per,
      efg_pct: roundStat(efgPct, 1),
      ts_pct: roundStat(tsPct, 1),
      pts_per_shot: roundStat(pointsPerShot, 2),
      fg2_pct: roundStat((player.fga - player.fg3a) > 0 ? ((player.fg - player.fg3) / Math.max(player.fga - player.fg3a, 1)) * 100 : 0, 1),
      fg3_pct: roundStat(player.fg3_pct, 1)
    },
    usage_role: {
      role: usageProxy >= 22 ? "Primary option" : usageProxy >= 14 ? "Secondary option" : "Role player",
      usage_proxy: usageProxy,
      scoring_share: scoringShare,
      shot_volume_share: shotVolumeShare,
      to_rate: toRate
    },
    ball_handling: {
      apg: roundStat(player.apg, 1),
      tpg: roundStat(player.tpg, 1),
      ast_to_ratio: astToRatio,
      total_assists: player.asst,
      total_turnovers: player.to
    },
    rebounding: {
      rpg: roundStat(player.rpg, 1),
      oreb: player.oreb,
      dreb: player.dreb,
      reb_share: reboundShare
    },
    defense_activity: {
      spg: roundStat(player.spg, 1),
      bpg: roundStat(player.bpg, 1),
      defensive_rating: defensiveRating,
      deflections_per_game: roundStat(player.spg + player.bpg, 1)
    },
    discipline: {
      fouls_per_game: roundStat(player.fpg, 1),
      foul_rate: roundStat(player.games > 0 ? player.fouls / player.games : 0, 1)
    },
    consistency: {
      games_played: player.games,
      scoring_baseline: roundStat(player.ppg, 1)
    },
    clutch_performance: {
      clutch_score: roundStat(player.ppg + player.apg - player.tpg, 1)
    },
    impact: {
      total_points: player.pts,
      total_rebounds: player.reb,
      total_assists: player.asst,
      efficiency_grade: efficiencyGrade
    }
  };
}

function buildPlayerTrendsPayload(schoolId: string, playerName: string) {
  const { teamIds, seasonGames, playerIdsByName } = getSchoolAnalyticsContext(schoolId);
  const playerIds = playerIdsByName.get(normalizeNameKey(playerName)) ?? [];
  const trendRows = seasonGames.map((game) => {
    const state = getGameState(game.gameId, { schoolId });
    if (!state) {
      return null;
    }

    const ourTeamId = getOurTeamId(state, teamIds);
    const teamStats = state.playerStatsByTeam[ourTeamId] ?? {};
    const combined = playerIds.reduce((acc, playerId) => {
      const stats = teamStats[playerId];
      if (!stats) {
        return acc;
      }

      acc.points += stats.points;
      acc.fgMade += stats.fgMade;
      acc.fgAttempts += stats.fgAttempts;
      acc.fg3Made += Math.max(0, Math.min(stats.fgMade, stats.points >= 3 ? stats.points / 3 : 0));
      acc.assists += stats.assists;
      acc.rebounds += stats.reboundsOff + stats.reboundsDef;
      acc.steals += stats.steals;
      acc.turnovers += stats.turnovers;
      acc.fouls += stats.fouls;
      return acc;
    }, {
      points: 0,
      fgMade: 0,
      fgAttempts: 0,
      fg3Made: 0,
      assists: 0,
      rebounds: 0,
      steals: 0,
      turnovers: 0,
      fouls: 0
    });

    return {
      gameId: game.gameId,
      opponent: game.opponent,
      date: game.date,
      stats: combined
    };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    games: trendRows.map((row) => row.gameId),
    opponents: trendRows.map((row) => row.opponent),
    dates: trendRows.map((row) => row.date),
    pts: trendRows.map((row) => row.stats.points),
    fg: trendRows.map((row) => row.stats.fgMade),
    fg_att: trendRows.map((row) => row.stats.fgAttempts),
    fg3: trendRows.map((row) => row.stats.fg3Made),
    asst: trendRows.map((row) => row.stats.assists),
    reb: trendRows.map((row) => row.stats.rebounds),
    stl: trendRows.map((row) => row.stats.steals),
    plus_minus: trendRows.map(() => 0),
    to: trendRows.map((row) => row.stats.turnovers),
    fouls: trendRows.map((row) => row.stats.fouls)
  };
}

function buildPlayerComparisonPayload(schoolId: string, playerNames: string[]) {
  const players = playerNames
    .map((playerName) => {
      const player = getSeasonPlayers({ schoolId }).find((entry) => normalizeNameKey(entry.name) === normalizeNameKey(playerName) || normalizeNameKey(entry.full_name) === normalizeNameKey(playerName));
      const advanced = buildPlayerAdvancedPayload(schoolId, playerName);
      if (!player || !advanced) {
        return null;
      }

      const efficiencyGrade = advanced.impact.efficiency_grade;
      return {
        name: player.full_name,
        basic_stats: {
          ppg: player.ppg,
          rpg: player.rpg,
          apg: player.apg,
          tpg: player.tpg,
          fg_pct: player.fg_pct,
          fg3_pct: player.fg3_pct,
          ft_pct: player.ft_pct,
          spg: player.spg,
          bpg: player.bpg
        },
        role: advanced.usage_role.role,
        efficiency_grade: efficiencyGrade
      };
    })
    .filter((player): player is NonNullable<typeof player> => Boolean(player));

  return { players };
}

function buildVolatilityPayload(schoolId: string) {
  const trends = buildTeamTrendsPayload(schoolId);
  return {
    team_volatility: {
      ppg_range: roundStat((Math.max(...trends.vc_score, 0) - Math.min(...trends.vc_score, 0)), 1),
      fg_pct_std_dev: roundStat(standardDeviation(trends.fg_pct), 1),
      to_std_dev: roundStat(standardDeviation(trends.to), 1)
    }
  };
}

function buildComprehensiveInsightsPayload(schoolId: string) {
  const seasonStats = getSeasonTeamStats({ schoolId });
  const trends = buildTeamTrendsPayload(schoolId);
  const recentScores = trends.vc_score.slice(-5);
  const earlyScores = trends.vc_score.slice(0, Math.min(5, trends.vc_score.length));
  const recentAllowed = trends.opp_score.slice(-5);
  const earlyAllowed = trends.opp_score.slice(0, Math.min(5, trends.opp_score.length));
  const recentWins = trends.vc_score.slice(-5).filter((score, index) => score > (trends.opp_score.slice(-5)[index] ?? 0)).length;
  const recentLosses = Math.max(Math.min(5, trends.games.length) - recentWins, 0);
  const recentAvgScore = average(recentScores);
  const recentAvgAllowed = average(recentAllowed);
  const earlyAvgScore = average(earlyScores);
  const earlyAvgAllowed = average(earlyAllowed);
  const players = getSeasonPlayers({ schoolId }).slice(0, 12);

  return {
    team_trends: {
      recent_performance: {
        record: `${recentWins}-${recentLosses}`,
        avg_score: roundStat(recentAvgScore, 1),
        point_differential: roundStat(recentAvgScore - recentAvgAllowed, 1),
        trend: recentAvgScore >= earlyAvgScore ? "up" : "down"
      },
      scoring_trends: {
        recent_avg: roundStat(recentAvgScore, 1),
        early_avg: roundStat(earlyAvgScore, 1),
        improvement: roundStat(recentAvgScore - earlyAvgScore, 1),
        trend: recentAvgScore >= earlyAvgScore ? "improving" : "declining"
      },
      defensive_trends: {
        recent_avg_allowed: roundStat(recentAvgAllowed, 1),
        early_avg_allowed: roundStat(earlyAvgAllowed, 1),
        improvement: roundStat(earlyAvgAllowed - recentAvgAllowed, 1),
        trend: recentAvgAllowed <= earlyAvgAllowed ? "improving" : "declining"
      }
    },
    key_metrics: {
      win_pct: roundStat((seasonStats.win + seasonStats.loss) > 0 ? (seasonStats.win / (seasonStats.win + seasonStats.loss)) * 100 : 0, 1),
      fg_pct: roundStat(seasonStats.fg_pct, 1),
      fg3_pct: roundStat(seasonStats.fg3_pct, 1),
      apg: roundStat(seasonStats.apg, 1),
      tpg: roundStat(seasonStats.to_avg, 1)
    },
    recommendations: [
      {
        category: "Ball Security",
        priority: seasonStats.to_avg >= 12 ? "High" : "Medium",
        recommendation: seasonStats.to_avg >= 12 ? "Reduce live-ball turnovers to stabilize offensive efficiency." : "Keep turnover discipline steady to preserve scoring margin.",
        reason: `Season turnover average is ${roundStat(seasonStats.to_avg, 1)} per game.`
      },
      {
        category: "Shot Quality",
        priority: seasonStats.fg3_pct >= 34 ? "Medium" : "High",
        recommendation: seasonStats.fg3_pct >= 34 ? "Maintain current 3-point volume while protecting paint touches." : "Prioritize rim and paint creation until perimeter efficiency improves.",
        reason: `Season 3-point percentage is ${roundStat(seasonStats.fg3_pct, 1)}%.`
      }
    ],
    player_insights: players.map((player) => {
      const advanced = buildPlayerAdvancedPayload(schoolId, player.full_name);
      return {
        name: player.full_name,
        role: advanced?.usage_role.role ?? "Role player",
        strengths: [
          player.ppg >= 10 ? "Reliable scoring" : "Low-mistake offense",
          player.apg >= 3 ? "Playmaking" : "Lineup stability",
          player.fg_pct >= 45 ? "Efficient finishing" : "Shot selection discipline"
        ],
        areas_for_improvement: [
          player.tpg >= 2 ? "Turnover control" : "Create more rim pressure",
          player.ft_pct < 70 ? "Free-throw consistency" : "Increase assertiveness"
        ],
        efficiency_grade: advanced?.impact.efficiency_grade ?? "C"
      };
    })
  };
}

function buildTeamSummaryText(schoolId: string): string {
  const season = getSeasonTeamStats({ schoolId });
  const games = buildGamesPayload(schoolId);
  const lastGame = games[games.length - 1] as Record<string, unknown> | undefined;
  const recentRecord = games.slice(-5).reduce<{ wins: number; losses: number }>((acc, game) => {
    const result = String((game as Record<string, unknown>).result ?? "");
    if (result === "W") acc.wins += 1;
    if (result === "L") acc.losses += 1;
    return acc;
  }, { wins: 0, losses: 0 });

  return [
    `Season record: ${season.win}-${season.loss}.`,
    `Scoring profile: ${roundStat(season.ppg, 1)} PPG for, ${roundStat(season.opp_ppg, 1)} allowed.`,
    `Efficiency: FG ${roundStat(season.fg_pct, 1)}%, 3PT ${roundStat(season.fg3_pct, 1)}%, FT ${roundStat(season.ft_pct, 1)}%.`,
    `Ball security: ${roundStat(season.to_avg, 1)} turnovers per game.`,
    `Recent form (last 5): ${recentRecord.wins}-${recentRecord.losses}.`,
    lastGame
      ? `Most recent game: ${String(lastGame.opponent ?? "Opponent")} ${String(lastGame.result ?? "")} ${Number(lastGame.vc_score ?? 0)}-${Number(lastGame.opp_score ?? 0)}.`
      : "No games logged yet."
  ].join(" ");
}

function buildGameAnalysisText(schoolId: string, gameId: string): string | null {
  const game = buildGamesPayload(schoolId).find((entry) => String(entry.gameId) === String(gameId)) as Record<string, unknown> | undefined;
  if (!game) {
    return null;
  }

  const teamStats = (game.team_stats as Record<string, unknown> | undefined) ?? {};
  const fgPct = roundStat(Number(teamStats.fga ?? 0) > 0 ? (Number(teamStats.fg ?? 0) / Number(teamStats.fga ?? 1)) * 100 : 0, 1);
  const fg3Pct = roundStat(Number(teamStats.fg3a ?? 0) > 0 ? (Number(teamStats.fg3 ?? 0) / Number(teamStats.fg3a ?? 1)) * 100 : 0, 1);
  const astTo = roundStat(Number(teamStats.to ?? 0) > 0 ? Number(teamStats.asst ?? 0) / Number(teamStats.to ?? 1) : Number(teamStats.asst ?? 0), 2);

  return [
    `${String(game.opponent ?? "Opponent")} result: ${String(game.result ?? "")} ${Number(game.vc_score ?? 0)}-${Number(game.opp_score ?? 0)}.`,
    `Shooting: ${Number(teamStats.fg ?? 0)}-${Number(teamStats.fga ?? 0)} FG (${fgPct}%), ${Number(teamStats.fg3 ?? 0)}-${Number(teamStats.fg3a ?? 0)} from 3 (${fg3Pct}%).`,
    `Possession metrics: ${Number(teamStats.asst ?? 0)} assists, ${Number(teamStats.to ?? 0)} turnovers, AST/TO ${astTo}.`,
    `Rebounding: ${Number(teamStats.oreb ?? 0)} offensive, ${Number(teamStats.dreb ?? 0)} defensive.`
  ].join(" ");
}

function buildPlayerInsightsText(schoolId: string, playerName: string): string | null {
  const player = getSeasonPlayers({ schoolId }).find((entry) => normalizeNameKey(entry.full_name) === normalizeNameKey(playerName) || normalizeNameKey(entry.name) === normalizeNameKey(playerName));
  if (!player) {
    return null;
  }

  const strengths: string[] = [];
  if (player.ppg >= 12) strengths.push("reliable scoring load");
  if (player.apg >= 3) strengths.push("secondary playmaking");
  if (player.fg_pct >= 45) strengths.push("efficient finishing");
  if (player.fg3_pct >= 33) strengths.push("credible perimeter threat");
  if (strengths.length === 0) strengths.push("steady two-way minutes");

  const focus: string[] = [];
  if (player.tpg >= 2) focus.push("reduce live-ball turnovers");
  if (player.fpg >= 2.5) focus.push("manage foul exposure");
  if (player.ft_pct < 70) focus.push("improve free-throw conversion");
  if (focus.length === 0) focus.push("expand usage in organized sets");

  return [
    `${player.full_name}: ${roundStat(player.ppg, 1)} PPG, ${roundStat(player.rpg, 1)} RPG, ${roundStat(player.apg, 1)} APG.`,
    `Efficiency: FG ${roundStat(player.fg_pct, 1)}%, 3PT ${roundStat(player.fg3_pct, 1)}%, FT ${roundStat(player.ft_pct, 1)}%.`,
    `Current strengths: ${strengths.join(", ")}.`,
    `Coaching focus: ${focus.join(", ")}.`
  ].join(" ");
}

function buildSeasonAnalysisPayload(schoolId: string, force = false): { generated_at: string; season_summary: string; per_game_analysis: unknown[] } {
  if (!force) {
    const cached = seasonAnalysisBySchool.get(schoolId);
    if (cached) return cached;
  }

  const games = buildGamesPayload(schoolId);
  const seasonStats = getSeasonTeamStats({ schoolId });
  const seasonPlayers = getSeasonPlayers({ schoolId });

  const perGameAnalysis = games.map((game) => {
    const ts = game.team_stats as { fg: number; fga: number; fg3: number; fg3a: number; ft: number; fta: number; asst: number; to: number; stl: number; reb: number };
    const playerStats = (game.player_stats ?? []) as Array<{ name: string; fg_made: number; fg_att: number; fg3_made: number; fg3_att: number; ft_made: number; ft_att: number; oreb: number; dreb: number; asst: number; pts: number }>;
    const fgPct = ts.fga > 0 ? (ts.fg / ts.fga) * 100 : 0;
    const fg3Pct = ts.fg3a > 0 ? (ts.fg3 / ts.fg3a) * 100 : 0;
    const ftPct = ts.fta > 0 ? (ts.ft / ts.fta) * 100 : 0;

    const sorted = [...playerStats].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));
    const playerPerfs = sorted.map((p, idx) => {
      const seasonPpg = seasonPlayers.find((sp) => normalizeNameKey(sp.name) === normalizeNameKey(p.name))?.ppg ?? 0;
      const diff = (p.pts ?? 0) - seasonPpg;
      const fgMade = p.fg_made ?? 0;
      const fgAtt = p.fg_att ?? 0;
      const fg3Made = p.fg3_made ?? 0;
      const fg3Att = p.fg3_att ?? 0;
      const ftMade = p.ft_made ?? 0;
      const ftAtt = p.ft_att ?? 0;
      return {
        rank: idx + 1,
        name: p.name,
        pts: p.pts ?? 0,
        fg: `${fgMade}/${fgAtt}`,
        fg_pct: fgAtt > 0 ? (fgMade / fgAtt) * 100 : 0,
        fg3: `${fg3Made}/${fg3Att}`,
        fg3_pct: fg3Att > 0 ? (fg3Made / fg3Att) * 100 : 0,
        ft: `${ftMade}/${ftAtt}`,
        ft_pct: ftAtt > 0 ? (ftMade / ftAtt) * 100 : 0,
        reb: (p.oreb ?? 0) + (p.dreb ?? 0),
        asst: p.asst ?? 0,
        season_ppg: seasonPpg,
        diff,
        indicator: diff > 1 ? "↑" : diff < -1 ? "↓" : "→",
      };
    });

    const twoFgMade = ts.fg - ts.fg3;
    const twoFgAtt = ts.fga - ts.fg3a;
    const analysis = `FG: ${fgPct.toFixed(1)}%, 3PT: ${fg3Pct.toFixed(1)}%, FT: ${ftPct.toFixed(1)}%. `
      + `AST: ${ts.asst}, TO: ${ts.to}, STL: ${ts.stl ?? 0}, REB: ${ts.reb}. `
      + (playerPerfs.length > 0 ? `Leaders: ${playerPerfs.slice(0, 3).map((p) => `${p.name} ${p.pts}pts`).join(", ")}.` : "No player data recorded.");

    return {
      game: game.gameId,
      opponent: game.opponent,
      date: game.date,
      score: `${game.vc_score}-${game.opp_score}`,
      result: game.result,
      shooting: {
        "2pt": `${twoFgMade}/${twoFgAtt}`,
        "3pt": `${ts.fg3}/${ts.fg3a}`,
        "ft": `${ts.ft}/${ts.fta}`,
      },
      player_performances: playerPerfs,
      analysis,
    };
  });

  const gamesPlayed = Math.max(seasonStats.win + seasonStats.loss, 1);
  const winPct = Math.round(seasonStats.win / gamesPlayed * 100);
  const summary = `Season Record: ${seasonStats.win}-${seasonStats.loss} (${winPct}% win rate). `
    + `Scoring: ${seasonStats.ppg.toFixed(1)} PPG. `
    + `FG: ${seasonStats.fg_pct.toFixed(1)}%, 3PT: ${seasonStats.fg3_pct.toFixed(1)}%, FT: ${seasonStats.ft_pct.toFixed(1)}%. `
    + `${games.length} games played. ${seasonStats.win >= seasonStats.loss ? "Positive" : "Below .500"} season trajectory.`;

  const result = { generated_at: new Date().toISOString(), season_summary: summary, per_game_analysis: perGameAnalysis };
  seasonAnalysisBySchool.set(schoolId, result);
  return result;
}

function buildPlayerAnalysisPayload(schoolId: string, playerName: string): unknown | null {
  const player = getSeasonPlayers({ schoolId }).find(
    (p) => normalizeNameKey(p.name) === normalizeNameKey(playerName) || normalizeNameKey(p.full_name) === normalizeNameKey(playerName)
  );
  if (!player) return null;

  const games = buildGamesPayload(schoolId);
  const gameLogs = games
    .map((g) => {
      const ps = (g.player_stats as Array<{ name: string; pts: number; oreb: number; dreb: number; asst: number }> ?? [])
        .find((p) => normalizeNameKey(p.name) === normalizeNameKey(playerName));
      return ps ? { pts: ps.pts ?? 0, reb: (ps.oreb ?? 0) + (ps.dreb ?? 0), asst: ps.asst ?? 0 } : null;
    })
    .filter((x): x is { pts: number; reb: number; asst: number } => x !== null);

  const ptsList = gameLogs.map((g) => g.pts);
  const recentPpg = ptsList.length >= 3 ? ptsList.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, ptsList.length) : player.ppg;

  const strengths: string[] = [];
  if (player.ppg >= 12) strengths.push("primary scoring option");
  if (player.apg >= 3) strengths.push("playmaking contributor");
  if (player.fg_pct >= 45) strengths.push("high-percentage finisher");
  if (player.fg3_pct >= 33) strengths.push("3-point threat");
  if (strengths.length === 0) strengths.push("steady contributor");

  const analysis = [
    `${player.full_name || player.name}: ${player.ppg.toFixed(1)} PPG, ${player.rpg.toFixed(1)} RPG, ${player.apg.toFixed(1)} APG over ${player.games} games.`,
    `Shooting: ${player.fg_pct.toFixed(1)}% FG, ${player.fg3_pct.toFixed(1)}% 3PT, ${player.ft_pct.toFixed(1)}% FT.`,
    `Role: ${strengths.join(", ")}.`,
    ptsList.length > 0 ? `Recent form (last 3): ${recentPpg.toFixed(1)} PPG. Range: ${Math.min(...ptsList)}-${Math.max(...ptsList)} pts.` : "",
  ].filter(Boolean).join(" ");

  return {
    player: playerName,
    analysis,
    generated_at: new Date().toISOString(),
    stats_summary: {
      games: player.games,
      ppg: roundStat(player.ppg),
      rpg: roundStat(player.rpg),
      apg: roundStat(player.apg),
      fg_pct: roundStat(player.fg_pct),
      fg3_pct: roundStat(player.fg3_pct),
      ft_pct: roundStat(player.ft_pct),
    },
    cached: false,
  };
}

// ---------------------------------------------------------------------------
// Optional API-key auth. Set BTA_API_KEY env var to enable.
// ---------------------------------------------------------------------------
const API_KEY = process.env.BTA_API_KEY?.trim() || undefined;
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const DEFAULT_SCHOOL_ID = String(process.env.BTA_DEFAULT_SCHOOL_ID ?? "default").trim().toLowerCase() || "default";
const REQUIRE_TENANT = process.env.BTA_REQUIRE_TENANT !== "0";
const JWT_WRITE_REQUIRED = process.env.BTA_JWT_WRITE_REQUIRED !== "0";
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

  return false;
}

function shouldSuppressMissingTenantTelemetry(req: Request): boolean {
  // Some clients probe roster config before account/school bootstrap completes.
  // Keep strict tenant enforcement (request still fails) but avoid noisy logs.
  return req.method === "GET" && req.path === "/roster-teams";
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
      payload.fullName,
      payload.coachName,
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

interface OperatorPresence {
  schoolId: string;
  userId?: string;
  deviceId?: string;
  deviceName?: string;
  connectionId?: string;
  gameId: string;
  socketId: string;
  connectedAtIso: string;
  lastSeenIso: string;
}

const operatorPresenceBySocketId = new Map<string, OperatorPresence>();
const operatorPresenceByDeviceId = new Map<string, OperatorPresence>(); // Index by school+device for O(1) lookup
const operatorPresenceByConnectionId = new Map<string, OperatorPresence>(); // Index by school+connection for O(1) lookup

interface OperatorLinkSetup {
  gameId?: string;
  myTeamId?: string;
  myTeamName?: string;
  opponentName?: string;
  vcSide: "home" | "away";
  homeTeamColor?: string;
  awayTeamColor?: string;
  dashboardUrl?: string;
  startingLineup?: string[];
  updatedAtIso: string;
  operatorToken?: string;
}

const operatorLinkByConnectionId = new Map<string, OperatorLinkSetup>();

// Debounce game state broadcasts to max 1 per 60ms per game.
// This keeps fanout fast enough for near-instant multi-device updates while
// still coalescing bursts during rapid stat entry.
interface PendingBroadcast {
  state: unknown;
  insights: unknown;
  timerId: ReturnType<typeof setTimeout>;
}

const pendingBroadcasts = new Map<string, PendingBroadcast>();
const BROADCAST_DEBOUNCE_MS = 60;

function emitToGameRooms(schoolId: string, gameId: string, eventName: string, payload: unknown): void {
  io.to(gameRoom(schoolId, gameId)).emit(eventName, payload);
}

function broadcastGameStateWithDebounce(schoolId: string, gameId: string, state: unknown, insights: unknown): void {
  const broadcastKey = `${schoolId}:${gameId}`;
  const existing = pendingBroadcasts.get(broadcastKey);
  if (existing) {
    // Update pending state/insights and keep existing timer
    existing.state = state;
    existing.insights = insights;
    return;
  }

  // Schedule broadcast for 200ms from now
  const timerId = setTimeout(() => {
    const pending = pendingBroadcasts.get(broadcastKey);
    if (pending) {
      emitToGameRooms(schoolId, gameId, "game:state", pending.state);
      emitToGameRooms(schoolId, gameId, "game:insights", pending.insights);
      pendingBroadcasts.delete(broadcastKey);
    }
  }, BROADCAST_DEBOUNCE_MS);

  pendingBroadcasts.set(broadcastKey, { state, insights, timerId });
}

function getOperatorByDeviceId(schoolId: string, deviceId: string): OperatorPresence | null {
  return operatorPresenceByDeviceId.get(`${schoolId}:${deviceId}`) ?? null;
}

function normalizeConnectionKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function operatorLinkKey(schoolId: string, connectionId: string): string {
  return `${schoolId}:${connectionId}`;
}

function getOperatorByConnectionId(schoolId: string, connectionId: string): OperatorPresence | null {
  return operatorPresenceByConnectionId.get(operatorLinkKey(schoolId, connectionId)) ?? null;
}

function getOperatorsByConnectionId(schoolId: string, connectionId: string): OperatorPresence[] {
  const normalizedConnectionId = normalizeConnectionKey(connectionId);
  if (!normalizedConnectionId) {
    return [];
  }

  const matches: OperatorPresence[] = [];
  for (const presence of operatorPresenceBySocketId.values()) {
    if (presence.schoolId === schoolId && presence.connectionId === normalizedConnectionId) {
      matches.push(presence);
    }
  }
  return matches;
}

function pickMostRecentOperator(operators: OperatorPresence[]): OperatorPresence | null {
  if (operators.length === 0) {
    return null;
  }

  return operators.reduce((latest, candidate) => {
    const latestMs = Date.parse(latest.lastSeenIso);
    const candidateMs = Date.parse(candidate.lastSeenIso);
    if (!Number.isFinite(latestMs)) {
      return candidate;
    }
    if (!Number.isFinite(candidateMs)) {
      return latest;
    }
    return candidateMs >= latestMs ? candidate : latest;
  });
}

function refreshOperatorConnectionIndex(schoolId: string, connectionId: string): void {
  const normalizedConnectionId = normalizeConnectionKey(connectionId);
  if (!normalizedConnectionId) {
    return;
  }
  const key = operatorLinkKey(schoolId, normalizedConnectionId);
  const operators = getOperatorsByConnectionId(schoolId, normalizedConnectionId);
  const latest = pickMostRecentOperator(operators);
  if (!latest) {
    operatorPresenceByConnectionId.delete(key);
    return;
  }
  operatorPresenceByConnectionId.set(key, latest);
}

function buildConnectionPresencePayload(schoolId: string, connectionId: string): {
  deviceId: string | null;
  connectionId: string;
  online: boolean;
  gameId: string | null;
  lastSeenIso: string | null;
  operatorCount: number;
  operators: Array<{ deviceId: string | null; deviceName: string | null; gameId: string | null; lastSeenIso: string | null; connectedAtIso: string | null }>;
} {
  const operators = getOperatorsByConnectionId(schoolId, connectionId);
  const latest = pickMostRecentOperator(operators);

  return {
    deviceId: latest?.deviceId ?? null,
    connectionId,
    online: operators.length > 0,
    gameId: latest?.gameId ?? null,
    lastSeenIso: latest?.lastSeenIso ?? null,
    operatorCount: operators.length,
    operators: operators.map((operator) => ({
      deviceId: operator.deviceId ?? null,
      deviceName: operator.deviceName ?? null,
      gameId: operator.gameId ?? null,
      lastSeenIso: operator.lastSeenIso ?? null,
      connectedAtIso: operator.connectedAtIso ?? null,
    })),
  };
}

function getOperatorLinkSetup(schoolId: string, connectionId: string): OperatorLinkSetup | null {
  return operatorLinkByConnectionId.get(operatorLinkKey(schoolId, connectionId)) ?? null;
}

function getLatestOperatorLinkSetup(
  schoolId: string,
  options?: { gameId?: string }
): { connectionId: string; setup: OperatorLinkSetup } | null {
  const prefix = `${schoolId}:`;
  const targetGameId = options?.gameId?.trim();
  let latest: { connectionId: string; setup: OperatorLinkSetup; updatedAtMs: number } | null = null;

  for (const [key, setup] of operatorLinkByConnectionId.entries()) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    if (targetGameId && setup.gameId !== targetGameId) {
      continue;
    }

    const updatedAtMs = Date.parse(setup.updatedAtIso);
    const safeUpdatedAtMs = Number.isFinite(updatedAtMs) ? updatedAtMs : 0;
    if (!latest || safeUpdatedAtMs >= latest.updatedAtMs) {
      latest = {
        connectionId: key.slice(prefix.length),
        setup,
        updatedAtMs: safeUpdatedAtMs,
      };
    }
  }

  if (!latest) {
    return null;
  }

  return {
    connectionId: latest.connectionId,
    setup: latest.setup,
  };
}

function clearOperatorLinksForSchool(schoolId: string): void {
  const prefix = `${schoolId}:`;
  for (const key of operatorLinkByConnectionId.keys()) {
    if (key.startsWith(prefix)) {
      operatorLinkByConnectionId.delete(key);
    }
  }
}

function emitPresenceForDevice(schoolId: string, deviceId: string): void {
  const operator = getOperatorByDeviceId(schoolId, deviceId);
  const payload = {
    deviceId,
    connectionId: operator?.connectionId ?? null,
    online: Boolean(operator),
    gameId: operator?.gameId ?? null,
    lastSeenIso: operator?.lastSeenIso ?? null
  };

  io.to(deviceRoom(schoolId, deviceId)).emit("presence:status", payload);
}

function emitPresenceForConnection(schoolId: string, connectionId: string): void {
  const payload = buildConnectionPresencePayload(schoolId, connectionId);

  io.to(connectionRoom(schoolId, connectionId)).emit("presence:status", payload);
}

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
  listSchoolIdsForConnection: (connectionId) => {
    return Array.from(operatorLinkByConnectionId.keys())
      .filter((key) => key.endsWith(`:${connectionId}`))
      .map((key) => key.slice(0, key.lastIndexOf(":")));
  },
  getOperatorLinkSetup,
  setOperatorLinkSetup: (schoolId, connectionId, setup) => {
    operatorLinkByConnectionId.set(operatorLinkKey(schoolId, connectionId), setup);
  },
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

  await initializeStore().catch((error) => {
    console.error("[realtime-api] Failed to initialize store persistence", error);
  });

  const port = overridePort ?? Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";

  return new Promise<number>((resolve) => {
    httpServer.listen(port, host, () => {
      serverStarted = true;
      const addr = httpServer.address();
      const boundPort = (typeof addr === "object" && addr !== null)
        ? (addr as { port: number }).port
        : port;
      console.log(`Realtime API listening on http://${host}:${boundPort}`);
      if (API_KEY) {
        console.log(`[realtime-api] API key authentication: ENABLED`);
      } else {
        console.log(`[realtime-api] API key authentication: disabled (set BTA_API_KEY to enable)`);
      }
      if (DATABASE_URL) {
        console.log("[realtime-api] Persistence backend: PostgreSQL");
      } else {
        console.log("[realtime-api] Persistence backend: file snapshot");
      }
      if (isJwtAuthEnabled()) {
        console.log("[realtime-api] JWT authentication: ENABLED");
      }
      console.log(`[realtime-api] Local token signing: ${isLocalTokenAuthEnabled() ? "ENABLED" : "disabled"}`);
      console.log(`[realtime-api] Tenant strict mode: ${REQUIRE_TENANT ? "ENABLED" : "disabled"}`);
      console.log(`[realtime-api] CORS origins: ${ALLOWED_ORIGINS.join(", ")}`);
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
