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
  getTeamMembershipsByScope: (scope: { schoolId: string }) => TeamMembership[];
  saveTeamMembership: (membership: Partial<TeamMembership> & Pick<TeamMembership, "schoolId" | "teamId" | "email" | "fullName" | "role">) => TeamMembership;
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
      const schoolTeams = options.getRosterTeamsByScope({ schoolId: membership.schoolId });
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

    const teams = options.getRosterTeamsByScope({ schoolId: school.schoolId });
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
        activeTeamsCount: teams.filter((team) => team.status !== "archived").length,
        activeLiveGamesCount: liveSessions.length,
        staffCount: schoolMemberships.length + teamMemberships.length,
        billingStatus: billing?.status ?? "trialing",
        planId: billing?.planId ?? "trial",
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
    const authUser = options.getAuthUser(req);
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const schoolMembership = options.getSchoolMembershipsByScope({ schoolId }).find((membership) =>
      (authUser.userId && membership.userId === authUser.userId) || (authUser.email && membership.email === authUser.email),
    );
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

    const savedTeams = options.saveRosterTeams([...teams, team], { schoolId });
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

    res.status(201).json({
      team: savedTeams.find((entry) => entry.id === team.id) ?? team,
      nextChecklist: ["Invite staff", "Import roster", "Start first live game"],
    });
  });

  app.get("/api/teams/:teamId", options.requireApiKey, (req, res) => {
    const teamId = options.sanitizeTextField(req.params.teamId, 120);
    const team = options.getTeamById(teamId);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    res.json({
      team,
      memberships: options.getTeamMembershipsByScope({ schoolId: team.schoolId ?? "" }).filter((membership) => membership.teamId === team.id),
    });
  });

  app.post("/api/teams/:teamId/live-sessions", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const authUser = options.getAuthUser(req);
    const teamId = options.sanitizeTextField(req.params.teamId, 120);
    const team = options.getTeamById(teamId);
    if (!team?.schoolId) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const schoolMembership = options.getSchoolMembershipsByScope({ schoolId: team.schoolId }).find((membership) =>
      (authUser.userId && membership.userId === authUser.userId) || (authUser.email && membership.email === authUser.email),
    );
    const teamMembership = options.getTeamMembershipsByScope({ schoolId: team.schoolId }).find((membership) =>
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
      schoolId: team.schoolId,
      teamId: team.id,
      gameId,
      opponentName,
      opponentTeamId,
      status: "active",
      pairingCode,
      createdByUserId: authUser.userId,
    });

    options.createGame({
      schoolId: team.schoolId,
      gameId,
      homeTeamId,
      awayTeamId,
      opponentName,
      opponentTeamId,
      startingLineupByTeam,
    }, { schoolId: team.schoolId });

    const operatorToken = options.issueLocalAuthToken({
      subject: `operator:${liveSessionId}`,
      email: `operator-${liveSessionId}@system.bta`,
      schoolId: team.schoolId,
      role: "operator",
      expiresInHours: 24,
    });

    if (operatorToken) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (24 * 60 * 60 * 1000));
      options.saveOperatorSessionRecord({
        operatorSessionId: `operator-session-${liveSessionId}`,
        liveSessionId,
        schoolId: team.schoolId,
        teamId: team.id,
        pairingCode,
        operatorToken,
        expiresAtIso: expiresAt.toISOString(),
        createdAtIso: now.toISOString(),
        updatedAtIso: now.toISOString(),
      });
      options.setOperatorLinkSetup?.(team.schoolId, pairingCode, {
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
      schoolId: team.schoolId,
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
