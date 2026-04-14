import type { Express, NextFunction, Request, Response } from "express";
import type { RosterTeam } from "../store.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

interface RegisterRosterConfigRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  getRosterTeamsByScope: (scope: { schoolId: string }) => RosterTeam[];
  saveRosterTeams: (next: RosterTeam[], scope?: { schoolId: string }) => RosterTeam[];
  emitRosterTeams: (schoolId: string, teams: RosterTeam[]) => void;
}

export function registerRosterConfigRoutes(app: Express, options: RegisterRosterConfigRoutesOptions): void {
  app.get("/config/roster-teams", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json({ teams: options.getRosterTeamsByScope({ schoolId }) });
  });

  app.put("/config/roster-teams", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const teams = req.body?.teams;
    if (!Array.isArray(teams)) {
      res.status(400).json({ error: "teams array is required" });
      return;
    }

    const saved = options.saveRosterTeams(teams, { schoolId });
    options.emitRosterTeams(schoolId, saved);
    res.json({ teams: saved });
  });
}
