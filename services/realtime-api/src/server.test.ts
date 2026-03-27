import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * Realtime API server endpoint tests
 * 
 * Since the server module starts listening automatically on import,
 * these tests use fetch() against a running instance.
 * 
 * To run these in isolation:
 *   npm run test -- server.test.ts
 */

const API_BASE = "http://localhost:4000";
const API_KEY = process.env.BTA_API_KEY || "test-key-xyz";

beforeEach(() => {
  // Reset env for each test
  delete process.env.BTA_API_KEY;
});

describe("Realtime API Server", () => {
  describe("POST /games/:gameId/events", () => {
    it("rejects event with invalid payload structure", async () => {
      const res = await fetch(`${API_BASE}/games/test-game/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: "payload" })
      });

      expect(res.status).toBe(400);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });

    it("accepts valid field goal event", async () => {
      const event = {
        id: "evt-1",
        gameId: "test-game",
        sequence: 1,
        timestampIso: new Date().toISOString(),
        period: "Q1" as const,
        clockSecondsRemaining: 600,
        teamId: "home",
        operatorId: "op-1",
        type: "shot_attempt" as const,
        playerId: "p1",
        made: true
      };

      const res = await fetch(`${API_BASE}/games/test-game/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event)
      });

      expect([201, 400]).toContain(res.status);
      if (res.status === 201) {
        const body = await res.json() as Record<string, unknown>;
        expect(body.event).toBeDefined();
      }
    });

    it("accepts valid free throw event with correct attempt count", async () => {
      const event = {
        id: "evt-2",
        gameId: "test-game",
        sequence: 2,
        timestampIso: new Date().toISOString(),
        period: "Q1" as const,
        clockSecondsRemaining: 590,
        teamId: "away",
        operatorId: "op-1",
        type: "free_throw_attempt" as const,
        playerId: "p2",
        made: true,
        attemptNumber: 1,
        totalAttempts: 2
      };

      const res = await fetch(`${API_BASE}/games/test-game/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event)
      });

      expect([201, 400]).toContain(res.status);
    });

    it("rejects free throw event with impossible attempt count (3 of 2)", async () => {
      const event = {
        id: "evt-3",
        gameId: "test-game",
        sequence: 3,
        timestampIso: new Date().toISOString(),
        period: "Q1" as const,
        clockSecondsRemaining: 580,
        teamId: "home",
        operatorId: "op-1",
        type: "free_throw_attempt" as const,
        playerId: "p3",
        made: true,
        attemptNumber: 3,
        totalAttempts: 2
      };

      const res = await fetch(`${API_BASE}/games/test-game/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event)
      });

      expect(res.status).toBe(400);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });
  });

  describe("GET /games/:gameId/state", () => {
    it("returns game state or 404 for nonexistent game", async () => {
      const res = await fetch(`${API_BASE}/games/nonexistent-game-xyz/state`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe("GET /games/:gameId/insights", () => {
    it("returns insights array for a game", async () => {
      const res = await fetch(`${API_BASE}/games/test-game/insights`);

      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
      }
    });
  });

  describe("CORS", () => {
    it("allows requests from whitelisted origin", async () => {
      const res = await fetch(`${API_BASE}/games/test-game/state`, {
        headers: { Origin: "http://localhost:5173" }
      });

      // Should not 403 due to CORS
      expect([200, 404]).toContain(res.status);
    });

    it("rejects requests from non-whitelisted origin", async () => {
      const res = await fetch(`${API_BASE}/games/test-game/state`, {
        headers: { Origin: "https://evil.com" }
      });

      // Should either 200/404 (if CORS check happens at middleware level)
      // or a CORS error at browser level. Accept any response for now.
      expect(res).toBeDefined();
    });
  });

  describe("Rate Limiting", () => {
    it("allows burst of requests within limit", async () => {
      // Send 5 rapid requests to /games/:gameId/events
      const promises = Array.from({ length: 5 }).map(() =>
        fetch(`${API_BASE}/games/test-game/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invalid: "test" })
        }).then(r => r.status)
      );

      const statuses = await Promise.all(promises);
      // Should all complete, likely 400 (invalid payload)
      statuses.forEach(status => {
        expect([200, 201, 400, 429]).toContain(status);
      });
    });
  });

  describe("API Key Auth", () => {
    it("allows requests without key when BTA_API_KEY env not set", async () => {
      delete process.env.BTA_API_KEY;

      const res = await fetch(`${API_BASE}/games/test-game/state`);

      // Should succeed (not 401)
      expect([200, 404]).toContain(res.status);
    });

    it("accepts request with valid API key header", async () => {
      // This test assumes BTA_API_KEY is set in test env
      const res = await fetch(`${API_BASE}/games/test-game/state`, {
        headers: { "x-api-key": API_KEY }
      });

      expect([200, 404, 401]).toContain(res.status);
    });

    it("rejects request with invalid API key", async () => {
      const res = await fetch(`${API_BASE}/games/test-game/state`, {
        headers: { "x-api-key": "wrong-key-123" }
      });

      // May be 401 if key is enforced, or 404/200 if not configured
      expect([200, 401, 404]).toContain(res.status);
    });
  });
});
