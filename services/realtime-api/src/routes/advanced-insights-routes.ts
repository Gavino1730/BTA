import type { Express, Request } from "express";

interface RegisterAdvancedInsightsRoutesOptions {
  getSchoolIdFromRequest: (req: Request) => string;
  buildTeamAdvancedPayload: (schoolId: string) => unknown;
  buildPlayerAdvancedPayload: (schoolId: string, playerName: string) => unknown;
  buildVolatilityPayload: (schoolId: string) => unknown;
  buildComprehensiveInsightsPayload: (schoolId: string) => unknown;
}

export function registerAdvancedInsightsRoutes(app: Express, options: RegisterAdvancedInsightsRoutesOptions): void {
  app.get("/api/advanced/team", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.buildTeamAdvancedPayload(schoolId));
  });

  app.get("/api/advanced/player/:playerName", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = options.buildPlayerAdvancedPayload(schoolId, req.params.playerName);
    if (!payload) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    res.json(payload);
  });

  app.get("/api/advanced/volatility", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.buildVolatilityPayload(schoolId));
  });

  app.get("/api/comprehensive-insights", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.buildComprehensiveInsightsPayload(schoolId));
  });
}
