import type { Express, NextFunction, Request, Response } from "express";
import type { GameEditOverride } from "../store.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

interface RegisterGameManagementRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  getSeasonTeamStats: (scope: { schoolId: string }) => unknown;
  buildGamesPayload: (schoolId: string) => Record<string, unknown>[];
  getGameOverrideMap: (schoolId: string) => Map<string, GameEditOverride>;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  resolveGameResult: (vcScore: number, oppScore: number) => "W" | "L" | "T";
  setGameOverride: (schoolId: string, override: GameEditOverride) => Promise<void>;
  deleteGame: (gameId: string, scope: { schoolId: string }) => boolean;
  emitToGameRooms: (schoolId: string, gameId: string, event: "game:deleted" | "game:submitted", payload: { gameId: string }) => void;
  submitGame: (gameId: string, scope: { schoolId: string }) => boolean;
  resetAllData: (scope: { schoolId: string }) => void;
}

export function registerGameManagementRoutes(app: Express, options: RegisterGameManagementRoutesOptions): void {
  app.get("/api/season-stats", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.getSeasonTeamStats({ schoolId }));
  });

  app.get("/api/games", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.buildGamesPayload(schoolId));
  });

  app.get("/api/games/:gameId", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const game = options.buildGamesPayload(schoolId).find((entry) => String(entry.gameId) === String(req.params.gameId));
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    res.json(game);
  });

  app.get("/api/games/:gameId/audit-log", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const override = options.getGameOverrideMap(schoolId).get(req.params.gameId);
    res.json({
      entries: override
        ? [{
          action: "manual_edit",
          gameId: req.params.gameId,
          updatedAtIso: override.updatedAtIso,
        }]
        : [],
    });
  });

  app.put("/api/games/:gameId", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const gameId = String(req.params.gameId);
    const existing = options.buildGamesPayload(schoolId).find((entry) => String(entry.gameId) === gameId);
    if (!existing) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const vcScore = Number(payload.vc_score);
    const oppScore = Number(payload.opp_score);
    if (!Number.isFinite(vcScore) || !Number.isFinite(oppScore)) {
      res.status(400).json({ error: "vc_score and opp_score are required" });
      return;
    }

    const baseTeamStats = (payload.team_stats && typeof payload.team_stats === "object")
      ? payload.team_stats as Record<string, unknown>
      : (existing.team_stats as Record<string, unknown> | undefined) ?? {};
    const override: GameEditOverride = {
      gameId,
      date: options.sanitizeTextField(payload.date ?? existing.date, 32) || String(existing.date ?? ""),
      opponent: options.sanitizeTextField(payload.opponent ?? existing.opponent, 120) || String(existing.opponent ?? "Opponent"),
      location: (payload.location === "away" || payload.location === "neutral") ? payload.location : "home",
      vc_score: vcScore,
      opp_score: oppScore,
      result: options.resolveGameResult(vcScore, oppScore),
      team_stats: {
        fg: Number(baseTeamStats.fg ?? 0),
        fga: Number(baseTeamStats.fga ?? 0),
        fg3: Number(baseTeamStats.fg3 ?? 0),
        fg3a: Number(baseTeamStats.fg3a ?? 0),
        ft: Number(baseTeamStats.ft ?? 0),
        fta: Number(baseTeamStats.fta ?? 0),
        oreb: Number(baseTeamStats.oreb ?? 0),
        dreb: Number(baseTeamStats.dreb ?? 0),
        reb: Number(baseTeamStats.reb ?? 0),
        asst: Number(baseTeamStats.asst ?? 0),
        to: Number(baseTeamStats.to ?? 0),
        stl: Number(baseTeamStats.stl ?? 0),
        blk: Number(baseTeamStats.blk ?? 0),
        fouls: Number(baseTeamStats.fouls ?? 0),
      },
      player_stats: Array.isArray(payload.player_stats) ? payload.player_stats as Array<Record<string, unknown>> : [],
      updatedAtIso: new Date().toISOString(),
    };

    await options.setGameOverride(schoolId, override);
    res.json({ message: "Game updated successfully", game: override });
  });

  app.delete("/api/games/:gameId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const gameId = String(req.params.gameId);
    const removedFromState = options.deleteGame(gameId, { schoolId });
    const removedOverride = options.getGameOverrideMap(schoolId).delete(gameId);
    if (!removedFromState && !removedOverride) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    options.emitToGameRooms(schoolId, gameId, "game:deleted", { gameId });
    res.json({ message: "Game deleted successfully", gameId });
  });

  app.post("/api/games/:gameId/submit", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const gameId = String(req.params.gameId);
    const ok = options.submitGame(gameId, { schoolId });
    if (!ok) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    options.emitToGameRooms(schoolId, gameId, "game:submitted", { gameId });
    res.json({ message: "Game submitted successfully", gameId });
  });

  app.post("/api/reset", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    options.resetAllData({ schoolId });
    res.json({ ok: true, message: "Reset complete", schoolId });
  });
}
