import type { Express, NextFunction, Request, Response } from "express";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

interface RegisterAiCompatibilityRoutesOptions {
  requireApiKey: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  buildAiSafetyMetadata: (value: unknown) => { safetyLabel: string; containsActionLikeContent: boolean; warningMessage?: string };
  getSeasonGames: (scope: { schoolId: string }) => Array<{ gameId: string }>;
  answerGameAiChat: (
    gameId: string,
    message: string,
    history: unknown,
    scope?: { schoolId: string },
  ) => Promise<{ answer?: string; suggestions?: string[]; usedHistoricalContext?: boolean } | null | undefined>;
  buildTeamSummaryText: (schoolId: string) => string;
  buildPlayerInsightsText: (schoolId: string, playerName: string) => string | null;
  buildGameAnalysisText: (schoolId: string, gameId: string) => string | null;
  buildSeasonAnalysisPayload: (schoolId: string, force: boolean) => unknown;
  seasonAnalysisBySchool: Map<string, unknown>;
  playerAnalysisCacheBySchool: Map<string, Map<string, unknown>>;
  buildPlayerAnalysisPayload: (schoolId: string, playerName: string) => unknown | null;
}

export function registerAiCompatibilityRoutes(app: Express, options: RegisterAiCompatibilityRoutesOptions): void {
  app.post("/api/ai/chat", async (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const message = options.sanitizeTextField((req.body as Record<string, unknown> | undefined)?.message, 1200);
    const history = (req.body as Record<string, unknown> | undefined)?.history;
    const allowLiveAi = !process.env.VITEST && process.env.NODE_ENV !== "test";
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const latestGame = allowLiveAi ? options.getSeasonGames({ schoolId }).slice(-1)[0] : undefined;
    if (latestGame) {
      const ai = await options.answerGameAiChat(latestGame.gameId, message, history, { schoolId });
      if (ai?.answer) {
        res.json({
          reply: ai.answer,
          suggestions: ai.suggestions ?? [],
          usedHistoricalContext: ai.usedHistoricalContext ?? false,
          aiSafety: options.buildAiSafetyMetadata({ reply: ai.answer, suggestions: ai.suggestions ?? [] }),
        });
        return;
      }
    }

    const reply = `${options.buildTeamSummaryText(schoolId)} Coach question: ${message}`;
    res.json({
      reply,
      suggestions: [
        "Which lineup gives us the best ball security?",
        "Who should absorb minutes if foul trouble increases?",
      ],
      aiSafety: options.buildAiSafetyMetadata(reply),
    });
  });

  app.get("/api/ai/team-summary", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const summary = options.buildTeamSummaryText(schoolId);
    res.json({ summary, aiSafety: options.buildAiSafetyMetadata(summary) });
  });

  app.post("/api/ai/analyze", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const query = options.sanitizeTextField((req.body as Record<string, unknown> | undefined)?.query, 1200)
      || options.sanitizeTextField((req.body as Record<string, unknown> | undefined)?.message, 1200);
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }

    const analysis = `${options.buildTeamSummaryText(schoolId)} Requested analysis: ${query}`;
    res.json({ analysis, aiSafety: options.buildAiSafetyMetadata(analysis) });
  });

  app.get("/api/ai/player-insights/:playerName", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const insights = options.buildPlayerInsightsText(schoolId, req.params.playerName);
    if (!insights) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    res.json({ player: req.params.playerName, insights, aiSafety: options.buildAiSafetyMetadata(insights) });
  });

  app.get("/api/ai/game-analysis/:gameId", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const analysis = options.buildGameAnalysisText(schoolId, req.params.gameId);
    if (!analysis) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    res.json({ gameId: req.params.gameId, analysis, aiSafety: options.buildAiSafetyMetadata(analysis) });
  });

  app.delete("/api/ai/team-summary", options.requireApiKey, (_req, res) => {
    // No persistent cache to clear in this implementation — return success.
    res.json({ message: "Cache cleared" });
  });

  app.get("/api/season-analysis", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const force = String(req.query.force ?? "false").toLowerCase() === "true";
    res.json(options.buildSeasonAnalysisPayload(schoolId, force));
  });

  app.delete("/api/season-analysis", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    options.seasonAnalysisBySchool.delete(schoolId);
    res.json({ message: "Cache cleared" });
  });

  app.get("/api/ai/player-analysis/:playerName", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const playerName = options.sanitizeTextField(req.params.playerName, 100);
    if (!playerName) {
      res.status(400).json({ error: "Invalid player name" });
      return;
    }

    const schoolCache = options.playerAnalysisCacheBySchool.get(schoolId);
    const force = String(req.query.regenerate ?? "false").toLowerCase() === "true";
    if (!force && schoolCache?.has(playerName)) {
      res.json({ ...(schoolCache.get(playerName) as object), cached: true });
      return;
    }

    const payload = options.buildPlayerAnalysisPayload(schoolId, playerName);
    if (!payload) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    if (!options.playerAnalysisCacheBySchool.has(schoolId)) {
      options.playerAnalysisCacheBySchool.set(schoolId, new Map());
    }
    options.playerAnalysisCacheBySchool.get(schoolId)!.set(playerName, payload);
    res.json(payload);
  });

  app.delete("/api/ai/player-analysis/:playerName", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const playerName = options.sanitizeTextField(req.params.playerName, 100) ?? "";
    options.playerAnalysisCacheBySchool.get(schoolId)?.delete(playerName);
    res.json({ message: `Cache cleared for ${playerName}` });
  });
}
