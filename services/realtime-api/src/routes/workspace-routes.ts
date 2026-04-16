import type { Express, NextFunction, Request, Response } from "express";
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
import { buildBillingEntitlement } from "./billing-routes.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

type AuthUser = {
  userId?: string;
  email?: string;
  fullName?: string;
};

type WorkspaceRosterTeam = RosterTeam & {
  sport?: "basketball";
  gender?: "boys" | "girls" | "custom";
  level?: "varsity" | "jv" | "freshman" | "custom";
  customLabel?: string;
  displayName?: string;
  status?: "active" | "archived" | "read_only";
};

interface RegisterWorkspaceRoutesOptions {
  paywallEnabled: boolean;
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getAuthUser: (req: Request) => AuthUser;
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
  }) => {
    operatorSessionId: string;
    liveSessionId: string;
    schoolId: string;
    teamId: string;
    pairingCode: string;
    operatorToken: string;
    expiresAtIso: string;
    createdAtIso: string;
    updatedAtIso: string;
  };
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
  }, scope?: { schoolId: string }) => unknown;
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
}

function buildPairingCode(): string {
  return String(Math.floor(100000 + (Math.random() * 900000)));
}

function normalizePairingCode(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 6);
  return /^\d{6}$/.test(digits) ? digits : "";
}

function slugifyOpponentName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "opponent";
}

function buildDefaultTeamName(gender: string, level: string, customLabel?: string): string {
  if (gender === "custom" || level === "custom") {
    return customLabel?.trim() || "Custom Team";
  }

  const genderLabel = gender === "girls" ? "Girls" : "Boys";
  const levelLabel = level === "jv" ? "JV" : level === "freshman" ? "Freshman" : "Varsity";
  return `${genderLabel} ${levelLabel}`;
}

function isSchoolAdmin(role: SchoolMembership["role"] | undefined): boolean {
  return role === "owner" || role === "school_admin";
}

function applyTeamBillingStatuses(
  options: Pick<RegisterWorkspaceRoutesOptions, "paywallEnabled" | "getBillingStateByScope" | "getRosterTeamsByScope" | "saveRosterTeams">,
  schoolId: string,
): {
  teams: WorkspaceRosterTeam[];
  entitlement: ReturnType<typeof buildBillingEntitlement>;
  activeTeamCount: number;
  overLimitTeamCount: number;
} {
  const teams = options.getRosterTeamsByScope({ schoolId }) as WorkspaceRosterTeam[];
  const entitlement = buildBillingEntitlement(options.paywallEnabled, options.getBillingStateByScope({ schoolId }));
  const activeTeamLimit = entitlement.activeTeamLimit;

  if (activeTeamLimit === null) {
    const normalizedTeams: WorkspaceRosterTeam[] = teams.map((team) => ({
      ...team,
      status: team.status === "archived" ? "archived" : "active",
    }));
    const changed = normalizedTeams.some((team, index) => team.status !== teams[index]?.status);
    const savedTeams = changed ? options.saveRosterTeams(normalizedTeams, { schoolId }) as WorkspaceRosterTeam[] : normalizedTeams;
    return {
      teams: savedTeams,
      entitlement,
      activeTeamCount: savedTeams.filter((team) => team.status === "active").length,
      overLimitTeamCount: 0,
    };
  }

  let remainingActiveSlots = Math.max(0, activeTeamLimit);
  const normalizedTeams: WorkspaceRosterTeam[] = teams.map((team) => {
    if (team.status === "archived") {
      return { ...team, status: "archived" as const };
    }
    if (remainingActiveSlots > 0) {
      remainingActiveSlots -= 1;
      return { ...team, status: "active" as const };
    }
    return { ...team, status: "read_only" as const };
  });
  const changed = normalizedTeams.some((team, index) => team.status !== teams[index]?.status);
  const savedTeams = changed ? options.saveRosterTeams(normalizedTeams, { schoolId }) as WorkspaceRosterTeam[] : normalizedTeams;
  return {
    teams: savedTeams,
    entitlement,
    activeTeamCount: savedTeams.filter((team) => team.status === "active").length,
    overLimitTeamCount: savedTeams.filter((team) => team.status === "read_only").length,
  };
}

function resolveActingSchoolMembership(
  options: Pick<RegisterWorkspaceRoutesOptions, "getSchoolMembershipsByScope" | "getAuthUser">,
  req: Request,
  schoolId: string,
): SchoolMembership | undefined {
  const authUser = options.getAuthUser(req);
  return options.getSchoolMembershipsByScope({ schoolId }).find((membership) =>
    (authUser.userId && membership.userId === authUser.userId)
    || (authUser.email && membership.email === authUser.email),
  );
}

export function registerWorkspaceRoutes(app: Express, options: RegisterWorkspaceRoutesOptions): void {
  app.get("/api/me/context", options.requireApiKey, (req, res) => {
    const authUser = options.getAuthUser(req);
    if (!authUser.email && !authUser.userId) {
      res.status(401).json({ error: "Authenticated user required" });
      return;
    }

    const schoolMemberships = options.listSchoolMembershipsForUser({
      userId: authUser.userId,
      email: authUser.email,
    });

    const schools = schoolMemberships
      .map((membership) => options.getSchoolRecord(membership.schoolId))
      .filter((school): school is SchoolRecord => Boolean(school));

    const teamMemberships = schoolMemberships.flatMap((membership) =>
      options.listTeamMembershipsForUser({
        schoolId: membership.schoolId,
        userId: authUser.userId,
        email: authUser.email,
      }),
    );

    const teams = schoolMemberships.flatMap((membership) => {
      const schoolTeams = applyTeamBillingStatuses(options, membership.schoolId).teams;
      if (isSchoolAdmin(membership.role)) {
        return schoolTeams;
      }

      const allowedTeamIds = new Set(
        options.listTeamMembershipsForUser({
          schoolId: membership.schoolId,
          userId: authUser.userId,
          email: authUser.email,
        }).map((teamMembership) => teamMembership.teamId),
      );
      return schoolTeams.filter((team) => allowedTeamIds.has(team.id));
    });

    const profile = authUser.userId ? options.getUserWorkspaceProfile(authUser.userId) : null;
    const preferredSchoolId = profile?.lastSchoolId && schools.some((school) => school.schoolId === profile.lastSchoolId)
      ? profile.lastSchoolId
      : schools[0]?.schoolId;
    const preferredSchoolMembership = schoolMemberships.find((membership) => membership.schoolId === preferredSchoolId) ?? schoolMemberships[0];
    const preferredTeams = teams.filter((team) => team.schoolId === preferredSchoolId);
    const defaultContext = isSchoolAdmin(preferredSchoolMembership?.role)
      ? { type: "school" as const, schoolId: preferredSchoolId ?? "" }
      : { type: "team" as const, schoolId: preferredSchoolId ?? "", teamId: profile?.lastTeamId && preferredTeams.some((team) => team.id === profile.lastTeamId) ? profile.lastTeamId : preferredTeams[0]?.id ?? "" };

    res.json({
      user: authUser,
      profile,
      schools,
      schoolMemberships,
      teamMemberships,
      teams,
      defaultContext,
    });
  });

  app.put("/api/me/context", options.requireApiKey, (req, res) => {
    const authUser = options.getAuthUser(req);
    if (!authUser.userId || !authUser.email) {
      res.status(400).json({ error: "userId and email are required to persist context" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const saved = options.saveUserWorkspaceProfile({
      userId: authUser.userId,
      email: authUser.email,
      fullName: authUser.fullName ?? "",
      lastSchoolId: options.sanitizeTextField(payload.schoolId, 80) || undefined,
      lastTeamId: options.sanitizeTextField(payload.teamId, 120) || undefined,
      lastContextType: payload.contextType === "team" ? "team" : "school",
    });
    res.json({ profile: saved });
  });

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

    const school = options.saveSchoolRecord({
      schoolId,
      name: schoolName,
      status: "draft",
    });
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
      staff: {
        schoolMemberships,
        teamMemberships,
      },
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
    options.saveSchoolRecord({
      schoolId,
      name: school.name,
      status: "active",
    });

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

  app.post("/api/schools/:schoolId/staff/invitations", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const actingMembership = resolveActingSchoolMembership(options, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const school = options.getSchoolRecord(schoolId);
    if (!school) {
      res.status(404).json({ error: "School not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const fullName = options.sanitizeTextField(payload.fullName, 120);
    const email = options.sanitizeTextField(payload.email, 160).toLowerCase();
    const schoolRole = payload.schoolRole === "school_admin" ? "school_admin" : null;
    const teamRole = payload.teamRole === "head_coach" || payload.teamRole === "assistant_coach" || payload.teamRole === "operator" || payload.teamRole === "viewer"
      ? payload.teamRole
      : null;
    const teamId = options.sanitizeTextField(payload.teamId, 120) || undefined;

    if (!fullName || !email) {
      res.status(400).json({ error: "fullName and email are required" });
      return;
    }

    if (schoolRole) {
      const membership = options.saveSchoolMembership({
        schoolId,
        email,
        fullName,
        role: schoolRole,
        status: "invited",
      });
      const invite = await options.issueWorkspaceInvitation(req, {
        schoolId,
        membershipId: membership.membershipId,
        email,
        fullName,
        roleLabel: "school admin",
      });
      options.saveActivityEvent({
        schoolId,
        type: "member_invited",
        actorUserId: options.getAuthUser(req).userId,
        message: `${fullName} was invited as a school admin.`,
        metadata: { membershipId: membership.membershipId, email, role: schoolRole },
      });
      res.status(201).json({
        membershipType: "school",
        membership,
        staff: {
          schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
          teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
        },
        inviteToken: invite.inviteToken,
        invitePath: invite.invitePath,
        emailDelivery: invite.emailDelivery,
        warning: invite.warning,
      });
      return;
    }

    if (!teamRole || !teamId) {
      res.status(400).json({ error: "teamRole and teamId are required for team staff invites" });
      return;
    }

    const team = options.getTeamById(teamId, { schoolId });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const membership = options.saveTeamMembership({
      schoolId,
      teamId,
      email,
      fullName,
      role: teamRole,
      status: "invited",
    });
    const invite = await options.issueWorkspaceInvitation(req, {
      schoolId,
      membershipId: membership.membershipId,
      email,
      fullName,
        roleLabel: `${(team as WorkspaceRosterTeam).displayName ?? team.name} ${teamRole.replace(/_/g, " ")}`,
    });
    options.saveActivityEvent({
      schoolId,
      teamId,
      type: "member_invited",
      actorUserId: options.getAuthUser(req).userId,
      message: `${fullName} was invited to ${(team as WorkspaceRosterTeam).displayName ?? team.name} as ${teamRole.replace(/_/g, " ")}.`,
      metadata: { membershipId: membership.membershipId, email, role: teamRole },
    });
    res.status(201).json({
      membershipType: "team",
      membership,
      staff: {
        schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
        teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
      },
      inviteToken: invite.inviteToken,
      invitePath: invite.invitePath,
      emailDelivery: invite.emailDelivery,
      warning: invite.warning,
    });
  });

  app.post("/api/schools/:schoolId/staff/school-memberships/:membershipId/resend-invite", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const membership = options.getSchoolMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!membership) {
      res.status(404).json({ error: "School membership not found" });
      return;
    }

    const invite = await options.issueWorkspaceInvitation(req, {
      schoolId,
      membershipId,
      email: membership.email,
      fullName: membership.fullName,
      roleLabel: membership.role === "school_admin" ? "school admin" : "owner",
    });
    res.json({
      membership,
      inviteToken: invite.inviteToken,
      invitePath: invite.invitePath,
      emailDelivery: invite.emailDelivery,
      warning: invite.warning,
    });
  });

  app.post("/api/schools/:schoolId/staff/team-memberships/:membershipId/resend-invite", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const membership = options.getTeamMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!membership) {
      res.status(404).json({ error: "Team membership not found" });
      return;
    }

    const team = options.getTeamById(membership.teamId, { schoolId });
    const invite = await options.issueWorkspaceInvitation(req, {
      schoolId,
      membershipId,
      email: membership.email,
      fullName: membership.fullName,
      roleLabel: `${(team as WorkspaceRosterTeam | null)?.displayName ?? team?.name ?? "team"} ${membership.role.replace(/_/g, " ")}`,
    });
    res.json({
      membership,
      inviteToken: invite.inviteToken,
      invitePath: invite.invitePath,
      emailDelivery: invite.emailDelivery,
      warning: invite.warning,
    });
  });

  app.put("/api/schools/:schoolId/staff/school-memberships/:membershipId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const existing = options.getSchoolMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!existing) {
      res.status(404).json({ error: "School membership not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const fullName = options.sanitizeTextField(payload.fullName ?? existing.fullName, 120) || existing.fullName;
    const email = options.sanitizeTextField(payload.email ?? existing.email, 160).toLowerCase() || existing.email;
    const role = payload.role === "school_admin" ? "school_admin" : existing.role;
    const status = payload.status === "active" || payload.status === "invited" ? payload.status : existing.status;

    if (existing.role === "owner" && role !== "owner") {
      res.status(400).json({ error: "Owner membership role cannot be changed here" });
      return;
    }

    const membership = options.saveSchoolMembership({
      membershipId,
      schoolId,
      userId: existing.userId,
      fullName,
      email,
      role,
      status,
    });

    options.saveActivityEvent({
      schoolId,
      type: "membership_updated",
      actorUserId: options.getAuthUser(req).userId,
      message: `${membership.fullName}'s school access was updated.`,
      metadata: { membershipId, email: membership.email, role: membership.role, status: membership.status },
    });

    res.json({
      membership,
      staff: {
        schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
        teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
      },
    });
  });

  app.put("/api/schools/:schoolId/staff/team-memberships/:membershipId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const existing = options.getTeamMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!existing) {
      res.status(404).json({ error: "Team membership not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const fullName = options.sanitizeTextField(payload.fullName ?? existing.fullName, 120) || existing.fullName;
    const email = options.sanitizeTextField(payload.email ?? existing.email, 160).toLowerCase() || existing.email;
    const nextTeamId = options.sanitizeTextField(payload.teamId ?? existing.teamId, 120) || existing.teamId;
    const nextTeam = options.getTeamById(nextTeamId, { schoolId });
    if (!nextTeam) {
      res.status(404).json({ error: "Target team not found" });
      return;
    }

    const role = payload.role === "head_coach" || payload.role === "assistant_coach" || payload.role === "operator" || payload.role === "viewer"
      ? payload.role
      : existing.role;
    const status = payload.status === "active" || payload.status === "invited" ? payload.status : existing.status;

    const membership = options.saveTeamMembership({
      membershipId,
      schoolId,
      teamId: nextTeamId,
      userId: existing.userId,
      fullName,
      email,
      role,
      status,
    });

    options.saveActivityEvent({
      schoolId,
      teamId: membership.teamId,
      type: "membership_updated",
      actorUserId: options.getAuthUser(req).userId,
      message: `${membership.fullName}'s team access was updated.`,
      metadata: { membershipId, email: membership.email, teamId: membership.teamId, role: membership.role, status: membership.status },
    });

    res.json({
      membership,
      staff: {
        schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
        teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
      },
    });
  });

  app.delete("/api/schools/:schoolId/staff/school-memberships/:membershipId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const target = options.getSchoolMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!target) {
      res.status(404).json({ error: "School membership not found" });
      return;
    }
    if (target.role === "owner") {
      res.status(400).json({ error: "Owner membership cannot be removed here" });
      return;
    }

    options.deleteSchoolMembership(membershipId, { schoolId });
    options.saveActivityEvent({
      schoolId,
      type: "membership_updated",
      actorUserId: options.getAuthUser(req).userId,
      message: `${target.fullName} was removed from school staff.`,
      metadata: { membershipId, email: target.email },
    });
    res.json({
      success: true,
      staff: {
        schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
        teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
      },
    });
  });

  app.delete("/api/schools/:schoolId/staff/team-memberships/:membershipId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const target = options.getTeamMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!target) {
      res.status(404).json({ error: "Team membership not found" });
      return;
    }

    options.deleteTeamMembership(membershipId, { schoolId });
    options.saveActivityEvent({
      schoolId,
      teamId: target.teamId,
      type: "membership_updated",
      actorUserId: options.getAuthUser(req).userId,
      message: `${target.fullName} was removed from team staff.`,
      metadata: { membershipId, email: target.email, teamId: target.teamId },
    });
    res.json({
      success: true,
      staff: {
        schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
        teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
      },
    });
  });

  app.get("/api/teams/:teamId", options.requireApiKey, (req, res) => {
    const teamId = options.sanitizeTextField(req.params.teamId, 120);
    const rawTeam = options.getTeamById(teamId);
    if (!rawTeam) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    const authUser = options.getAuthUser(req);
    if (!rawTeam.schoolId) {
      res.status(404).json({ error: "Team school not found" });
      return;
    }
    const schoolId = rawTeam.schoolId;
    const schoolMembership = options.getSchoolMembershipsByScope({ schoolId }).find((membership) =>
      (authUser.userId && membership.userId === authUser.userId) || (authUser.email && membership.email === authUser.email),
    );
    const teamMembership = options.getTeamMembershipsByScope({ schoolId }).find((membership) =>
      membership.teamId === rawTeam.id
        && (
          (authUser.userId && membership.userId === authUser.userId)
          || (authUser.email && membership.email === authUser.email)
        ),
    );
    if (!isSchoolAdmin(schoolMembership?.role) && !teamMembership) {
      res.status(403).json({ error: "Team access required" });
      return;
    }
    const team = rawTeam.schoolId
      ? applyTeamBillingStatuses(options, schoolId).teams.find((entry) => entry.id === rawTeam.id) ?? rawTeam
      : rawTeam;

    res.json({
      team,
      memberships: options.getTeamMembershipsByScope({ schoolId }).filter((membership) => membership.teamId === team.id),
    });
  });

  app.post("/api/teams/:teamId/live-sessions", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const authUser = options.getAuthUser(req);
    const teamId = options.sanitizeTextField(req.params.teamId, 120);
    const rawTeam = options.getTeamById(teamId);
    if (!rawTeam?.schoolId) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    const schoolId = rawTeam.schoolId;
    const team = applyTeamBillingStatuses(options, schoolId).teams.find((entry) => entry.id === rawTeam.id) ?? rawTeam;

    const schoolMembership = options.getSchoolMembershipsByScope({ schoolId }).find((membership) =>
      (authUser.userId && membership.userId === authUser.userId) || (authUser.email && membership.email === authUser.email),
    );
    const teamMembership = options.getTeamMembershipsByScope({ schoolId }).find((membership) =>
      membership.teamId === team.id
        && (
          (authUser.userId && membership.userId === authUser.userId)
          || (authUser.email && membership.email === authUser.email)
        ),
    );
    if (!isSchoolAdmin(schoolMembership?.role) && !teamMembership) {
      res.status(403).json({ error: "Team access required" });
      return;
    }
    if (team.status === "read_only") {
      res.status(402).json({
        error: "This team is read-only until the school upgrades for additional active team capacity.",
        code: "team_upgrade_required",
        team,
      });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const opponentName = options.sanitizeTextField(payload.opponentName, 120);
    if (!opponentName) {
      res.status(400).json({ error: "opponentName is required" });
      return;
    }

    const liveSessionId = `live-${Date.now()}`;
    const gameId = options.sanitizeTextField(payload.gameId, 120) || `${team.id}-${Date.now()}`;
    const pairingCode = normalizePairingCode(payload.pairingCode) || buildPairingCode();
    const opponentTeamId = `opponent-${slugifyOpponentName(opponentName)}`;
    const vcSide = payload.vcSide === "away" ? "away" : "home";
    const homeTeamId = vcSide === "home" ? team.id : opponentTeamId;
    const awayTeamId = vcSide === "away" ? team.id : opponentTeamId;
    const startingLineup = Array.isArray(payload.startingLineup)
      ? (payload.startingLineup as unknown[])
        .filter((playerId): playerId is string => typeof playerId === "string" && playerId.trim().length > 0)
        .slice(0, 5)
      : [];
    const startingLineupByTeam = startingLineup.length > 0 ? { [team.id]: startingLineup } : undefined;
    const homeTeamColor = options.normalizeTeamColor(payload.homeTeamColor);
    const awayTeamColor = options.normalizeTeamColor(payload.awayTeamColor);

    const liveSession = options.createLiveGameSessionRecord({
      liveSessionId,
      schoolId,
      teamId: team.id,
      gameId,
      opponentName,
      opponentTeamId,
      status: "active",
      pairingCode,
      createdByUserId: authUser.userId,
    });

    options.createGame({
      schoolId,
      gameId,
      homeTeamId,
      awayTeamId,
      opponentName,
      opponentTeamId,
      startingLineupByTeam,
    }, { schoolId });

    const operatorToken = options.issueLocalAuthToken({
      subject: `operator:${liveSessionId}`,
      email: `operator-${liveSessionId}@system.bta`,
      schoolId,
      role: "operator",
      expiresInHours: 24,
    });

    if (operatorToken) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (24 * 60 * 60 * 1000));
      options.saveOperatorSessionRecord({
        operatorSessionId: `operator-session-${liveSessionId}`,
        liveSessionId,
        schoolId,
        teamId: team.id,
        pairingCode,
        operatorToken,
        expiresAtIso: expiresAt.toISOString(),
        createdAtIso: now.toISOString(),
        updatedAtIso: now.toISOString(),
      });
      options.setOperatorLinkSetup?.(schoolId, pairingCode, {
        gameId,
        myTeamId: team.id,
        myTeamName: (team as WorkspaceRosterTeam).displayName ?? team.name,
        opponentName,
        vcSide,
        homeTeamColor,
        awayTeamColor,
        startingLineup,
        updatedAtIso: now.toISOString(),
        operatorToken,
      });
    }

    options.saveActivityEvent({
      schoolId,
      teamId: team.id,
      type: "live_session_started",
      actorUserId: authUser.userId,
      message: `${authUser.fullName ?? authUser.email} started a live session for ${(team as WorkspaceRosterTeam).displayName ?? team.name}.`,
    });

    res.status(201).json({
      liveSession,
      team,
      pairing: {
        pairingCode,
        operatorToken,
      },
    });
  });

  app.post("/api/live-sessions/:sessionId/operator-pairing", options.requireApiKey, (req, res) => {
    const liveSessionId = options.sanitizeTextField(req.params.sessionId, 120);
    const liveSession = options.getLiveGameSessionById(liveSessionId);
    if (!liveSession) {
      res.status(404).json({ error: "Live session not found" });
      return;
    }

    const team = options.getTeamById(liveSession.teamId, { schoolId: liveSession.schoolId });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const existingOperatorSession = options.getOperatorSessionByLiveSession(liveSessionId);
    res.json({
      liveSession,
      team,
      pairing: existingOperatorSession
        ? {
            pairingCode: existingOperatorSession.pairingCode,
            operatorToken: existingOperatorSession.operatorToken,
            expiresAtIso: existingOperatorSession.expiresAtIso,
          }
        : {
            pairingCode: liveSession.pairingCode,
            operatorToken: null,
            expiresAtIso: null,
          },
      setup: {
        teamId: team.id,
        teamName: (team as WorkspaceRosterTeam).displayName ?? team.name,
        opponentName: liveSession.opponentName,
        startingLineup: [],
        teamColor: team.teamColor,
      },
    });
  });
}
