import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerGameEventRoutes } from "./routes/game-event-routes.js";
import { registerGameSessionRoutes } from "./routes/game-session-routes.js";

function noOpMiddleware(_req: express.Request, _res: express.Response, next: () => void) {
  next();
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function withServer(setup: {
  (app: express.Express): void;
  run?: (baseUrl: string) => Promise<void>;
}) {
  const app = express();
  app.use(express.json());
  setup(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    if (setup.run) {
      await setup.run(`http://127.0.0.1:${port}`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
  }
}

describe("durability route behavior", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for durable createGame completion before replying or emitting", async () => {
    const emitToGameRooms = vi.fn();
    const createGameResult = deferred();

    await withServer(Object.assign((app: express.Express) => {
      registerGameSessionRoutes(app, {
        requireApiKey: noOpMiddleware,
        requireWriteRole: noOpMiddleware,
        getSchoolIdFromRequest: () => "durable-school",
        getRosterTeamsByScope: () => [{ id: "home", name: "Home", abbreviation: "H", players: [] }],
        getGameState: () => null,
        getActiveGameState: () => null,
        createGame: () => createGameResult.promise,
        emitToGameRooms,
        getLatestOperatorLinkSetup: () => null,
        patchGameLineup: async () => null,
      });
    }, {
      async run(baseUrl: string) {
        let settled = false;
        const request = fetch(`${baseUrl}/api/games`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-school-id": "durable-school" },
          body: JSON.stringify({
            gameId: "game-durable",
            teamId: "home",
            homeTeamId: "home",
            awayTeamId: "away",
          }),
        }).then(async (response) => {
          settled = true;
          return {
            status: response.status,
            body: await response.json(),
          };
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(settled).toBe(false);
        expect(emitToGameRooms).not.toHaveBeenCalled();

        createGameResult.resolve({ gameId: "game-durable", scoreByTeam: { home: 0, away: 0 } });

        const result = await request;
        expect(result.status).toBe(201);
        expect(result.body.gameId).toBe("game-durable");
        expect(emitToGameRooms).toHaveBeenCalledTimes(2);
      },
    }));
  });

  it("returns 503 and suppresses broadcasts when durable ingest fails", async () => {
    const emitToGameRooms = vi.fn();
    const broadcastGameStateWithDebounce = vi.fn();

    await withServer(Object.assign((app: express.Express) => {
      registerGameEventRoutes(app, {
        requireApiKey: noOpMiddleware,
        requireWriteRole: noOpMiddleware,
        eventRateLimiter: noOpMiddleware,
        getSchoolIdFromRequest: () => "durable-school",
        getRosterTeamsByScope: () => [],
        getGameState: () => ({ gameId: "game-durable" }),
        getGameEvents: () => [],
        ingestEvent: async () => {
          throw new Error("postgres persistence unavailable");
        },
        emitToGameRooms,
        broadcastGameStateWithDebounce,
        refreshAndBroadcastInsights: async () => undefined,
        deleteEvent: async () => ({ state: {}, insights: [] }),
        updateEvent: async () => ({ event: {}, state: {}, insights: [] }),
      });
    }, {
      async run(baseUrl: string) {
        const response = await fetch(`${baseUrl}/api/games/game-durable/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-school-id": "durable-school" },
          body: JSON.stringify({
            id: "evt-1",
            sequence: 1,
            period: "Q1",
            clockSecondsRemaining: 470,
            teamId: "home",
            operatorId: "op-1",
            type: "shot_attempt",
            playerId: "p-1",
            made: true,
            points: 2,
            zone: "paint",
          }),
        });

        expect(response.status).toBe(503);
        const payload = await response.json();
        expect(payload.code).toBe("persistence_unavailable");
        expect(emitToGameRooms).not.toHaveBeenCalled();
        expect(broadcastGameStateWithDebounce).not.toHaveBeenCalled();
      },
    }));
  });
});
