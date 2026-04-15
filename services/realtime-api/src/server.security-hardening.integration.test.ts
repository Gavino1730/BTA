import { afterEach, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";

type ServerModule = {
  startServer: (overridePort?: number) => Promise<number>;
  stopServer: () => Promise<void>;
};

const API_PORT = "4111";
const API_BASE = `http://localhost:${API_PORT}`;

function makeTestToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `test.${encoded}`;
}

async function startSecurityServer(env: {
  apiKey?: string;
  writeApiKey?: string;
  jwtWriteRequired?: "0" | "1";
} = {}): Promise<ServerModule> {
  process.env.BTA_REQUIRE_TENANT = "0";
  process.env.BTA_JWT_WRITE_REQUIRED = env.jwtWriteRequired ?? "0";
  process.env.BTA_PAYWALL_ENABLED = "0";
  process.env.NODE_ENV = "test";
  process.env.PORT = API_PORT;

  if (env.apiKey) {
    process.env.BTA_API_KEY = env.apiKey;
  } else {
    delete process.env.BTA_API_KEY;
  }

  if (env.writeApiKey) {
    process.env.BTA_WRITE_API_KEY = env.writeApiKey;
  } else {
    delete process.env.BTA_WRITE_API_KEY;
  }

  vi.resetModules();
  const serverModule = await import("./server.js");
  await serverModule.startServer();
  return serverModule;
}

async function stopSecurityServer(server: ServerModule): Promise<void> {
  await server.stopServer();
  delete process.env.BTA_REQUIRE_TENANT;
  delete process.env.BTA_JWT_WRITE_REQUIRED;
  delete process.env.BTA_PAYWALL_ENABLED;
  delete process.env.BTA_API_KEY;
  delete process.env.BTA_WRITE_API_KEY;
  delete process.env.PORT;
}

describe("server security hardening integration", () => {
  let activeServer: ServerModule | null = null;

  afterEach(async () => {
    if (activeServer) {
      await stopSecurityServer(activeServer);
      activeServer = null;
    }
  });

  it("fails closed for protected HTTP routes when auth is misconfigured", async () => {
    activeServer = await startSecurityServer();

    const response = await fetch(`${API_BASE}/api/team`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-school-id": "hardening-school",
      },
      body: JSON.stringify({ name: "Unsafe Team" }),
    });

    expect(response.status).toBe(503);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toContain("Authentication is not configured");
  });

  it("fails closed for protected sockets when auth is misconfigured", async () => {
    activeServer = await startSecurityServer();

    const errorMessage = await new Promise<string>((resolve) => {
      const client: Socket = io(API_BASE, {
        transports: ["websocket"],
        auth: { schoolId: "socket-school" },
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

    expect(errorMessage).toContain("Authentication is not configured");
  });

  it("treats BTA_API_KEY as read-only and BTA_WRITE_API_KEY as write-capable", async () => {
    activeServer = await startSecurityServer({
      apiKey: "read-key",
      writeApiKey: "write-key",
    });

    const readResponse = await fetch(`${API_BASE}/config/roster-teams`, {
      headers: {
        "x-api-key": "read-key",
        "x-school-id": "rbac-school",
      },
    });
    expect(readResponse.status).toBe(200);

    const deniedWrite = await fetch(`${API_BASE}/api/team`, {
      method: "POST",
      headers: {
        "x-api-key": "read-key",
        "x-school-id": "rbac-school",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Read Only Team" }),
    });
    expect(deniedWrite.status).toBe(403);

    const allowedWrite = await fetch(`${API_BASE}/api/team`, {
      method: "POST",
      headers: {
        "x-api-key": "write-key",
        "x-school-id": "rbac-school",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Write Key Team" }),
    });
    expect(allowedWrite.status).toBe(201);
  });

  it("reports persistence durability and auth capabilities on /health", async () => {
    activeServer = await startSecurityServer({
      apiKey: "read-key",
      writeApiKey: "write-key",
    });

    const response = await fetch(`${API_BASE}/health`);
    expect(response.status).toBe(200);

    const payload = await response.json() as {
      persistence?: { backend?: string; durable?: boolean; warning?: string };
      auth?: { apiKey?: boolean; writeApiKey?: boolean; jwt?: boolean };
    };

    expect(payload.persistence?.backend).toBe("memory");
    expect(payload.persistence?.durable).toBe(false);
    expect(payload.persistence?.warning).toContain("Data will be lost");
    expect(payload.auth?.apiKey).toBe(true);
    expect(payload.auth?.writeApiKey).toBe(true);
  });
});
