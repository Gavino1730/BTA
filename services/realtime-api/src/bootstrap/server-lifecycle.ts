/**
 * Server lifecycle management (start/stop/shutdown).
 * Extracted from server.ts to keep it under 300 lines.
 */
import type { Server as HttpServer } from "node:http";
import { assertRuntimeConfig, readRuntimeConfig } from "../config-validation.js";
import { initializeStore, getPersistenceStatus } from "../store.js";
import { isJwtAuthEnabled, isLocalTokenAuthEnabled } from "../auth.js";
import { logger } from "../logger.js";

export interface ServerLifecycleOptions {
  httpServer: HttpServer;
  API_KEY: string | undefined;
  WRITE_API_KEY: string | undefined;
  REQUIRE_TENANT: boolean;
  ALLOWED_ORIGINS: string[];
}

export function createServerLifecycle(opts: ServerLifecycleOptions) {
  const { httpServer, API_KEY, WRITE_API_KEY, REQUIRE_TENANT, ALLOWED_ORIGINS } = opts;
  let serverStarted = false;

  /**
   * Start the HTTP server. Accepts an optional port override (pass 0 for an
   * OS-assigned ephemeral port — useful in tests to avoid EADDRINUSE conflicts).
   * Returns the actual bound port number.
   */
  async function startServer(overridePort?: number): Promise<number> {
    if (serverStarted) {
      const addr = httpServer.address();
      const boundPort = (typeof addr === "object" && addr !== null)
        ? (addr as { port: number }).port
        : (overridePort ?? Number(process.env.PORT ?? 4000));
      return boundPort;
    }

    assertRuntimeConfig(readRuntimeConfig(isJwtAuthEnabled()));

    const strictPersistenceInit = (process.env.NODE_ENV ?? "development") === "production"
      || process.env.BTA_PERSISTENCE_STARTUP_STRICT === "1";
    try {
      await initializeStore({ failOnPersistenceError: strictPersistenceInit });
    } catch (error) {
      logger.error("startup.store_initialize_failed", { strictPersistenceInit, error });
      if (strictPersistenceInit) {
        throw error;
      }
    }

    const port = overridePort ?? Number(process.env.PORT ?? 4000);
    const host = process.env.HOST ?? "0.0.0.0";
    const persistenceStatus = getPersistenceStatus();

    return new Promise<number>((resolve) => {
      httpServer.listen(port, host, () => {
        serverStarted = true;
        const addr = httpServer.address();
        const boundPort = (typeof addr === "object" && addr !== null)
          ? (addr as { port: number }).port
          : port;
        logger.info("startup.server_listening", { port: boundPort, host });
        logger.info("startup.api_key_auth", { enabled: Boolean(API_KEY) });
        logger.info("startup.write_api_key_auth", { enabled: Boolean(WRITE_API_KEY) });
        logger.info("startup.persistence_backend", { backend: persistenceStatus.backend, durable: persistenceStatus.durable });
        if (persistenceStatus.warning) {
          logger.warn("startup.persistence_degraded", {
            backend: persistenceStatus.backend,
            warning: persistenceStatus.warning,
            dataFile: persistenceStatus.dataFile,
          });
        }
        if (!isJwtAuthEnabled() && !WRITE_API_KEY) {
          logger.warn("startup.write_auth_degraded", {
            warning: "No write-capable auth path configured; protected write routes will return 503 until JWT auth or BTA_WRITE_API_KEY is configured.",
          });
        }
        if (isJwtAuthEnabled()) {
          logger.info("startup.jwt_auth", { enabled: true });
        }
        logger.info("startup.local_token_auth", { enabled: isLocalTokenAuthEnabled() });
        logger.info("startup.tenant_strict_mode", { enabled: REQUIRE_TENANT });
        logger.info("startup.cors_origins", { origins: ALLOWED_ORIGINS });
        resolve(boundPort);
      });
    });
  }

  async function stopServer(): Promise<void> {
    if (!serverStarted) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        serverStarted = false;
        resolve();
      });
    });
  }

  function registerShutdownHandlers(): void {
    let shutdownInProgress = false;
    async function handleShutdownSignal(signal: NodeJS.Signals): Promise<void> {
      if (shutdownInProgress) return;
      shutdownInProgress = true;
      logger.info("shutdown.signal_received", { signal });
      try {
        await stopServer();
        process.exit(0);
      } catch (error) {
        logger.error("shutdown.graceful_failed", { error });
        process.exit(1);
      }
    }
    process.once("SIGTERM", () => { void handleShutdownSignal("SIGTERM"); });
    process.once("SIGINT", () => { void handleShutdownSignal("SIGINT"); });
  }

  return { startServer, stopServer, registerShutdownHandlers };
}
