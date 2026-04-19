import type { GameState } from "@bta/game-state";
import type { LiveInsight } from "@bta/insight-engine";
import type { GameEvent, RosterPlayer, RosterTeam } from "@bta/shared-schema";

export type { RosterPlayer, RosterTeam };

export type WorkspaceRosterTeam = RosterTeam & {
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
  budgetWarning?: string;
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

export interface GameSession {
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

export interface PersistedGameSession {
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

export interface EventMutationPrecondition {
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

export interface PersistedSnapshot {
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

export interface PersistenceStatus {
  backend: "postgres" | "file_snapshot" | "memory";
  durable: boolean;
  connected: boolean;
  lastRestoreAtIso: string | null;
  lastSuccessfulWriteAtIso: string | null;
  warning?: string;
  dataFile?: string;
}

export type NormalizedPersistenceWaiter = {
  sequence: number;
  resolve: () => void;
  reject: (error: unknown) => void;
};
