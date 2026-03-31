import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";

const API_PORT = "4100";
const API_BASE = `http://localhost:${API_PORT}`;

function makeTestToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `test.${encoded}`;
}

describe("server auth integration", () => {
  let startServer: (() => Promise<void>) | undefined;
  let stopServer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    process.env.BTA_AUTH_TEST_MODE = "1";
    process.env.BTA_REQUIRE_TENANT = "1";
    process.env.BTA_JWT_WRITE_REQUIRED = "1";
    process.env.NODE_ENV = "test";
    process.env.PORT = API_PORT;

    vi.resetModules();
    const serverModule = await import("./server.js");
    startServer = serverModule.startServer;
    stopServer = serverModule.stopServer;
    await startServer();
  });

  afterAll(async () => {
    if (stopServer) {
      await stopServer();
    }
    delete process.env.BTA_AUTH_TEST_MODE;
    delete process.env.BTA_REQUIRE_TENANT;
    delete process.env.BTA_JWT_WRITE_REQUIRED;
    delete process.env.PORT;
  });

  it("denies write endpoint for viewer role and allows coach role", async () => {
    const viewerToken = makeTestToken({
      sub: "viewer-user",
      schoolId: "rbac-school",
      role: "viewer"
    });
    const coachToken = makeTestToken({
      sub: "coach-user",
      schoolId: "rbac-school",
      role: "coach"
    });

    const denied = await fetch(`${API_BASE}/api/team`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "rbac-school"
      },
      body: JSON.stringify({ name: "RBAC Team" })
    });

    expect(denied.status).toBe(403);

    const allowed = await fetch(`${API_BASE}/api/team`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${coachToken}`,
        "Content-Type": "application/json",
        "x-school-id": "rbac-school"
      },
      body: JSON.stringify({ name: "RBAC Team" })
    });

    expect(allowed.status).toBe(201);
  });

  it("rejects request when token tenant and requested tenant mismatch", async () => {
    const token = makeTestToken({
      sub: "coach-user",
      schoolId: "alpha",
      role: "coach"
    });

    const response = await fetch(`${API_BASE}/api/teams`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "beta"
      }
    });

    expect(response.status).toBe(403);
  });

  it("exposes prometheus security metrics to authorized write role", async () => {
    const token = makeTestToken({
      sub: "metrics-coach",
      schoolId: "rbac-school",
      role: "coach"
    });

    const response = await fetch(`${API_BASE}/admin/security-metrics/prometheus`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "rbac-school"
      }
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("bta_security_unauthorized_http_total");
    expect(text).toContain("bta_security_forbidden_write_role_total");
  });

  it("rejects socket connection on tenant mismatch and allows matching scope", async () => {
    const mismatchToken = makeTestToken({
      sub: "socket-user",
      schoolId: "alpha",
      role: "coach"
    });

    const mismatchError = await new Promise<string>((resolve) => {
      const client: Socket = io(API_BASE, {
        transports: ["websocket"],
        auth: {
          token: mismatchToken,
          schoolId: "beta"
        }
      });

      client.on("connect", () => {
        client.disconnect();
        resolve("unexpected-connect");
      });

      client.on("connect_error", (error) => {
        client.disconnect();
        resolve(String(error.message ?? ""));
      });
    });

    expect(mismatchError.toLowerCase()).toContain("mismatch");

    const okToken = makeTestToken({
      sub: "socket-user-ok",
      schoolId: "alpha",
      role: "coach"
    });

    const connected = await new Promise<boolean>((resolve) => {
      const client: Socket = io(API_BASE, {
        transports: ["websocket"],
        auth: {
          token: okToken,
          schoolId: "alpha"
        }
      });

      client.on("connect", () => {
        client.disconnect();
        resolve(true);
      });

      client.on("connect_error", () => {
        client.disconnect();
        resolve(false);
      });
    });

    expect(connected).toBe(true);
  });
});
