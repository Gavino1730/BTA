import { afterEach, describe, expect, it, vi } from "vitest";

describe("server startup", () => {
  afterEach(async () => {
    delete process.env.BTA_PERSISTENCE_STARTUP_STRICT;
    delete process.env.PORT;
    delete process.env.HOST;
    vi.doUnmock("./store.js");
    vi.resetModules();
  });

  it("fails fast when strict persistence initialization fails", async () => {
    process.env.NODE_ENV = "test";
    process.env.BTA_PERSISTENCE_STARTUP_STRICT = "1";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.doMock("./store.js", async () => {
      const actual = await vi.importActual<typeof import("./store.js")>("./store.js");
      return {
        ...actual,
        initializeStore: vi.fn(async () => {
          throw new Error("startup persistence failure");
        }),
      };
    });

    const serverModule = await import("./server.js");

    try {
      await expect(serverModule.startServer(0)).rejects.toThrow("startup persistence failure");

      const startupErrorLog = errorSpy.mock.calls
        .map((call) => {
          const raw = call[0];
          if (typeof raw !== "string") {
            return null;
          }
          try {
            return JSON.parse(raw) as {
              service?: string;
              message?: string;
              context?: Record<string, unknown>;
            };
          } catch {
            return null;
          }
        })
        .find((payload) => payload?.service === "realtime-api" && payload?.message === "startup.store_initialize_failed");

      expect(startupErrorLog).toBeTruthy();
      const context = (startupErrorLog?.context ?? {}) as Record<string, unknown>;
      expect(context.strictPersistenceInit).toBe(true);
      expect((context.error as Record<string, unknown> | undefined)?.message).toBe("startup persistence failure");

      await serverModule.stopServer();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("emits stable structured startup event keys", async () => {
    process.env.NODE_ENV = "test";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const serverModule = await import("./server.js");
      const port = await serverModule.startServer(0);
      expect(port).toBeGreaterThan(0);

      const startupMessages = new Set(
        logSpy.mock.calls
          .map((call) => {
            const raw = call[0];
            if (typeof raw !== "string") {
              return null;
            }
            try {
              return JSON.parse(raw) as { service?: string; message?: string };
            } catch {
              return null;
            }
          })
          .filter((entry): entry is { service?: string; message?: string } => entry !== null)
          .filter((entry) => entry.service === "realtime-api")
          .map((entry) => entry.message)
          .filter((message): message is string => Boolean(message))
      );

      expect(startupMessages.has("startup.server_listening")).toBe(true);
      expect(startupMessages.has("startup.api_key_auth")).toBe(true);
      expect(startupMessages.has("startup.persistence_backend")).toBe(true);
      expect(startupMessages.has("startup.local_token_auth")).toBe(true);
      expect(startupMessages.has("startup.tenant_strict_mode")).toBe(true);
      expect(startupMessages.has("startup.cors_origins")).toBe(true);

      await serverModule.stopServer();
    } finally {
      logSpy.mockRestore();
    }
  });
});
