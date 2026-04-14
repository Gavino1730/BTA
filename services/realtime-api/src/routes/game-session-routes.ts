import type { Express, NextFunction, Request, Response } from "express";
import type { CreateGameInput } from "../store.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

type GameState = {
  gameId: string;
};

type OperatorLinkSetup = {
  operatorToken?: string;
};

interface RegisterGameSessionRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  getGameState: (gameId: string, scope: { schoolId: string }) => unknown | null;
  getActiveGameState: (scope: { schoolId: string }) => GameState | null;
  createGame: (input: CreateGameInput, scope?: { schoolId: string }) => unknown;
  emitToGameRooms: (schoolId: string, gameId: string, eventName: string, payload: unknown) => void;
  getLatestOperatorLinkSetup: (schoolId: string, options?: { gameId?: string }) => { connectionId: string; setup: OperatorLinkSetup } | null;
  patchGameLineup: (gameId: string, startingLineupByTeam: Record<string, string[]>, scope?: { schoolId: string }) => unknown | null;
}

export function registerGameSessionRoutes(app: Express, options: RegisterGameSessionRoutesOptions): void {
  app.post(["/games", "/api/games"], options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const {
      gameId,
      homeTeamId,
      awayTeamId,
      opponentName,
      opponentTeamId,
      startingLineupByTeam,
      aiContext,
    } = req.body ?? {};

    if (!gameId || !homeTeamId || !awayTeamId) {
      res.status(400).json({ error: "gameId, homeTeamId, awayTeamId are required" });
      return;
    }

    const existingState = options.getGameState(gameId, { schoolId });
    if (existingState) {
      res.status(200).json(existingState);
      return;
    }

    const activeState = options.getActiveGameState({ schoolId });
    if (activeState && activeState.gameId !== gameId) {
      res.status(409).json({
        error: "An active game is already in progress for this school",
        activeGameId: activeState.gameId,
        activeState,
      });
      return;
    }

    const state = options.createGame({
      schoolId,
      gameId,
      homeTeamId,
      awayTeamId,
      opponentName,
      opponentTeamId,
      startingLineupByTeam,
      aiContext,
    }, { schoolId });

    options.emitToGameRooms(schoolId, gameId, "game:state", state);
    options.emitToGameRooms(schoolId, gameId, "game:insights", []);

    res.status(201).json(state);
  });

  app.get("/api/games/active/state", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const activeState = options.getActiveGameState({ schoolId });

    if (!activeState) {
      res.json({ gameId: null });
      return;
    }

    res.json(activeState);
  });

  app.get("/api/games/active/setup", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const activeState = options.getActiveGameState({ schoolId });

    if (!activeState) {
      res.status(404).json({ error: "no active game" });
      return;
    }

    const latestForActiveGame = options.getLatestOperatorLinkSetup(schoolId, { gameId: activeState.gameId });
    const latestForSchool = options.getLatestOperatorLinkSetup(schoolId);
    const resolved = latestForActiveGame ?? latestForSchool;

    if (!resolved) {
      res.status(404).json({ error: "no active setup" });
      return;
    }

    const { operatorToken, ...publicSetup } = resolved.setup;
    res.json({
      connectionId: resolved.connectionId,
      activeGameId: activeState.gameId,
      setup: publicSetup,
    });
  });

  app.get("/api/games/:gameId/state", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const state = options.getGameState(req.params.gameId, { schoolId });

    if (!state) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    res.json(state);
  });

  app.patch("/api/games/:gameId/lineup", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const { startingLineupByTeam } = req.body ?? {};
    if (!startingLineupByTeam || typeof startingLineupByTeam !== "object") {
      res.status(400).json({ error: "startingLineupByTeam is required" });
      return;
    }

    const state = options.patchGameLineup(req.params.gameId, startingLineupByTeam as Record<string, string[]>, { schoolId });
    if (!state) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    options.emitToGameRooms(schoolId, req.params.gameId, "game:state", state);
    res.json(state);
  });
}
