import { normalizeSchoolId } from "../school-id.js";
import type {
  ActivityEvent,
  BillingState,
  GameEditOverride,
  GameSession,
  LiveGameSessionRecord,
  LocalAuthAccount,
  OnboardingAccountState,
  OperatorSessionRecord,
  OrganizationMember,
  OrganizationProfile,
  RosterTeam,
  SchoolMembership,
  SchoolRecord,
  TeamMembership,
  TenantScope,
  UserWorkspaceProfile,
} from "./store-types.js";

export function resolveSchoolId(scope?: TenantScope): string {
  return normalizeSchoolId(scope?.schoolId);
}

export function resolveRequiredSchoolId(inputSchoolId: unknown, scope?: TenantScope): string {
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

export function buildGameSessionKey(gameId: string, schoolId: string): string {
  return `${schoolId}:${gameId}`;
}

export const sessions = new Map<string, GameSession>();
export const rosterTeamsBySchool = new Map<string, RosterTeam[]>();
export const organizationProfilesBySchool = new Map<string, OrganizationProfile>();
export const onboardingAccountsBySchool = new Map<string, OnboardingAccountState>();
export const organizationMembersBySchool = new Map<string, OrganizationMember[]>();
export const localAuthAccountsBySchool = new Map<string, LocalAuthAccount[]>();
export const gameOverridesBySchool = new Map<string, Map<string, GameEditOverride>>();
export const billingBySchool = new Map<string, BillingState>();
export const processedStripeWebhookEvents = new Map<string, string>();
export const userWorkspaceProfilesById = new Map<string, UserWorkspaceProfile>();
export const schoolsById = new Map<string, SchoolRecord>();
export const schoolMembershipsBySchool = new Map<string, SchoolMembership[]>();
export const teamMembershipsBySchool = new Map<string, TeamMembership[]>();
export const activityEventsBySchool = new Map<string, ActivityEvent[]>();
export const liveGameSessionsBySchool = new Map<string, LiveGameSessionRecord[]>();
export const operatorSessionsByLiveSession = new Map<string, OperatorSessionRecord>();
