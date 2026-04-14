import type { Express, NextFunction, Request, Response } from "express";
import type { RosterPlayer, RosterTeam } from "../store.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

type SeasonPlayer = {
  name: string;
  full_name?: string;
  roster_info?: {
    name?: string;
  } | null;
};

interface RegisterPlayerRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  getSeasonPlayers: (scope: { schoolId: string }) => SeasonPlayer[];
  getRosterPlayers: (scope: { schoolId: string }) => unknown;
  normalizeNameKey: (value: unknown) => string;
  normalizePersonName: (value: unknown) => string;
  getPrimaryTeam: (schoolId: string) => { teams: RosterTeam[]; team: RosterTeam | null };
  buildRosterPlayer: (input: Record<string, unknown>, teamId: string, existingPlayer?: RosterPlayer) => RosterPlayer | null;
  findPlayerRecord: (teams: RosterTeam[], playerName: string) => {
    player: RosterPlayer;
    playerIndex: number;
    teamIndex: number;
  } | null;
  getRosterTeamsByScope: (scope: { schoolId: string }) => RosterTeam[];
  persistSchoolTeams: (schoolId: string, teams: RosterTeam[]) => RosterTeam[];
}

function deletePlayerByName(
  schoolId: string,
  playerName: string,
  options: Pick<RegisterPlayerRoutesOptions, "getRosterTeamsByScope" | "findPlayerRecord" | "persistSchoolTeams">,
  res: Response,
): void {
  const teams = options.getRosterTeamsByScope({ schoolId });
  const record = options.findPlayerRecord(teams, playerName);
  if (!record) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const nextTeams = teams.map((team, index) => index === record.teamIndex
    ? { ...team, players: team.players.filter((_, playerIndex) => playerIndex !== record.playerIndex) }
    : team);
  options.persistSchoolTeams(schoolId, nextTeams);
  res.json({ message: "Player deleted successfully", player: record.player.name });
}

export function registerPlayerRoutes(app: Express, options: RegisterPlayerRoutesOptions): void {
  app.get("/api/players", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.getSeasonPlayers({ schoolId }));
  });

  app.get("/api/roster/players", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.getRosterPlayers({ schoolId }));
  });

  app.get("/api/player/:playerName", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const targetKey = options.normalizeNameKey(req.params.playerName);
    const player = options.getSeasonPlayers({ schoolId }).find((entry) => {
      return options.normalizeNameKey(entry.name) === targetKey
        || options.normalizeNameKey(entry.full_name) === targetKey
        || options.normalizeNameKey(entry.roster_info?.name) === targetKey;
    });

    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    res.json(player);
  });

  app.post("/api/player/:playerName", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const requestedName = options.normalizePersonName(req.params.playerName);
    if (!requestedName) {
      res.status(400).json({ error: "Player name is required" });
      return;
    }

    const originalName = options.normalizePersonName(payload.originalName) || requestedName;
    const nextName = options.normalizePersonName(payload.name) || requestedName;

    const { teams, team } = options.getPrimaryTeam(schoolId);
    const primaryTeam: RosterTeam = team ?? {
      id: "primary-team",
      schoolId,
      name: "Team",
      abbreviation: "TEAM",
      players: [],
    };

    const existingRecord = options.findPlayerRecord([primaryTeam], originalName);
    const builtPlayer = options.buildRosterPlayer({ ...payload, name: nextName }, primaryTeam.id, existingRecord?.player);
    if (!builtPlayer) {
      res.status(400).json({ error: "Player name is required" });
      return;
    }

    const nextPrimaryTeam: RosterTeam = {
      ...primaryTeam,
      players: existingRecord
        ? primaryTeam.players.map((player, index) => index === existingRecord.playerIndex ? builtPlayer : player)
        : [...primaryTeam.players, builtPlayer],
    };
    const nextTeams = team ? [nextPrimaryTeam, ...teams.slice(1)] : [nextPrimaryTeam];
    options.persistSchoolTeams(schoolId, nextTeams);

    res.status(201).json({ message: "Player saved successfully", player: builtPlayer });
  });

  app.delete("/api/roster/player/:playerName", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    deletePlayerByName(schoolId, req.params.playerName, options, res);
  });

  app.delete("/api/player/:playerName", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    deletePlayerByName(schoolId, req.params.playerName, options, res);
  });

  app.post("/api/player/:playerName/delete", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    deletePlayerByName(schoolId, req.params.playerName, options, res);
  });
}
