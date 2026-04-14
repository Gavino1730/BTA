import type { Express, NextFunction, Request, Response } from "express";
import type { RosterTeam } from "../store.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

type TeamPlayer = {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;
  grade?: string;
};

interface RegisterTeamManagementRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  getRosterTeamsByScope: (scope: { schoolId: string }) => RosterTeam[];
  saveRosterTeams: (next: RosterTeam[], scope?: { schoolId: string }) => RosterTeam[];
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  normalizeTeamColor: (value: unknown) => string | undefined;
  buildUniqueSchoolTeamId: (name: string, teams: RosterTeam[]) => string;
  emitRosterTeams: (schoolId: string, teams: RosterTeam[]) => void;
  emitTeamCreated: (schoolId: string, team: RosterTeam) => void;
  emitTeamUpdated: (schoolId: string, team: RosterTeam) => void;
  emitTeamDeleted: (schoolId: string, teamId: string) => void;
  emitPlayerAdded: (schoolId: string, teamId: string, player: TeamPlayer) => void;
  emitPlayerUpdated: (schoolId: string, teamId: string, player: TeamPlayer) => void;
  emitPlayerDeleted: (schoolId: string, teamId: string, playerId: string) => void;
}

export function registerTeamManagementRoutes(app: Express, options: RegisterTeamManagementRoutesOptions): void {
  app.get("/teams", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json({ teams: options.getRosterTeamsByScope({ schoolId }) });
  });

  app.post("/teams", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const { name, abbreviation } = req.body ?? {};
    const teamColor = options.normalizeTeamColor(req.body?.teamColor);
    if (!name || !abbreviation) {
      res.status(400).json({ error: "name and abbreviation are required" });
      return;
    }

    const teams = options.getRosterTeamsByScope({ schoolId });
    const normalizedName = options.sanitizeTextField(name, 120);
    const normalizedAbbreviation = options.sanitizeTextField(abbreviation, 12).toUpperCase();
    if (!normalizedName || !normalizedAbbreviation) {
      res.status(400).json({ error: "name and abbreviation are required" });
      return;
    }

    const id = options.buildUniqueSchoolTeamId(normalizedName, teams);
    const newTeam: RosterTeam = {
      id,
      schoolId,
      name: normalizedName,
      abbreviation: normalizedAbbreviation,
      teamColor,
      players: [],
    };

    teams.push(newTeam);
    options.saveRosterTeams(teams, { schoolId });
    options.emitRosterTeams(schoolId, teams);
    options.emitTeamCreated(schoolId, newTeam);

    res.status(201).json({ team: newTeam });
  });

  app.get("/api/school/teams", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json({ teams: options.getRosterTeamsByScope({ schoolId }) });
  });

  app.post("/api/school/teams", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const name = options.sanitizeTextField(payload.name, 120);
    const abbreviation = options.sanitizeTextField(payload.abbreviation, 12).toUpperCase();
    const season = options.sanitizeTextField(payload.season, 40) || undefined;
    const teamColor = options.normalizeTeamColor(payload.teamColor);

    if (!name || !abbreviation) {
      res.status(400).json({ error: "name and abbreviation are required" });
      return;
    }

    const teams = options.getRosterTeamsByScope({ schoolId });
    const id = options.buildUniqueSchoolTeamId(name, teams);
    const team: RosterTeam = {
      id,
      schoolId,
      name,
      abbreviation,
      season,
      teamColor,
      players: [],
    };

    const saved = options.saveRosterTeams([...teams, team], { schoolId });
    options.emitRosterTeams(schoolId, saved);
    options.emitTeamCreated(schoolId, team);

    res.status(201).json({ team });
  });

  app.put("/teams/:teamId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const { name, abbreviation } = req.body ?? {};
    const teamColor = options.normalizeTeamColor(req.body?.teamColor);
    const teams = options.getRosterTeamsByScope({ schoolId });
    const team = teams.find((t) => t.id === req.params.teamId);

    if (!team) {
      res.status(404).json({ error: "team not found" });
      return;
    }

    if (name) team.name = name;
    if (abbreviation) team.abbreviation = abbreviation;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, "teamColor")) {
      team.teamColor = teamColor;
    }

    options.saveRosterTeams(teams, { schoolId });
    options.emitRosterTeams(schoolId, teams);
    options.emitTeamUpdated(schoolId, team);

    res.json({ team });
  });

  app.delete("/teams/:teamId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const teams = options.getRosterTeamsByScope({ schoolId });
    const idx = teams.findIndex((t) => t.id === req.params.teamId);

    if (idx < 0) {
      res.status(404).json({ error: "team not found" });
      return;
    }

    const deleted = teams.splice(idx, 1)[0];
    options.saveRosterTeams(teams, { schoolId });
    options.emitRosterTeams(schoolId, teams);
    options.emitTeamDeleted(schoolId, deleted.id);

    res.json({ teamId: deleted.id });
  });

  app.post("/teams/:teamId/players", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const { number, name, position, height, grade } = req.body ?? {};
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const teams = options.getRosterTeamsByScope({ schoolId });
    const team = teams.find((t) => t.id === req.params.teamId);

    if (!team) {
      res.status(404).json({ error: "team not found" });
      return;
    }

    const playerId = `${req.params.teamId}-${Date.now()}`;
    const player: TeamPlayer = {
      id: playerId,
      number: String(number || ""),
      name,
      position: String(position || ""),
      height: height ? String(height) : undefined,
      grade: grade ? String(grade) : undefined,
    };

    team.players.push(player);
    options.saveRosterTeams(teams, { schoolId });
    options.emitRosterTeams(schoolId, teams);
    options.emitPlayerAdded(schoolId, req.params.teamId, player);

    res.status(201).json({ player });
  });

  app.put("/teams/:teamId/players/:playerId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const { number, name, position, height, grade } = req.body ?? {};
    const teams = options.getRosterTeamsByScope({ schoolId });
    const team = teams.find((t) => t.id === req.params.teamId);

    if (!team) {
      res.status(404).json({ error: "team not found" });
      return;
    }

    const player = team.players.find((p) => p.id === req.params.playerId) as TeamPlayer | undefined;
    if (!player) {
      res.status(404).json({ error: "player not found" });
      return;
    }

    if (number !== undefined) player.number = String(number);
    if (name !== undefined) player.name = name;
    if (position !== undefined) player.position = String(position);
    if (height !== undefined) player.height = height ? String(height) : undefined;
    if (grade !== undefined) player.grade = grade ? String(grade) : undefined;

    options.saveRosterTeams(teams, { schoolId });
    options.emitRosterTeams(schoolId, teams);
    options.emitPlayerUpdated(schoolId, req.params.teamId, player);

    res.json({ player });
  });

  app.delete("/teams/:teamId/players/:playerId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const teams = options.getRosterTeamsByScope({ schoolId });
    const team = teams.find((t) => t.id === req.params.teamId);

    if (!team) {
      res.status(404).json({ error: "team not found" });
      return;
    }

    const idx = team.players.findIndex((p) => p.id === req.params.playerId);
    if (idx < 0) {
      res.status(404).json({ error: "player not found" });
      return;
    }

    const deleted = team.players.splice(idx, 1)[0] as TeamPlayer;
    options.saveRosterTeams(teams, { schoolId });
    options.emitRosterTeams(schoolId, teams);
    options.emitPlayerDeleted(schoolId, req.params.teamId, deleted.id);

    res.json({ playerId: deleted.id });
  });
}
