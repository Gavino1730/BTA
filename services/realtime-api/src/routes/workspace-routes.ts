import type { Express, Request, Response } from "express";
import type {
  ActivityEvent,
  LiveGameSessionRecord,
  SchoolMembership,
  SchoolRecord,
  TeamMembership,
  UserWorkspaceProfile,
  BillingState,
  RosterTeam,
} from "../store.js";
import { registerSchoolRoutes } from "./workspace-school-routes.js";
import { registerTeamRoutes } from "./workspace-team-routes.js";

export interface RegisterWorkspaceRoutesOptions {
  paywallEnabled: boolean;
  requireApiKey: (req: Request, res: Response, next: () => void) => void;
  requireWriteRole: (req: Request, res: Response, next: () => void) => void;
  getAuthUser: (req: Request) => { userId?: string; email?: string; fullName?: string };
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  buildUniqueSchoolTeamId: (name: string, teams: RosterTeam[]) => string;
  normalizeTeamColor: (value: unknown) => string | undefined;
  getSchoolRecord: (schoolId: string) => SchoolRecord | null;
  saveSchoolRecord: (record: Partial<SchoolRecord> & Pick<SchoolRecord, "schoolId" | "name">) => SchoolRecord;
  getUserWorkspaceProfile: (userId: string) => UserWorkspaceProfile | null;
  saveUserWorkspaceProfile: (profile: Partial<UserWorkspaceProfile> & Pick<UserWorkspaceProfile, "userId" | "email">) => UserWorkspaceProfile;
  getSchoolMembershipsByScope: (scope: { schoolId: string }) => SchoolMembership[];
  saveSchoolMembership: (membership: Partial<SchoolMembership> & Pick<SchoolMembership, "schoolId" | "email" | "fullName" | "role">) => SchoolMembership;
  deleteSchoolMembership: (membershipId: string, scope?: { schoolId: string }) => boolean;
  getTeamMembershipsByScope: (scope: { schoolId: string }) => TeamMembership[];
  saveTeamMembership: (membership: Partial<TeamMembership> & Pick<TeamMembership, "schoolId" | "teamId" | "email" | "fullName" | "role">) => TeamMembership;
  deleteTeamMembership: (membershipId: string, scope?: { schoolId: string }) => boolean;
  listSchoolMembershipsForUser: (input: { userId?: string; email?: string }) => SchoolMembership[];
  listTeamMembershipsForUser: (input: { schoolId?: string; userId?: string; email?: string }) => TeamMembership[];
  getRosterTeamsByScope: (scope: { schoolId: string }) => RosterTeam[];
  saveRosterTeams: (teams: RosterTeam[], scope: { schoolId: string }) => RosterTeam[];
  getTeamById: (teamId: string, scope?: { schoolId?: string }) => RosterTeam | null;
  getActivityEventsByScope: (scope: { schoolId: string }) => ActivityEvent[];
  saveActivityEvent: (event: Omit<ActivityEvent, "id" | "createdAtIso"> & { id?: string; createdAtIso?: string }) => ActivityEvent;
  getLiveGameSessionsByScope: (scope: { schoolId: string }) => LiveGameSessionRecord[];
  createLiveGameSessionRecord: (input: Omit<LiveGameSessionRecord, "createdAtIso" | "updatedAtIso">) => LiveGameSessionRecord;
  getLiveGameSessionById: (liveSessionId: string) => LiveGameSessionRecord | null;
  saveOperatorSessionRecord: (session: {
    operatorSessionId: string;
    liveSessionId: string;
    schoolId: string;
    teamId: string;
    pairingCode: string;
    operatorToken: string;
    expiresAtIso: string;
    createdAtIso: string;
    updatedAtIso: string;
  }) => unknown;
  getOperatorSessionByLiveSession: (liveSessionId: string) => {
    operatorSessionId: string;
    liveSessionId: string;
    schoolId: string;
    teamId: string;
    pairingCode: string;
    operatorToken: string;
    expiresAtIso: string;
    createdAtIso: string;
    updatedAtIso: string;
  } | null;
  issueLocalAuthToken: (payload: {
    subject: string;
    email: string;
    schoolId: string;
    role: "operator";
    expiresInHours: number;
  }) => string | null;
  getBillingStateByScope: (scope: { schoolId: string }) => BillingState | null;
  saveBillingState: (state: Partial<BillingState>, scope: { schoolId: string }) => BillingState;
  createGame: (input: {
    schoolId: string;
    gameId: string;
    homeTeamId: string;
    awayTeamId: string;
    opponentName?: string;
    opponentTeamId?: string;
    startingLineupByTeam?: Record<string, string[]>;
  }, scope?: { schoolId: string }) => Promise<unknown>;
  setOperatorLinkSetup?: (schoolId: string, connectionId: string, setup: {
    gameId?: string;
    myTeamId?: string;
    myTeamName?: string;
    opponentName?: string;
    vcSide: "home" | "away";
    homeTeamColor?: string;
    awayTeamColor?: string;
    startingLineup?: string[];
    updatedAtIso: string;
    operatorToken?: string;
  }) => void;
  issueWorkspaceInvitation: (req: Request, input: {
    schoolId: string;
    membershipId: string;
    email: string;
    fullName: string;
    roleLabel: string;
  }) => Promise<{
    inviteToken?: string;
    invitePath: string;
    emailDelivery: unknown;
    warning?: string;
  }>;
  emitTeamDeleted: (schoolId: string, teamId: string) => void;
}

export function registerWorkspaceRoutes(app: Express, options: RegisterWorkspaceRoutesOptions): void {
  registerSchoolRoutes(app, options);
  registerTeamRoutes(app, options);
}
