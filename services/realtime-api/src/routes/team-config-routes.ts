import type { Express, NextFunction, Request, Response } from "express";
import type { RosterPlayer, RosterTeam } from "../store.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

type TeamAiSettings = {
  focusInsights: string[];
};

interface RegisterTeamConfigRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  getRosterTeamsByScope: (scope: { schoolId: string }) => RosterTeam[];
  defaultTeamAiSettings: () => TeamAiSettings;
  getPrimaryTeam: (schoolId: string) => { team: RosterTeam | null };
  extractTeamAiSettings: (team: RosterTeam | null | undefined) => unknown;
  upsertPrimaryTeam: (schoolId: string, payload: Record<string, unknown>) => RosterTeam[];
  persistSchoolTeams: (schoolId: string, teams: RosterTeam[]) => RosterTeam[];
  normalizeNameKey: (value: string) => string;
  buildRosterPlayer: (input: Record<string, unknown>, teamId: string, existing?: RosterPlayer) => RosterPlayer | null;
  buildTeamAbbreviation: (name: string) => string;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
}

export function registerTeamConfigRoutes(app: Express, options: RegisterTeamConfigRoutesOptions): void {
  app.get("/api/teams", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const teams = options.getRosterTeamsByScope({ schoolId }).map((team) => ({
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      season: team.season ?? "",
      teamColor: team.teamColor ?? "",
      coachStyle: team.coachStyle ?? "",
      playingStyle: team.playingStyle ?? "",
      teamContext: team.teamContext ?? "",
      customPrompt: team.customPrompt ?? "",
      focusInsights: team.focusInsights ?? options.defaultTeamAiSettings().focusInsights,
      players: team.players,
    }));

    res.json({ teams });
  });

  app.get("/api/ai-settings", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const { team } = options.getPrimaryTeam(schoolId);
    res.json(options.extractTeamAiSettings(team));
  });

  app.put("/api/ai-settings", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const savedTeams = options.upsertPrimaryTeam(schoolId, {
      playingStyle: payload.playingStyle,
      teamContext: payload.teamContext,
      customPrompt: payload.customPrompt,
      focusInsights: payload.focusInsights,
    });

    res.json({ message: "AI settings saved", settings: options.extractTeamAiSettings(savedTeams[0]) });
  });

  app.put("/api/roster-sync", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = (req.body ?? {}) as Record<string, unknown>;

    if (Array.isArray(payload.teams)) {
      const saved = options.persistSchoolTeams(schoolId, payload.teams as RosterTeam[]);
      res.json({
        message: "Roster synced successfully",
        team: saved[0]?.name ?? "",
        players_loaded: saved[0]?.players.length ?? 0,
      });
      return;
    }

    const existing = options.getPrimaryTeam(schoolId).team;
    const teamId = existing?.id ?? "primary-team";
    const currentPlayers = new Map((existing?.players ?? []).map((player) => [options.normalizeNameKey(player.name), player]));
    const rosterPayload = Array.isArray(payload.roster) ? payload.roster : [];
    const players = rosterPayload
      .map((entry) => options.buildRosterPlayer(entry as Record<string, unknown>, teamId, currentPlayers.get(options.normalizeNameKey(String((entry as Record<string, unknown>).name ?? "")))))
      .filter((player): player is RosterPlayer => Boolean(player));

    const saved = options.upsertPrimaryTeam(schoolId, {
      name: payload.team,
      season: payload.season,
      teamColor: payload.teamColor,
      coachStyle: payload.coachStyle,
      playingStyle: payload.playingStyle,
      teamContext: payload.teamContext,
      customPrompt: payload.customPrompt,
      focusInsights: payload.focusInsights,
      abbreviation: existing?.abbreviation ?? options.buildTeamAbbreviation(options.sanitizeTextField(payload.team, 120) || existing?.name || "Team"),
    });

    saved[0]!.players = players;
    const persisted = options.persistSchoolTeams(schoolId, saved);
    res.json({
      message: "Roster synced successfully",
      team: persisted[0]?.name ?? "",
      players_loaded: persisted[0]?.players.length ?? 0,
    });
  });

  app.post("/api/team", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const name = options.sanitizeTextField(payload.name, 120);
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const saved = options.upsertPrimaryTeam(schoolId, payload);
    res.status(201).json({
      message: "Team created successfully",
      team: { id: saved[0]?.id ?? "primary-team", name: saved[0]?.name ?? name },
    });
  });

  app.post("/api/reload-data", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const teams = options.getRosterTeamsByScope({ schoolId });
    res.json({ ok: true, teamsLoaded: teams.length, message: "Realtime data already current" });
  });
}
