import type { Express, Request } from "express";

interface RegisterLiveInsightsRoutesOptions {
  getSchoolIdFromRequest: (req: Request) => string;
  getLiveContext: (scope: { schoolId: string }) => unknown;
  buildLeaderboardsPayload: (schoolId: string) => unknown;
  buildTeamTrendsPayload: (schoolId: string) => unknown;
  normalizePersonName: (value: unknown) => string;
  buildPlayerTrendsPayload: (schoolId: string, playerName: string) => unknown;
  buildPlayerComparisonPayload: (schoolId: string, playerNames: string[]) => unknown;
}

export function registerLiveInsightsRoutes(app: Express, options: RegisterLiveInsightsRoutesOptions): void {
  app.get("/api/live-context", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.getLiveContext({ schoolId }));
  });

  app.get("/api/leaderboards", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.buildLeaderboardsPayload(schoolId));
  });

  app.get("/api/team-trends", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.buildTeamTrendsPayload(schoolId));
  });

  app.get("/api/player-trends/:playerName", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const targetName = options.normalizePersonName(req.params.playerName);
    if (!targetName || targetName.length > 100) {
      res.status(400).json({ error: "Invalid player name" });
      return;
    }

    res.json(options.buildPlayerTrendsPayload(schoolId, targetName));
  });

  app.get("/api/player-comparison", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const playerNames = ([] as string[]).concat(req.query.players as string | string[] | undefined ?? [])
      .map((name) => options.normalizePersonName(name))
      .filter(Boolean);
    if (playerNames.length < 2) {
      res.status(400).json({ error: "At least 2 players required for comparison" });
      return;
    }

    res.json(options.buildPlayerComparisonPayload(schoolId, playerNames));
  });
}
