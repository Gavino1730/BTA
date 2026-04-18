import type { Express, Request, Response } from "express";
import type {
  SchoolMembership,
  SchoolRecord,
  ActivityEvent,
  LiveGameSessionRecord,
  BillingState,
  RosterTeam,
  TeamMembership,
  UserWorkspaceProfile,
} from "../store.js";
import { buildBillingEntitlement } from "./billing-routes.js";
import type { WorkspaceRosterTeam, WorkspaceSharedOptions } from "./workspace-helpers.js";
import { applyTeamBillingStatuses, resolveActingSchoolMembership, isSchoolAdmin } from "./workspace-helpers.js";
import { registerStaffRoutes } from "./workspace-staff-routes.js";
import { registerMeRoutes } from "./workspace-me-routes.js";

export interface RegisterSchoolRoutesOptions extends WorkspaceSharedOptions {
  getAuthUser: (req: Request) => { userId?: string; email?: string; fullName?: string };
  requireApiKey: (req: Request, res: Response, next: () => void) => void;
  requireWriteRole: (req: Request, res: Response, next: () => void) => void;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  buildUniqueSchoolTeamId: (name: string, teams: RosterTeam[]) => string;
  normalizeTeamColor: (value: unknown) => string | undefined;
  paywallEnabled: boolean;
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
  getBillingStateByScope: (scope: { schoolId: string }) => BillingState | null;
  saveBillingState: (state: Partial<BillingState>, scope: { schoolId: string }) => BillingState;
  emitTeamDeleted: (schoolId: string, teamId: string) => void;
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
}

function buildDefaultTeamName(gender: string, level: string, customLabel?: string): string {
  if (gender === "custom" || level === "custom") {
    return customLabel?.trim() || "Custom Team";
  }
  const genderLabel = gender === "girls" ? "Girls" : "Boys";
  const levelLabel = level === "jv" ? "JV" : level === "freshman" ? "Freshman" : "Varsity";
  return `${genderLabel} ${levelLabel}`;
}

export function registerSchoolRoutes(app: Express, options: RegisterSchoolRoutesOptions): void {
  registerMeRoutes(app, options);

  app.post("/api/schools/bootstrap", options.requireApiKey, (req, res) => {
    const authUser = options.getAuthUser(req);
    if (!authUser.userId || !authUser.email) {
      res.status(401).json({ error: "Authenticated user required" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const schoolId = options.sanitizeTextField(payload.schoolId, 80);
    const schoolName = options.sanitizeTextField(payload.schoolName, 160);
    if (!schoolId || !schoolName) {
      res.status(400).json({ error: "schoolId and schoolName are required" });
      return;
    }

    const school = options.saveSchoolRecord({ schoolId, name: schoolName, status: "draft" });
    const membership = options.saveSchoolMembership({
      schoolId,
      userId: authUser.userId,
      email: authUser.email,
      fullName: authUser.fullName ?? schoolName,
      role: "owner",
      status: "active",
    });
    options.saveUserWorkspaceProfile({
      userId: authUser.userId,
      email: authUser.email,
      fullName: authUser.fullName ?? "",
      lastSchoolId: school.schoolId,
      lastContextType: "school",
    });
    options.saveActivityEvent({
      schoolId: school.schoolId,
      type: "school_created",
      actorUserId: authUser.userId,
      message: `${authUser.fullName ?? authUser.email} created ${school.name}.`,
    });

    res.status(201).json({ school, membership });
  });

  app.get("/api/schools/:schoolId/overview", options.requireApiKey, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const school = options.getSchoolRecord(schoolId);
    if (!school) {
      res.status(404).json({ error: "School not found" });
      return;
    }
    const actingMembership = resolveActingSchoolMembership(options, req, schoolId);
    if (!actingMembership) {
      res.status(403).json({ error: "School access required" });
      return;
    }

    const billingTeamState = applyTeamBillingStatuses(options, school.schoolId);
    const teams = billingTeamState.teams;
    const schoolMemberships = options.getSchoolMembershipsByScope({ schoolId: school.schoolId });
    const teamMemberships = options.getTeamMembershipsByScope({ schoolId: school.schoolId });
    const activity = options.getActivityEventsByScope({ schoolId: school.schoolId }).slice(0, 12);
    const liveSessions = options.getLiveGameSessionsByScope({ schoolId: school.schoolId }).filter((session) => session.status === "active");
    const billing = options.getBillingStateByScope({ schoolId: school.schoolId });

    const teamSummaries = teams.map((team) => ({
      ...(team as WorkspaceRosterTeam),
      staffCount: schoolMemberships.filter((membership) => isSchoolAdmin(membership.role)).length
        + teamMemberships.filter((membership) => membership.teamId === team.id).length,
      rosterCount: team.players.length,
      liveSession: liveSessions.find((session) => session.teamId === team.id) ?? null,
    }));

    res.json({
      school,
      summary: {
        activeTeamsCount: billingTeamState.activeTeamCount,
        activeLiveGamesCount: liveSessions.length,
        staffCount: schoolMemberships.length + teamMemberships.length,
        billingStatus: billing?.status ?? "trialing",
        planId: billing?.planId ?? "trial",
        activeTeamLimit: billingTeamState.entitlement.activeTeamLimit,
        overLimitTeamCount: billingTeamState.overLimitTeamCount,
      },
      teams: teamSummaries,
      staff: { schoolMemberships, teamMemberships },
      activity,
      billing,
      quickActions: [
        { id: "add-team", label: "Add Team" },
        { id: "invite-staff", label: "Invite Staff" },
        { id: "start-live-game", label: "Start Live Game" },
        { id: "import-roster", label: "Import Roster" },
      ],
    });
  });

  app.post("/api/schools/:schoolId/teams", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const authUser = options.getAuthUser(req);
    const schoolMembership = resolveActingSchoolMembership(options, req, schoolId);
    if (!isSchoolAdmin(schoolMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const school = options.getSchoolRecord(schoolId);
    if (!school) {
      res.status(404).json({ error: "School not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const gender = payload.gender === "girls" || payload.gender === "boys" ? payload.gender : payload.gender === "custom" ? "custom" : "";
    const level = payload.level === "jv" || payload.level === "freshman" || payload.level === "varsity" ? payload.level : payload.level === "custom" ? "custom" : "";
    const customLabel = options.sanitizeTextField(payload.customLabel, 80) || undefined;
    const displayName = options.sanitizeTextField(payload.displayName, 120) || buildDefaultTeamName(gender, level, customLabel);
    const abbreviation = options.sanitizeTextField(payload.abbreviation, 12).toUpperCase() || displayName.replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase();
    if (!gender || !level || !displayName) {
      res.status(400).json({ error: "gender, level, and displayName are required" });
      return;
    }

    const teams = options.getRosterTeamsByScope({ schoolId });
    const id = options.buildUniqueSchoolTeamId(displayName, teams);
    const team: WorkspaceRosterTeam = {
      id,
      schoolId,
      sport: "basketball",
      gender,
      level,
      customLabel,
      displayName,
      name: displayName,
      abbreviation,
      teamColor: options.normalizeTeamColor(payload.teamColor),
      status: "active",
      players: [],
    };

    options.saveRosterTeams([...teams, team], { schoolId });
    options.saveTeamMembership({
      schoolId,
      teamId: team.id,
      userId: authUser.userId,
      email: authUser.email ?? "",
      fullName: authUser.fullName ?? authUser.email ?? "Coach",
      role: "head_coach",
      status: "active",
    });
    options.saveSchoolRecord({ schoolId, name: school.name, status: "active" });

    const billingState = options.getBillingStateByScope({ schoolId });
    if (!billingState) {
      const now = new Date();
      const trialEnd = new Date(now.getTime());
      trialEnd.setDate(trialEnd.getDate() + 14);
      options.saveBillingState({
        planId: "school-base",
        status: "trialing",
        trialStartedAtIso: now.toISOString(),
        trialEndsAtIso: trialEnd.toISOString(),
      }, { schoolId });
    }

    options.saveActivityEvent({
      schoolId,
      teamId: team.id,
      type: "team_created",
      actorUserId: authUser.userId,
      message: `${authUser.fullName ?? authUser.email} added ${displayName}.`,
    });

    const billingTeamState = applyTeamBillingStatuses(options, schoolId);
    const savedTeam = billingTeamState.teams.find((entry) => entry.id === team.id) ?? team;

    res.status(201).json({
      team: savedTeam,
      billingNotice: savedTeam.status === "read_only"
        ? "This team was created successfully, but it is read-only until the school adds more active team capacity."
        : undefined,
      nextChecklist: ["Invite staff", "Import roster", "Start first live game"],
    });
  });

  app.delete("/api/schools/:schoolId/teams/:teamId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const teamId = options.sanitizeTextField(req.params.teamId, 120);
    const schoolMembership = resolveActingSchoolMembership(options, req, schoolId);
    if (!isSchoolAdmin(schoolMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const teams = options.getRosterTeamsByScope({ schoolId });
    const idx = teams.findIndex((t) => t.id === teamId);
    if (idx < 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const deleted = teams.splice(idx, 1)[0];
    options.saveRosterTeams(teams, { schoolId });
    options.emitTeamDeleted(schoolId, deleted.id);
    res.json({ teamId: deleted.id });
  });

  registerStaffRoutes(app, options);
}
