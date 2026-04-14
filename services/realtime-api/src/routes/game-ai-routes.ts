import type { Express, NextFunction, Request, Response } from "express";
import type { CoachAiSettings, GameAiContext } from "../store.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

interface RegisterGameAiRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  getGameState: (gameId: string, scope: { schoolId: string }) => unknown | null;
  refreshGameAiInsights: (gameId: string, options: { force?: boolean } | undefined, scope: { schoolId: string }) => Promise<unknown>;
  getGameInsights: (gameId: string, scope: { schoolId: string }) => unknown;
  getGameAiSettings: (gameId: string, scope: { schoolId: string }) => unknown;
  updateGameAiSettings: (gameId: string, settings: Partial<CoachAiSettings>, scope: { schoolId: string }) => unknown | null;
  emitGameInsights: (schoolId: string, gameId: string, insights: unknown) => void;
  getGameAiContext: (gameId: string, scope: { schoolId: string }) => unknown;
  updateGameAiContext: (gameId: string, context: Partial<GameAiContext>, scope: { schoolId: string }) => unknown | null;
  getGameAiPromptPreview: (gameId: string, scope: { schoolId: string }) => unknown | null;
  sanitizePromptText: (value: string, maxLength: number) => string;
  answerGameAiChat: (gameId: string, question: string, history: unknown, scope: { schoolId: string }) => Promise<unknown | null>;
}

export function registerGameAiRoutes(app: Express, options: RegisterGameAiRoutesOptions): void {
  app.get("/api/games/:gameId/insights", options.requireApiKey, async (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const state = options.getGameState(req.params.gameId, { schoolId });
    if (!state) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    const forceRefresh = req.query.force === "1" || req.query.force === "true";
    const insights = await options.refreshGameAiInsights(req.params.gameId, { force: forceRefresh }, { schoolId });
    res.json(insights ?? options.getGameInsights(req.params.gameId, { schoolId }));
  });

  app.get("/api/games/:gameId/ai-settings", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const state = options.getGameState(req.params.gameId, { schoolId });
    if (!state) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    const settings = options.getGameAiSettings(req.params.gameId, { schoolId });
    res.json(settings);
  });

  app.put("/api/games/:gameId/ai-settings", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const state = options.getGameState(req.params.gameId, { schoolId });
    if (!state) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    const payload = (req.body ?? {}) as Partial<CoachAiSettings>;
    const updated = options.updateGameAiSettings(req.params.gameId, payload, { schoolId });
    if (!updated) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    const insights = await options.refreshGameAiInsights(req.params.gameId, undefined, { schoolId });
    if (insights) {
      options.emitGameInsights(schoolId, req.params.gameId, insights);
    }

    res.json(updated);
  });

  app.get("/api/games/:gameId/ai-context", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const state = options.getGameState(req.params.gameId, { schoolId });
    if (!state) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    const context = options.getGameAiContext(req.params.gameId, { schoolId });
    res.json(context);
  });

  app.put("/api/games/:gameId/ai-context", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const state = options.getGameState(req.params.gameId, { schoolId });
    if (!state) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    const payload = (req.body ?? {}) as Partial<GameAiContext>;
    const updated = options.updateGameAiContext(req.params.gameId, payload, { schoolId });
    if (!updated) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    const insights = await options.refreshGameAiInsights(req.params.gameId, { force: true }, { schoolId });
    if (insights) {
      options.emitGameInsights(schoolId, req.params.gameId, insights);
    }

    res.json(updated);
  });

  app.get("/api/games/:gameId/ai-prompt-preview", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const state = options.getGameState(req.params.gameId, { schoolId });
    if (!state) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    const preview = options.getGameAiPromptPreview(req.params.gameId, { schoolId });
    if (!preview) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    res.json(preview);
  });

  app.post("/api/games/:gameId/ai-chat", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const state = options.getGameState(req.params.gameId, { schoolId });
    if (!state) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    const question = typeof req.body?.question === "string" ? options.sanitizePromptText(req.body.question, 2000) : "";
    if (!question.trim()) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const response = await options.answerGameAiChat(req.params.gameId, question, req.body?.history, { schoolId });
    if (!response) {
      res.status(503).json({ error: "ai chat unavailable" });
      return;
    }

    res.json(response);
  });
}
