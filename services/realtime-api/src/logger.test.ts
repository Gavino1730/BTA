import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete process.env.BTA_LOG_LEVEL;
});

describe("logger", () => {
  it("filters debug logs by level in production defaults", async () => {
    process.env.NODE_ENV = "production";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { logger } = await import("./logger.js");
    logger.debug("debug.hidden", { sample: true });
    logger.info("info.visible", { sample: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0] ?? "")) as {
      level?: string;
      message?: string;
    };
    expect(payload.level).toBe("info");
    expect(payload.message).toBe("info.visible");
  });

  it("redacts sensitive keys in nested context payloads", async () => {
    process.env.BTA_LOG_LEVEL = "debug";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { logger } = await import("./logger.js");

    logger.warn("security.event", {
      authorization: "Bearer abc",
      nested: {
        password: "super-secret",
        token: "internal-token",
      },
      list: [{ secret: "s1" }, { ok: "value" }],
      safe: "yes",
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const rawLine = String(warnSpy.mock.calls[0]?.[0] ?? "");
    const payload = JSON.parse(rawLine) as {
      level: string;
      context?: Record<string, unknown>;
    };

    expect(payload.level).toBe("warn");
    expect(payload.context?.authorization).toBe("[REDACTED]");
    expect((payload.context?.nested as Record<string, unknown>)?.password).toBe("[REDACTED]");
    expect((payload.context?.nested as Record<string, unknown>)?.token).toBe("[REDACTED]");
    expect(((payload.context?.list as Array<Record<string, unknown>>)?.[0])?.secret).toBe("[REDACTED]");
    expect(payload.context?.safe).toBe("yes");
  });

  it("serializes Error objects with stack for diagnostics", async () => {
    process.env.BTA_LOG_LEVEL = "debug";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { logger } = await import("./logger.js");
    logger.error("store.failure", { error: new Error("boom") });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(errorSpy.mock.calls[0]?.[0] ?? "")) as {
      context?: { error?: { name?: string; message?: string; stack?: string } };
    };

    expect(payload.context?.error?.name).toBe("Error");
    expect(payload.context?.error?.message).toBe("boom");
    expect(typeof payload.context?.error?.stack).toBe("string");
  });
});
