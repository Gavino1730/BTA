import {
  applyEvent,
  createInitialGameState,
  replayEvents,
  type GameState
} from "@bta/game-state";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  generateInsights,
  type LiveInsight
} from "@bta/insight-engine";
import { parseGameEvent, isOvertimePeriod, type GameEvent, type RosterPlayer, type RosterTeam } from "@bta/shared-schema";
export type { RosterPlayer, RosterTeam };
import {
  createPostgresPersistenceProvider,
  type OrgDataResult,
  type PersistedGameSessionRecord,
  type PersistenceProvider
} from "../persistence.js";
import { DEFAULT_SCHOOL_ID, normalizeSchoolId } from "../school-id.js";
import { logger } from "../logger.js";
import { createActivityStore } from "./activity-store.js";
import { createAuthStore } from "./auth-store.js";
import { createBillingStore } from "./billing-store.js";
import { createRosterStore } from "./roster-store.js";

type WorkspaceRosterTeam = RosterTeam & {
  sport?: "basketball";
  gender?: "boys" | "girls" | "custom";
  level?: "varsity" | "jv" | "freshman" | "custom";
  customLabel?: string;
  displayName?: string;
  status?: "active" | "archived" | "read_only";
};

export interface CreateGameInput {
  schoolId: string;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  startingLineupByTeam?: Record<string, string[]>;
  aiContext?: Partial<GameAiContext>;
}

export interface OrganizationProfile {
  schoolId?: string;
  organizationName: string;
  organizationSlug?: string;
  coachName: string;
  coachEmail: string;
  teamName?: string;
  season?: string;
  completedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface OrganizationAccount {
  schoolId?: string;
  organizationId: string;
  organizationName: string;
  organizationSlug?: string;
  teamName?: string;
  season?: string;
  onboardingCompletedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CoachAccount {
  schoolId?: string;
  accountId: string;
  organizationId: string;
  fullName: string;
  email: string;
  role: "owner";
  createdAtIso: string;
  updatedAtIso: string;
}

export interface OnboardingAccountState {
  organization: OrganizationAccount;
  primaryCoach: CoachAccount;
}

export interface OnboardingAccountInput {
  organization?: Partial<OrganizationAccount>;
  primaryCoach?: Partial<CoachAccount>;
}

export interface OrganizationMember {
  schoolId?: string;
  memberId: string;
  organizationId: string;
  authSubject?: string;
  fullName: string;
  email: string;
  role: "owner" | "coach" | "analyst" | "player";
  status: "active" | "invited";
  invitedAtIso?: string;
  joinedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface OrganizationMemberInput {
  memberId?: string;
  organizationId?: string;
  authSubject?: string;
  fullName?: string;
  email?: string;
  role?: OrganizationMember["role"];
  status?: OrganizationMember["status"];
  invitedAtIso?: string;
  joinedAtIso?: string;
}

export interface LocalAuthAccount {
  schoolId?: string;
  accountId: string;
  organizationId?: string;
  email: string;
  fullName: string;
  passwordHash: string;
  passwordSalt: string;
  profilePhotoDataUrl?: string;
  role: "owner" | "coach" | "analyst" | "player";
  status: "active" | "invited";
  createdAtIso: string;
  updatedAtIso: string;
  lastLoginAtIso?: string;
  sessionInvalidBeforeIso?: string;
  scheduledDeletionAtIso?: string;
}

export interface LocalAuthAccountInput {
  accountId?: string;
  organizationId?: string;
  email?: string;
  fullName?: string;
  passwordHash?: string;
  passwordSalt?: string;
  profilePhotoDataUrl?: string;
  role?: LocalAuthAccount["role"];
  status?: LocalAuthAccount["status"];
  lastLoginAtIso?: string;
  sessionInvalidBeforeIso?: string;
  scheduledDeletionAtIso?: string;
}

export type BillingSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

export interface BillingState {
  schoolId?: string;
  planId: string;
  status: BillingSubscriptionStatus;
  includedActiveTeamLimit?: number;
  extraActiveTeamSeats?: number;
  trialStartedAtIso?: string;
  trialEndsAtIso?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEndsAtIso?: string;
  couponCode?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UserWorkspaceProfile {
  userId: string;
  email: string;
  fullName: string;
  lastSchoolId?: string;
  lastTeamId?: string;
  lastContextType?: "school" | "team";
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SchoolRecord {
  schoolId: string;
  name: string;
  slug: string;
  sport: "basketball";
  status: "draft" | "active";
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SchoolMembership {
  membershipId: string;
  schoolId: string;
  userId?: string;
  email: string;
  fullName: string;
  role: "owner" | "school_admin";
  status: "active" | "invited";
  createdAtIso: string;
  updatedAtIso: string;
}

export interface TeamMembership {
  membershipId: string;
  schoolId: string;
  teamId: string;
  userId?: string;
  email: string;
  fullName: string;
  role: "head_coach" | "assistant_coach" | "operator" | "viewer";
  status: "active" | "invited";
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ActivityEvent {
  id: string;
  schoolId: string;
  teamId?: string;
  type:
    | "school_created"
    | "team_created"
    | "live_session_started"
    | "member_invited"
    | "membership_updated";
  actorUserId?: string;
  message: string;
  createdAtIso: string;
  metadata?: Record<string, unknown>;
}

export interface LiveGameSessionRecord {
  liveSessionId: string;
  schoolId: string;
  teamId: string;
  gameId: string;
  opponentName?: string;
  opponentTeamId?: string;
  status: "active" | "completed";
  pairingCode: string;
  createdByUserId?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface OperatorSessionRecord {
  operatorSessionId: string;
  liveSessionId: string;
  schoolId: string;
  teamId: string;
  pairingCode: string;
  operatorToken: string;
  expiresAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CoachAiSettings {
  playingStyle: string;
  teamContext: string;
  customPrompt: string;
  focusInsights: Array<
    "timeouts"
    | "substitutions"
    | "foul_management"
    | "momentum"
    | "shot_selection"
    | "ball_security"
    | "hot_hand"
    | "defense"
  >;
}

export interface AiPromptPreview {
  model: string;
  userPrompt: string;
  systemGuide: string[];
  coachSettings: CoachAiSettings;
  recentEventCount: number;
  generatedAtIso: string;
}

export interface CoachAiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CoachAiChatResponse {
  answer: string;
  suggestions: string[];
  generatedAtIso: string;
  usedHistoricalContext: boolean;
}

export type GameAiErrorCode =
  | "missing_api_key"
  | "budget_exceeded"
  | "rate_limited"
  | "timeout"
  | "service_unavailable"
  | "upstream_error"
  | "invalid_payload"
  | "network_error";

export interface GameAiStatus {
  model: string;
  healthy: boolean;
  totalTokensUsed: number;
  totalEstimatedCostUsd: number;
  maxTokensPerGame?: number;
  maxCostPerGameUsd?: number;
  lastSuccessAtIso?: string;
  lastErrorAtIso?: string;
  lastErrorCode?: GameAiErrorCode;
  lastErrorMessage?: string;
  lastErrorStatus?: number;
}

export interface AiUsageTotals {
  activeGames: number;
  totalTokensUsed: number;
  totalEstimatedCostUsd: number;
}

export interface GameAiContext {
  clockEnabled: boolean;
  opponentStatsLimited: boolean;
  opponentTrackedStats: string[];
  /** Per-game notes set before tip-off — mindset, opponent tendencies, etc. Cleared on game reset. */
  preGameNotes: string;
}

export interface SeasonTeamStats {
  fg: number;
  fga: number;
  fg3: number;
  fg3a: number;
  ft: number;
  fta: number;
  oreb: number;
  dreb: number;
  reb: number;
  asst: number;
  to: number;
  stl: number;
  blk: number;
  fouls: number;
  win: number;
  loss: number;
  ppg: number;
  opp_ppg: number;
  rpg: number;
  apg: number;
  to_avg: number;
  stl_pg: number;
  blk_pg: number;
  oreb_pg: number;
  dreb_pg: number;
  fouls_pg: number;
  fg_pct: number;
  fg3_pct: number;
  ft_pct: number;
}

export interface SeasonGameSummary {
  gameId: string;
  date: string;
  opponent: string;
  location: "home" | "away";
  vc_score: number;
  opp_score: number;
  result: "W" | "L" | "T";
  team_stats: {
    fg: number;
    fga: number;
    fg3: number;
    fg3a: number;
    ft: number;
    fta: number;
    oreb: number;
    dreb: number;
    reb: number;
    asst: number;
    to: number;
    stl: number;
    blk: number;
    fouls: number;
  };
}

export interface SeasonPlayerSummary {
  playerId?: string;
  name: string;
  full_name: string;
  first_name: string;
  number?: string;
  position?: string;
  height?: string;
  grade?: string;
  role?: string;
  notes?: string;
  games: number;
  pts: number;
  fg: number;
  fga: number;
  fg3: number;
  fg3a: number;
  ft: number;
  fta: number;
  oreb: number;
  dreb: number;
  reb: number;
  asst: number;
  to: number;
  stl: number;
  blk: number;
  fouls: number;
  plus_minus: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  tpg: number;
  fpg: number;
  fg_pct: number;
  fg3_pct: number;
  ft_pct: number;
  coach_style: string;
  roster_info: {
    name: string;
    number?: string;
    position?: string;
    height?: string;
    grade?: string;
    role?: string;
    notes?: string;
  } | null;
}

export interface LiveContextPayload {
  seasonStats: SeasonTeamStats;
  recentGames: SeasonGameSummary[];
  players: Array<{
    name: string;
    number: string;
    ppg: number;
    rpg: number;
    apg: number;
    fg_pct: number;
    fg3_pct: number;
    ft_pct: number;
    fpg: number;
    games: number;
    role: string;
    notes: string;
  }>;
  teamInfo: {
    name: string;
    coachStyle: string;
    playingStyle: string;
    teamContext: string;
  };
}

interface GameSession {
  schoolId: string;
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  startingLineupByTeam?: Record<string, string[]>;
  aiSettings: CoachAiSettings;
  aiContext: GameAiContext;
  historicalContextSummary: string;
  historicalContextFetchedAtMs: number;
  state: GameState;
  eventsById: Map<string, GameEvent>;
  eventIdsBySequence: Map<number, string>;
  ruleInsights: LiveInsight[];
  aiInsights: LiveInsight[];
  aiRefreshInFlight: Promise<LiveInsight[] | null> | null;
  aiStatus: GameAiStatus;
  lastAiRefreshAtMs: number;
  lastAiEventCount: number;
  lastAiFingerprint: string;
  submitted: boolean;
}

interface PersistedGameSession {
  schoolId?: string;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  startingLineupByTeam?: Record<string, string[]>;
  aiSettings?: CoachAiSettings;
  aiStatus?: Partial<GameAiStatus>;
  aiContext?: GameAiContext;
  historicalContextSummary?: string;
  historicalContextFetchedAtMs?: number;
  events: GameEvent[];
  submitted?: boolean;
}

interface EventMutationPrecondition {
  expectedSequence?: number;
}

export interface GameEditOverride {
  gameId: string;
  date: string;
  opponent: string;
  location: "home" | "away" | "neutral";
  vc_score: number;
  opp_score: number;
  result: "W" | "L" | "T";
  team_stats: {
    fg: number;
    fga: number;
    fg3: number;
    fg3a: number;
    ft: number;
    fta: number;
    oreb: number;
    dreb: number;
    reb: number;
    asst: number;
    to: number;
    stl: number;
    blk: number;
    fouls: number;
  };
  player_stats: Array<Record<string, unknown>>;
  coach_notes?: string;
  updatedAtIso: string;
}

interface PersistedSnapshot {
  sessions: PersistedGameSession[];
  rosterTeams?: RosterTeam[];
  rosterTeamsBySchool?: Record<string, RosterTeam[]>;
  organizationProfilesBySchool?: Record<string, OrganizationProfile>;
  onboardingAccountsBySchool?: Record<string, OnboardingAccountState>;
  organizationMembersBySchool?: Record<string, OrganizationMember[]>;
  localAuthAccountsBySchool?: Record<string, LocalAuthAccount[]>;
  gameOverridesBySchool?: Record<string, Record<string, GameEditOverride>>;
  billingBySchool?: Record<string, BillingState>;
  processedStripeWebhookEvents?: Record<string, string>;
  userWorkspaceProfilesById?: Record<string, UserWorkspaceProfile>;
  schoolsById?: Record<string, SchoolRecord>;
  schoolMembershipsBySchool?: Record<string, SchoolMembership[]>;
  teamMembershipsBySchool?: Record<string, TeamMembership[]>;
  activityEventsBySchool?: Record<string, ActivityEvent[]>;
  liveGameSessionsBySchool?: Record<string, LiveGameSessionRecord[]>;
  operatorSessionsByLiveSession?: Record<string, OperatorSessionRecord>;
}

export interface TenantScope {
  schoolId?: string;
  teamId?: string;
}

function resolveSchoolId(scope?: TenantScope): string {
  return normalizeSchoolId(scope?.schoolId);
}

function resolveRequiredSchoolId(inputSchoolId: unknown, scope?: TenantScope): string {
  const hasInputSchoolId = inputSchoolId !== undefined
    && inputSchoolId !== null
    && String(inputSchoolId).trim().length > 0;
  const normalizedInput = hasInputSchoolId ? normalizeSchoolId(inputSchoolId) : "";
  const normalizedScope = scope?.schoolId !== undefined ? normalizeSchoolId(scope.schoolId) : undefined;

  if (normalizedScope && hasInputSchoolId && normalizedInput !== normalizedScope) {
    throw new Error("Tenant schoolId mismatch between payload and scope");
  }

  if (normalizedScope) {
    return normalizedScope;
  }
  return hasInputSchoolId ? normalizedInput : normalizeSchoolId(undefined);
}

function buildGameSessionKey(gameId: string, schoolId: string): string {
  return `${schoolId}:${gameId}`;
}

const sessions = new Map<string, GameSession>();
const rosterTeamsBySchool = new Map<string, RosterTeam[]>();
const organizationProfilesBySchool = new Map<string, OrganizationProfile>();
const onboardingAccountsBySchool = new Map<string, OnboardingAccountState>();
const organizationMembersBySchool = new Map<string, OrganizationMember[]>();
const localAuthAccountsBySchool = new Map<string, LocalAuthAccount[]>();
const gameOverridesBySchool = new Map<string, Map<string, GameEditOverride>>();
const billingBySchool = new Map<string, BillingState>();
const processedStripeWebhookEvents = new Map<string, string>();
const userWorkspaceProfilesById = new Map<string, UserWorkspaceProfile>();
const schoolsById = new Map<string, SchoolRecord>();
const schoolMembershipsBySchool = new Map<string, SchoolMembership[]>();
const teamMembershipsBySchool = new Map<string, TeamMembership[]>();
const activityEventsBySchool = new Map<string, ActivityEvent[]>();
const liveGameSessionsBySchool = new Map<string, LiveGameSessionRecord[]>();
const operatorSessionsByLiveSession = new Map<string, OperatorSessionRecord>();
const persistenceEnabled = !process.env.VITEST && process.env.NODE_ENV !== "test";
const dataDirectory = resolve(process.cwd(), ".platform-data");
const dataFile = resolve(dataDirectory, "realtime-api.json");
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const REALTIME_DB_TABLE = process.env.BTA_REALTIME_DB_TABLE?.trim();
const persistenceProvider: PersistenceProvider | null = persistenceEnabled && DATABASE_URL
  ? createPostgresPersistenceProvider({ connectionString: DATABASE_URL, tableName: REALTIME_DB_TABLE })
  : null;

export interface PersistenceStatus {
  backend: "postgres" | "file_snapshot" | "memory";
  durable: boolean;
  warning?: string;
  dataFile?: string;
}
const OPENAI_API_URL = process.env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions";
const LIVE_AI_MODEL = process.env.BTA_LIVE_INSIGHT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const LIVE_AI_TIMEOUT_MS = readEnvNumber("BTA_LIVE_INSIGHT_TIMEOUT_MS", 12000);
const LIVE_AI_MIN_EVENTS = readEnvNumber("BTA_LIVE_INSIGHT_MIN_EVENTS", 4);
const LIVE_AI_REFRESH_EVERY_EVENTS = readEnvNumber("BTA_LIVE_INSIGHT_REFRESH_EVERY_EVENTS", 8);
const LIVE_AI_MIN_INTERVAL_MS = readEnvNumber("BTA_LIVE_INSIGHT_MIN_INTERVAL_MS", 45000);
const LIVE_AI_RECENT_EVENT_WINDOW = readEnvNumber("BTA_LIVE_INSIGHT_RECENT_EVENT_WINDOW", 12);
const STATS_DASHBOARD_BASE = (process.env.STATS_DASHBOARD_BASE ?? "http://localhost:4000").replace(/\/+$/, "");
const HISTORICAL_CONTEXT_TTL_MS = readEnvNumber("BTA_HISTORICAL_CONTEXT_TTL_MS", 60000);
const DATA_RETENTION_DAYS = Number(process.env.BTA_DATA_RETENTION_DAYS ?? 180);
const RETENTION_PRUNE_INTERVAL_MINUTES = Number(process.env.BTA_RETENTION_PRUNE_INTERVAL_MINUTES ?? 1440);
const FOCUS_INSIGHT_OPTIONS = new Set<CoachAiSettings["focusInsights"][number]>([
  "timeouts",
  "substitutions",
  "foul_management",
  "momentum",
  "shot_selection",
  "ball_security",
  "hot_hand",
  "defense"
]);

function defaultCoachAiSettings(): CoachAiSettings {
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

function defaultGameAiContext(): GameAiContext {
  return {
    clockEnabled: true,
    opponentStatsLimited: true,
    opponentTrackedStats: ["points", "foul"],
    preGameNotes: ""
  };
}

function sanitizeGameAiContext(input: Partial<GameAiContext> | null | undefined): GameAiContext {
  const defaults = defaultGameAiContext();
  const clockEnabled = typeof input?.clockEnabled === "boolean"
    ? input.clockEnabled
    : defaults.clockEnabled;
  const opponentStatsLimited = typeof input?.opponentStatsLimited === "boolean"
    ? input.opponentStatsLimited
    : defaults.opponentStatsLimited;
  const opponentTrackedStats = Array.isArray(input?.opponentTrackedStats)
    ? [...new Set(input.opponentTrackedStats
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 24))]
    : defaults.opponentTrackedStats;

  const preGameNotes = typeof input?.preGameNotes === "string"
    ? input.preGameNotes.slice(0, 800)
    : defaults.preGameNotes;

  return {
    clockEnabled,
    opponentStatsLimited,
    opponentTrackedStats: opponentTrackedStats.length > 0 ? opponentTrackedStats : defaults.opponentTrackedStats,
    preGameNotes
  };
}

function sanitizeCoachAiSettings(input: Partial<CoachAiSettings> | null | undefined): CoachAiSettings {
  const defaults = defaultCoachAiSettings();
  const sanitize = (text: string, max: number) => text
    .replace(/^\ufeff/g, "") // BOM
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "") // Control chars
    .trim()
    .slice(0, max);
  
  const playingStyle = typeof input?.playingStyle === "string" ? sanitize(input.playingStyle, 500) : defaults.playingStyle;
  const teamContext = typeof input?.teamContext === "string" ? sanitize(input.teamContext, 1200) : defaults.teamContext;
  const customPrompt = typeof input?.customPrompt === "string" ? sanitize(input.customPrompt, 1200) : defaults.customPrompt;
  const focusInsights = Array.isArray(input?.focusInsights)
    ? [...new Set(input.focusInsights.filter((item): item is CoachAiSettings["focusInsights"][number] => FOCUS_INSIGHT_OPTIONS.has(item as CoachAiSettings["focusInsights"][number])))]
    : defaults.focusInsights;

  return {
    playingStyle,
    teamContext,
    customPrompt,
    focusInsights: focusInsights.length > 0 ? focusInsights : defaults.focusInsights
  };
}

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readEnvOptionalPositiveInteger(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  const integerValue = Math.floor(parsed);
  return integerValue > 0 ? integerValue : undefined;
}

function readEnvOptionalPositiveUsd(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getAiBudgetCaps(): { maxTokensPerGame?: number; maxCostPerGameUsd?: number } {
  return {
    maxTokensPerGame: readEnvOptionalPositiveInteger("BTA_OPENAI_MAX_TOKENS_PER_GAME"),
    maxCostPerGameUsd: readEnvOptionalPositiveUsd("BTA_OPENAI_MAX_COST_PER_GAME_USD"),
  };
}

function getOpenAiApiKey(): string {
  return process.env.OPENAI_API_KEY ?? "";
}

function defaultGameAiStatus(): GameAiStatus {
  const caps = getAiBudgetCaps();
  return {
    model: LIVE_AI_MODEL,
    healthy: true,
    totalTokensUsed: 0,
    totalEstimatedCostUsd: 0,
    maxTokensPerGame: caps.maxTokensPerGame,
    maxCostPerGameUsd: caps.maxCostPerGameUsd,
  };
}

function sanitizePersistedGameAiStatus(input: Partial<GameAiStatus> | null | undefined): GameAiStatus {
  const defaults = defaultGameAiStatus();
  const totalTokensUsed = Number(input?.totalTokensUsed ?? defaults.totalTokensUsed);
  const totalEstimatedCostUsd = Number(input?.totalEstimatedCostUsd ?? defaults.totalEstimatedCostUsd);

  return {
    ...defaults,
    healthy: typeof input?.healthy === "boolean" ? input.healthy : defaults.healthy,
    totalTokensUsed: Number.isFinite(totalTokensUsed) && totalTokensUsed > 0 ? Math.floor(totalTokensUsed) : 0,
    totalEstimatedCostUsd: Number.isFinite(totalEstimatedCostUsd) && totalEstimatedCostUsd > 0
      ? Number(totalEstimatedCostUsd.toFixed(6))
      : 0,
    lastSuccessAtIso: typeof input?.lastSuccessAtIso === "string" ? input.lastSuccessAtIso : undefined,
    lastErrorAtIso: typeof input?.lastErrorAtIso === "string" ? input.lastErrorAtIso : undefined,
    lastErrorCode: input?.lastErrorCode,
    lastErrorMessage: typeof input?.lastErrorMessage === "string" ? input.lastErrorMessage : undefined,
    lastErrorStatus: typeof input?.lastErrorStatus === "number" ? input.lastErrorStatus : undefined,
  };
}

function markAiSuccess(session: GameSession): void {
  session.aiStatus = {
    ...session.aiStatus,
    model: LIVE_AI_MODEL,
    healthy: true,
    lastSuccessAtIso: new Date().toISOString(),
  };
}

function markAiFailure(
  session: GameSession,
  code: GameAiErrorCode,
  message: string,
  status?: number,
): void {
  const nowIso = new Date().toISOString();
  session.aiStatus = {
    ...session.aiStatus,
    model: LIVE_AI_MODEL,
    healthy: false,
    lastErrorAtIso: nowIso,
    lastErrorCode: code,
    lastErrorMessage: message,
    lastErrorStatus: status,
  };

  logger.warn("ai.status_degraded", {
    code,
    gameId: session.state.gameId,
    schoolId: session.schoolId,
    status,
    message,
  });
}

interface AiRequestIssue {
  code: GameAiErrorCode;
  message: string;
  status?: number;
}

interface OpenAiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function normalizeOpenAiUsage(raw: unknown): OpenAiUsage | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const usage = raw as Record<string, unknown>;
  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? 0);
  const totalTokensRaw = Number(usage.total_tokens ?? Number.NaN);
  const fallbackTotal = Math.max(0, promptTokens) + Math.max(0, completionTokens);
  const totalTokens = Number.isFinite(totalTokensRaw) && totalTokensRaw > 0
    ? totalTokensRaw
    : fallbackTotal;

  const normalizedPrompt = Number.isFinite(promptTokens) && promptTokens > 0 ? Math.floor(promptTokens) : 0;
  const normalizedCompletion = Number.isFinite(completionTokens) && completionTokens > 0 ? Math.floor(completionTokens) : 0;
  const normalizedTotal = Number.isFinite(totalTokens) && totalTokens > 0 ? Math.floor(totalTokens) : 0;
  if (normalizedTotal === 0) {
    return null;
  }

  return {
    promptTokens: normalizedPrompt,
    completionTokens: normalizedCompletion,
    totalTokens: normalizedTotal,
  };
}

function resolveModelCostPer1k(model: string): { inputUsd: number; outputUsd: number } {
  const normalized = model.trim().toLowerCase();
  if (normalized.startsWith("gpt-4o-mini")) {
    return { inputUsd: 0.00015, outputUsd: 0.0006 };
  }
  if (normalized.startsWith("gpt-4o")) {
    return { inputUsd: 0.005, outputUsd: 0.015 };
  }
  // Conservative fallback for unknown models when usage data is available.
  return { inputUsd: 0.001, outputUsd: 0.001 };
}

function estimateUsageCostUsd(usage: OpenAiUsage): number {
  const rates = resolveModelCostPer1k(LIVE_AI_MODEL);
  const inputCost = (usage.promptTokens / 1000) * rates.inputUsd;
  const outputCost = (usage.completionTokens / 1000) * rates.outputUsd;
  const blendedCost = usage.promptTokens === 0 && usage.completionTokens === 0
    ? (usage.totalTokens / 1000) * rates.outputUsd
    : inputCost + outputCost;
  return Number(blendedCost.toFixed(6));
}

function syncAiBudgetCaps(session: GameSession): void {
  const caps = getAiBudgetCaps();
  session.aiStatus.maxTokensPerGame = caps.maxTokensPerGame;
  session.aiStatus.maxCostPerGameUsd = caps.maxCostPerGameUsd;
}

function getAiBudgetViolation(session: GameSession): AiRequestIssue | null {
  syncAiBudgetCaps(session);

  const maxTokensPerGame = session.aiStatus.maxTokensPerGame;
  if (typeof maxTokensPerGame === "number" && session.aiStatus.totalTokensUsed >= maxTokensPerGame) {
    return {
      code: "budget_exceeded",
      message: `AI token budget reached for this game (${session.aiStatus.totalTokensUsed}/${maxTokensPerGame} tokens).`,
      status: 429,
    };
  }

  const maxCostPerGameUsd = session.aiStatus.maxCostPerGameUsd;
  if (typeof maxCostPerGameUsd === "number" && session.aiStatus.totalEstimatedCostUsd >= maxCostPerGameUsd) {
    return {
      code: "budget_exceeded",
      message: `AI cost budget reached for this game ($${session.aiStatus.totalEstimatedCostUsd.toFixed(4)}/$${maxCostPerGameUsd.toFixed(4)}).`,
      status: 429,
    };
  }

  return null;
}

function recordAiUsage(session: GameSession, rawUsage: unknown): void {
  syncAiBudgetCaps(session);

  const usage = normalizeOpenAiUsage(rawUsage);
  if (!usage) {
    return;
  }

  session.aiStatus.totalTokensUsed += usage.totalTokens;
  session.aiStatus.totalEstimatedCostUsd = Number(
    (session.aiStatus.totalEstimatedCostUsd + estimateUsageCostUsd(usage)).toFixed(6)
  );
}

function mapOpenAiHttpFailure(status: number): AiRequestIssue {
  if (status === 429) {
    return { code: "rate_limited", message: "OpenAI rate limit reached", status };
  }
  if (status === 503) {
    return { code: "service_unavailable", message: "OpenAI service unavailable", status };
  }
  if (status >= 500) {
    return { code: "upstream_error", message: `OpenAI upstream error (${status})`, status };
  }
  return { code: "upstream_error", message: `OpenAI request rejected (${status})`, status };
}

function buildStatsHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.BTA_API_KEY;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

function getSession(gameId: string, scope?: TenantScope): GameSession | null {
  const schoolId = resolveSchoolId(scope);
  return sessions.get(buildGameSessionKey(gameId, schoolId)) ?? null;
}

function sanitizeCoachStyleValue(style: unknown, schoolId: string): string | undefined {
  if (typeof style !== "string") {
    return undefined;
  }

  const trimmedStyle = style.trim().slice(0, 500);
  if (!trimmedStyle) {
    return undefined;
  }

  const coachName = organizationProfilesBySchool.get(schoolId)?.coachName?.trim().toLowerCase() ?? "";
  return coachName && trimmedStyle.toLowerCase() === coachName ? undefined : trimmedStyle;
}

function sanitizeTeamContextValue(context: unknown, schoolId: string): string | undefined {
  if (typeof context !== "string") {
    return undefined;
  }

  const trimmed = context.trim().slice(0, 1200);
  if (!trimmed) {
    return undefined;
  }

  // If teamContext exactly matches the organization name it was accidentally written from onboarding bug
  const orgName = organizationProfilesBySchool.get(schoolId)?.organizationName?.trim().toLowerCase() ?? "";
  const teamName = (rosterTeamsBySchool.get(schoolId)?.[0]?.name ?? "").trim().toLowerCase();
  const lower = trimmed.toLowerCase();
  if ((orgName && lower === orgName) || (teamName && lower === teamName)) {
    return undefined;
  }

  return trimmed;
}

function getRosterTeamsForSchool(schoolId: string): RosterTeam[] {
  return (rosterTeamsBySchool.get(schoolId) ?? []).map((team) => ({
    ...team,
    coachStyle: sanitizeCoachStyleValue(team.coachStyle, schoolId),
    teamContext: sanitizeTeamContextValue(team.teamContext, schoolId),
  }));
}

function getSessionsForSchool(schoolId: string): GameSession[] {
  return [...sessions.values()].filter((session) => session.schoolId === schoolId);
}

function getMostRecentActiveSessionForSchool(schoolId: string): GameSession | null {
  const activeSessions = getSessionsForSchool(schoolId).filter((session) => !session.submitted);
  if (activeSessions.length === 0) {
    return null;
  }

  activeSessions.sort((left, right) => {
    const eventCountDiff = right.state.events.length - left.state.events.length;
    if (eventCountDiff !== 0) {
      return eventCountDiff;
    }

    return right.state.gameId.localeCompare(left.state.gameId);
  });

  return activeSessions[0] ?? null;
}

function getMostRecentActiveSessionForTeam(schoolId: string, teamId: string): GameSession | null {
  const normalizedTeamId = String(teamId ?? "").trim();
  if (!normalizedTeamId) {
    return getMostRecentActiveSessionForSchool(schoolId);
  }

  const activeSessions = getSessionsForSchool(schoolId).filter((session) =>
    !session.submitted
      && (session.homeTeamId === normalizedTeamId || session.awayTeamId === normalizedTeamId),
  );
  if (activeSessions.length === 0) {
    return null;
  }

  activeSessions.sort((left, right) => {
    const eventCountDiff = right.state.events.length - left.state.events.length;
    if (eventCountDiff !== 0) {
      return eventCountDiff;
    }

    return right.state.gameId.localeCompare(left.state.gameId);
  });

  return activeSessions[0] ?? null;
}

function setRosterTeamsForSchool(schoolId: string, teams: RosterTeam[]): RosterTeam[] {
  const normalized = Array.isArray(teams)
    ? teams.map((team) => {
        const workspaceTeam = team as WorkspaceRosterTeam;
        return {
          ...team,
          schoolId: normalizeSchoolId(team.schoolId ?? schoolId),
          sport: "basketball" as const,
          gender: workspaceTeam.gender ?? "custom",
          level: workspaceTeam.level ?? "custom",
          customLabel: trimProfileField(workspaceTeam.customLabel, 80) || undefined,
          displayName: trimProfileField(workspaceTeam.displayName ?? team.name, 120) || team.name,
          status: workspaceTeam.status === "archived" || workspaceTeam.status === "read_only" ? workspaceTeam.status : "active",
          name: trimProfileField(workspaceTeam.displayName ?? team.name, 120) || "Team",
          coachStyle: sanitizeCoachStyleValue(team.coachStyle, schoolId),
          teamContext: sanitizeTeamContextValue(team.teamContext, schoolId),
        } as RosterTeam;
      })
    : [];
  rosterTeamsBySchool.set(schoolId, normalized);
  return normalized;
}

function trimProfileField(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function buildOrganizationSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function sanitizeOrganizationProfile(
  input: Partial<OrganizationProfile> | null | undefined,
  schoolId: string,
  existing?: OrganizationProfile | null,
): OrganizationProfile {
  const now = new Date().toISOString();
  const organizationName = trimProfileField(input?.organizationName ?? existing?.organizationName, 160);
  const coachName = trimProfileField(input?.coachName ?? existing?.coachName, 120);
  const coachEmail = trimProfileField(input?.coachEmail ?? existing?.coachEmail, 160).toLowerCase();
  const organizationSlug = trimProfileField(input?.organizationSlug ?? existing?.organizationSlug, 80) || buildOrganizationSlug(organizationName);

  return {
    schoolId,
    organizationName,
    organizationSlug: organizationSlug || undefined,
    coachName,
    coachEmail,
    teamName: trimProfileField(input?.teamName ?? existing?.teamName, 120) || undefined,
    season: trimProfileField(input?.season ?? existing?.season, 40) || undefined,
    completedAtIso: trimProfileField(input?.completedAtIso ?? existing?.completedAtIso, 64) || undefined,
    createdAtIso: existing?.createdAtIso ?? now,
    updatedAtIso: now,
  };
}

function buildOrganizationId(schoolId: string, organizationSlug: string): string {
  return organizationSlug ? `org-${organizationSlug}` : `org-${schoolId}`;
}

function buildCoachAccountId(email: string, schoolId: string): string {
  const localPart = email.split("@")[0]?.replace(/[^a-z0-9_-]/g, "") || schoolId;
  return `coach-${localPart.slice(0, 48)}`;
}

function buildLocalAuthAccountId(email: string, schoolId: string): string {
  const normalizedEmail = trimProfileField(email, 160).toLowerCase();
  const localPart = normalizedEmail.split("@")[0]?.replace(/[^a-z0-9_-]/g, "") || schoolId;
  const suffix = createHash("sha1").update(normalizedEmail || schoolId).digest("hex").slice(0, 10);
  return `acct-${localPart.slice(0, 36)}-${suffix}`;
}

function buildOrganizationMemberId(email: string, organizationId: string): string {
  const normalizedEmail = trimProfileField(email, 160).toLowerCase();
  const localPart = normalizedEmail.split("@")[0]?.replace(/[^a-z0-9_-]/g, "") || organizationId;
  const suffix = createHash("sha1").update(normalizedEmail || organizationId).digest("hex").slice(0, 10);
  return `member-${localPart.slice(0, 34)}-${suffix}`;
}

function sanitizeOnboardingAccountState(
  input: OnboardingAccountInput | null | undefined,
  schoolId: string,
  existing?: OnboardingAccountState | null,
): OnboardingAccountState {
  const now = new Date().toISOString();
  const organizationName = trimProfileField(
    input?.organization?.organizationName ?? existing?.organization.organizationName,
    160,
  );
  const organizationSlug = trimProfileField(
    input?.organization?.organizationSlug ?? existing?.organization.organizationSlug,
    80,
  ) || buildOrganizationSlug(organizationName);
  const organizationId = trimProfileField(
    input?.organization?.organizationId ?? existing?.organization.organizationId,
    80,
  ) || buildOrganizationId(schoolId, organizationSlug);
  const email = trimProfileField(
    input?.primaryCoach?.email ?? existing?.primaryCoach.email,
    160,
  ).toLowerCase();

  return {
    organization: {
      schoolId,
      organizationId,
      organizationName,
      organizationSlug: organizationSlug || undefined,
      teamName: trimProfileField(input?.organization?.teamName ?? existing?.organization.teamName, 120) || undefined,
      season: trimProfileField(input?.organization?.season ?? existing?.organization.season, 40) || undefined,
      onboardingCompletedAtIso: trimProfileField(
        input?.organization?.onboardingCompletedAtIso ?? existing?.organization.onboardingCompletedAtIso,
        64,
      ) || undefined,
      createdAtIso: existing?.organization.createdAtIso ?? now,
      updatedAtIso: now,
    },
    primaryCoach: {
      schoolId,
      organizationId,
      accountId: trimProfileField(input?.primaryCoach?.accountId ?? existing?.primaryCoach.accountId, 80) || buildCoachAccountId(email, schoolId),
      fullName: trimProfileField(input?.primaryCoach?.fullName ?? existing?.primaryCoach.fullName, 120),
      email,
      role: "owner",
      createdAtIso: existing?.primaryCoach.createdAtIso ?? now,
      updatedAtIso: now,
    },
  };
}

function setOrganizationProfileForSchool(schoolId: string, profile: Partial<OrganizationProfile> | null | undefined): OrganizationProfile {
  const existing = organizationProfilesBySchool.get(schoolId) ?? null;
  const next = sanitizeOrganizationProfile(profile, schoolId, existing);
  organizationProfilesBySchool.set(schoolId, next);
  return next;
}

function setOnboardingAccountStateForSchool(
  schoolId: string,
  accountState: OnboardingAccountInput | null | undefined,
): OnboardingAccountState {
  const existing = onboardingAccountsBySchool.get(schoolId) ?? null;
  const next = sanitizeOnboardingAccountState(accountState, schoolId, existing);
  onboardingAccountsBySchool.set(schoolId, next);
  return next;
}

function sanitizeOrganizationMember(
  input: OrganizationMemberInput,
  schoolId: string,
  organizationId: string,
  existing?: OrganizationMember | null,
): OrganizationMember {
  const now = new Date().toISOString();
  const email = trimProfileField(input.email ?? existing?.email, 160).toLowerCase();
  const role = input.role === "analyst" || input.role === "coach" || input.role === "owner" || input.role === "player"
    ? input.role
    : existing?.role ?? "coach";
  const status = input.status === "invited" || input.status === "active"
    ? input.status
    : existing?.status ?? "invited";

  return {
    schoolId,
    organizationId,
    memberId: trimProfileField(input.memberId ?? existing?.memberId, 80) || buildOrganizationMemberId(email, organizationId),
    authSubject: trimProfileField(input.authSubject ?? existing?.authSubject, 120) || undefined,
    fullName: trimProfileField(input.fullName ?? existing?.fullName, 120),
    email,
    role,
    status,
    invitedAtIso: trimProfileField(input.invitedAtIso ?? existing?.invitedAtIso, 64) || (status === "invited" ? now : undefined),
    joinedAtIso: trimProfileField(input.joinedAtIso ?? existing?.joinedAtIso, 64) || (status === "active" ? now : undefined),
    createdAtIso: existing?.createdAtIso ?? now,
    updatedAtIso: now,
  };
}

function setOrganizationMembersForSchool(schoolId: string, members: OrganizationMember[]): OrganizationMember[] {
  const dedupedByMemberId = new Map<string, OrganizationMember>();
  for (const member of members) {
    const normalizedMember = { ...member, schoolId: normalizeSchoolId(member.schoolId ?? schoolId) };
    dedupedByMemberId.set(normalizedMember.memberId, normalizedMember);
  }

  const normalized = [...dedupedByMemberId.values()]
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "owner" ? -1 : right.role === "owner" ? 1 : left.role.localeCompare(right.role);
      }
      return left.email.localeCompare(right.email);
    });
  organizationMembersBySchool.set(schoolId, normalized);
  return normalized;
}

function sanitizeLocalAuthAccount(
  input: LocalAuthAccountInput,
  schoolId: string,
  existing?: LocalAuthAccount | null,
): LocalAuthAccount {
  const now = new Date().toISOString();
  const email = trimProfileField(input.email ?? existing?.email, 160).toLowerCase();
  const organizationId = trimProfileField(input.organizationId ?? existing?.organizationId, 80)
    || onboardingAccountsBySchool.get(schoolId)?.organization.organizationId
    || undefined;
  const role = input.role === "analyst" || input.role === "coach" || input.role === "owner" || input.role === "player"
    ? input.role
    : existing?.role ?? "owner";
  const status = input.status === "invited" || input.status === "active"
    ? input.status
    : existing?.status ?? "active";

  return {
    schoolId,
    accountId: trimProfileField(input.accountId ?? existing?.accountId, 80) || buildLocalAuthAccountId(email, schoolId),
    organizationId,
    email,
    fullName: trimProfileField(input.fullName ?? existing?.fullName, 120),
    passwordHash: trimProfileField(input.passwordHash ?? existing?.passwordHash, 240),
    passwordSalt: trimProfileField(input.passwordSalt ?? existing?.passwordSalt, 240),
    profilePhotoDataUrl: trimProfileField(input.profilePhotoDataUrl ?? existing?.profilePhotoDataUrl, 350_000) || undefined,
    role,
    status,
    createdAtIso: existing?.createdAtIso ?? now,
    updatedAtIso: now,
    lastLoginAtIso: trimProfileField(input.lastLoginAtIso ?? existing?.lastLoginAtIso, 64) || undefined,
    sessionInvalidBeforeIso: trimProfileField(input.sessionInvalidBeforeIso ?? existing?.sessionInvalidBeforeIso, 64) || undefined,
    scheduledDeletionAtIso: trimProfileField(input.scheduledDeletionAtIso ?? existing?.scheduledDeletionAtIso, 64) || undefined,
  };
}

function setLocalAuthAccountsForSchool(schoolId: string, accounts: LocalAuthAccount[]): LocalAuthAccount[] {
  const dedupedByAccountId = new Map<string, LocalAuthAccount>();
  for (const account of accounts) {
    const normalizedAccount = { ...account, schoolId: normalizeSchoolId(account.schoolId ?? schoolId) };
    dedupedByAccountId.set(normalizedAccount.accountId, normalizedAccount);
  }

  const dedupedByEmail = new Map<string, LocalAuthAccount>();
  for (const account of dedupedByAccountId.values()) {
    dedupedByEmail.set(account.email, account);
  }

  const normalized = [...dedupedByEmail.values()]
    .sort((left, right) => left.email.localeCompare(right.email));
  localAuthAccountsBySchool.set(schoolId, normalized);
  return normalized;
}

function upsertLocalAuthAccountForSchool(schoolId: string, input: LocalAuthAccountInput): LocalAuthAccount {
  const accounts = localAuthAccountsBySchool.get(schoolId) ?? [];
  const email = trimProfileField(input.email, 160).toLowerCase();
  const existing = accounts.find((account) =>
    (email && account.email === email)
    || (input.accountId && account.accountId === input.accountId)
  ) ?? null;
  const next = sanitizeLocalAuthAccount(input, schoolId, existing);
  const merged = existing
    ? accounts.map((account) => (account.accountId === existing.accountId ? next : account))
    : [...accounts, next];
  setLocalAuthAccountsForSchool(schoolId, merged);
  return next;
}

function findLocalAuthAccountByEmailForSchool(schoolId: string, email: string): LocalAuthAccount | null {
  const normalizedEmail = trimProfileField(email, 160).toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const accounts = localAuthAccountsBySchool.get(schoolId) ?? [];
  return accounts.find((account) => account.email === normalizedEmail) ?? null;
}

function touchLocalAuthAccountLoginForSchool(schoolId: string, accountId: string): LocalAuthAccount | null {
  const accounts = localAuthAccountsBySchool.get(schoolId) ?? [];
  const existing = accounts.find((account) => account.accountId === accountId) ?? null;
  if (!existing) {
    return null;
  }

  return upsertLocalAuthAccountForSchool(schoolId, {
    accountId: existing.accountId,
    email: existing.email,
    fullName: existing.fullName,
    organizationId: existing.organizationId,
    passwordHash: existing.passwordHash,
    passwordSalt: existing.passwordSalt,
    role: existing.role,
    status: existing.status,
    lastLoginAtIso: new Date().toISOString(),
    scheduledDeletionAtIso: existing.scheduledDeletionAtIso,
  });
}

function buildWorkspaceMembershipId(seed: string, prefix: string): string {
  const normalizedSeed = trimProfileField(seed, 200).toLowerCase() || prefix;
  const suffix = createHash("sha1").update(normalizedSeed).digest("hex").slice(0, 10);
  const localPart = normalizedSeed.replace(/[^a-z0-9_-]/g, "").slice(0, 32) || prefix;
  return `${prefix}-${localPart}-${suffix}`;
}

function setSchoolRecord(record: Partial<SchoolRecord> & Pick<SchoolRecord, "schoolId" | "name">): SchoolRecord {
  const schoolId = normalizeSchoolId(record.schoolId);
  const nowIso = new Date().toISOString();
  const existing = schoolsById.get(schoolId);
  const slug = trimProfileField(record.slug ?? existing?.slug, 80) || buildOrganizationSlug(record.name);
  const next: SchoolRecord = {
    schoolId,
    name: trimProfileField(record.name, 160) || existing?.name || schoolId,
    slug: slug || schoolId,
    sport: "basketball",
    status: record.status ?? existing?.status ?? "draft",
    createdAtIso: existing?.createdAtIso ?? nowIso,
    updatedAtIso: nowIso,
  };
  schoolsById.set(schoolId, next);
  return next;
}

function setUserWorkspaceProfile(profile: Partial<UserWorkspaceProfile> & Pick<UserWorkspaceProfile, "userId" | "email">): UserWorkspaceProfile {
  const userId = trimProfileField(profile.userId, 120);
  const email = trimProfileField(profile.email, 160).toLowerCase();
  const nowIso = new Date().toISOString();
  const existing = userWorkspaceProfilesById.get(userId);
  const next: UserWorkspaceProfile = {
    userId,
    email,
    fullName: trimProfileField(profile.fullName ?? existing?.fullName, 120),
    lastSchoolId: trimProfileField(profile.lastSchoolId ?? existing?.lastSchoolId, 80) || undefined,
    lastTeamId: trimProfileField(profile.lastTeamId ?? existing?.lastTeamId, 80) || undefined,
    lastContextType: profile.lastContextType ?? existing?.lastContextType ?? "school",
    createdAtIso: existing?.createdAtIso ?? nowIso,
    updatedAtIso: nowIso,
  };
  userWorkspaceProfilesById.set(userId, next);
  return next;
}

function setSchoolMembershipsForSchool(schoolId: string, memberships: SchoolMembership[]): SchoolMembership[] {
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  const deduped = new Map<string, SchoolMembership>();
  for (const membership of memberships) {
    const userId = trimProfileField(membership.userId, 120) || undefined;
    const email = trimProfileField(membership.email, 160).toLowerCase();
    const nowIso = new Date().toISOString();
    const key = userId || email || membership.membershipId;
    const normalizedMembership: SchoolMembership = {
      ...membership,
      schoolId: normalizedSchoolId,
      userId,
      email,
      membershipId: trimProfileField(membership.membershipId, 120) || buildWorkspaceMembershipId(`${normalizedSchoolId}:${key}`, "school-member"),
      fullName: trimProfileField(membership.fullName, 120),
      role: membership.role === "school_admin" ? "school_admin" : "owner",
      status: membership.status === "invited" ? "invited" : "active",
      createdAtIso: membership.createdAtIso || nowIso,
      updatedAtIso: nowIso,
    };
    deduped.set(key, normalizedMembership);
  }
  const next = [...deduped.values()].sort((left, right) => left.email.localeCompare(right.email));
  schoolMembershipsBySchool.set(normalizedSchoolId, next);
  return next;
}

function setTeamMembershipsForSchool(schoolId: string, memberships: TeamMembership[]): TeamMembership[] {
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  const deduped = new Map<string, TeamMembership>();
  for (const membership of memberships) {
    const userId = trimProfileField(membership.userId, 120) || undefined;
    const email = trimProfileField(membership.email, 160).toLowerCase();
    const teamId = trimProfileField(membership.teamId, 120);
    const nowIso = new Date().toISOString();
    const key = `${teamId}:${userId || email || membership.membershipId}`;
    const normalizedMembership: TeamMembership = {
      ...membership,
      schoolId: normalizedSchoolId,
      teamId,
      userId,
      email,
      membershipId: trimProfileField(membership.membershipId, 120) || buildWorkspaceMembershipId(`${normalizedSchoolId}:${key}`, "team-member"),
      fullName: trimProfileField(membership.fullName, 120),
      role: membership.role ?? "viewer",
      status: membership.status === "invited" ? "invited" : "active",
      createdAtIso: membership.createdAtIso || nowIso,
      updatedAtIso: nowIso,
    };
    deduped.set(key, normalizedMembership);
  }
  const next = [...deduped.values()].sort((left, right) => {
    if (left.teamId !== right.teamId) {
      return left.teamId.localeCompare(right.teamId);
    }
    return left.email.localeCompare(right.email);
  });
  teamMembershipsBySchool.set(normalizedSchoolId, next);
  return next;
}

function setActivityEventsForSchool(schoolId: string, events: ActivityEvent[]): ActivityEvent[] {
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  const next = [...events]
    .map((event) => ({
      ...event,
      schoolId: normalizedSchoolId,
      id: trimProfileField(event.id, 120) || buildWorkspaceMembershipId(`${normalizedSchoolId}:${event.type}:${event.createdAtIso}`, "activity"),
      message: trimProfileField(event.message, 240),
      teamId: trimProfileField(event.teamId, 120) || undefined,
      actorUserId: trimProfileField(event.actorUserId, 120) || undefined,
      createdAtIso: trimProfileField(event.createdAtIso, 64) || new Date().toISOString(),
    }))
    .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso))
    .slice(0, 100);
  activityEventsBySchool.set(normalizedSchoolId, next);
  return next;
}

function setLiveGameSessionsForSchool(schoolId: string, sessionsForSchool: LiveGameSessionRecord[]): LiveGameSessionRecord[] {
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  const next = sessionsForSchool.map((session) => {
    const normalizedSession: LiveGameSessionRecord = {
      ...session,
      schoolId: normalizedSchoolId,
      liveSessionId: trimProfileField(session.liveSessionId, 120),
      teamId: trimProfileField(session.teamId, 120),
      gameId: trimProfileField(session.gameId, 120),
      pairingCode: trimProfileField(session.pairingCode, 32),
      opponentName: trimProfileField(session.opponentName, 120) || undefined,
      opponentTeamId: trimProfileField(session.opponentTeamId, 120) || undefined,
      createdByUserId: trimProfileField(session.createdByUserId, 120) || undefined,
      status: session.status === "completed" ? "completed" : "active",
      createdAtIso: trimProfileField(session.createdAtIso, 64) || new Date().toISOString(),
      updatedAtIso: trimProfileField(session.updatedAtIso, 64) || new Date().toISOString(),
    };
    return normalizedSession;
  });
  liveGameSessionsBySchool.set(normalizedSchoolId, next);
  return next;
}

function upsertOrganizationMemberForSchool(
  schoolId: string,
  input: OrganizationMemberInput,
  organizationId: string,
): OrganizationMember {
  const members = organizationMembersBySchool.get(schoolId) ?? [];
  const email = trimProfileField(input.email, 160).toLowerCase();
  const authSubject = trimProfileField(input.authSubject, 120);
  const existing = members.find((member) =>
    (authSubject && member.authSubject === authSubject)
    || (email && member.email === email)
    || (input.memberId && member.memberId === input.memberId)
  ) ?? null;
  const next = sanitizeOrganizationMember(input, schoolId, organizationId, existing);
  const merged = existing
    ? members.map((member) => (member.memberId === existing.memberId ? next : member))
    : [...members, next];
  setOrganizationMembersForSchool(schoolId, merged);
  return next;
}

function combineInsights(session: GameSession): LiveInsight[] {
  return [...session.aiInsights, ...session.ruleInsights]
    .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso))
    .slice(0, 20);
}

/**
 * Build a lookup map from player ID → "#number name" display label.
 * Falls back to pretty-printing the raw ID if the player is not in the roster.
 */
function buildPlayerLookup(rosterTeam: RosterTeam | null | undefined): Map<string, string> {
  const lookup = new Map<string, string>();
  if (!rosterTeam) return lookup;
  for (const player of rosterTeam.players) {
    const label = player.number ? `#${player.number} ${player.name}` : player.name;
    lookup.set(player.id, label);
  }
  return lookup;
}

/**
 * Resolve a raw player ID to a human-readable label using the roster lookup.
 * Falls back to stripping known prefixes and title-casing the ID.
 */
function resolvePlayerDisplay(playerId: string, lookup: Map<string, string>): string {
  if (lookup.has(playerId)) return lookup.get(playerId)!;
  // Pretty-print: strip common team prefix (e.g. "vc-", "vc_"), replace separators
  return playerId
    .replace(/^[a-z]{1,4}[-_]/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    || playerId;
}

function describeEvent(event: GameEvent, lookup?: Map<string, string>): string {
  const pl = lookup ? (id: string) => resolvePlayerDisplay(id, lookup) : (id: string) => id;
  switch (event.type) {
    case "shot_attempt":
      return `${event.teamId} ${event.made ? "made" : "missed"} ${event.points}pt shot (${event.zone})`;
    case "free_throw_attempt":
      return `${event.teamId} ${event.made ? "made" : "missed"} free throw ${event.attemptNumber}/${event.totalAttempts}`;
    case "rebound":
      return `${event.teamId} ${event.offensive ? "offensive" : "defensive"} rebound by ${pl(event.playerId)}`;
    case "turnover":
      return `${event.teamId} turnover${event.playerId ? ` by ${pl(event.playerId)}` : ""} (${event.turnoverType})`;
    case "foul":
      return `${event.teamId} foul on ${pl(event.playerId)} (${event.foulType})`;
    case "assist":
      return `${event.teamId} assist by ${pl(event.playerId)}`;
    case "steal":
      return `${event.teamId} steal by ${pl(event.playerId)}`;
    case "block":
      return `${event.teamId} block by ${pl(event.playerId)}`;
    case "substitution":
      return `${event.teamId} substitution ${pl(event.playerOutId)} → ${pl(event.playerInId)}`;
    case "possession_start":
      return `possession starts for ${event.possessedByTeamId}`;
    case "possession_end":
      return `possession ends for ${event.possessedByTeamId} (${event.result})`;
    case "timeout":
      return `${event.teamId} timeout (${event.timeoutType})`;
    case "period_transition":
      return `period starts: ${event.newPeriod}`;
  }

  return "unknown event";
}

function isPreGameState(state: GameState, orderedEvents: GameEvent[]): boolean {
  const totalScore = Object.values(state.scoreByTeam).reduce((sum, s) => sum + s, 0);
  return state.currentPeriod === "Q1" && totalScore === 0 && orderedEvents.length < 5;
}

function formatFgPct(made: number, att: number): string {
  if (att === 0) return "0%";
  return `${Math.round(made / att * 100)}%`;
}

function summarizeTeamState(
  state: GameState,
  teamId: string,
  isOurTeam: boolean,
  opponentStatsLimited: boolean,
  lookup?: Map<string, string>
): string {
  const teamStats = state.teamStats[teamId];
  const players = Object.values(state.playerStatsByTeam[teamId] ?? {});
  const teamLabel = isOurTeam
    ? (teamId === state.homeTeamId ? "Our team (home)" : "Our team (away)")
    : (state.opponentName?.trim() || (teamId === state.homeTeamId ? "Opponent (home)" : "Opponent (away)"));

  const sortedPlayers = [...players].sort((left, right) => right.points - left.points);
  const topScorer = sortedPlayers[0];
  const pl = lookup ? (id: string) => resolvePlayerDisplay(id, lookup) : (id: string) => id;
  const foulTroubledPlayers = players
    .filter((p) => (state.playerFouls[p.playerId] ?? 0) >= 3)
    .map((p) => `${pl(p.playerId)}(${state.playerFouls[p.playerId]}f)`)
    .join(", ");

  const fgPct = formatFgPct(teamStats?.shooting.fgMade ?? 0, teamStats?.shooting.fgAttempts ?? 0);
  const activeLineup = (state.activeLineupsByTeam[teamId] ?? []).map(pl).join(", ");

  const lines = [
    `${teamLabel}: ${state.scoreByTeam[teamId] ?? 0} pts`,
    `FG ${teamStats?.shooting.fgMade ?? 0}/${teamStats?.shooting.fgAttempts ?? 0} (${fgPct})`,
    `FT ${teamStats?.shooting.ftMade ?? 0}/${teamStats?.shooting.ftAttempts ?? 0}`,
    `Reb off/def: ${teamStats?.reboundsOff ?? 0}/${teamStats?.reboundsDef ?? 0}`,
    `TO ${teamStats?.turnovers ?? 0}`,
    `Fouls ${teamStats?.fouls ?? 0}`,
    `Bonus ${state.bonusByTeam[teamId] ? "YES" : "no"}`,
    topScorer ? `Top scorer: ${pl(topScorer.playerId)} (${topScorer.points}pts, ${topScorer.fgMade}/${topScorer.fgAttempts}FG)` : "Top scorer: none",
    foulTroubledPlayers ? `Foul trouble: ${foulTroubledPlayers}` : "",
    activeLineup ? `Active lineup: ${activeLineup}` : ""
  ].filter(Boolean).join(", ");

  // If opponent — note partial tracking
  if (!isOurTeam && opponentStatsLimited) {
    return `${lines} [NOTE: opponent tracking may be score+fouls only]`;
  }
  return lines;
}

function buildRosterMetadataLines(state: GameState, teamId: string, schoolId: string): string[] {
  const rosterTeam = getRosterTeamsForSchool(schoolId).find((team) => team.id === teamId);
  if (!rosterTeam) {
    return [];
  }

  const liveLineup = new Set(state.activeLineupsByTeam[teamId] ?? []);
  const statPlayers = Object.values(state.playerStatsByTeam[teamId] ?? {});
  const relevantPlayers = new Set<string>([
    ...liveLineup,
    ...statPlayers
      .filter((player) => player.points > 0 || player.fouls >= 2 || player.turnovers > 0)
      .map((player) => player.playerId)
  ]);

  const relevantMetadata = rosterTeam.players
    .filter((player) => player.role?.trim() || player.notes?.trim())
    .filter((player) => relevantPlayers.size === 0 || relevantPlayers.has(player.id));

  const playersToDescribe = (relevantMetadata.length > 0 ? relevantMetadata : rosterTeam.players)
    .filter((player) => player.role?.trim() || player.notes?.trim())
    .slice(0, 8);

  return playersToDescribe.map((player) => {
    const displayLabel = player.number ? `#${player.number} ${player.name}` : player.name;
    const details = [
      player.role?.trim() ? `role: ${player.role.trim()}` : "",
      player.notes?.trim() ? `context: ${player.notes.trim()}` : "",
      liveLineup.has(player.id) ? "currently in lineup" : ""
    ].filter(Boolean).join("; ");

    return `- ${displayLabel}: ${details}`;
  });
}

function isOpeningSample(state: GameState, orderedEvents: GameEvent[]): boolean {
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const inEarlyQ1 = state.currentPeriod === "Q1" && (latestEvent?.clockSecondsRemaining ?? 0) >= 390;
  const lowEventVolume = orderedEvents.length < 10;
  return inEarlyQ1 || lowEventVolume;
}

/**
 * Compute 3PT and 2PT shooting splits from raw events for both teams.
 */
function buildShotQualityLines(
  orderedEvents: GameEvent[],
  ourTeamId: string,
  opponentTeamId: string,
  opponentStatsLimited: boolean,
): string {
  const shots = orderedEvents.filter((e): e is typeof e & { type: "shot_attempt" } => e.type === "shot_attempt");

  function computeSplits(teamId: string) {
    const teamShots = shots.filter((e) => e.teamId === teamId);
    const two = teamShots.filter((e) => e.points === 2);
    const three = teamShots.filter((e) => e.points === 3);
    const twoMade = two.filter((e) => e.made).length;
    const threeMade = three.filter((e) => e.made).length;
    const twoPct = two.length > 0 ? Math.round((twoMade / two.length) * 100) : 0;
    const threePct = three.length > 0 ? Math.round((threeMade / three.length) * 100) : 0;
    return { twoMade, twoAtt: two.length, twoPct, threeMade, threeAtt: three.length, threePct };
  }

  const us = computeSplits(ourTeamId);
  const them = computeSplits(opponentTeamId);

  const ourLine = `Us: 2PT ${us.twoMade}/${us.twoAtt} (${us.twoPct}%), 3PT ${us.threeMade}/${us.threeAtt} (${us.threePct}%)`;
  if (opponentStatsLimited) {
    return `Shot quality — ${ourLine}; Opponent: limited tracking`;
  }
  const theirLine = `Opponent: 2PT ${them.twoMade}/${them.twoAtt} (${them.twoPct}%), 3PT ${them.threeMade}/${them.threeAtt} (${them.threePct}%)`;
  return `Shot quality — ${ourLine}; ${theirLine}`;
}

/**
 * Detect any recent scoring run over the last N scoring events.
 * Returns a string like "us on 8-0 run (last 6 scoring events)" or "" if balanced.
 */
function buildScoringRunSummary(
  orderedEvents: GameEvent[],
  ourTeamId: string,
  opponentTeamId: string,
): string {
  const SCORING_WINDOW = 16;
  // Collect point-scoring events in order
  interface ScoringPoint { teamId: string; points: number }
  const scoringEvents: ScoringPoint[] = [];
  for (const e of orderedEvents) {
    if (e.type === "shot_attempt" && e.made) {
      scoringEvents.push({ teamId: e.teamId, points: e.points });
    } else if (e.type === "free_throw_attempt" && e.made) {
      scoringEvents.push({ teamId: e.teamId, points: 1 });
    }
  }
  const recent = scoringEvents.slice(-SCORING_WINDOW);
  if (recent.length < 4) return "";

  // Find longest tail of unanswered scoring by one team
  let runTeam = recent[recent.length - 1].teamId;
  let runPoints = 0;
  let otherPoints = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].teamId === runTeam) {
      runPoints += recent[i].points;
    } else {
      otherPoints += recent[i].points;
      if (otherPoints > 0) break;
    }
  }

  if (runPoints >= 5 && otherPoints === 0) {
    const teamLabel = runTeam === ourTeamId ? "We are" : "Opponent is";
    return `Scoring run: ${teamLabel} on a ${runPoints}-0 unanswered run`;
  }

  return "";
}

/**
 * Most recent substitutions (last 4) for both teams for the AI prompt.
 */
function buildRecentSubstitutionLines(
  orderedEvents: GameEvent[],
  ourTeamId: string,
  playerLookup: Map<string, string>,
): string {
  const subs = orderedEvents
    .filter((e): e is typeof e & { type: "substitution" } => e.type === "substitution")
    .slice(-4);

  if (subs.length === 0) return "";

  const emptyLookup = new Map<string, string>();
  const lines = subs.map((e) => {
    const lookup = e.teamId === ourTeamId ? playerLookup : emptyLookup;
    const pl = (id: string) => resolvePlayerDisplay(id, lookup);
    const label = e.teamId === ourTeamId ? "us" : "opp";
    return `${label}: ${pl(e.playerOutId)} out → ${pl(e.playerInId)} in`;
  });

  return `Recent subs: ${lines.join(" | ")}`;
}

/**
 * Shared game context block used by both the live insight and chat prompt builders.
 * Returns an array of non-empty lines ready to join with "\n".
 */
function buildGameContextBlock(params: {
  session: GameSession;
  orderedEvents: GameEvent[];
  ourTeamId: string;
  opponentTeamId: string;
  aiSettings: CoachAiSettings;
  aiContext: GameAiContext;
  rosterTeam: ReturnType<typeof getRosterTeamsForSchool>[number] | undefined;
  playerLookup: Map<string, string>;
  historicalContextSummary?: string;
  includeDetailedPlayerStats?: boolean;
}): string[] {
  const {
    session,
    orderedEvents,
    ourTeamId,
    opponentTeamId,
    aiSettings,
    aiContext,
    rosterTeam,
    playerLookup,
    historicalContextSummary,
    includeDetailedPlayerStats,
  } = params;
  const state = session.state;
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const isOT = isOvertimePeriod(state.currentPeriod);
  const openingSample = isOpeningSample(state, orderedEvents);
  const clockSec = latestEvent?.clockSecondsRemaining ?? 0;
  const clockStr = clockSec >= 60
    ? `${Math.floor(clockSec / 60)}:${String(clockSec % 60).padStart(2, "0")}`
    : `${clockSec}s`;

  const homeLabel = state.homeTeamId === ourTeamId ? "Our team (home)" : (state.opponentName || "Opponent (home)");
  const awayLabel = state.awayTeamId === ourTeamId ? "Our team (away)" : (state.opponentName || "Opponent (away)");

  const timeouts = orderedEvents.filter((e) => e.type === "timeout");
  const ourTimeouts = timeouts.filter((e) => e.teamId === ourTeamId).length;
  const oppTimeouts = timeouts.filter((e) => e.teamId === opponentTeamId).length;
  const maxRegTimeouts = 3;
  const maxOTTimeouts = 1;
  const maxTimeouts = isOT ? maxOTTimeouts : maxRegTimeouts;

  const emptyLookup = new Map<string, string>();
  const ourLineup = (state.activeLineupsByTeam[ourTeamId] ?? []).map((id) => resolvePlayerDisplay(id, playerLookup)).join(", ");
  const theirLineup = (state.activeLineupsByTeam[opponentTeamId] ?? []).map((id) => resolvePlayerDisplay(id, emptyLookup)).join(", ");

  const ourPlayers = Object.values(state.playerStatsByTeam[ourTeamId] ?? {});
  const playerFoulLines = ourPlayers
    .filter((p) => (state.playerFouls[p.playerId] ?? 0) >= 2)
    .sort((a, b) => (state.playerFouls[b.playerId] ?? 0) - (state.playerFouls[a.playerId] ?? 0))
    .map((p) => {
      const f = state.playerFouls[p.playerId] ?? 0;
      const foulNote = f >= 4 ? " (FOUL OUT RISK)" : f === 3 ? " (watch)" : "";
      const display = resolvePlayerDisplay(p.playerId, playerLookup);
      return `${display}: ${f} fouls${foulNote}, ${p.points}pts, ${p.fgMade}/${p.fgAttempts}FG`;
    });

  const recentEvents = orderedEvents.slice(-LIVE_AI_RECENT_EVENT_WINDOW);
  const recentEventLines = recentEvents.map((e) => `- ${describeEvent(e, playerLookup)}`).join("\n");

  const combinedStyle = [rosterTeam?.coachStyle?.trim(), aiSettings.playingStyle].filter(Boolean).join(" | ");
  const styleLine = combinedStyle ? `Team playing style from coach: ${combinedStyle}` : "Team playing style from coach: not provided";
  const contextLine = aiSettings.teamContext ? `Team context from coach: ${aiSettings.teamContext}` : "Team context from coach: not provided";
  const customPromptLine = aiSettings.customPrompt ? `Custom coach instruction: ${aiSettings.customPrompt}` : "";
  const focusInsightsLine = aiSettings.focusInsights.length > 0
    ? `Coach requested focus: ${aiSettings.focusInsights.join(", ")}`
    : "Coach requested focus: none";
  const preGameNotesLine = aiContext.preGameNotes ? `Pre-game notes from coach: ${aiContext.preGameNotes}` : "";
  const rosterMetadataLines = buildRosterMetadataLines(state, ourTeamId, session.schoolId);
  const clockTrackingLine = `Clock tracking status: ${aiContext.clockEnabled ? "enabled" : "disabled"}`;
  const opponentTrackingLine = aiContext.opponentStatsLimited
    ? `Opponent stat tracking: limited (${aiContext.opponentTrackedStats.join(", ")})`
    : `Opponent stat tracking: expanded (${aiContext.opponentTrackedStats.join(", ")})`;
  const runSummary = buildScoringRunSummary(orderedEvents, ourTeamId, opponentTeamId);
  const shotQualityLine = buildShotQualityLines(orderedEvents, ourTeamId, opponentTeamId, aiContext.opponentStatsLimited);
  const recentSubsLine = buildRecentSubstitutionLines(orderedEvents, ourTeamId, playerLookup);
  const historicalLine = historicalContextSummary
    ? `Historical context from stats dashboard: ${historicalContextSummary}`
    : "Historical context from stats dashboard: unavailable — AI relies on live game data only";

  const detailedStatBlock = includeDetailedPlayerStats
    ? `Current player stats (our team):\n${buildCurrentPlayerSnapshot(state, ourTeamId, playerLookup)}`
    : "";

  return [
    `Game: ${state.gameId}`,
    `Period: ${state.currentPeriod}${isOT ? " [OVERTIME — 4-min period, 1 timeout per team per OT]" : ""}`,
    `Clock: ${clockStr}${latestEvent && clockSec === 0 ? " [clock at 0:00 in latest event]" : ""}`,
    clockTrackingLine,
    opponentTrackingLine,
    `Sample context: ${openingSample ? "opening_small_sample — be conservative with conclusions" : "stabilized"}`,
    "",
    `Score: ${homeLabel} ${state.scoreByTeam[session.homeTeamId] ?? 0} — ${awayLabel} ${state.scoreByTeam[session.awayTeamId] ?? 0}`,
    runSummary,
    "",
    "Team snapshots:",
    summarizeTeamState(state, ourTeamId, true, aiContext.opponentStatsLimited, playerLookup),
    summarizeTeamState(state, opponentTeamId, false, aiContext.opponentStatsLimited),
    "",
    shotQualityLine,
    `Timeouts used — us: ${ourTimeouts}/${maxTimeouts}, them: ${oppTimeouts}/${maxTimeouts}`,
    "",
    styleLine,
    contextLine,
    preGameNotesLine,
    historicalLine,
    focusInsightsLine,
    customPromptLine,
    rosterMetadataLines.length > 0 ? `Roster context from coaches:\n${rosterMetadataLines.join("\n")}` : "",
    "",
    ourLineup ? `Our current lineup: ${ourLineup}` : "",
    theirLineup ? `Their current lineup: ${theirLineup}` : "",
    recentSubsLine,
    playerFoulLines.length > 0 ? `Our player foul detail:\n${playerFoulLines.join("\n")}` : "",
    detailedStatBlock,
    "",
    `Recent events (last ${Math.min(LIVE_AI_RECENT_EVENT_WINDOW, recentEvents.length)}):`,
    recentEventLines || "- none",
  ].filter(Boolean);
}

function buildAiInsightPrompt(
  session: GameSession,
  orderedEvents: GameEvent[],
  historicalContextSummary?: string
): string {
  const state = session.state;
  const openingSample = isOpeningSample(state, orderedEvents);
  const preGame = isPreGameState(state, orderedEvents);
  const rawAiSettings = sanitizeCoachAiSettings(session.aiSettings);
  const aiContext = sanitizeGameAiContext(session.aiContext);
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const isOT = isOvertimePeriod(state.currentPeriod);

  const ourTeamId = state.opponentTeamId
    ? (state.homeTeamId !== state.opponentTeamId ? state.homeTeamId : state.awayTeamId)
    : session.homeTeamId;
  const opponentTeamId = state.opponentTeamId ?? session.awayTeamId;
  const rosterTeam = getRosterTeamsForSchool(session.schoolId).find((team) => team.id === ourTeamId);
  const playerLookup = buildPlayerLookup(rosterTeam);

  const aiSettings = sanitizeCoachAiSettings({
    ...rawAiSettings,
    teamContext: rawAiSettings.teamContext || (rosterTeam?.teamContext ?? ""),
    customPrompt: rawAiSettings.customPrompt || (rosterTeam?.customPrompt ?? ""),
    focusInsights: rawAiSettings.focusInsights.length > 0 ? rawAiSettings.focusInsights : (Array.isArray(rosterTeam?.focusInsights) ? rosterTeam.focusInsights : []),
  });

  if (preGame) {
    const homeLabel = state.homeTeamId === ourTeamId ? "Our team (home)" : (state.opponentName || "Opponent (home)");
    const awayLabel = state.awayTeamId === ourTeamId ? "Our team (away)" : (state.opponentName || "Opponent (away)");
    const preGameNotesLine = aiContext.preGameNotes ? `Pre-game notes from coach: ${aiContext.preGameNotes}` : "";
    return [
      "CONTEXT: Game has just started — minimal data available.",
      "Give ONE general pre-game readiness note only. Do not reference stats or runs.",
      `Home: ${homeLabel} | Away: ${awayLabel}`,
      preGameNotesLine,
      "IMPORTANT: Do not make assumptions about plays, strategies, or player roles without data.",
      "IMPORTANT: Do NOT refer to players by raw IDs — use player names from roster context only.",
    ].filter(Boolean).join("\n");
  }

  const contextLines = buildGameContextBlock({
    session,
    orderedEvents,
    ourTeamId,
    opponentTeamId,
    aiSettings,
    aiContext,
    rosterTeam,
    playerLookup,
    historicalContextSummary,
  });

  const clockSec = latestEvent?.clockSecondsRemaining ?? 0;
  const rules = [
    "",
    "RULES for your response:",
    "- You are helping OUR team (identified above). Give advice that benefits us, not the opponent.",
    "- Do NOT invent or guess tactical plays, player roles, or tendencies not visible in the data.",
    "- ONLY name specific players when their stats (fouls, points, etc.) directly support the claim.",
    "- If clock tracking status is disabled, omit clock-specific urgency statements and avoid time-dependent calls.",
    "- If opponent stat tracking is limited, avoid assumptions about opponent rebounds, assists, turnovers, and shot profile unless explicitly shown.",
    "- Think in this order before writing: score/time state -> foul/timeout constraints -> best immediate action -> fallback action.",
    "- Prioritize the coach's focus settings and custom instructions when they do not conflict with game reality.",
    "- Each insight must follow: Trigger | Action | Why-now, using concrete numbers from the context.",
    "- In clutch time (<= 30s, margin <= 3), always include one end-game management call (timeout/foul/2-for-1/quick-hit).",
    "- If multiple actions are reasonable, provide best call first and one fallback option.",
    isOT ? "- This is OVERTIME — timeout urgency is critical (only 1 per team). Note if either team still has their OT timeout." : "",
    openingSample
      ? "- Opening sample: keep claims conservative. No momentum/run language yet."
      : "- Data is stabilized: include decisive tactical calls grounded in provided stats only.",
    clockSec > 0 && clockSec <= 30 && !aiContext.clockEnabled
      ? ""
      : "- If historical context is unavailable, base all strategy on live game data only — do not speculate about season tendencies.",
    "- Allowed insight types per call: timeout suggestion, sub suggestion, foul management, momentum, shot selection, ball security.",
    "- Multiple insights allowed if the situation clearly warrants distinct calls.",
    "- Keep each message concise, command-style, and immediately actionable.",
  ];

  return [...contextLines, ...rules].filter(Boolean).join("\n");
}

function resolveRecordLine(seasonStats: Pick<SeasonTeamStats, "win" | "loss">): string {
  const wins = Number(seasonStats.win ?? 0);
  const losses = Number(seasonStats.loss ?? 0);
  if (Number.isFinite(wins) && Number.isFinite(losses) && (wins > 0 || losses > 0)) {
    return `${wins}-${losses}`;
  }
  return "n/a";
}

function resolveTeamLabelFromRoster(teamId: string, schoolId: string): string {
  const team = getRosterTeamsForSchool(schoolId).find((item) => item.id === teamId);
  return team?.name?.trim() || team?.abbreviation?.trim() || teamId;
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimToLength(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeAiInsightText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function hasUnsafeAiInsightText(value: string): boolean {
  if (!value) {
    return true;
  }

  const lower = value.toLowerCase();
  if (lower.includes("```") || /<\s*script/i.test(value)) {
    return true;
  }

  return /(ignore\s+(all\s+)?previous\s+instructions|disregard\s+previous\s+instructions|reveal\s+system\s+prompt|show\s+system\s+prompt|developer\s+message|prompt\s+injection|jailbreak)/i.test(value);
}

function summarizeHistoricalPlayers(playersPayload: SeasonPlayerSummary[], session: GameSession): string {
  if (playersPayload.length === 0) {
    return "";
  }

  const ourTeamId = session.opponentTeamId
    ? (session.homeTeamId !== session.opponentTeamId ? session.homeTeamId : session.awayTeamId)
    : session.homeTeamId;
  const rosterTeam = getRosterTeamsForSchool(session.schoolId).find((team) => team.id === ourTeamId);
  const rosterNames = new Set((rosterTeam?.players ?? []).map((player) => player.name.trim().toLowerCase()).filter(Boolean));

  const preferredPlayers = playersPayload.filter((player) => {
    const fullName = trimToLength(player.full_name, 120).toLowerCase();
    const name = trimToLength(player.name, 120).toLowerCase();
    return rosterNames.size === 0 || rosterNames.has(fullName) || rosterNames.has(name);
  });

  const playersToSummarize = (preferredPlayers.length > 0 ? preferredPlayers : playersPayload)
    .slice()
    .sort((left, right) => safeNumber(right.ppg) - safeNumber(left.ppg))
    .slice(0, 12);

  if (playersToSummarize.length === 0) {
    return "";
  }

  return playersToSummarize.map((player) => {
    const fullName = trimToLength(player.full_name, 120) || trimToLength(player.name, 120) || "Unknown";
    const number = trimToLength(player.number, 8);
    const role = trimToLength(player.role, 80) || trimToLength((player.roster_info as { role?: unknown } | undefined)?.role, 80);
    const notes = trimToLength((player.roster_info as { notes?: unknown } | undefined)?.notes, 140);
    const line = [
      `${fullName}${number ? ` (#${number})` : ""}`,
      `${safeNumber(player.ppg).toFixed(1)} ppg`,
      `${safeNumber(player.rpg).toFixed(1)} rpg`,
      `${safeNumber(player.apg).toFixed(1)} apg`,
      `${safeNumber(player.fg_pct).toFixed(1)} FG%`,
      `${safeNumber(player.fg3_pct).toFixed(1)} 3PT%`,
      `${safeNumber(player.ft_pct).toFixed(1)} FT%`,
      `${safeNumber(player.fpg).toFixed(1)} fouls/g`,
      role ? `role: ${role}` : "",
      notes ? `notes: ${notes}` : "",
    ].filter(Boolean).join(", ");

    return `- ${line}`;
  }).join("\n");
}

function buildCurrentPlayerSnapshot(state: GameState, teamId: string, lookup?: Map<string, string>): string {
  const playerStats = Object.values(state.playerStatsByTeam[teamId] ?? {})
    .slice()
    .sort((left, right) => right.points - left.points || right.fgMade - left.fgMade);

  if (playerStats.length === 0) {
    return "No tracked player stats yet.";
  }

  const pl = lookup ? (id: string) => resolvePlayerDisplay(id, lookup) : (id: string) => id;
  return playerStats
    .map((player) => {
      const fgPct = player.fgAttempts > 0 ? Math.round((player.fgMade / player.fgAttempts) * 100) : 0;
      const fouls = state.playerFouls[player.playerId] ?? player.fouls ?? 0;
      return `- ${pl(player.playerId)}: ${player.points} pts, ${player.fgMade}/${player.fgAttempts} FG (${fgPct}%), ${player.ftMade}/${player.ftAttempts} FT, ${player.reboundsOff + player.reboundsDef} reb, ${player.assists} ast, ${player.turnovers} to, ${fouls} fouls`;
    })
    .join("\n");
}

function sanitizeAiChatHistory(history: unknown): CoachAiChatMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item): CoachAiChatMessage => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: trimToLength(item.content, 1200),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-12);
}

function buildAiChatPrompt(
  session: GameSession,
  orderedEvents: GameEvent[],
  question: string,
  history: CoachAiChatMessage[],
  historicalContextSummary?: string
): string {
  const state = session.state;
  const ourTeamId = state.opponentTeamId
    ? (state.homeTeamId !== state.opponentTeamId ? state.homeTeamId : state.awayTeamId)
    : session.homeTeamId;
  const opponentTeamId = state.opponentTeamId ?? session.awayTeamId;
  const rawAiSettings = sanitizeCoachAiSettings(session.aiSettings);
  const aiContext = sanitizeGameAiContext(session.aiContext);
  const rosterTeam = getRosterTeamsForSchool(session.schoolId).find((team) => team.id === ourTeamId);
  const playerLookup = buildPlayerLookup(rosterTeam);

  const aiSettings = sanitizeCoachAiSettings({
    ...rawAiSettings,
    teamContext: rawAiSettings.teamContext || (rosterTeam?.teamContext ?? ""),
    customPrompt: rawAiSettings.customPrompt || (rosterTeam?.customPrompt ?? ""),
    focusInsights: rawAiSettings.focusInsights.length > 0 ? rawAiSettings.focusInsights : (Array.isArray(rosterTeam?.focusInsights) ? rosterTeam.focusInsights : []),
  });

  const contextLines = buildGameContextBlock({
    session,
    orderedEvents,
    ourTeamId,
    opponentTeamId,
    aiSettings,
    aiContext,
    rosterTeam,
    playerLookup,
    historicalContextSummary,
    includeDetailedPlayerStats: true,
  });

  const chatHistory = history.length > 0
    ? history.map((entry) => `${entry.role === "assistant" ? "Assistant" : "Coach"}: ${entry.content}`).join("\n")
    : "Coach: no prior chat in this thread";

  const activeAlerts = (session.ruleInsights ?? []).slice(0, 6).map((i) => `- [${i.type}] ${i.message}`).join("\n");

  return [
    ...contextLines,
    "",
    activeAlerts ? `Active system alerts:\n${activeAlerts}` : "",
    "",
    `Conversation so far:\n${chatHistory}`,
    "",
    `Coach question: ${question}`,
    "",
    "Answer rules:",
    "- Answer as an in-game varsity basketball bench assistant for OUR team.",
    "- Use the live game state, player stats, roster context, coach instructions, and active alerts provided above.",
    "- Prioritize coach's style, context, focus areas, and custom instructions when they don't conflict with game reality.",
    "- When recommending substitutions, name exactly who goes in/out and explain the trigger clearly.",
    "- Reference specific player foul counts, stats, and lineup context when making calls.",
    "- If opponent stats are limited, avoid assumptions about opponent rebounding, assists, or shot profile.",
    "- If historical context is unavailable, base answers on live game data only — do not speculate about season tendencies.",
    "- If data is incomplete, say so directly instead of guessing.",
    "- Keep answers concise and immediately actionable with concrete numbers.",
    "- Output strict JSON: {\"answer\":\"...\",\"suggestions\":[\"...\",\"...\"]}",
    "- suggestions: 0 to 3 short follow-up questions the coach may want to ask next.",
    "- No markdown. No code fences.",
  ].filter(Boolean).join("\n");
}

async function fetchHistoricalContextSummary(session: GameSession): Promise<string> {
  async function attempt(): Promise<string> {
    try {
      const analytics = buildSchoolAnalytics({ schoolId: session.schoolId });
      const seasonStats = analytics.seasonTeamStats;
      const games = analytics.games;
      const players = analytics.players;

      const seasonLine = [
        `record ${resolveRecordLine(seasonStats)}`,
        `PPG ${Number(seasonStats.ppg ?? 0).toFixed(1)}`,
        `Opp PPG ${Number(seasonStats.opp_ppg ?? 0).toFixed(1)}`,
        `FG% ${Math.round(Number(seasonStats.fg_pct ?? 0) * 100)}%`,
        `3PT% ${Math.round(Number(seasonStats.fg3_pct ?? 0) * 100)}%`,
        `TO avg ${Number(seasonStats.to_avg ?? 0).toFixed(1)}`
      ].join(", ");

      const recentGames = Array.isArray(games)
        ? [...games].sort((a, b) => Number(b.gameId ?? 0) - Number(a.gameId ?? 0)).slice(0, 3)
        : [];
      const ourTeamId = session.opponentTeamId
        ? (session.homeTeamId !== session.opponentTeamId ? session.homeTeamId : session.awayTeamId)
        : session.homeTeamId;
      const ourTeamLabel = resolveTeamLabelFromRoster(ourTeamId, session.schoolId);

      const recentLine = recentGames.length > 0
        ? recentGames.map((game) => {
          const vc = Number(game.vc_score ?? 0);
          const opp = Number(game.opp_score ?? 0);
          const opponent = String(game.opponent ?? "Unknown");
          const result = vc > opp ? "W" : vc < opp ? "L" : "T";
          return `${opponent} ${result} ${vc}-${opp}`;
        }).join(" | ")
        : "no recent games";

      const playerLine = summarizeHistoricalPlayers(players, session);

      return `${ourTeamLabel} season: ${seasonLine}. Last games: ${recentLine}.${playerLine ? ` Player history:\n${playerLine}` : ""}`;
    } catch {
      return "";
    }
  }

  const result = await attempt();
  if (result) return result;
  // Retry once in case analytics assembly races with very recent writes.
  await new Promise<void>((resolve) => setTimeout(resolve, 1200));
  return attempt();
}

function parseAiChatResponse(content: string): { answer: string; suggestions: string[] } {
  try {
    const parsed = JSON.parse(content) as { answer?: unknown; suggestions?: unknown };
    const answer = trimToLength(parsed.answer, 4000);
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map((item) => trimToLength(item, 160)).filter(Boolean).slice(0, 3)
      : [];

    if (answer) {
      return { answer, suggestions };
    }
  } catch {
    // Fall through to raw-text fallback.
  }

  return {
    answer: trimToLength(content, 4000),
    suggestions: []
  };
}

async function requestAiChatResponse(
  session: GameSession,
  question: string,
  history: CoachAiChatMessage[]
): Promise<CoachAiChatResponse | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return null;
  }

  const budgetViolation = getAiBudgetViolation(session);
  if (budgetViolation) {
    markAiFailure(session, budgetViolation.code, budgetViolation.message, budgetViolation.status);
    return null;
  }

  const orderedEvents = listOrderedEvents(session);
  const latestEventForChat = orderedEvents[orderedEvents.length - 1];
  const isChatPeriodTransition = latestEventForChat?.type === "period_transition";
  if (isChatPeriodTransition || Date.now() - session.historicalContextFetchedAtMs >= HISTORICAL_CONTEXT_TTL_MS) {
    const summary = await fetchHistoricalContextSummary(session);
    if (summary) {
      session.historicalContextSummary = summary;
      session.historicalContextFetchedAtMs = Date.now();
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_AI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: LIVE_AI_MODEL,
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a live varsity basketball assistant for the coaching staff.",
              "Answer in-game questions using the provided live stats, lineup context, recent events, and historical team/player performance.",
              "Favor concrete coaching actions: subs, defensive pressure, foul management, pace, shot diet, timeout use.",
              "Do not invent scheme or player tendencies that are not present in the provided context.",
              "If evidence is thin, say so clearly.",
              "Output strict JSON only: {\"answer\":\"...\",\"suggestions\":[\"...\"]}."
            ].join(" ")
          },
          {
            role: "user",
            content: buildAiChatPrompt(session, orderedEvents, question, history, session.historicalContextSummary)
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const failure = mapOpenAiHttpFailure(response.status);
      logger.warn("ai.chat_upstream_failure", {
        gameId: session.state.gameId,
        schoolId: session.schoolId,
        status: failure.status,
        code: failure.code,
      });
      return null;
    }

    const payload = await response.json() as {
      usage?: unknown;
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    recordAiUsage(session, payload.usage);
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = parseAiChatResponse(content);
    return {
      answer: parsed.answer,
      suggestions: parsed.suggestions,
      generatedAtIso: new Date().toISOString(),
      usedHistoricalContext: Boolean(session.historicalContextSummary)
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.warn("ai.chat_timeout", {
        gameId: session.state.gameId,
        schoolId: session.schoolId,
      });
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseAiInsightResponse(content: string, session: GameSession, latestEvent: GameEvent): LiveInsight[] {
  const parsed = JSON.parse(content) as { insights?: unknown };
  const rawInsights = Array.isArray(parsed.insights) ? parsed.insights : [];
  const validTeams = new Set(Object.keys(session.state.scoreByTeam));
  const createdAtIso = new Date().toISOString();

  const insights = rawInsights
    .map((item, index): LiveInsight | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const message = normalizeAiInsightText(raw.message, 280);
      const explanation = normalizeAiInsightText(raw.explanation, 500);
      if (!message || !explanation) {
        return null;
      }

      // Discard suspiciously short/bloated insights and obvious prompt-injection patterns.
      if (message.length < 12 || explanation.length < 20) {
        return null;
      }
      if (hasUnsafeAiInsightText(message) || hasUnsafeAiInsightText(explanation)) {
        return null;
      }

      const relatedTeamId = typeof raw.relatedTeamId === "string" && validTeams.has(raw.relatedTeamId)
        ? raw.relatedTeamId
        : undefined;
      const confidence = raw.confidence === "high" ? "high" : "medium";

      // Prefix so coaches can identify model-generated advice on the dashboard
      const labeledMessage = `[AI] ${message}`;

      return {
        id: `ai-${latestEvent.id}-${index}`,
        gameId: session.state.gameId,
        type: "ai_coaching",
        priority: "important",
        createdAtIso,
        confidence,
        message: labeledMessage,
        explanation,
        relatedTeamId
      };
    })
    .filter((insight): insight is LiveInsight => insight !== null);

  // Allow up to 4 AI insights for richer late-game and OT guidance
  return insights.slice(0, 4);
}

async function requestAiInsights(session: GameSession, orderedEvents: GameEvent[]): Promise<LiveInsight[]> {
  const apiKey = getOpenAiApiKey();
  const latestEvent = orderedEvents[orderedEvents.length - 1];

  if (!apiKey || !latestEvent) {
    return [];
  }

  const budgetViolation = getAiBudgetViolation(session);
  if (budgetViolation) {
    markAiFailure(session, budgetViolation.code, budgetViolation.message, budgetViolation.status);
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_AI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: LIVE_AI_MODEL,
        temperature: 0.2,
        max_tokens: 650,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a varsity basketball bench assistant speaking directly to coaches in real time.",
              "Your job is to help OUR team win — all advice should benefit our team.",
              "Use ONLY the provided game state and recent events. Never invent plays, tendencies, or player roles.",
              "NEVER guess tactical plays (e.g. pick and roll) unless that specific event type appeared in the data.",
              "Base player-specific advice only on stats (points, fouls, FG%) that appear in the context.",
              "Be direct, practical, command-style. No fluff, no analysis paragraphs.",
              "Decision quality standard: prioritize the highest-leverage next possession call before secondary advice.",
              "When game state is clutch or overtime, include time/score management (timeouts, foul strategy, tempo) grounded in context.",
              "When clock context is unavailable/disabled, avoid time-specific commands and focus on possession quality and foul/lineup management.",
              "Output strict JSON: {\"insights\":[{\"message\":\"...\",\"explanation\":\"...\",\"relatedTeamId\":\"...\",\"confidence\":\"high|medium\"}]}",
              "message: one concise coaching call.",
              "explanation: one stat-grounded reason from the data provided, including trigger and why-now.",
              "You may write 1 to 4 insights if the situation warrants multiple distinct calls.",
              "No markdown. No code fences."
            ].join(" ")
          },
          {
            role: "user",
            content: buildAiInsightPrompt(session, orderedEvents, session.historicalContextSummary)
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const failure = mapOpenAiHttpFailure(response.status);
      markAiFailure(session, failure.code, failure.message, failure.status);
      return [];
    }

    const payload = await response.json() as {
      usage?: unknown;
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    recordAiUsage(session, payload.usage);
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      markAiFailure(session, "invalid_payload", "OpenAI returned empty chat completion content", 502);
      return [];
    }

    let parsedInsights: LiveInsight[];
    try {
      parsedInsights = parseAiInsightResponse(content, session, latestEvent);
    } catch {
      markAiFailure(session, "invalid_payload", "OpenAI returned invalid JSON payload", 502);
      return [];
    }

    markAiSuccess(session);
    if (!isOpeningSample(session.state, orderedEvents)) {
      return parsedInsights;
    }

    return parsedInsights
      .slice(0, 1)
      .map((insight) => ({
        ...insight,
        explanation: insight.explanation.startsWith("Opening sample")
          ? insight.explanation
          : `Opening sample: ${insight.explanation}`
      }));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      markAiFailure(session, "timeout", "OpenAI request timed out", 504);
      return [];
    }

    markAiFailure(session, "network_error", "OpenAI request failed due to network/runtime error", 503);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function buildPersistedSnapshot(): PersistedSnapshot {
  return {
    sessions: [...sessions.values()].map((session) => ({
      schoolId: session.schoolId,
      gameId: session.state.gameId,
      homeTeamId: session.homeTeamId,
      awayTeamId: session.awayTeamId,
      opponentName: session.opponentName,
      opponentTeamId: session.opponentTeamId,
      startingLineupByTeam: session.startingLineupByTeam,
      aiContext: sanitizeGameAiContext(session.aiContext),
      historicalContextSummary: session.historicalContextSummary,
      historicalContextFetchedAtMs: session.historicalContextFetchedAtMs,
      events: listOrderedEvents(session),
      aiSettings: sanitizeCoachAiSettings(session.aiSettings),
      aiStatus: session.aiStatus,
      submitted: session.submitted
    })),
    rosterTeamsBySchool: Object.fromEntries(rosterTeamsBySchool.entries()),
    organizationProfilesBySchool: Object.fromEntries(organizationProfilesBySchool.entries()),
    onboardingAccountsBySchool: Object.fromEntries(onboardingAccountsBySchool.entries()),
    organizationMembersBySchool: Object.fromEntries(organizationMembersBySchool.entries()),
    localAuthAccountsBySchool: Object.fromEntries(localAuthAccountsBySchool.entries()),
    billingBySchool: Object.fromEntries(billingBySchool.entries()),
    processedStripeWebhookEvents: Object.fromEntries(processedStripeWebhookEvents.entries()),
    userWorkspaceProfilesById: Object.fromEntries(userWorkspaceProfilesById.entries()),
    schoolsById: Object.fromEntries(schoolsById.entries()),
    schoolMembershipsBySchool: Object.fromEntries(schoolMembershipsBySchool.entries()),
    teamMembershipsBySchool: Object.fromEntries(teamMembershipsBySchool.entries()),
    activityEventsBySchool: Object.fromEntries(activityEventsBySchool.entries()),
    liveGameSessionsBySchool: Object.fromEntries(liveGameSessionsBySchool.entries()),
    operatorSessionsByLiveSession: Object.fromEntries(operatorSessionsByLiveSession.entries()),
    gameOverridesBySchool: Object.fromEntries(
      [...gameOverridesBySchool.entries()].map(([schoolId, overrideMap]) => [
        schoolId,
        Object.fromEntries(overrideMap.entries())
      ])
    ),
    // Backward compatibility for older readers expecting a top-level rosterTeams array.
    rosterTeams: getRosterTeamsForSchool(DEFAULT_SCHOOL_ID)
  };
}

function buildPersistedSessions(): PersistedGameSessionRecord[] {
  return buildPersistedSnapshot().sessions.map((session) => ({
    ...session,
    schoolId: normalizeSchoolId(session.schoolId)
  }));
}

function sanitizePersistedEventsForSession(
  gameId: string,
  schoolId: string,
  events: unknown
): GameEvent[] {
  if (!Array.isArray(events)) {
    return [];
  }

  const normalizedEvents: GameEvent[] = [];
  for (const rawEvent of events) {
    try {
      const parsed = parseGameEvent({
        ...(rawEvent as object),
        gameId,
        schoolId
      });
      normalizedEvents.push(parsed);
    } catch {
      // Skip malformed legacy events while preserving valid history.
      continue;
    }
  }

  return normalizedEvents;
}

function applyPersistedSnapshot(payload: PersistedSnapshot | PersistedGameSession[]): void {
  const persistedSessions = Array.isArray(payload) ? payload : payload.sessions;
  const persistedRosterTeams = Array.isArray(payload) ? [] : payload.rosterTeams;
  const persistedRosterTeamsBySchool = Array.isArray(payload) ? undefined : payload.rosterTeamsBySchool;
  const persistedOrganizationProfiles = Array.isArray(payload) ? undefined : payload.organizationProfilesBySchool;
  const persistedOnboardingAccounts = Array.isArray(payload) ? undefined : payload.onboardingAccountsBySchool;
  const persistedOrganizationMembers = Array.isArray(payload) ? undefined : payload.organizationMembersBySchool;
  const persistedLocalAuthAccounts = Array.isArray(payload) ? undefined : payload.localAuthAccountsBySchool;
  const persistedGameOverrides = Array.isArray(payload) ? undefined : payload.gameOverridesBySchool;
  const persistedBilling = Array.isArray(payload) ? undefined : payload.billingBySchool;
  const persistedWebhookEvents = Array.isArray(payload) ? undefined : payload.processedStripeWebhookEvents;
  const persistedWorkspaceProfiles = Array.isArray(payload) ? undefined : payload.userWorkspaceProfilesById;
  const persistedSchools = Array.isArray(payload) ? undefined : payload.schoolsById;
  const persistedSchoolMemberships = Array.isArray(payload) ? undefined : payload.schoolMembershipsBySchool;
  const persistedTeamMemberships = Array.isArray(payload) ? undefined : payload.teamMembershipsBySchool;
  const persistedActivityEvents = Array.isArray(payload) ? undefined : payload.activityEventsBySchool;
  const persistedLiveGameSessions = Array.isArray(payload) ? undefined : payload.liveGameSessionsBySchool;
  const persistedOperatorSessions = Array.isArray(payload) ? undefined : payload.operatorSessionsByLiveSession;

  sessions.clear();
  rosterTeamsBySchool.clear();
  organizationProfilesBySchool.clear();
  onboardingAccountsBySchool.clear();
  organizationMembersBySchool.clear();
  localAuthAccountsBySchool.clear();
  gameOverridesBySchool.clear();
  billingBySchool.clear();
  processedStripeWebhookEvents.clear();
  userWorkspaceProfilesById.clear();
  schoolsById.clear();
  schoolMembershipsBySchool.clear();
  teamMembershipsBySchool.clear();
  activityEventsBySchool.clear();
  liveGameSessionsBySchool.clear();
  operatorSessionsByLiveSession.clear();

  if (persistedRosterTeamsBySchool && typeof persistedRosterTeamsBySchool === "object") {
    for (const [schoolId, teams] of Object.entries(persistedRosterTeamsBySchool)) {
      setRosterTeamsForSchool(normalizeSchoolId(schoolId), Array.isArray(teams) ? teams : []);
    }
  } else if (Array.isArray(persistedRosterTeams)) {
    setRosterTeamsForSchool(DEFAULT_SCHOOL_ID, persistedRosterTeams);
  }

  if (persistedOrganizationProfiles && typeof persistedOrganizationProfiles === "object") {
    for (const [schoolId, profile] of Object.entries(persistedOrganizationProfiles)) {
      setOrganizationProfileForSchool(normalizeSchoolId(schoolId), profile);
    }
  }

  if (persistedOnboardingAccounts && typeof persistedOnboardingAccounts === "object") {
    for (const [schoolId, accountState] of Object.entries(persistedOnboardingAccounts)) {
      setOnboardingAccountStateForSchool(normalizeSchoolId(schoolId), accountState);
    }
  }

  if (persistedOrganizationMembers && typeof persistedOrganizationMembers === "object") {
    for (const [schoolId, members] of Object.entries(persistedOrganizationMembers)) {
      setOrganizationMembersForSchool(normalizeSchoolId(schoolId), Array.isArray(members) ? members : []);
    }
  }

  if (persistedLocalAuthAccounts && typeof persistedLocalAuthAccounts === "object") {
    for (const [schoolId, accounts] of Object.entries(persistedLocalAuthAccounts)) {
      setLocalAuthAccountsForSchool(normalizeSchoolId(schoolId), Array.isArray(accounts) ? accounts : []);
    }
  }

  if (persistedGameOverrides && typeof persistedGameOverrides === "object") {
    for (const [schoolId, overrides] of Object.entries(persistedGameOverrides)) {
      const overrideMap = new Map<string, GameEditOverride>();
      if (overrides && typeof overrides === "object") {
        for (const [gameId, override] of Object.entries(overrides)) {
          overrideMap.set(gameId, override as GameEditOverride);
        }
      }
      gameOverridesBySchool.set(normalizeSchoolId(schoolId), overrideMap);
    }
  }

  if (persistedBilling && typeof persistedBilling === "object") {
    for (const [schoolId, billing] of Object.entries(persistedBilling)) {
      if (!billing || typeof billing !== "object") {
        continue;
      }
      const nowIso = new Date().toISOString();
      billingBySchool.set(normalizeSchoolId(schoolId), {
        schoolId: normalizeSchoolId(schoolId),
        planId: String((billing as BillingState).planId ?? "trial"),
        status: ((billing as BillingState).status ?? "trialing") as BillingSubscriptionStatus,
        includedActiveTeamLimit: Number.isFinite((billing as BillingState).includedActiveTeamLimit)
          ? Number((billing as BillingState).includedActiveTeamLimit)
          : 1,
        extraActiveTeamSeats: Number.isFinite((billing as BillingState).extraActiveTeamSeats)
          ? Number((billing as BillingState).extraActiveTeamSeats)
          : 0,
        trialStartedAtIso: (billing as BillingState).trialStartedAtIso,
        trialEndsAtIso: (billing as BillingState).trialEndsAtIso,
        stripeCustomerId: (billing as BillingState).stripeCustomerId,
        stripeSubscriptionId: (billing as BillingState).stripeSubscriptionId,
        currentPeriodEndsAtIso: (billing as BillingState).currentPeriodEndsAtIso,
        couponCode: (billing as BillingState).couponCode,
        createdAtIso: (billing as BillingState).createdAtIso ?? nowIso,
        updatedAtIso: (billing as BillingState).updatedAtIso ?? nowIso,
      });
    }
  }

  if (persistedWebhookEvents && typeof persistedWebhookEvents === "object") {
    for (const [eventId, processedAtIso] of Object.entries(persistedWebhookEvents)) {
      const normalizedEventId = String(eventId ?? "").trim();
      if (!normalizedEventId) {
        continue;
      }
      const normalizedProcessedAtIso = String(processedAtIso ?? "").trim() || new Date().toISOString();
      processedStripeWebhookEvents.set(normalizedEventId, normalizedProcessedAtIso);
    }
  }

  if (persistedWorkspaceProfiles && typeof persistedWorkspaceProfiles === "object") {
    for (const profile of Object.values(persistedWorkspaceProfiles)) {
      if (!profile || typeof profile !== "object") {
        continue;
      }
      const typedProfile = profile as UserWorkspaceProfile;
      if (!typedProfile.userId || !typedProfile.email) {
        continue;
      }
      setUserWorkspaceProfile(typedProfile);
    }
  }

  if (persistedSchools && typeof persistedSchools === "object") {
    for (const school of Object.values(persistedSchools)) {
      if (!school || typeof school !== "object") {
        continue;
      }
      const typedSchool = school as SchoolRecord;
      if (!typedSchool.schoolId || !typedSchool.name) {
        continue;
      }
      setSchoolRecord(typedSchool);
    }
  }

  if (persistedSchoolMemberships && typeof persistedSchoolMemberships === "object") {
    for (const [schoolId, memberships] of Object.entries(persistedSchoolMemberships)) {
      setSchoolMembershipsForSchool(normalizeSchoolId(schoolId), Array.isArray(memberships) ? memberships as SchoolMembership[] : []);
    }
  }

  if (persistedTeamMemberships && typeof persistedTeamMemberships === "object") {
    for (const [schoolId, memberships] of Object.entries(persistedTeamMemberships)) {
      setTeamMembershipsForSchool(normalizeSchoolId(schoolId), Array.isArray(memberships) ? memberships as TeamMembership[] : []);
    }
  }

  if (persistedActivityEvents && typeof persistedActivityEvents === "object") {
    for (const [schoolId, events] of Object.entries(persistedActivityEvents)) {
      setActivityEventsForSchool(normalizeSchoolId(schoolId), Array.isArray(events) ? events as ActivityEvent[] : []);
    }
  }

  if (persistedLiveGameSessions && typeof persistedLiveGameSessions === "object") {
    for (const [schoolId, liveSessions] of Object.entries(persistedLiveGameSessions)) {
      setLiveGameSessionsForSchool(normalizeSchoolId(schoolId), Array.isArray(liveSessions) ? liveSessions as LiveGameSessionRecord[] : []);
    }
  }

  if (persistedOperatorSessions && typeof persistedOperatorSessions === "object") {
    for (const [liveSessionId, session] of Object.entries(persistedOperatorSessions)) {
      if (!session || typeof session !== "object") {
        continue;
      }
      operatorSessionsByLiveSession.set(trimProfileField(liveSessionId, 120), session as OperatorSessionRecord);
    }
  }

  for (const session of persistedSessions) {
    const normalizedSchoolId = normalizeSchoolId(session.schoolId);
    const normalizedEvents = sanitizePersistedEventsForSession(
      session.gameId,
      normalizedSchoolId,
      session.events
    );

    const initialState = createInitialGameState(
      session.gameId,
      session.homeTeamId,
      session.awayTeamId,
      session.opponentName,
      session.opponentTeamId
    );

    // Re-seed the starting lineup before replaying events so substitutions
    // are applied on top of the correct initial on-court players.
    if (session.startingLineupByTeam) {
      for (const [teamId, lineup] of Object.entries(session.startingLineupByTeam)) {
        if ((teamId === session.homeTeamId || teamId === session.awayTeamId) && Array.isArray(lineup)) {
          initialState.activeLineupsByTeam[teamId] = lineup.map(String).filter(Boolean);
        }
      }
      // Expose on state so downstream consumers can use it without re-querying
      initialState.startingLineupByTeam = session.startingLineupByTeam;
    }

    const restoredSession: GameSession = {
      schoolId: normalizedSchoolId,
      homeTeamId: session.homeTeamId,
      awayTeamId: session.awayTeamId,
      opponentName: session.opponentName,
      opponentTeamId: session.opponentTeamId,
      startingLineupByTeam: session.startingLineupByTeam,
      aiSettings: sanitizeCoachAiSettings(session.aiSettings),
      aiStatus: sanitizePersistedGameAiStatus(session.aiStatus),
      aiContext: sanitizeGameAiContext(session.aiContext),
      historicalContextSummary: typeof session.historicalContextSummary === "string" ? session.historicalContextSummary : "",
      historicalContextFetchedAtMs: Number(session.historicalContextFetchedAtMs ?? 0),
      state: replayEvents(initialState, normalizedEvents),
      eventsById: new Map(normalizedEvents.map((event) => [event.id, event])),
      eventIdsBySequence: new Map(normalizedEvents.map((event) => [event.sequence, event.id])),
      ruleInsights: [],
      aiInsights: [],
      aiRefreshInFlight: null,
      lastAiRefreshAtMs: 0,
      lastAiEventCount: 0,
      lastAiFingerprint: "",
      submitted: session.submitted === true
    };

    recomputeSession(restoredSession);
    sessions.set(buildGameSessionKey(session.gameId, restoredSession.schoolId), restoredSession);
  }
}

function restoreSessionsFromFile(): boolean {
  if (!persistenceEnabled || !existsSync(dataFile)) {
    return false;
  }

  const payload = JSON.parse(readFileSync(dataFile, "utf8")) as PersistedSnapshot | PersistedGameSession[];
  applyPersistedSnapshot(payload);
  return true;
}

async function restoreRosterTeamsFromProvider(): Promise<boolean> {
  if (!persistenceProvider) {
    return false;
  }

  const payload = await persistenceProvider.loadRosterTeamsBySchool();
  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return false;
  }

  const snapshotTeamMetadata = new Map<string, RosterTeam>();
  for (const [schoolId, teams] of rosterTeamsBySchool.entries()) {
    for (const team of teams) {
      snapshotTeamMetadata.set(`${schoolId}:${team.id}`, team);
    }
  }

  rosterTeamsBySchool.clear();
  for (const [schoolId, teams] of entries) {
    const normalizedSchoolId = normalizeSchoolId(schoolId);
    const mergedTeams = (Array.isArray(teams) ? teams : []).map((team) => ({
      ...snapshotTeamMetadata.get(`${normalizedSchoolId}:${team.id}`),
      ...team,
    }));
    setRosterTeamsForSchool(normalizedSchoolId, mergedTeams);
  }
  return true;
}

async function restoreSessionsFromProvider(): Promise<boolean> {
  if (!persistenceProvider) {
    return false;
  }

  const sessionsPayload = await persistenceProvider.loadPersistedSessions();
  if (sessionsPayload.length === 0) {
    return false;
  }

  applyPersistedSnapshot(sessionsPayload);
  return true;
}

function persistRosterTeamsForSchool(schoolId: string, teams: RosterTeam[]): void {
  if (!persistenceProvider) {
    return;
  }

  const normalizedSchoolId = normalizeSchoolId(schoolId);
  queuedRosterPersistBySchool.set(normalizedSchoolId, cloneRosterTeamsForPersistence(teams));

  if (rosterPersistInFlightBySchool.has(normalizedSchoolId)) {
    return;
  }

  flushRosterTeamsPersistence(normalizedSchoolId);
}

const rosterPersistInFlightBySchool = new Set<string>();
const queuedRosterPersistBySchool = new Map<string, RosterTeam[]>();

function cloneRosterTeamsForPersistence(teams: RosterTeam[]): RosterTeam[] {
  return teams.map((team) => ({
    ...team,
    focusInsights: Array.isArray(team.focusInsights) ? [...team.focusInsights] : team.focusInsights,
    players: team.players.map((player) => ({ ...player })),
  }));
}

function flushRosterTeamsPersistence(schoolId: string): void {
  if (!persistenceProvider) {
    return;
  }

  const queuedTeams = queuedRosterPersistBySchool.get(schoolId);
  if (!queuedTeams) {
    return;
  }

  queuedRosterPersistBySchool.delete(schoolId);
  rosterPersistInFlightBySchool.add(schoolId);

  void persistenceProvider
    .replaceRosterTeamsForSchool(schoolId, queuedTeams)
    .catch((error) => {
      logger.warn("persistence.roster_teams_save_failed", { schoolId, error });
    })
    .finally(() => {
      rosterPersistInFlightBySchool.delete(schoolId);
      if (queuedRosterPersistBySchool.has(schoolId)) {
        flushRosterTeamsPersistence(schoolId);
      }
    });
}

let normalizedSessionsPersistInFlight = false;
let normalizedSessionsPersistQueued = false;

function persistNormalizedSessions(): void {
  if (!persistenceProvider) {
    return;
  }

  // If a write is already running, mark that we need another pass once it
  // finishes rather than launching a second concurrent transaction.  This
  // collapses rapid bursts of events into at-most-two DB writes and prevents
  // the deadlocks that arise when concurrent DELETE+INSERT transactions race.
  if (normalizedSessionsPersistInFlight) {
    normalizedSessionsPersistQueued = true;
    return;
  }

  normalizedSessionsPersistInFlight = true;
  void persistenceProvider
    .replacePersistedSessions(buildPersistedSessions())
    .catch((error) => {
      logger.warn("persistence.normalized_sessions_save_failed", { error });
    })
    .finally(() => {
      normalizedSessionsPersistInFlight = false;
      if (normalizedSessionsPersistQueued) {
        normalizedSessionsPersistQueued = false;
        persistNormalizedSessions();
      }
    });
}

function clearPersistedRosterTeams(): void {
  if (!persistenceProvider) {
    return;
  }

  void persistenceProvider.clearAllRosterTeams().catch((error) => {
    logger.warn("persistence.roster_teams_clear_failed", { error });
  });
}

function persistOrgProfileForSchool(schoolId: string, profile: OrganizationProfile | null): void {
  if (!persistenceProvider) {
    return;
  }

  void persistenceProvider.replaceOrgProfileForSchool(schoolId, profile).catch((error) => {
    logger.warn("persistence.org_profile_save_failed", { schoolId, error });
  });
}

function persistOrgMembersForSchool(schoolId: string, members: OrganizationMember[]): void {
  if (!persistenceProvider) {
    return;
  }

  void persistenceProvider.replaceOrgMembersForSchool(schoolId, members).catch((error) => {
    logger.warn("persistence.org_members_save_failed", { schoolId, error });
  });
}

function persistLocalAuthAccountsForSchool(schoolId: string, accounts: LocalAuthAccount[]): void {
  if (!persistenceProvider) {
    return;
  }

  void persistenceProvider.replaceLocalAuthAccountsForSchool(schoolId, accounts).catch((error) => {
    logger.warn("persistence.local_auth_save_failed", { schoolId, error });
  });
}

async function restoreOrgDataFromProvider(): Promise<void> {
  if (!persistenceProvider) {
    return;
  }

  const data: OrgDataResult = await persistenceProvider.loadOrgData();

  for (const [schoolId, profile] of Object.entries(data.profiles)) {
    const existing = organizationProfilesBySchool.get(normalizeSchoolId(schoolId));
    if (!existing) {
      setOrganizationProfileForSchool(normalizeSchoolId(schoolId), profile);
    }
  }

  for (const [schoolId, members] of Object.entries(data.members)) {
    const existing = organizationMembersBySchool.get(normalizeSchoolId(schoolId));
    if (!existing || existing.length === 0) {
      setOrganizationMembersForSchool(normalizeSchoolId(schoolId), members);
    }
  }

  for (const [schoolId, accounts] of Object.entries(data.localAuth)) {
    const existing = localAuthAccountsBySchool.get(normalizeSchoolId(schoolId));
    if (!existing || existing.length === 0) {
      setLocalAuthAccountsForSchool(normalizeSchoolId(schoolId), accounts);
    }
  }
}

function persistSessions() {
  if (!persistenceEnabled) {
    return;
  }

  mkdirSync(dataDirectory, { recursive: true });

  const payload = buildPersistedSnapshot();
  writeFileSync(dataFile, JSON.stringify(payload, null, 2), "utf8");

  if (persistenceProvider) {
    void persistenceProvider.save(payload).catch((error) => {
      logger.warn("persistence.snapshot_save_failed", { error });
    });
  }

  persistNormalizedSessions();
}

async function flushSnapshotToDb(): Promise<void> {
  if (!persistenceProvider) {
    return;
  }
  const payload = buildPersistedSnapshot();
  await persistenceProvider.save(payload);
}

let storeInitialized = false;
let retentionTimer: ReturnType<typeof setInterval> | null = null;

function setupRetentionMaintenance(): void {
  if (!persistenceProvider) {
    return;
  }

  const retentionDays = Number.isFinite(DATA_RETENTION_DAYS) ? Math.floor(DATA_RETENTION_DAYS) : 0;
  if (retentionDays <= 0) {
    return;
  }

  const runPrune = () => {
    void persistenceProvider.pruneStaleGames(retentionDays)
      .then((deletedGames) => {
        if (deletedGames > 0) {
          logger.info("persistence.retention_pruned", { deletedGames, retentionDays });
        }
      })
      .catch((error) => {
        logger.warn("persistence.retention_prune_failed", { error, retentionDays });
      });
  };

  runPrune();

  const intervalMinutes = Number.isFinite(RETENTION_PRUNE_INTERVAL_MINUTES)
    ? Math.max(Math.floor(RETENTION_PRUNE_INTERVAL_MINUTES), 15)
    : 1440;

  if (retentionTimer) {
    clearInterval(retentionTimer);
  }

  retentionTimer = setInterval(runPrune, intervalMinutes * 60 * 1000);
}

export async function initializeStore(options: { failOnPersistenceError?: boolean } = {}): Promise<void> {
  if (storeInitialized) {
    return;
  }

  const failOnPersistenceError = Boolean(options.failOnPersistenceError);

  let restoredSnapshot = false;
  if (persistenceProvider) {
    try {
      const payload = await persistenceProvider.load();
      if (payload) {
        applyPersistedSnapshot(payload as PersistedSnapshot | PersistedGameSession[]);
        restoredSnapshot = true;
      }
    } catch (error) {
      logger.warn("persistence.snapshot_restore_failed", { error });
      if (failOnPersistenceError) {
        throw new Error("PostgreSQL snapshot restore failed during startup");
      }
    }
  }

  if (!restoredSnapshot && persistenceProvider) {
    try {
      restoredSnapshot = await restoreSessionsFromProvider();
    } catch (error) {
      logger.warn("persistence.normalized_sessions_restore_failed", { error });
      if (failOnPersistenceError) {
        throw new Error("PostgreSQL game session restore failed during startup");
      }
    }
  }

  // When PostgreSQL persistence is enabled, never fall back to local file
  // snapshots. Those files can be stale on long-lived hosts and reintroduce
  // deleted tenants/accounts after a clean DB reset.
  if (!restoredSnapshot && !persistenceProvider) {
    restoreSessionsFromFile();
  }

  if (persistenceProvider) {
    try {
      await restoreRosterTeamsFromProvider();
    } catch (error) {
      logger.warn("persistence.roster_restore_failed", { error });
      if (failOnPersistenceError) {
        throw new Error("PostgreSQL roster restore failed during startup");
      }
    }
  }

  if (persistenceProvider) {
    try {
      await restoreOrgDataFromProvider();
    } catch (error) {
      logger.warn("persistence.org_data_restore_failed", { error });
      if (failOnPersistenceError) {
        throw new Error("PostgreSQL org data restore failed during startup");
      }
    }
  }

  setupRetentionMaintenance();

  storeInitialized = true;
}

export function getPersistenceStatus(): PersistenceStatus {
  if (persistenceProvider) {
    return {
      backend: "postgres",
      durable: true,
    };
  }

  if (persistenceEnabled) {
    return {
      backend: "file_snapshot",
      durable: false,
      dataFile,
      warning: "Using local file snapshot persistence. Data durability depends on host-local storage.",
    };
  }

  return {
    backend: "memory",
    durable: false,
    warning: "Persistence is disabled. Data will be lost when the process exits.",
  };
}

const rosterStore = createRosterStore({
  resolveSchoolId,
  trimProfileField,
  rosterTeamsBySchool,
  getRosterTeamsForSchool,
  setRosterTeamsForSchool,
  persistSessions,
  persistRosterTeamsForSchool,
});

export const {
  getRosterTeamsByScope,
  saveRosterTeams,
  getTeamById,
} = rosterStore;

export function resetAllData(scope?: TenantScope): void {
  const schoolId = scope ? resolveSchoolId(scope) : null;
  if (!schoolId) {
    sessions.clear();
    rosterTeamsBySchool.clear();
    organizationProfilesBySchool.clear();
    onboardingAccountsBySchool.clear();
    organizationMembersBySchool.clear();
    localAuthAccountsBySchool.clear();
    gameOverridesBySchool.clear();
    billingBySchool.clear();
    processedStripeWebhookEvents.clear();
    userWorkspaceProfilesById.clear();
    schoolsById.clear();
    schoolMembershipsBySchool.clear();
    teamMembershipsBySchool.clear();
    activityEventsBySchool.clear();
    liveGameSessionsBySchool.clear();
    operatorSessionsByLiveSession.clear();
    persistSessions();
    clearPersistedRosterTeams();
    return;
  }

  for (const key of sessions.keys()) {
    if (key.startsWith(`${schoolId}:`)) {
      sessions.delete(key);
    }
  }
  rosterTeamsBySchool.delete(schoolId);
  organizationProfilesBySchool.delete(schoolId);
  onboardingAccountsBySchool.delete(schoolId);
  organizationMembersBySchool.delete(schoolId);
  localAuthAccountsBySchool.delete(schoolId);
  gameOverridesBySchool.delete(schoolId);
  billingBySchool.delete(schoolId);
  schoolsById.delete(schoolId);
  schoolMembershipsBySchool.delete(schoolId);
  teamMembershipsBySchool.delete(schoolId);
  activityEventsBySchool.delete(schoolId);
  liveGameSessionsBySchool.delete(schoolId);
  for (const [liveSessionId, operatorSession] of operatorSessionsByLiveSession.entries()) {
    if (operatorSession.schoolId === schoolId) {
      operatorSessionsByLiveSession.delete(liveSessionId);
    }
  }
  persistSessions();
  persistRosterTeamsForSchool(schoolId, []);
}

const billingStore = createBillingStore({
  resolveSchoolId,
  billingBySchool,
  processedStripeWebhookEvents,
  persistSessions,
});

export const {
  getBillingStateByScope,
  findBillingStateByStripeCustomerId,
  findBillingStateByStripeSubscriptionId,
  ensureTrialBillingState,
  saveBillingState,
  hasProcessedStripeWebhookEvent,
  markProcessedStripeWebhookEvent,
  trimProcessedStripeWebhookEvents,
} = billingStore;

export function getOrganizationProfileByScope(scope?: TenantScope): OrganizationProfile | null {
  return organizationProfilesBySchool.get(resolveSchoolId(scope)) ?? null;
}

export function saveOrganizationProfile(profile: Partial<OrganizationProfile>, scope?: TenantScope): OrganizationProfile {
  const schoolId = resolveSchoolId(scope);
  const saved = setOrganizationProfileForSchool(schoolId, profile);
  persistSessions();
  persistOrgProfileForSchool(schoolId, saved);
  return saved;
}

export function getOnboardingAccountStateByScope(scope?: TenantScope): OnboardingAccountState | null {
  return onboardingAccountsBySchool.get(resolveSchoolId(scope)) ?? null;
}

export function saveOnboardingAccountState(accountState: OnboardingAccountInput, scope?: TenantScope): OnboardingAccountState {
  const schoolId = resolveSchoolId(scope);
  const saved = setOnboardingAccountStateForSchool(schoolId, accountState);
  persistSessions();
  return saved;
}

export function getOrganizationMembersByScope(scope?: TenantScope): OrganizationMember[] {
  return organizationMembersBySchool.get(resolveSchoolId(scope)) ?? [];
}

const authStore = createAuthStore({
  resolveSchoolId,
  trimProfileField,
  localAuthAccountsBySchool,
  findLocalAuthAccountByEmailForSchool,
  upsertLocalAuthAccountForSchool,
  touchLocalAuthAccountLoginForSchool,
  setLocalAuthAccountsForSchool,
  persistSessions,
  persistLocalAuthAccountsForSchool,
});

export const {
  getLocalAuthAccountsByScope,
  getLocalAuthAccountByEmail,
  getLocalAuthAccountsByEmailAcrossSchools,
  saveLocalAuthAccount,
  recordLocalAuthLogin,
  deleteLocalAuthAccount,
} = authStore;

export function getGameOverrideMap(schoolId: string): Map<string, GameEditOverride> {
  const existing = gameOverridesBySchool.get(normalizeSchoolId(schoolId));
  if (existing) {
    return existing;
  }

  const created = new Map<string, GameEditOverride>();
  gameOverridesBySchool.set(normalizeSchoolId(schoolId), created);
  return created;
}

export async function setGameOverride(schoolId: string, override: GameEditOverride): Promise<void> {
  getGameOverrideMap(schoolId).set(override.gameId, override);
  persistSessions();
  await flushSnapshotToDb();
}

export function saveOrganizationMember(member: OrganizationMemberInput, scope?: TenantScope): OrganizationMember {
  const schoolId = resolveSchoolId(scope);
  const organizationId = trimProfileField(member.organizationId, 80)
    || onboardingAccountsBySchool.get(schoolId)?.organization.organizationId
    || `org-${schoolId}`;
  const saved = upsertOrganizationMemberForSchool(schoolId, member, organizationId);
  persistSessions();
  persistOrgMembersForSchool(schoolId, organizationMembersBySchool.get(schoolId) ?? []);
  return saved;
}

export function deleteOrganizationMember(memberId: string, scope?: TenantScope): boolean {
  const schoolId = resolveSchoolId(scope);
  const members = organizationMembersBySchool.get(schoolId) ?? [];
  const next = members.filter((member) => member.memberId !== memberId);
  if (next.length === members.length) {
    return false;
  }

  setOrganizationMembersForSchool(schoolId, next);
  persistSessions();
  persistOrgMembersForSchool(schoolId, next);
  return true;
}

export function getUserWorkspaceProfile(userId: string): UserWorkspaceProfile | null {
  const normalizedUserId = trimProfileField(userId, 120);
  return normalizedUserId ? userWorkspaceProfilesById.get(normalizedUserId) ?? null : null;
}

export function saveUserWorkspaceProfile(profile: Partial<UserWorkspaceProfile> & Pick<UserWorkspaceProfile, "userId" | "email">): UserWorkspaceProfile {
  const saved = setUserWorkspaceProfile(profile);
  persistSessions();
  return saved;
}

export function getSchoolRecord(schoolId: string): SchoolRecord | null {
  return schoolsById.get(normalizeSchoolId(schoolId)) ?? null;
}

export function saveSchoolRecord(record: Partial<SchoolRecord> & Pick<SchoolRecord, "schoolId" | "name">): SchoolRecord {
  const saved = setSchoolRecord(record);
  persistSessions();
  return saved;
}

export function getSchoolMembershipsByScope(scope?: TenantScope): SchoolMembership[] {
  return schoolMembershipsBySchool.get(resolveSchoolId(scope)) ?? [];
}

export function saveSchoolMembership(membership: Partial<SchoolMembership> & Pick<SchoolMembership, "schoolId" | "email" | "fullName" | "role">): SchoolMembership {
  const schoolId = normalizeSchoolId(membership.schoolId);
  const current = schoolMembershipsBySchool.get(schoolId) ?? [];
  const normalizedEmail = trimProfileField(membership.email, 160).toLowerCase();
  const existing = current.find((entry) =>
    (membership.userId && entry.userId === membership.userId)
    || entry.email === normalizedEmail
    || (membership.membershipId && entry.membershipId === membership.membershipId)
  );
  const createdMembership: SchoolMembership = {
    membershipId: trimProfileField(membership.membershipId, 120) || buildWorkspaceMembershipId(`${schoolId}:${membership.userId ?? membership.email}:${membership.role}`, "school-member"),
    schoolId,
    userId: trimProfileField(membership.userId, 120) || undefined,
    email: normalizedEmail,
    fullName: trimProfileField(membership.fullName, 120),
    role: membership.role,
    status: membership.status === "invited" ? "invited" : "active",
    createdAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
  };
  const merged = existing
    ? current.map((entry) => (entry.membershipId === existing.membershipId
      ? { ...entry, ...membership, schoolId, email: normalizedEmail, fullName: trimProfileField(membership.fullName, 120), updatedAtIso: new Date().toISOString() }
      : entry))
    : [...current, createdMembership];
  const saved = setSchoolMembershipsForSchool(schoolId, merged).find((entry) =>
    (membership.userId && entry.userId === membership.userId) || entry.email === normalizedEmail
  );
  persistSessions();
  return saved!;
}

export function deleteSchoolMembership(membershipId: string, scope?: TenantScope): boolean {
  const schoolId = resolveSchoolId(scope);
  const current = schoolMembershipsBySchool.get(schoolId) ?? [];
  const normalizedMembershipId = trimProfileField(membershipId, 120);
  const next = current.filter((entry) => entry.membershipId !== normalizedMembershipId);
  if (next.length === current.length) {
    return false;
  }
  schoolMembershipsBySchool.set(schoolId, next);
  persistSessions();
  return true;
}

export function getTeamMembershipsByScope(scope?: TenantScope): TeamMembership[] {
  return teamMembershipsBySchool.get(resolveSchoolId(scope)) ?? [];
}

export function saveTeamMembership(membership: Partial<TeamMembership> & Pick<TeamMembership, "schoolId" | "teamId" | "email" | "fullName" | "role">): TeamMembership {
  const schoolId = normalizeSchoolId(membership.schoolId);
  const current = teamMembershipsBySchool.get(schoolId) ?? [];
  const normalizedTeamId = trimProfileField(membership.teamId, 120);
  const normalizedEmail = trimProfileField(membership.email, 160).toLowerCase();
  const existing = current.find((entry) =>
    (membership.membershipId && entry.membershipId === membership.membershipId)
      || (
        entry.teamId === normalizedTeamId
        && (
          (membership.userId && entry.userId === membership.userId)
          || entry.email === normalizedEmail
        )
      )
  );
  const createdMembership: TeamMembership = {
    membershipId: trimProfileField(membership.membershipId, 120) || buildWorkspaceMembershipId(`${schoolId}:${membership.teamId}:${membership.userId ?? membership.email}:${membership.role}`, "team-member"),
    schoolId,
    teamId: normalizedTeamId,
    userId: trimProfileField(membership.userId, 120) || undefined,
    email: normalizedEmail,
    fullName: trimProfileField(membership.fullName, 120),
    role: membership.role,
    status: membership.status === "invited" ? "invited" : "active",
    createdAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
  };
  const merged = existing
    ? current.map((entry) => (entry.membershipId === existing.membershipId
      ? { ...entry, ...membership, schoolId, teamId: normalizedTeamId, email: normalizedEmail, fullName: trimProfileField(membership.fullName, 120), updatedAtIso: new Date().toISOString() }
      : entry))
    : [...current, createdMembership];
  const saved = setTeamMembershipsForSchool(schoolId, merged).find((entry) =>
    (membership.membershipId && entry.membershipId === membership.membershipId)
      || (
        entry.teamId === normalizedTeamId
        && ((membership.userId && entry.userId === membership.userId) || entry.email === normalizedEmail)
      )
  );
  persistSessions();
  return saved!;
}

export function deleteTeamMembership(membershipId: string, scope?: TenantScope): boolean {
  const schoolId = resolveSchoolId(scope);
  const current = teamMembershipsBySchool.get(schoolId) ?? [];
  const normalizedMembershipId = trimProfileField(membershipId, 120);
  const next = current.filter((entry) => entry.membershipId !== normalizedMembershipId);
  if (next.length === current.length) {
    return false;
  }
  teamMembershipsBySchool.set(schoolId, next);
  persistSessions();
  return true;
}

export function listSchoolMembershipsForUser(input: { userId?: string; email?: string }): SchoolMembership[] {
  const normalizedUserId = trimProfileField(input.userId, 120);
  const normalizedEmail = trimProfileField(input.email, 160).toLowerCase();
  return [...schoolMembershipsBySchool.values()]
    .flat()
    .filter((membership) => (normalizedUserId && membership.userId === normalizedUserId) || (normalizedEmail && membership.email === normalizedEmail));
}

export function listTeamMembershipsForUser(input: { schoolId?: string; userId?: string; email?: string }): TeamMembership[] {
  const normalizedSchoolId = trimProfileField(input.schoolId, 80);
  const normalizedUserId = trimProfileField(input.userId, 120);
  const normalizedEmail = trimProfileField(input.email, 160).toLowerCase();
  const source = normalizedSchoolId
    ? [teamMembershipsBySchool.get(normalizeSchoolId(normalizedSchoolId)) ?? []]
    : [...teamMembershipsBySchool.values()];
  return source
    .flat()
    .filter((membership) => (normalizedUserId && membership.userId === normalizedUserId) || (normalizedEmail && membership.email === normalizedEmail));
}

const activityStore = createActivityStore({
  resolveSchoolId,
  normalizeSchoolId,
  trimProfileField,
  buildWorkspaceMembershipId,
  activityEventsBySchool,
  liveGameSessionsBySchool,
  operatorSessionsByLiveSession,
  setActivityEventsForSchool,
  setLiveGameSessionsForSchool,
  persistSessions,
});

export const {
  saveActivityEvent,
  getActivityEventsByScope,
  createLiveGameSessionRecord,
  getLiveGameSessionsByScope,
  getLiveGameSessionById,
  saveOperatorSessionRecord,
  getOperatorSessionByLiveSession,
} = activityStore;

export function createGame(input: CreateGameInput, scope?: TenantScope): GameState {
  const schoolId = resolveRequiredSchoolId(input.schoolId, scope);
  const state = createInitialGameState(
    input.gameId,
    input.homeTeamId,
    input.awayTeamId,
    input.opponentName,
    input.opponentTeamId
  );

  const seededLineups: Record<string, string[]> = {};

  if (input.startingLineupByTeam) {
    for (const [teamId, lineup] of Object.entries(input.startingLineupByTeam)) {
      if (teamId !== input.homeTeamId && teamId !== input.awayTeamId) {
        continue;
      }

      const seededLineup = Array.isArray(lineup)
        ? [...new Set(lineup.map((playerId) => String(playerId).trim()).filter(Boolean))].slice(0, 5)
        : [];

      state.activeLineupsByTeam[teamId] = seededLineup;
      seededLineups[teamId] = seededLineup;
    }
  }

  if (Object.keys(seededLineups).length > 0) {
    // Expose normalized starting lineups on state so they are safe for socket fanout.
    state.startingLineupByTeam = seededLineups;
  }

  sessions.set(buildGameSessionKey(input.gameId, schoolId), {
    schoolId,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    opponentName: input.opponentName,
    opponentTeamId: input.opponentTeamId,
    startingLineupByTeam: Object.keys(seededLineups).length > 0 ? seededLineups : undefined,
    aiSettings: defaultCoachAiSettings(),
    aiContext: sanitizeGameAiContext(input.aiContext),
    historicalContextSummary: "",
    historicalContextFetchedAtMs: 0,
    state,
    eventsById: new Map<string, GameEvent>(),
    eventIdsBySequence: new Map<number, string>(),
    ruleInsights: [],
    aiInsights: [],
    aiRefreshInFlight: null,
    aiStatus: defaultGameAiStatus(),
    lastAiRefreshAtMs: 0,
    lastAiEventCount: 0,
    lastAiFingerprint: "",
    submitted: false
  });

  persistSessions();

  return state;
}

export function getActiveGameState(scope?: TenantScope): GameState | null {
  const schoolId = resolveSchoolId(scope);
  const activeSession = scope?.teamId
    ? getMostRecentActiveSessionForTeam(schoolId, scope.teamId)
    : getMostRecentActiveSessionForSchool(schoolId);
  return activeSession?.state ?? null;
}

export function getActiveGameId(scope?: TenantScope): string | null {
  return getActiveGameState(scope)?.gameId ?? null;
}

export function submitGame(gameId: string, scope?: TenantScope): boolean {
  const session = getSession(gameId, scope);
  if (!session) return false;
  session.submitted = true;
  persistSessions();
  return true;
}

export function isGameSubmitted(gameId: string, scope?: TenantScope): boolean {
  return getSession(gameId, scope)?.submitted === true;
}

export function deleteGame(gameId: string, scope?: TenantScope): boolean {
  const removed = sessions.delete(buildGameSessionKey(gameId, resolveSchoolId(scope)));
  if (removed) {
    persistSessions();
  }
  return removed;
}

/**
 * Patch the active lineup for one or more teams without resetting game state or
 * replaying events.  Only fills in empty slots — if a team already has 5 players
 * on court the incoming lineup is ignored for that team.  Returns the updated
 * state, or null if the game doesn't exist.
 */
export function patchGameLineup(
  gameId: string,
  startingLineupByTeam: Record<string, string[]>,
  scope?: TenantScope
): GameState | null {
  const session = getSession(gameId, scope);
  if (!session) return null;

  let changed = false;
  for (const [teamId, lineup] of Object.entries(startingLineupByTeam)) {
    if (teamId !== session.homeTeamId && teamId !== session.awayTeamId) continue;
    const existing = session.state.activeLineupsByTeam[teamId] ?? [];
    if (existing.length >= 5) continue;

    const incoming = [...new Set(lineup.map((id) => String(id).trim()).filter(Boolean))];
    if (incoming.length === 0) continue;

    const merged = [...existing];
    for (const playerId of incoming) {
      if (merged.length >= 5) {
        break;
      }
      if (!merged.includes(playerId)) {
        merged.push(playerId);
      }
    }

    if (merged.length === existing.length) continue;

    session.state = {
      ...session.state,
      activeLineupsByTeam: {
        ...session.state.activeLineupsByTeam,
        [teamId]: merged,
      },
    };
    // Persist the starting lineup so it survives server restarts.
    session.startingLineupByTeam = {
      ...(session.startingLineupByTeam ?? {}),
      [teamId]: merged,
    };
    changed = true;
  }

  if (changed) {
    persistSessions();
  }

  return session.state;
}

export function getGameState(gameId: string, scope?: TenantScope): GameState | null {
  return getSession(gameId, scope)?.state ?? null;
}

export function getGameStateByScope(gameId: string, scope?: TenantScope): GameState | null {
  return getGameState(gameId, scope);
}

export function getGameAiSettings(gameId: string, scope?: TenantScope): CoachAiSettings | null {
  const session = getSession(gameId, scope);
  if (!session) {
    return null;
  }
  return sanitizeCoachAiSettings(session.aiSettings);
}

export function getGameAiContext(gameId: string, scope?: TenantScope): GameAiContext | null {
  const session = getSession(gameId, scope);
  if (!session) {
    return null;
  }
  return sanitizeGameAiContext(session.aiContext);
}

export function getGameAiStatus(gameId: string, scope?: TenantScope): GameAiStatus | null {
  const session = getSession(gameId, scope);
  if (!session) {
    return null;
  }
  return { ...session.aiStatus, model: LIVE_AI_MODEL };
}

export function getAiUsageTotals(scope?: TenantScope): AiUsageTotals {
  const schoolId = scope ? resolveSchoolId(scope) : null;
  const sessionsToCount = schoolId
    ? [...sessions.values()].filter((session) => session.schoolId === schoolId)
    : [...sessions.values()];

  return sessionsToCount.reduce<AiUsageTotals>((acc, session) => {
    acc.activeGames += 1;
    acc.totalTokensUsed += Math.max(0, Math.floor(Number(session.aiStatus.totalTokensUsed ?? 0)));
    acc.totalEstimatedCostUsd = Number(
      (acc.totalEstimatedCostUsd + Math.max(0, Number(session.aiStatus.totalEstimatedCostUsd ?? 0))).toFixed(6)
    );
    return acc;
  }, {
    activeGames: 0,
    totalTokensUsed: 0,
    totalEstimatedCostUsd: 0,
  });
}

export function updateGameAiSettings(
  gameId: string,
  settings: Partial<CoachAiSettings>,
  scope?: TenantScope
): CoachAiSettings | null {
  const session = getSession(gameId, scope);
  if (!session) {
    return null;
  }

  session.aiSettings = sanitizeCoachAiSettings({
    ...session.aiSettings,
    ...settings
  });
  // Force next AI refresh to include updated instructions.
  session.lastAiFingerprint = "";
  session.lastAiRefreshAtMs = 0;
  persistSessions();
  return session.aiSettings;
}

export function updateGameAiContext(
  gameId: string,
  context: Partial<GameAiContext>,
  scope?: TenantScope
): GameAiContext | null {
  const session = getSession(gameId, scope);
  if (!session) {
    return null;
  }

  session.aiContext = sanitizeGameAiContext({
    ...session.aiContext,
    ...context
  });
  recomputeSession(session);
  session.lastAiFingerprint = "";
  session.lastAiRefreshAtMs = 0;
  persistSessions();
  return session.aiContext;
}

export function getGameAiPromptPreview(gameId: string, scope?: TenantScope): AiPromptPreview | null {
  const session = getSession(gameId, scope);
  if (!session) {
    return null;
  }

  const orderedEvents = listOrderedEvents(session);
  const coachSettings = sanitizeCoachAiSettings(session.aiSettings);
  const userPrompt = buildAiInsightPrompt(
    { ...session, aiSettings: coachSettings },
    orderedEvents,
    session.historicalContextSummary
  );

  return {
    model: LIVE_AI_MODEL,
    userPrompt,
    systemGuide: [
      "Uses only provided game state and recent events.",
      "Prioritizes our team outcome and avoids speculative play calls.",
      "Returns strict JSON coaching insights with trigger/action/why-now structure.",
      "Keeps hidden internal safety and policy rules private."
    ],
    coachSettings,
    recentEventCount: orderedEvents.length,
    generatedAtIso: new Date().toISOString()
  };
}

export async function answerGameAiChat(
  gameId: string,
  question: string,
  history?: unknown,
  scope?: TenantScope
): Promise<CoachAiChatResponse | null> {
  const session = getSession(gameId, scope);
  const trimmedQuestion = trimToLength(question, 1200);
  if (!session || !trimmedQuestion) {
    return null;
  }

  return requestAiChatResponse(session, trimmedQuestion, sanitizeAiChatHistory(history));
}

export function getGameInsights(gameId: string, scope?: TenantScope): LiveInsight[] {
  const session = getSession(gameId, scope);
  return session ? combineInsights(session) : [];
}

export function getGameEvents(gameId: string, scope?: TenantScope): GameEvent[] {
  const session = getSession(gameId, scope);
  if (!session) {
    return [];
  }

  return listOrderedEvents(session);
}

export function getSeasonTeamStats(scope?: TenantScope): SeasonTeamStats {
  return buildSchoolAnalytics(scope).seasonTeamStats;
}

export function getSeasonGames(scope?: TenantScope): SeasonGameSummary[] {
  return buildSchoolAnalytics(scope).games;
}

export function getSeasonPlayers(scope?: TenantScope): SeasonPlayerSummary[] {
  return buildSchoolAnalytics(scope).players;
}

export function getLiveContext(scope?: TenantScope): LiveContextPayload {
  return buildSchoolAnalytics(scope).liveContext;
}

export function getRosterPlayers(scope?: TenantScope): SeasonPlayerSummary[] {
  return buildSchoolAnalytics(scope).players;
}

function listOrderedEvents(session: GameSession): GameEvent[] {
  return [...session.eventsById.values()].sort((left, right) => left.sequence - right.sequence);
}

function roundStat(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function buildSchoolAnalytics(scope?: TenantScope): {
  seasonTeamStats: SeasonTeamStats;
  games: SeasonGameSummary[];
  players: SeasonPlayerSummary[];
  liveContext: LiveContextPayload;
} {
  const schoolId = resolveSchoolId(scope);
  const rosterTeams = getRosterTeamsForSchool(schoolId);
  const rosterTeamIds = new Set(rosterTeams.map((team) => team.id));
  const playerMap = new Map<string, SeasonPlayerSummary>();

  for (const team of rosterTeams) {
    for (const player of team.players) {
      playerMap.set(player.id, {
        playerId: player.id,
        name: player.name,
        full_name: player.name,
        first_name: player.name.split(" ")[0] ?? player.name,
        number: player.number,
        position: player.position,
        height: player.height,
        grade: player.grade,
        role: player.role,
        notes: player.notes,
        games: 0,
        pts: 0,
        fg: 0,
        fga: 0,
        fg3: 0,
        fg3a: 0,
        ft: 0,
        fta: 0,
        oreb: 0,
        dreb: 0,
        reb: 0,
        asst: 0,
        to: 0,
        stl: 0,
        blk: 0,
        fouls: 0,
        plus_minus: 0,
        ppg: 0,
        rpg: 0,
        apg: 0,
        spg: 0,
        bpg: 0,
        tpg: 0,
        fpg: 0,
        fg_pct: 0,
        fg3_pct: 0,
        ft_pct: 0,
        coach_style: team.coachStyle ?? "",
        roster_info: {
          name: player.name,
          number: player.number,
          position: player.position,
          height: player.height,
          grade: player.grade,
          role: player.role,
          notes: player.notes
        }
      });
    }
  }

  const aggregatedTeam = {
    fg: 0,
    fga: 0,
    fg3: 0,
    fg3a: 0,
    ft: 0,
    fta: 0,
    oreb: 0,
    dreb: 0,
    reb: 0,
    asst: 0,
    to: 0,
    stl: 0,
    blk: 0,
    fouls: 0,
    win: 0,
    loss: 0,
    pointsFor: 0,
    pointsAgainst: 0
  };

  const games: SeasonGameSummary[] = [];
  const overrideMap = gameOverridesBySchool.get(schoolId) ?? new Map<string, GameEditOverride>();
  const sessionsForSchool = getSessionsForSchool(schoolId)
    .filter((session) => (rosterTeamIds.has(session.homeTeamId) || rosterTeamIds.has(session.awayTeamId)) && session.submitted === true);

  for (const session of sessionsForSchool) {
    const ourTeamId = rosterTeamIds.has(session.homeTeamId) ? session.homeTeamId : session.awayTeamId;
    const opponentTeamId = ourTeamId === session.homeTeamId ? session.awayTeamId : session.homeTeamId;
    const teamStats = session.state.teamStats[ourTeamId];
    const playerStats = session.state.playerStatsByTeam[ourTeamId] ?? {};
    const orderedEvents = listOrderedEvents(session);
    const latestTimestampIso = orderedEvents[orderedEvents.length - 1]?.timestampIso ?? "";
    const fg3ByPlayer = new Map<string, { made: number; attempts: number }>();
    let fg3 = 0;
    let fg3a = 0;

    for (const event of orderedEvents) {
      if (event.teamId !== ourTeamId || event.type !== "shot_attempt" || event.points !== 3) {
        continue;
      }

      fg3a += 1;
      const playerId = event.playerId ?? "";
      const current = fg3ByPlayer.get(playerId) ?? { made: 0, attempts: 0 };
      current.attempts += 1;
      if (event.made) {
        current.made += 1;
        fg3 += 1;
      }
      fg3ByPlayer.set(playerId, current);
    }

    const assists = Object.values(playerStats).reduce((sum, player) => sum + player.assists, 0);
    const steals = Object.values(playerStats).reduce((sum, player) => sum + player.steals, 0);
    const blocks = Object.values(playerStats).reduce((sum, player) => sum + player.blocks, 0);

    // Build base game stats from events
    let gameDate = latestTimestampIso ? latestTimestampIso.slice(0, 10) : "";
    let gameOpponent = session.opponentName?.trim() || resolveTeamLabelFromRoster(opponentTeamId, schoolId);
    let gameLocation: "home" | "away" = ourTeamId === session.homeTeamId ? "home" : "away";
    let gameVcScore = session.state.scoreByTeam[ourTeamId] ?? 0;
    let gameOppScore = session.state.scoreByTeam[opponentTeamId] ?? 0;
    let gameTeamStats = {
      fg: teamStats?.shooting.fgMade ?? 0,
      fga: teamStats?.shooting.fgAttempts ?? 0,
      fg3,
      fg3a,
      ft: teamStats?.shooting.ftMade ?? 0,
      fta: teamStats?.shooting.ftAttempts ?? 0,
      oreb: teamStats?.reboundsOff ?? 0,
      dreb: teamStats?.reboundsDef ?? 0,
      reb: (teamStats?.reboundsOff ?? 0) + (teamStats?.reboundsDef ?? 0),
      asst: assists,
      to: teamStats?.turnovers ?? 0,
      stl: steals,
      blk: blocks,
      fouls: teamStats?.fouls ?? 0
    };

    // Apply override if one exists for this game
    const override = overrideMap.get(session.state.gameId);
    if (override) {
      gameDate = override.date || gameDate;
      gameOpponent = override.opponent || gameOpponent;
      gameLocation = override.location === "neutral" ? "away" : (override.location || gameLocation);
      gameVcScore = override.vc_score;
      gameOppScore = override.opp_score;
      // Only use override team_stats if they contain non-zero data
      const ots = override.team_stats;
      if (ots && (ots.fg > 0 || ots.fga > 0 || ots.ft > 0 || ots.reb > 0)) {
        gameTeamStats = { ...ots };
      }
    }

    const gameResult = gameVcScore > gameOppScore ? "W" as const : gameVcScore < gameOppScore ? "L" as const : "T" as const;

    aggregatedTeam.fg += gameTeamStats.fg;
    aggregatedTeam.fga += gameTeamStats.fga;
    aggregatedTeam.fg3 += gameTeamStats.fg3;
    aggregatedTeam.fg3a += gameTeamStats.fg3a;
    aggregatedTeam.ft += gameTeamStats.ft;
    aggregatedTeam.fta += gameTeamStats.fta;
    aggregatedTeam.oreb += gameTeamStats.oreb;
    aggregatedTeam.dreb += gameTeamStats.dreb;
    aggregatedTeam.reb += gameTeamStats.reb;
    aggregatedTeam.asst += gameTeamStats.asst;
    aggregatedTeam.to += gameTeamStats.to;
    aggregatedTeam.stl += gameTeamStats.stl;
    aggregatedTeam.blk += gameTeamStats.blk;
    aggregatedTeam.fouls += gameTeamStats.fouls;
    aggregatedTeam.pointsFor += gameVcScore;
    aggregatedTeam.pointsAgainst += gameOppScore;
    if (gameResult === "W") {
      aggregatedTeam.win += 1;
    } else if (gameResult === "L") {
      aggregatedTeam.loss += 1;
    }

    games.push({
      gameId: session.state.gameId,
      date: gameDate,
      opponent: gameOpponent,
      location: gameLocation,
      vc_score: gameVcScore,
      opp_score: gameOppScore,
      result: gameResult,
      team_stats: gameTeamStats
    });

    // Use override player_stats if available, otherwise fall back to event-derived stats
    const overridePlayerStats = override?.player_stats;
    if (Array.isArray(overridePlayerStats) && overridePlayerStats.length > 0) {
      for (const ps of overridePlayerStats) {
        const playerId = String(ps.playerId ?? "");
        if (!playerId) { continue; }
        const existing = playerMap.get(playerId);
        if (!existing) { continue; }
        existing.games += 1;
        existing.pts += Number(ps.pts ?? 0);
        existing.fg += Number(ps.fg ?? 0);
        existing.fga += Number(ps.fga ?? 0);
        existing.fg3 += Number(ps.fg3 ?? 0);
        existing.fg3a += Number(ps.fg3a ?? 0);
        existing.ft += Number(ps.ft ?? 0);
        existing.fta += Number(ps.fta ?? 0);
        existing.oreb += Number(ps.oreb ?? 0);
        existing.dreb += Number(ps.dreb ?? 0);
        existing.reb += Number(ps.oreb ?? 0) + Number(ps.dreb ?? 0);
        existing.asst += Number(ps.asst ?? 0);
        existing.to += Number(ps.to ?? 0);
        existing.stl += Number(ps.stl ?? 0);
        existing.blk += Number(ps.blk ?? 0);
        existing.fouls += Number(ps.fouls ?? 0);
        playerMap.set(playerId, existing);
      }
    } else {
      for (const statLine of Object.values(playerStats)) {
        const existing = playerMap.get(statLine.playerId) ?? {
          name: statLine.playerId,
          full_name: statLine.playerId,
          first_name: statLine.playerId,
          games: 0,
          pts: 0,
          fg: 0,
          fga: 0,
          fg3: 0,
          fg3a: 0,
          ft: 0,
          fta: 0,
          oreb: 0,
          dreb: 0,
          reb: 0,
          asst: 0,
          to: 0,
          stl: 0,
          blk: 0,
          fouls: 0,
          plus_minus: 0,
          ppg: 0,
          rpg: 0,
          apg: 0,
          spg: 0,
          bpg: 0,
          tpg: 0,
          fpg: 0,
          fg_pct: 0,
          fg3_pct: 0,
          ft_pct: 0,
          coach_style: "",
          roster_info: null
        } as SeasonPlayerSummary;
        const fg3Line = fg3ByPlayer.get(statLine.playerId) ?? { made: 0, attempts: 0 };
        existing.games += 1;
        existing.pts += statLine.points;
        existing.fg += statLine.fgMade;
        existing.fga += statLine.fgAttempts;
        existing.fg3 += fg3Line.made;
        existing.fg3a += fg3Line.attempts;
        existing.ft += statLine.ftMade;
        existing.fta += statLine.ftAttempts;
        existing.oreb += statLine.reboundsOff;
        existing.dreb += statLine.reboundsDef;
        existing.reb += statLine.reboundsOff + statLine.reboundsDef;
        existing.asst += statLine.assists;
        existing.to += statLine.turnovers;
        existing.stl += statLine.steals;
        existing.blk += statLine.blocks;
        existing.fouls += statLine.fouls;
        playerMap.set(statLine.playerId, existing);
      }
    }
  }

  const totalGames = games.length;
  const seasonTeamStats: SeasonTeamStats = {
    fg: aggregatedTeam.fg,
    fga: aggregatedTeam.fga,
    fg3: aggregatedTeam.fg3,
    fg3a: aggregatedTeam.fg3a,
    ft: aggregatedTeam.ft,
    fta: aggregatedTeam.fta,
    oreb: aggregatedTeam.oreb,
    dreb: aggregatedTeam.dreb,
    reb: aggregatedTeam.reb,
    asst: aggregatedTeam.asst,
    to: aggregatedTeam.to,
    stl: aggregatedTeam.stl,
    blk: aggregatedTeam.blk,
    fouls: aggregatedTeam.fouls,
    win: aggregatedTeam.win,
    loss: aggregatedTeam.loss,
    ppg: totalGames > 0 ? roundStat(aggregatedTeam.pointsFor / totalGames) : 0,
    opp_ppg: totalGames > 0 ? roundStat(aggregatedTeam.pointsAgainst / totalGames) : 0,
    rpg: totalGames > 0 ? roundStat(aggregatedTeam.reb / totalGames) : 0,
    apg: totalGames > 0 ? roundStat(aggregatedTeam.asst / totalGames) : 0,
    to_avg: totalGames > 0 ? roundStat(aggregatedTeam.to / totalGames) : 0,
    stl_pg: totalGames > 0 ? roundStat(aggregatedTeam.stl / totalGames) : 0,
    blk_pg: totalGames > 0 ? roundStat(aggregatedTeam.blk / totalGames) : 0,
    oreb_pg: totalGames > 0 ? roundStat(aggregatedTeam.oreb / totalGames) : 0,
    dreb_pg: totalGames > 0 ? roundStat(aggregatedTeam.dreb / totalGames) : 0,
    fouls_pg: totalGames > 0 ? roundStat(aggregatedTeam.fouls / totalGames) : 0,
    fg_pct: aggregatedTeam.fga > 0 ? aggregatedTeam.fg / aggregatedTeam.fga : 0,
    fg3_pct: aggregatedTeam.fg3a > 0 ? aggregatedTeam.fg3 / aggregatedTeam.fg3a : 0,
    ft_pct: aggregatedTeam.fta > 0 ? aggregatedTeam.ft / aggregatedTeam.fta : 0
  };

  const players = [...playerMap.values()]
    .map((player) => ({
      ...player,
      ppg: player.games > 0 ? roundStat(player.pts / player.games) : 0,
      rpg: player.games > 0 ? roundStat(player.reb / player.games) : 0,
      apg: player.games > 0 ? roundStat(player.asst / player.games) : 0,
      spg: player.games > 0 ? roundStat(player.stl / player.games) : 0,
      bpg: player.games > 0 ? roundStat(player.blk / player.games) : 0,
      tpg: player.games > 0 ? roundStat(player.to / player.games) : 0,
      fpg: player.games > 0 ? roundStat(player.fouls / player.games) : 0,
      fg_pct: player.fga > 0 ? roundStat(player.fg / player.fga, 3) : 0,
      fg3_pct: player.fg3a > 0 ? roundStat(player.fg3 / player.fg3a, 3) : 0,
      ft_pct: player.fta > 0 ? roundStat(player.ft / player.fta, 3) : 0
    }))
    .sort((left, right) => right.ppg - left.ppg);

  const primaryTeam = rosterTeams[0];
  return {
    seasonTeamStats,
    games: [...games].sort((left, right) => right.gameId.localeCompare(left.gameId)),
    players,
    liveContext: {
      seasonStats: seasonTeamStats,
      recentGames: [...games].sort((left, right) => right.gameId.localeCompare(left.gameId)).slice(0, 5),
      players: players.map((player) => ({
        name: player.full_name,
        number: player.number ?? "",
        ppg: player.ppg,
        rpg: player.rpg,
        apg: player.apg,
        fg_pct: player.fg_pct,
        fg3_pct: player.fg3_pct,
        ft_pct: player.ft_pct,
        fpg: player.fpg,
        games: player.games,
        role: player.role ?? "",
        notes: player.notes ?? ""
      })),
      teamInfo: {
        name: primaryTeam?.name ?? "",
        coachStyle: primaryTeam?.coachStyle ?? "",
        playingStyle: "",
        teamContext: ""
      }
    }
  };
}

function recomputeSession(session: GameSession): void {
  const orderedEvents = listOrderedEvents(session);
  const initialState = createInitialGameState(
    session.state.gameId,
    session.homeTeamId,
    session.awayTeamId,
    session.opponentName,
    session.opponentTeamId
  );

  session.state = replayEvents(initialState, orderedEvents);

  const insightIds = new Set<string>();
  // Tracks the latest insight id per (type, teamId, playerId) to replace stale same-condition alerts
  const latestByCondition = new Map<string, string>();
  const insights: LiveInsight[] = [];
  let rollingState = initialState;

  // Build roster player list for insight engine player label resolution
  const ourTeamIdForInsights = session.state.opponentTeamId
    ? (session.homeTeamId !== session.state.opponentTeamId ? session.homeTeamId : session.awayTeamId)
    : session.homeTeamId;
  const rosterTeamForInsights = getRosterTeamsForSchool(session.schoolId).find((t) => t.id === ourTeamIdForInsights);
  const rosterPlayersForInsights = rosterTeamForInsights?.players.map((p) => ({ id: p.id, number: p.number, name: p.name }));

  for (const event of orderedEvents) {
    rollingState = applyEvent(rollingState, event);
    const nextInsights = generateInsights({
      state: rollingState,
      latestEvent: event,
      clockEnabled: session.aiContext.clockEnabled,
      rosterPlayers: rosterPlayersForInsights
    }).filter((insight) => !insightIds.has(insight.id));

    for (const insight of nextInsights) {
      const conditionKey = `${insight.type}:${insight.relatedTeamId ?? ""}:${insight.relatedPlayerId ?? ""}`;
      const supersededId = latestByCondition.get(conditionKey);
      if (supersededId !== undefined) {
        const oldIdx = insights.findIndex((i) => i.id === supersededId);
        if (oldIdx !== -1) {
          insights.splice(oldIdx, 1);
        }
        insightIds.delete(supersededId);
      }
      latestByCondition.set(conditionKey, insight.id);
      insightIds.add(insight.id);
      insights.unshift(insight);
    }
  }

  // Strip stale pre-game insights once the game has meaningfully started
  const totalScore = Object.values(session.state.scoreByTeam ?? {}).reduce((s, v) => s + v, 0);
  const stillPreGame = session.state.currentPeriod === "Q1" && totalScore === 0 && session.state.events.length < 5;
  const finalInsights = stillPreGame ? insights : insights.filter((i) => i.type !== "pre_game");

  session.ruleInsights = finalInsights.slice(0, 15);

  // Filter out sub suggestions for players who are already in the active lineup —
  // the insight engine may produce these for benched players who have since re-entered.
  const ourTeamIdForFilter = session.state.opponentTeamId
    ? (session.homeTeamId !== session.state.opponentTeamId ? session.homeTeamId : session.awayTeamId)
    : session.homeTeamId;
  const currentLineupForFilter = new Set(session.state.activeLineupsByTeam[ourTeamIdForFilter] ?? []);
  session.ruleInsights = session.ruleInsights.filter(
    (insight) =>
      insight.type !== "sub_suggestion" ||
      insight.relatedPlayerId == null ||
      !currentLineupForFilter.has(insight.relatedPlayerId)
  );
}

export async function refreshGameAiInsights(
  gameId: string,
  options?: { force?: boolean },
  scope?: TenantScope
): Promise<LiveInsight[] | null> {
  const session = getSession(gameId, scope);
  if (!session) {
    return null;
  }

  const forceRefresh = options?.force === true;

  if (!getOpenAiApiKey()) {
    markAiFailure(session, "missing_api_key", "OPENAI_API_KEY is not configured", 503);
    return null;
  }

  const orderedEvents = listOrderedEvents(session);
  const latestStoredEvent = orderedEvents[orderedEvents.length - 1];
  const isPeriodTransition = latestStoredEvent?.type === "period_transition";
  if (isPeriodTransition || Date.now() - session.historicalContextFetchedAtMs >= HISTORICAL_CONTEXT_TTL_MS) {
    const summary = await fetchHistoricalContextSummary(session);
    if (summary) {
      session.historicalContextSummary = summary;
      session.historicalContextFetchedAtMs = Date.now();
    }
  }

  if (orderedEvents.length < LIVE_AI_MIN_EVENTS) {
    if (session.aiInsights.length > 0) {
      session.aiInsights = [];
      session.lastAiEventCount = orderedEvents.length;
      session.lastAiFingerprint = "";
      persistSessions();
      return combineInsights(session);
    }

    return null;
  }

  const latestEvent = orderedEvents[orderedEvents.length - 1];
  if (!latestEvent) {
    return null;
  }

  const fingerprint = [
    orderedEvents.length,
    latestEvent.id,
    latestEvent.sequence,
    session.state.currentPeriod,
    latestEvent.clockSecondsRemaining,
    ...Object.entries(session.state.scoreByTeam).flat()
  ].join("|");

  const now = Date.now();
  const hasEnoughNewEvents = orderedEvents.length - session.lastAiEventCount >= LIVE_AI_REFRESH_EVERY_EVENTS;
  const intervalElapsed = now - session.lastAiRefreshAtMs >= LIVE_AI_MIN_INTERVAL_MS;
  const shouldRefresh = session.aiInsights.length === 0 || fingerprint !== session.lastAiFingerprint;

  if (!forceRefresh && (!shouldRefresh || (!hasEnoughNewEvents && !intervalElapsed && session.aiInsights.length > 0))) {
    return null;
  }

  if (session.aiRefreshInFlight) {
    return session.aiRefreshInFlight;
  }

  session.aiRefreshInFlight = requestAiInsights(session, orderedEvents)
    .then((aiInsights) => {
      // Only update if we got new insights; preserve existing if API failed/timed out
      if (aiInsights.length > 0) {
        session.aiInsights = aiInsights;
        session.lastAiRefreshAtMs = Date.now();
        session.lastAiEventCount = orderedEvents.length;
        session.lastAiFingerprint = fingerprint;
        persistSessions();
      } else {
        // API failed/timed out: keep existing aiInsights, rule-based insights show as fallback
        session.lastAiEventCount = orderedEvents.length;
      }
      return combineInsights(session);
    })
    .catch(() => {
      // Network error: keep existing insights and show rule-based fallback
      markAiFailure(session, "network_error", "AI insights refresh failed unexpectedly", 503);
      return combineInsights(session);
    })
    .finally(() => {
      session.aiRefreshInFlight = null;
    });

  return session.aiRefreshInFlight;
}

export function ingestEvent(rawEvent: unknown, scope?: TenantScope): {
  event: GameEvent;
  state: GameState;
  insights: LiveInsight[];
} {
  const schoolId = resolveRequiredSchoolId((rawEvent as { schoolId?: unknown } | null)?.schoolId, scope);
  const event = parseGameEvent({ ...(rawEvent as object), schoolId });
  const session = getSession(event.gameId, { schoolId });

  if (!session) {
    throw new Error(`Game not found: ${event.gameId}`);
  }

  if (session.submitted) {
    throw new Error(`Game already submitted: ${event.gameId}`);
  }

  const existingEventId = session.eventIdsBySequence.get(event.sequence);
  if (existingEventId && existingEventId !== event.id) {
    throw new Error(`Sequence ${event.sequence} already belongs to event ${existingEventId}`);
  }

  const existingEvent = session.eventsById.get(event.id);
  if (existingEvent) {
    if (JSON.stringify(existingEvent) !== JSON.stringify(event)) {
      throw new Error(`Event ${event.id} already exists with different payload`);
    }
    return { event, state: session.state, insights: combineInsights(session) };
  }

  session.eventsById.set(event.id, event);
  session.eventIdsBySequence.set(event.sequence, event.id);
  recomputeSession(session);
  persistSessions();

  return {
    event,
    state: session.state,
    insights: combineInsights(session)
  };
}

export function deleteEvent(gameId: string, eventId: string, scope?: TenantScope, precondition?: EventMutationPrecondition): {
  state: GameState;
  insights: LiveInsight[];
} {
  const session = getSession(gameId, scope);

  if (!session) {
    throw new Error(`Game not found: ${gameId}`);
  }

  if (session.submitted) {
    throw new Error(`Game already submitted: ${gameId}`);
  }

  const event = session.eventsById.get(eventId);
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  if (precondition?.expectedSequence !== undefined && event.sequence !== precondition.expectedSequence) {
    throw new Error(`Event ${eventId} version mismatch: expected sequence ${precondition.expectedSequence}, actual ${event.sequence}`);
  }

  session.eventsById.delete(eventId);
  session.eventIdsBySequence.delete(event.sequence);
  recomputeSession(session);
  persistSessions();

  return {
    state: session.state,
    insights: combineInsights(session)
  };
}

export function updateEvent(gameId: string, eventId: string, rawEvent: unknown, scope?: TenantScope, precondition?: EventMutationPrecondition): {
  event: GameEvent;
  state: GameState;
  insights: LiveInsight[];
} {
  const schoolId = resolveRequiredSchoolId((rawEvent as { schoolId?: unknown } | null)?.schoolId, scope);
  const session = getSession(gameId, { schoolId });
  if (!session) {
    throw new Error(`Game not found: ${gameId}`);
  }

  if (session.submitted) {
    throw new Error(`Game already submitted: ${gameId}`);
  }

  const existing = session.eventsById.get(eventId);
  if (!existing) {
    throw new Error(`Event not found: ${eventId}`);
  }

  if (precondition?.expectedSequence !== undefined && existing.sequence !== precondition.expectedSequence) {
    throw new Error(`Event ${eventId} version mismatch: expected sequence ${precondition.expectedSequence}, actual ${existing.sequence}`);
  }

  const parsed = parseGameEvent({
    ...(rawEvent as object),
    id: eventId,
    gameId,
    schoolId
  });

  const currentOwner = session.eventIdsBySequence.get(parsed.sequence);
  if (currentOwner && currentOwner !== eventId) {
    throw new Error(`Sequence ${parsed.sequence} already belongs to event ${currentOwner}`);
  }

  session.eventsById.set(eventId, parsed);
  if (existing.sequence !== parsed.sequence) {
    session.eventIdsBySequence.delete(existing.sequence);
  }
  session.eventIdsBySequence.set(parsed.sequence, eventId);

  recomputeSession(session);
  persistSessions();

  return {
    event: parsed,
    state: session.state,
    insights: combineInsights(session)
  };
}
