import type { Express, Request, Response } from "express";
import type {
  SchoolMembership,
  TeamMembership,
  ActivityEvent,
  LiveGameSessionRecord,
  RosterTeam,
} from "../store.js";
import type { WorkspaceRosterTeam, WorkspaceSharedOptions } from "./workspace-helpers.js";
import { applyTeamBillingStatuses, isSchoolAdmin, buildPairingCode, normalizePairingCode, slugifyOpponentName } from "./workspace-helpers.js";

type Middleware = (req: Request, res: Response, next: () => void) => void | Promise<void>;

export interface RegisterTeamRoutesOptions extends WorkspaceSharedOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  normalizeTeamColor: (value: unknown) => string | undefined;
  getSchoolMembershipsByScope: (scope: { schoolId: string }) => SchoolMembership[];
  getTeamMembershipsByScope: (scope: { schoolId: string }) => TeamMembership[];
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

export function registerTeamRoutes(app: Express, options: RegisterTeamRoutesOptions): void {
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

  app.put("/api/teams/:teamId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const teamId = options.sanitizeTextField(req.params.teamId, 120);
    const rawTeam = options.getTeamById(teamId);
    if (!rawTeam?.schoolId) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    const schoolId = rawTeam.schoolId;
    const authUser = options.getAuthUser(req);
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

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const teams = options.getRosterTeamsByScope({ schoolId });
    const teamIndex = teams.findIndex((t) => t.id === teamId);
    if (teamIndex < 0) {
      res.status(404).json({ error: "Team not found in school" });
      return;
    }

    const existing = teams[teamIndex]!;
    const VALID_FOCUS_INSIGHTS = new Set([
      "timeouts", "substitutions", "foul_management", "momentum",
      "shot_selection", "ball_security", "hot_hand", "defense",
    ]);
    type FocusInsight = NonNullable<RosterTeam["focusInsights"]>[number];
    const focusInsights = Array.isArray(payload.focusInsights)
      ? (payload.focusInsights as unknown[])
          .map((v) => options.sanitizeTextField(v, 200))
          .filter((v): v is FocusInsight => VALID_FOCUS_INSIGHTS.has(v))
      : existing.focusInsights;

    const updated = {
      ...existing,
      ...(payload.name !== undefined && { name: options.sanitizeTextField(payload.name, 120) || existing.name }),
      ...(payload.abbreviation !== undefined && { abbreviation: options.sanitizeTextField(payload.abbreviation, 12) || existing.abbreviation }),
      ...(payload.season !== undefined && { season: options.sanitizeTextField(payload.season, 40) || undefined }),
      ...(payload.teamColor !== undefined && { teamColor: options.normalizeTeamColor(payload.teamColor) }),
      ...(payload.playingStyle !== undefined && { playingStyle: options.sanitizeTextField(payload.playingStyle, 500) || undefined }),
      ...(payload.teamContext !== undefined && { teamContext: options.sanitizeTextField(payload.teamContext, 1200) || undefined }),
      ...(payload.customPrompt !== undefined && { customPrompt: options.sanitizeTextField(payload.customPrompt, 1200) || undefined }),
      ...(payload.focusInsights !== undefined && { focusInsights: focusInsights as string[] | undefined }),
    };

    const nextTeams = [...teams];
    nextTeams[teamIndex] = updated;
    options.saveRosterTeams(nextTeams, { schoolId });

    res.json({ team: updated });
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
    if ((team as WorkspaceRosterTeam).status === "read_only") {
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
      pairing: { pairingCode, operatorToken },
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
