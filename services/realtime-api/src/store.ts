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
import { resolve } from "node:path";
import {
  generateInsights,
  type LiveInsight
} from "@bta/insight-engine";
import { parseGameEvent, isOvertimePeriod, type GameEvent } from "@bta/shared-schema";
import {
  createPostgresPersistenceProvider,
  type PersistedGameSessionRecord,
  type PersistenceProvider
} from "./persistence.js";

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

export interface RosterPlayer {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;
  grade?: string;
  role?: string;
  notes?: string;
}

export interface RosterTeam {
  id: string;
  schoolId?: string;
  name: string;
  abbreviation: string;
  season?: string;
  teamColor?: string;
  coachStyle?: string;
  playingStyle?: string;
  teamContext?: string;
  customPrompt?: string;
  focusInsights?: CoachAiSettings["focusInsights"];
  players: RosterPlayer[];
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
  role: "owner" | "coach" | "analyst";
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
  role: "owner" | "coach" | "analyst";
  status: "active" | "invited";
  createdAtIso: string;
  updatedAtIso: string;
  lastLoginAtIso?: string;
}

export interface LocalAuthAccountInput {
  accountId?: string;
  organizationId?: string;
  email?: string;
  fullName?: string;
  passwordHash?: string;
  passwordSalt?: string;
  role?: LocalAuthAccount["role"];
  status?: LocalAuthAccount["status"];
  lastLoginAtIso?: string;
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

export interface GameAiContext {
  clockEnabled: boolean;
  opponentStatsLimited: boolean;
  opponentTrackedStats: string[];
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
  lastAiRefreshAtMs: number;
  lastAiEventCount: number;
  lastAiFingerprint: string;
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
  aiContext?: GameAiContext;
  historicalContextSummary?: string;
  historicalContextFetchedAtMs?: number;
  events: GameEvent[];
}

interface PersistedSnapshot {
  sessions: PersistedGameSession[];
  rosterTeams?: RosterTeam[];
  rosterTeamsBySchool?: Record<string, RosterTeam[]>;
  organizationProfilesBySchool?: Record<string, OrganizationProfile>;
  onboardingAccountsBySchool?: Record<string, OnboardingAccountState>;
  organizationMembersBySchool?: Record<string, OrganizationMember[]>;
  localAuthAccountsBySchool?: Record<string, LocalAuthAccount[]>;
}

export interface TenantScope {
  schoolId?: string;
}

const DEFAULT_SCHOOL_ID = "default";

function normalizeSchoolId(input: unknown): string {
  if (typeof input !== "string") {
    return DEFAULT_SCHOOL_ID;
  }

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return DEFAULT_SCHOOL_ID;
  }

  return trimmed.replace(/[^a-z0-9_-]/g, "").slice(0, 64) || DEFAULT_SCHOOL_ID;
}

function resolveSchoolId(scope?: TenantScope): string {
  return normalizeSchoolId(scope?.schoolId);
}

function resolveRequiredSchoolId(inputSchoolId: unknown, scope?: TenantScope): string {
  const normalizedInput = normalizeSchoolId(inputSchoolId);
  const normalizedScope = scope?.schoolId !== undefined ? normalizeSchoolId(scope.schoolId) : undefined;

  if (normalizedScope && normalizedInput !== normalizedScope) {
    throw new Error("Tenant schoolId mismatch between payload and scope");
  }

  return normalizedScope ?? normalizedInput;
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
const persistenceEnabled = !process.env.VITEST && process.env.NODE_ENV !== "test";
const dataDirectory = resolve(process.cwd(), ".platform-data");
const dataFile = resolve(dataDirectory, "realtime-api.json");
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const REALTIME_DB_TABLE = process.env.BTA_REALTIME_DB_TABLE?.trim();
const persistenceProvider: PersistenceProvider | null = persistenceEnabled && DATABASE_URL
  ? createPostgresPersistenceProvider({ connectionString: DATABASE_URL, tableName: REALTIME_DB_TABLE })
  : null;
const OPENAI_API_URL = process.env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions";
const LIVE_AI_MODEL = process.env.BTA_LIVE_INSIGHT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const LIVE_AI_TIMEOUT_MS = readEnvNumber("BTA_LIVE_INSIGHT_TIMEOUT_MS", 12000);
const LIVE_AI_MIN_EVENTS = readEnvNumber("BTA_LIVE_INSIGHT_MIN_EVENTS", 4);
const LIVE_AI_REFRESH_EVERY_EVENTS = readEnvNumber("BTA_LIVE_INSIGHT_REFRESH_EVERY_EVENTS", 3);
const LIVE_AI_MIN_INTERVAL_MS = readEnvNumber("BTA_LIVE_INSIGHT_MIN_INTERVAL_MS", 20000);
const LIVE_AI_RECENT_EVENT_WINDOW = readEnvNumber("BTA_LIVE_INSIGHT_RECENT_EVENT_WINDOW", 8);
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
    opponentTrackedStats: ["points", "foul"]
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

  return {
    clockEnabled,
    opponentStatsLimited,
    opponentTrackedStats: opponentTrackedStats.length > 0 ? opponentTrackedStats : defaults.opponentTrackedStats
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

function getOpenAiApiKey(): string {
  return process.env.OPENAI_API_KEY ?? "";
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

function getRosterTeamsForSchool(schoolId: string): RosterTeam[] {
  return rosterTeamsBySchool.get(schoolId) ?? [];
}

function getSessionsForSchool(schoolId: string): GameSession[] {
  return [...sessions.values()].filter((session) => session.schoolId === schoolId);
}

function setRosterTeamsForSchool(schoolId: string, teams: RosterTeam[]): RosterTeam[] {
  const normalized = Array.isArray(teams)
    ? teams.map((team) => ({ ...team, schoolId: normalizeSchoolId(team.schoolId ?? schoolId) }))
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
  const localPart = email.split("@")[0]?.replace(/[^a-z0-9_-]/g, "") || schoolId;
  return `acct-${localPart.slice(0, 48)}`;
}

function buildOrganizationMemberId(email: string, organizationId: string): string {
  const localPart = email.split("@")[0]?.replace(/[^a-z0-9_-]/g, "") || organizationId;
  return `member-${localPart.slice(0, 48)}`;
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
  const role = input.role === "analyst" || input.role === "coach" || input.role === "owner"
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
  const normalized = members
    .map((member) => ({ ...member, schoolId: normalizeSchoolId(member.schoolId ?? schoolId) }))
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
  const role = input.role === "analyst" || input.role === "coach" || input.role === "owner"
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
    role,
    status,
    createdAtIso: existing?.createdAtIso ?? now,
    updatedAtIso: now,
    lastLoginAtIso: trimProfileField(input.lastLoginAtIso ?? existing?.lastLoginAtIso, 64) || undefined,
  };
}

function setLocalAuthAccountsForSchool(schoolId: string, accounts: LocalAuthAccount[]): LocalAuthAccount[] {
  const normalized = accounts
    .map((account) => ({ ...account, schoolId: normalizeSchoolId(account.schoolId ?? schoolId) }))
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
  });
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

function describeEvent(event: GameEvent): string {
  switch (event.type) {
    case "shot_attempt":
      return `${event.teamId} ${event.made ? "made" : "missed"} ${event.points}pt shot (${event.zone})`;
    case "free_throw_attempt":
      return `${event.teamId} ${event.made ? "made" : "missed"} free throw ${event.attemptNumber}/${event.totalAttempts}`;
    case "rebound":
      return `${event.teamId} ${event.offensive ? "offensive" : "defensive"} rebound by ${event.playerId}`;
    case "turnover":
      return `${event.teamId} turnover${event.playerId ? ` by ${event.playerId}` : ""} (${event.turnoverType})`;
    case "foul":
      return `${event.teamId} foul on ${event.playerId} (${event.foulType})`;
    case "assist":
      return `${event.teamId} assist by ${event.playerId}`;
    case "steal":
      return `${event.teamId} steal by ${event.playerId}`;
    case "block":
      return `${event.teamId} block by ${event.playerId}`;
    case "substitution":
      return `${event.teamId} substitution ${event.playerOutId} -> ${event.playerInId}`;
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
  opponentStatsLimited: boolean
): string {
  const teamStats = state.teamStats[teamId];
  const players = Object.values(state.playerStatsByTeam[teamId] ?? {});
  const teamLabel = isOurTeam
    ? (teamId === state.homeTeamId ? "Our team (home)" : "Our team (away)")
    : (state.opponentName?.trim() || (teamId === state.homeTeamId ? "Opponent (home)" : "Opponent (away)"));

  const sortedPlayers = [...players].sort((left, right) => right.points - left.points);
  const topScorer = sortedPlayers[0];
  const foulTroubledPlayers = players
    .filter((p) => (state.playerFouls[p.playerId] ?? 0) >= 3)
    .map((p) => `${p.playerId}(${state.playerFouls[p.playerId]}f)`)
    .join(", ");

  const fgPct = formatFgPct(teamStats?.shooting.fgMade ?? 0, teamStats?.shooting.fgAttempts ?? 0);
  const activeLineup = (state.activeLineupsByTeam[teamId] ?? []).join(", ");

  const lines = [
    `${teamLabel}: ${state.scoreByTeam[teamId] ?? 0} pts`,
    `FG ${teamStats?.shooting.fgMade ?? 0}/${teamStats?.shooting.fgAttempts ?? 0} (${fgPct})`,
    `FT ${teamStats?.shooting.ftMade ?? 0}/${teamStats?.shooting.ftAttempts ?? 0}`,
    `Reb off/def: ${teamStats?.reboundsOff ?? 0}/${teamStats?.reboundsDef ?? 0}`,
    `TO ${teamStats?.turnovers ?? 0}`,
    `Fouls ${teamStats?.fouls ?? 0}`,
    `Bonus ${state.bonusByTeam[teamId] ? "YES" : "no"}`,
    topScorer ? `Top scorer: ${topScorer.playerId} (${topScorer.points}pts, ${topScorer.fgMade}/${topScorer.fgAttempts}FG)` : "Top scorer: none",
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
    const details = [
      player.role?.trim() ? `role: ${player.role.trim()}` : "",
      player.notes?.trim() ? `context: ${player.notes.trim()}` : "",
      liveLineup.has(player.id) ? "currently in lineup" : ""
    ].filter(Boolean).join("; ");

    return `- ${player.id}${player.number ? ` (#${player.number})` : ""}: ${details}`;
  });
}

function isOpeningSample(state: GameState, orderedEvents: GameEvent[]): boolean {
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const inEarlyQ1 = state.currentPeriod === "Q1" && (latestEvent?.clockSecondsRemaining ?? 0) >= 390;
  const lowEventVolume = orderedEvents.length < 10;
  return inEarlyQ1 || lowEventVolume;
}

function buildAiInsightPrompt(
  session: GameSession,
  orderedEvents: GameEvent[],
  historicalContextSummary?: string
): string {
  const state = session.state;
  const recentEvents = orderedEvents.slice(-LIVE_AI_RECENT_EVENT_WINDOW);
  const openingSample = isOpeningSample(state, orderedEvents);
  const preGame = isPreGameState(state, orderedEvents);
  const aiSettings = sanitizeCoachAiSettings(session.aiSettings);
  const aiContext = sanitizeGameAiContext(session.aiContext);
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const clockSec = latestEvent?.clockSecondsRemaining ?? 0;
  const isOT = isOvertimePeriod(state.currentPeriod);

  // Identify which is "our" team
  const ourTeamId = state.opponentTeamId
    ? (state.homeTeamId !== state.opponentTeamId ? state.homeTeamId : state.awayTeamId)
    : session.homeTeamId;
  const opponentTeamId = state.opponentTeamId ?? session.awayTeamId;
  const rosterTeam = getRosterTeamsForSchool(session.schoolId).find((team) => team.id === ourTeamId);

  const homeLabel = state.homeTeamId === ourTeamId ? "Our team (home)" : (state.opponentName || "Opponent (home)");
  const awayLabel = state.awayTeamId === ourTeamId ? "Our team (away)" : (state.opponentName || "Opponent (away)");

  const clockStr = clockSec >= 60
    ? `${Math.floor(clockSec / 60)}:${String(clockSec % 60).padStart(2, "0")}`
    : `${clockSec}s`;

  // Timeout usage
  const timeouts = orderedEvents.filter((e) => e.type === "timeout");
  const ourTimeouts = timeouts.filter((e) => e.teamId === ourTeamId).length;
  const oppTimeouts = timeouts.filter((e) => e.teamId === opponentTeamId).length;
  const maxRegTimeouts = 3;
  const maxOTTimeouts = 1;
  const maxTimeouts = isOT ? maxOTTimeouts : maxRegTimeouts;

  // Player foul summary for our team
  const ourPlayers = Object.values(state.playerStatsByTeam[ourTeamId] ?? {});
  const playerFoulLines = ourPlayers
    .filter((p) => (state.playerFouls[p.playerId] ?? 0) >= 2)
    .sort((a, b) => (state.playerFouls[b.playerId] ?? 0) - (state.playerFouls[a.playerId] ?? 0))
    .map((p) => {
      const f = state.playerFouls[p.playerId] ?? 0;
      const foulNote = f >= 4 ? " (FOUL OUT RISK)" : f === 3 ? " (watch)" : "";
      return `${p.playerId}: ${f} fouls${foulNote}, ${p.points}pts, ${p.fgMade}/${p.fgAttempts}FG`;
    });

  // Our active lineup
  const ourLineup = (state.activeLineupsByTeam[ourTeamId] ?? []).join(", ");
  const theirLineup = (state.activeLineupsByTeam[opponentTeamId] ?? []).join(", ");

  const recentEventLines = recentEvents.map((event) => `- ${describeEvent(event)}`).join("\n");
  const focusInsightsLine = aiSettings.focusInsights.length > 0
    ? `Coach requested focus: ${aiSettings.focusInsights.join(", ")}`
    : "Coach requested focus: none";
  const combinedStyle = [rosterTeam?.coachStyle?.trim(), aiSettings.playingStyle]
    .filter(Boolean)
    .join(" | ");
  const styleLine = combinedStyle
    ? `Team playing style from coach: ${combinedStyle}`
    : "Team playing style from coach: not provided";
  const contextLine = aiSettings.teamContext
    ? `Team context from coach: ${aiSettings.teamContext}`
    : "Team context from coach: not provided";
  const customPromptLine = aiSettings.customPrompt
    ? `Custom coach instruction: ${aiSettings.customPrompt}`
    : "Custom coach instruction: none";
  const historicalLine = historicalContextSummary
    ? `Historical context from stats dashboard: ${historicalContextSummary}`
    : "Historical context from stats dashboard: unavailable";
  const rosterMetadataLines = buildRosterMetadataLines(state, ourTeamId, session.schoolId);
  const clockTrackingLine = `Clock tracking status: ${aiContext.clockEnabled ? "enabled" : "disabled"}`;
  const opponentTrackingLine = aiContext.opponentStatsLimited
    ? `Opponent stat tracking: limited (${aiContext.opponentTrackedStats.join(", ")})`
    : `Opponent stat tracking: expanded (${aiContext.opponentTrackedStats.join(", ")})`;

  if (preGame) {
    return [
      "CONTEXT: Game has just started — minimal data available.",
      "Give ONE general pre-game readiness note only. Do not reference stats or runs.",
      `Home: ${homeLabel} | Away: ${awayLabel}`,
      "IMPORTANT: Do not make assumptions about plays, strategies, or player roles without data."
    ].join("\n");
  }

  return [
    `Game: ${state.gameId}`,
    `Period: ${state.currentPeriod}${isOT ? " [OVERTIME — 4-min period, 1 timeout per team per OT]" : ""}`,
    `Clock: ${clockStr}${latestEvent && clockSec === 0 ? " [clock at 0:00 in latest event]" : ""}`,
    clockTrackingLine,
    opponentTrackingLine,
    `Sample context: ${openingSample ? "opening_small_sample — be conservative with conclusions" : "stabilized"}`,
    "",
    `Score: ${homeLabel} ${state.scoreByTeam[session.homeTeamId] ?? 0} — ${awayLabel} ${state.scoreByTeam[session.awayTeamId] ?? 0}`,
    "",
    "Team snapshots:",
    summarizeTeamState(state, ourTeamId, true, aiContext.opponentStatsLimited),
    summarizeTeamState(state, opponentTeamId, false, aiContext.opponentStatsLimited),
    "",
    `Timeouts used — us: ${ourTimeouts}/${maxTimeouts}, them: ${oppTimeouts}/${maxTimeouts}`,
    styleLine,
    contextLine,
    historicalLine,
    focusInsightsLine,
    customPromptLine,
    rosterMetadataLines.length > 0 ? `Roster context from coaches:\n${rosterMetadataLines.join("\n")}` : "",
    ourLineup ? `Our current lineup: ${ourLineup}` : "",
    theirLineup ? `Their current lineup: ${theirLineup}` : "",
    playerFoulLines.length > 0 ? `Our player foul detail:\n${playerFoulLines.join("\n")}` : "",
    "",
    `Recent events (last ${Math.min(LIVE_AI_RECENT_EVENT_WINDOW, recentEvents.length)}):`,
    recentEventLines || "- none",
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
    "- Allowed insight types per call: timeout suggestion, sub suggestion, foul management, momentum, shot selection, ball security.",
    "- Multiple insights allowed if the situation clearly warrants distinct calls.",
    "- Keep each message concise, command-style, and immediately actionable.",
  ].filter(Boolean).join("\n");
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

function buildCurrentPlayerSnapshot(state: GameState, teamId: string): string {
  const playerStats = Object.values(state.playerStatsByTeam[teamId] ?? {})
    .slice()
    .sort((left, right) => right.points - left.points || right.fgMade - left.fgMade);

  if (playerStats.length === 0) {
    return "No tracked player stats yet.";
  }

  return playerStats
    .map((player) => {
      const fgPct = player.fgAttempts > 0 ? Math.round((player.fgMade / player.fgAttempts) * 100) : 0;
      const fouls = state.playerFouls[player.playerId] ?? player.fouls ?? 0;
      return `- ${player.playerId}: ${player.points} pts, ${player.fgMade}/${player.fgAttempts} FG (${fgPct}%), ${player.ftMade}/${player.ftAttempts} FT, ${player.reboundsOff + player.reboundsDef} reb, ${player.assists} ast, ${player.turnovers} to, ${fouls} fouls`;
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
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const ourTeamId = state.opponentTeamId
    ? (state.homeTeamId !== state.opponentTeamId ? state.homeTeamId : state.awayTeamId)
    : session.homeTeamId;
  const opponentTeamId = state.opponentTeamId ?? session.awayTeamId;
  const aiSettings = sanitizeCoachAiSettings(session.aiSettings);
  const aiContext = sanitizeGameAiContext(session.aiContext);
  const rosterTeam = getRosterTeamsForSchool(session.schoolId).find((team) => team.id === ourTeamId);
  const isOT = isOvertimePeriod(state.currentPeriod);

  const clockSec = latestEvent?.clockSecondsRemaining ?? 0;
  const clockStr = clockSec >= 60
    ? `${Math.floor(clockSec / 60)}:${String(clockSec % 60).padStart(2, "0")}`
    : `${clockSec}s`;

  const recentEvents = orderedEvents.slice(-10).map((event) => `- ${describeEvent(event)}`).join("\n") || "- none";
  const chatHistory = history.length > 0
    ? history.map((entry) => `${entry.role === "assistant" ? "Assistant" : "Coach"}: ${entry.content}`).join("\n")
    : "Coach: no prior chat in this thread";

  // Coach settings and roster context (same as buildAiInsightPrompt)
  const combinedStyle = [rosterTeam?.coachStyle?.trim(), aiSettings.playingStyle].filter(Boolean).join(" | ");
  const styleLine = combinedStyle ? `Team playing style: ${combinedStyle}` : "Team playing style: not provided";
  const contextLine = aiSettings.teamContext ? `Team context: ${aiSettings.teamContext}` : "Team context: not provided";
  const customPromptLine = aiSettings.customPrompt ? `Custom coach instruction: ${aiSettings.customPrompt}` : "";
  const focusLine = aiSettings.focusInsights.length > 0 ? `Coach focus areas: ${aiSettings.focusInsights.join(", ")}` : "";
  const rosterMetadataLines = buildRosterMetadataLines(state, ourTeamId, session.schoolId);

  // Player foul summary
  const ourPlayers = Object.values(state.playerStatsByTeam[ourTeamId] ?? {});
  const playerFoulLines = ourPlayers
    .filter((p) => (state.playerFouls[p.playerId] ?? 0) >= 2)
    .sort((a, b) => (state.playerFouls[b.playerId] ?? 0) - (state.playerFouls[a.playerId] ?? 0))
    .map((p) => {
      const f = state.playerFouls[p.playerId] ?? 0;
      const foulNote = f >= 4 ? " (FOUL OUT RISK)" : f === 3 ? " (watch)" : "";
      return `${p.playerId}: ${f} fouls${foulNote}, ${p.points}pts, ${p.fgMade}/${p.fgAttempts}FG`;
    });

  // Active lineups
  const ourLineup = (state.activeLineupsByTeam[ourTeamId] ?? []).join(", ");
  const theirLineup = (state.activeLineupsByTeam[opponentTeamId] ?? []).join(", ");

  // Active rule insights context
  const activeAlerts = (session.ruleInsights ?? []).slice(0, 6).map((i) => `- [${i.type}] ${i.message}`).join("\n");

  return [
    `Game: ${state.gameId}`,
    `Period: ${state.currentPeriod}${isOT ? " [OVERTIME]" : ""}  |  Clock: ${clockStr}`,
    `Clock tracking: ${aiContext.clockEnabled ? "enabled" : "disabled"}`,
    `Opponent stats: ${aiContext.opponentStatsLimited ? "limited" : "expanded"}`,
    "",
    `Our team: ${summarizeTeamState(state, ourTeamId, true, aiContext.opponentStatsLimited)}`,
    `Opponent: ${summarizeTeamState(state, opponentTeamId, false, aiContext.opponentStatsLimited)}`,
    "",
    `Current player stats (our team):\n${buildCurrentPlayerSnapshot(state, ourTeamId)}`,
    "",
    playerFoulLines.length > 0 ? `Player foul detail:\n${playerFoulLines.join("\n")}` : "",
    ourLineup ? `Our lineup: ${ourLineup}` : "",
    theirLineup ? `Their lineup: ${theirLineup}` : "",
    "",
    styleLine,
    contextLine,
    customPromptLine,
    focusLine,
    rosterMetadataLines.length > 0 ? `Roster context from coaches:\n${rosterMetadataLines.join("\n")}` : "",
    "",
    `Historical context: ${historicalContextSummary || "unavailable"}`,
    "",
    activeAlerts ? `Active system alerts:\n${activeAlerts}` : "",
    "",
    `Recent events:\n${recentEvents}`,
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

  const orderedEvents = listOrderedEvents(session);
  if (Date.now() - session.historicalContextFetchedAtMs >= HISTORICAL_CONTEXT_TTL_MS) {
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
              "Favor concrete coaching actions: subs, matchup pressure, foul management, pace, shot diet, timeout use.",
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
      return null;
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
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
  } catch {
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
      const message = typeof raw.message === "string" ? raw.message.trim() : "";
      const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";
      if (!message || !explanation) {
        return null;
      }

      const relatedTeamId = typeof raw.relatedTeamId === "string" && validTeams.has(raw.relatedTeamId)
        ? raw.relatedTeamId
        : undefined;
      const confidence = raw.confidence === "high" ? "high" : "medium";

      return {
        id: `ai-${latestEvent.id}-${index}`,
        gameId: session.state.gameId,
        type: "ai_coaching",
        priority: "important",
        createdAtIso,
        confidence,
        message,
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
      return [];
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsedInsights = parseAiInsightResponse(content, session, latestEvent);
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
  } catch {
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
      aiSettings: sanitizeCoachAiSettings(session.aiSettings)
    })),
    rosterTeamsBySchool: Object.fromEntries(rosterTeamsBySchool.entries()),
    organizationProfilesBySchool: Object.fromEntries(organizationProfilesBySchool.entries()),
    onboardingAccountsBySchool: Object.fromEntries(onboardingAccountsBySchool.entries()),
    organizationMembersBySchool: Object.fromEntries(organizationMembersBySchool.entries()),
    localAuthAccountsBySchool: Object.fromEntries(localAuthAccountsBySchool.entries()),
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

  sessions.clear();
  rosterTeamsBySchool.clear();
  organizationProfilesBySchool.clear();
  onboardingAccountsBySchool.clear();
  organizationMembersBySchool.clear();
  localAuthAccountsBySchool.clear();

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
    }

    const restoredSession: GameSession = {
      schoolId: normalizedSchoolId,
      homeTeamId: session.homeTeamId,
      awayTeamId: session.awayTeamId,
      opponentName: session.opponentName,
      opponentTeamId: session.opponentTeamId,
      startingLineupByTeam: session.startingLineupByTeam,
      aiSettings: sanitizeCoachAiSettings(session.aiSettings),
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
      lastAiFingerprint: ""
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

  rosterTeamsBySchool.clear();
  for (const [schoolId, teams] of entries) {
    setRosterTeamsForSchool(normalizeSchoolId(schoolId), Array.isArray(teams) ? teams : []);
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

  void persistenceProvider.replaceRosterTeamsForSchool(schoolId, teams).catch((error) => {
    console.warn(`[realtime-api] Failed to persist roster teams for school ${schoolId}`, error);
  });
}

function persistNormalizedSessions(): void {
  if (!persistenceProvider) {
    return;
  }

  void persistenceProvider.replacePersistedSessions(buildPersistedSessions()).catch((error) => {
    console.warn("[realtime-api] Failed to persist normalized game sessions", error);
  });
}

function clearPersistedRosterTeams(): void {
  if (!persistenceProvider) {
    return;
  }

  void persistenceProvider.clearAllRosterTeams().catch((error) => {
    console.warn("[realtime-api] Failed to clear persisted roster teams", error);
  });
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
      console.warn("[realtime-api] Failed to persist snapshot to PostgreSQL", error);
    });
  }

  persistNormalizedSessions();
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
          console.log(`[realtime-api] Retention maintenance removed ${deletedGames} stale games older than ${retentionDays} days.`);
        }
      })
      .catch((error) => {
        console.warn("[realtime-api] Retention maintenance failed", error);
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

export async function initializeStore(): Promise<void> {
  if (storeInitialized) {
    return;
  }

  let restoredSnapshot = false;
  if (persistenceProvider) {
    try {
      const payload = await persistenceProvider.load();
      if (payload) {
        applyPersistedSnapshot(payload as PersistedSnapshot | PersistedGameSession[]);
        restoredSnapshot = true;
      }
    } catch (error) {
      console.warn("[realtime-api] Failed to restore snapshot from PostgreSQL", error);
    }
  }

  if (!restoredSnapshot && persistenceProvider) {
    try {
      restoredSnapshot = await restoreSessionsFromProvider();
    } catch (error) {
      console.warn("[realtime-api] Failed to restore normalized game sessions from PostgreSQL", error);
    }
  }

  if (!restoredSnapshot) {
    restoreSessionsFromFile();
  }

  if (persistenceProvider) {
    try {
      await restoreRosterTeamsFromProvider();
    } catch (error) {
      console.warn("[realtime-api] Failed to restore normalized roster data from PostgreSQL", error);
    }
  }

  setupRetentionMaintenance();

  storeInitialized = true;
}

export function getRosterTeams(): RosterTeam[] {
  return getRosterTeamsForSchool(DEFAULT_SCHOOL_ID);
}

export function getRosterTeamsByScope(scope?: TenantScope): RosterTeam[] {
  return getRosterTeamsForSchool(resolveSchoolId(scope));
}

export function saveRosterTeams(next: RosterTeam[], scope?: TenantScope): RosterTeam[] {
  const schoolId = resolveSchoolId(scope);
  const saved = setRosterTeamsForSchool(schoolId, next);
  persistSessions();
  persistRosterTeamsForSchool(schoolId, saved);
  return saved;
}

export function resetAllData(scope?: TenantScope): void {
  const schoolId = scope ? resolveSchoolId(scope) : null;
  if (!schoolId) {
    sessions.clear();
    rosterTeamsBySchool.clear();
    organizationProfilesBySchool.clear();
    onboardingAccountsBySchool.clear();
    organizationMembersBySchool.clear();
    localAuthAccountsBySchool.clear();
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
  persistSessions();
  persistRosterTeamsForSchool(schoolId, []);
}

export function getOrganizationProfileByScope(scope?: TenantScope): OrganizationProfile | null {
  return organizationProfilesBySchool.get(resolveSchoolId(scope)) ?? null;
}

export function saveOrganizationProfile(profile: Partial<OrganizationProfile>, scope?: TenantScope): OrganizationProfile {
  const schoolId = resolveSchoolId(scope);
  const saved = setOrganizationProfileForSchool(schoolId, profile);
  persistSessions();
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

export function getLocalAuthAccountsByScope(scope?: TenantScope): LocalAuthAccount[] {
  return localAuthAccountsBySchool.get(resolveSchoolId(scope)) ?? [];
}

export function getLocalAuthAccountByEmail(email: string, scope?: TenantScope): LocalAuthAccount | null {
  const schoolId = resolveSchoolId(scope);
  return findLocalAuthAccountByEmailForSchool(schoolId, email);
}

export function getLocalAuthAccountsByEmailAcrossSchools(email: string): LocalAuthAccount[] {
  const normalizedEmail = trimProfileField(email, 160).toLowerCase();
  if (!normalizedEmail) {
    return [];
  }

  return Array.from(localAuthAccountsBySchool.values())
    .flat()
    .filter((account) => account.email === normalizedEmail);
}

export function saveLocalAuthAccount(account: LocalAuthAccountInput, scope?: TenantScope): LocalAuthAccount {
  const schoolId = resolveSchoolId(scope);
  const saved = upsertLocalAuthAccountForSchool(schoolId, account);
  persistSessions();
  return saved;
}

export function recordLocalAuthLogin(accountId: string, scope?: TenantScope): LocalAuthAccount | null {
  const schoolId = resolveSchoolId(scope);
  const saved = touchLocalAuthAccountLoginForSchool(schoolId, accountId);
  persistSessions();
  return saved;
}

export function saveOrganizationMember(member: OrganizationMemberInput, scope?: TenantScope): OrganizationMember {
  const schoolId = resolveSchoolId(scope);
  const organizationId = trimProfileField(member.organizationId, 80)
    || onboardingAccountsBySchool.get(schoolId)?.organization.organizationId
    || `org-${schoolId}`;
  const saved = upsertOrganizationMemberForSchool(schoolId, member, organizationId);
  persistSessions();
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
  return true;
}

export function createGame(input: CreateGameInput, scope?: TenantScope): GameState {
  const schoolId = resolveRequiredSchoolId(input.schoolId, scope);
  const state = createInitialGameState(
    input.gameId,
    input.homeTeamId,
    input.awayTeamId,
    input.opponentName,
    input.opponentTeamId
  );

  if (input.startingLineupByTeam) {
    for (const [teamId, lineup] of Object.entries(input.startingLineupByTeam)) {
      if (teamId !== input.homeTeamId && teamId !== input.awayTeamId) {
        continue;
      }

      const seededLineup = Array.isArray(lineup)
        ? [...new Set(lineup.map((playerId) => String(playerId).trim()).filter(Boolean))].slice(0, 5)
        : [];

      state.activeLineupsByTeam[teamId] = seededLineup;
    }
  }

  sessions.set(buildGameSessionKey(input.gameId, schoolId), {
    schoolId,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    opponentName: input.opponentName,
    opponentTeamId: input.opponentTeamId,
    startingLineupByTeam: input.startingLineupByTeam,
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
    lastAiRefreshAtMs: 0,
    lastAiEventCount: 0,
    lastAiFingerprint: ""
  });

  persistSessions();

  return state;
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
    if ((session.state.activeLineupsByTeam[teamId]?.length ?? 0) >= 5) continue;

    const seeded = [...new Set(lineup.map((id) => String(id).trim()).filter(Boolean))].slice(0, 5);
    if (seeded.length === 0) continue;

    session.state = {
      ...session.state,
      activeLineupsByTeam: {
        ...session.state.activeLineupsByTeam,
        [teamId]: seeded,
      },
    };
    // Persist the starting lineup so it survives server restarts.
    session.startingLineupByTeam = {
      ...(session.startingLineupByTeam ?? {}),
      [teamId]: seeded,
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
  const sessionsForSchool = getSessionsForSchool(schoolId)
    .filter((session) => rosterTeamIds.has(session.homeTeamId) || rosterTeamIds.has(session.awayTeamId));

  for (const session of sessionsForSchool) {
    const ourTeamId = rosterTeamIds.has(session.homeTeamId) ? session.homeTeamId : session.awayTeamId;
    const opponentTeamId = ourTeamId === session.homeTeamId ? session.awayTeamId : session.homeTeamId;
    const teamStats = session.state.teamStats[ourTeamId];
    const ourScore = session.state.scoreByTeam[ourTeamId] ?? 0;
    const oppScore = session.state.scoreByTeam[opponentTeamId] ?? 0;
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

    aggregatedTeam.fg += teamStats?.shooting.fgMade ?? 0;
    aggregatedTeam.fga += teamStats?.shooting.fgAttempts ?? 0;
    aggregatedTeam.fg3 += fg3;
    aggregatedTeam.fg3a += fg3a;
    aggregatedTeam.ft += teamStats?.shooting.ftMade ?? 0;
    aggregatedTeam.fta += teamStats?.shooting.ftAttempts ?? 0;
    aggregatedTeam.oreb += teamStats?.reboundsOff ?? 0;
    aggregatedTeam.dreb += teamStats?.reboundsDef ?? 0;
    aggregatedTeam.reb += (teamStats?.reboundsOff ?? 0) + (teamStats?.reboundsDef ?? 0);
    aggregatedTeam.asst += assists;
    aggregatedTeam.to += teamStats?.turnovers ?? 0;
    aggregatedTeam.stl += steals;
    aggregatedTeam.blk += blocks;
    aggregatedTeam.fouls += teamStats?.fouls ?? 0;
    aggregatedTeam.pointsFor += ourScore;
    aggregatedTeam.pointsAgainst += oppScore;
    if (ourScore > oppScore) {
      aggregatedTeam.win += 1;
    } else if (ourScore < oppScore) {
      aggregatedTeam.loss += 1;
    }

    games.push({
      gameId: session.state.gameId,
      date: latestTimestampIso ? latestTimestampIso.slice(0, 10) : "",
      opponent: session.opponentName?.trim() || resolveTeamLabelFromRoster(opponentTeamId, schoolId),
      location: ourTeamId === session.homeTeamId ? "home" : "away",
      vc_score: ourScore,
      opp_score: oppScore,
      result: ourScore > oppScore ? "W" : ourScore < oppScore ? "L" : "T",
      team_stats: {
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
      }
    });

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

  for (const event of orderedEvents) {
    rollingState = applyEvent(rollingState, event);
    const nextInsights = generateInsights({
      state: rollingState,
      latestEvent: event,
      clockEnabled: session.aiContext.clockEnabled
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
    return null;
  }

  const orderedEvents = listOrderedEvents(session);
  if (Date.now() - session.historicalContextFetchedAtMs >= HISTORICAL_CONTEXT_TTL_MS) {
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
      console.warn("[realtime-api] AI insights fetch failed; showing rule-based insights");
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

  const existingEventId = session.eventIdsBySequence.get(event.sequence);
  if (existingEventId && existingEventId !== event.id) {
    throw new Error(`Sequence ${event.sequence} already belongs to event ${existingEventId}`);
  }

  if (session.eventsById.has(event.id)) {
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

export function deleteEvent(gameId: string, eventId: string, scope?: TenantScope): {
  state: GameState;
  insights: LiveInsight[];
} {
  const session = getSession(gameId, scope);

  if (!session) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const event = session.eventsById.get(eventId);
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
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

export function updateEvent(gameId: string, eventId: string, rawEvent: unknown, scope?: TenantScope): {
  event: GameEvent;
  state: GameState;
  insights: LiveInsight[];
} {
  const schoolId = resolveRequiredSchoolId((rawEvent as { schoolId?: unknown } | null)?.schoolId, scope);
  const session = getSession(gameId, { schoolId });
  if (!session) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const existing = session.eventsById.get(eventId);
  if (!existing) {
    throw new Error(`Event not found: ${eventId}`);
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
