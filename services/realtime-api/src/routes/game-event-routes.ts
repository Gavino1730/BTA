import type { Express, NextFunction, Request, Response } from "express";
import { findTrackedRosterTeamForGame, isTeamReadOnly, type GameStateLike, type WorkspaceRosterTeam } from "../helpers/team-billing-guards.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

interface RegisterGameEventRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  eventRateLimiter: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  getRosterTeamsByScope: (scope: { schoolId: string }) => WorkspaceRosterTeam[];
  getGameState: (gameId: string, scope: { schoolId: string }) => unknown | null;
  getGameEvents: (gameId: string, scope: { schoolId: string }) => unknown[];
  ingestEvent: (payload: Record<string, unknown>, scope: { schoolId: string }) => { event: { gameId: string }; state: unknown; insights: unknown };
  emitToGameRooms: (schoolId: string, gameId: string, event: string, payload: unknown) => void;
  broadcastGameStateWithDebounce: (schoolId: string, gameId: string, state: unknown, insights: unknown) => void;
  refreshAndBroadcastInsights: (schoolId: string, gameId: string) => Promise<void>;
  deleteEvent: (gameId: string, eventId: string, scope: { schoolId: string }) => { state: unknown; insights: unknown };
  updateEvent: (gameId: string, eventId: string, patch: unknown, scope: { schoolId: string }) => { event: unknown; state: unknown; insights: unknown };
}

export function registerGameEventRoutes(app: Express, options: RegisterGameEventRoutesOptions): void {
  function rejectReadOnlyTeamMutation(res: Response, schoolId: string, gameId: string): boolean {
    const state = options.getGameState(gameId, { schoolId }) as GameStateLike | null;
    const trackedTeam = findTrackedRosterTeamForGame(state, options.getRosterTeamsByScope({ schoolId }));
    if (!isTeamReadOnly(trackedTeam)) {
      return false;
    }

    res.status(402).json({
      error: "This team is read-only until the school upgrades for additional active team capacity.",
      code: "team_upgrade_required",
      team: trackedTeam,
    });
    return true;
  }

  app.get("/api/games/:gameId/events", options.requireApiKey, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const state = options.getGameState(req.params.gameId, { schoolId });
    if (!state) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    const allEvents = options.getGameEvents(req.params.gameId, { schoolId });
    const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 50, 1), 500) : undefined;
    const offset = req.query.offset !== undefined ? Math.max(Number(req.query.offset) || 0, 0) : 0;

    if (limit !== undefined) {
      const paginated = allEvents.slice(offset, offset + limit);
      res.json({ events: paginated, total: allEvents.length, offset, limit });
      return;
    }

    res.json(allEvents);
  });

  app.post("/api/games/:gameId/events", options.requireApiKey, options.requireWriteRole, options.eventRateLimiter, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    if (rejectReadOnlyTeamMutation(res, schoolId, req.params.gameId)) {
      return;
    }
    try {
      const payload = {
        ...(req.body ?? {}),
        gameId: req.params.gameId,
        schoolId,
      };

      const { event, state, insights } = options.ingestEvent(payload, { schoolId });

      options.emitToGameRooms(schoolId, event.gameId, "game:event", event);
      options.broadcastGameStateWithDebounce(schoolId, event.gameId, state, insights);
      void options.refreshAndBroadcastInsights(schoolId, event.gameId);

      res.status(201).json({ event, state, insights });
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid event";
      if (/^Game not found:/i.test(message)) {
        res.status(404).json({ error: message });
        return;
      }
      if (/^Game already submitted:/i.test(message)) {
        res.status(409).json({ error: message });
        return;
      }
      if (/^Sequence\s+\d+\s+already belongs to event\s+/i.test(message) || /^Event\s+.+\s+already exists with different payload/i.test(message)) {
        res.status(409).json({
          error: message,
          code: "event_conflict",
          state: options.getGameState(req.params.gameId, { schoolId }) ?? null,
        });
        return;
      }
      res.status(400).json({ error: message });
    }
  });

  app.delete("/api/games/:gameId/events/:eventId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    if (rejectReadOnlyTeamMutation(res, schoolId, req.params.gameId)) {
      return;
    }
    try {
      const { state, insights } = options.deleteEvent(req.params.gameId, req.params.eventId, { schoolId });

      options.emitToGameRooms(schoolId, req.params.gameId, "game:event:deleted", { eventId: req.params.eventId });
      options.broadcastGameStateWithDebounce(schoolId, req.params.gameId, state, insights);
      void options.refreshAndBroadcastInsights(schoolId, req.params.gameId);

      res.json({ state, insights });
    } catch (error) {
      const message = error instanceof Error ? error.message : "delete failed";
      if (/^Game already submitted:/i.test(message)) {
        res.status(409).json({ error: message });
        return;
      }
      res.status(400).json({ error: message });
    }
  });

  app.put("/api/games/:gameId/events/:eventId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    if (rejectReadOnlyTeamMutation(res, schoolId, req.params.gameId)) {
      return;
    }
    try {
      const { event, state, insights } = options.updateEvent(
        req.params.gameId,
        req.params.eventId,
        req.body ?? {},
        { schoolId },
      );

      options.emitToGameRooms(schoolId, req.params.gameId, "game:event:updated", event);
      options.emitToGameRooms(schoolId, req.params.gameId, "game:state", state);
      options.emitToGameRooms(schoolId, req.params.gameId, "game:insights", insights);
      void options.refreshAndBroadcastInsights(schoolId, req.params.gameId);

      res.json({ event, state, insights });
    } catch (error) {
      const message = error instanceof Error ? error.message : "update failed";
      if (/^Game already submitted:/i.test(message)) {
        res.status(409).json({ error: message });
        return;
      }
      res.status(400).json({ error: message });
    }
  });
}
