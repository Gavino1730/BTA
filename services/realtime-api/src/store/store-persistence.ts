import { mkdirSync, writeFileSync } from "node:fs";
import { logger } from "../logger.js";
import type { PersistenceProvider } from "../persistence.js";
import type {
  NormalizedPersistenceWaiter,
  PersistenceStatus,
} from "./store-types.js";

type StorePersistenceOptions = {
  persistenceEnabled: boolean;
  dataDirectory: string;
  dataFile: string;
  persistenceProvider: PersistenceProvider | null;
  dataRetentionDays: number;
  retentionPruneIntervalMinutes: number;
  buildSnapshot: () => unknown;
  restoreSnapshotFromProvider: () => Promise<boolean>;
  restoreNormalizedSessionsFromProvider: () => Promise<boolean>;
  restoreSessionsFromFile: () => boolean;
  restoreRosterTeamsFromProvider: () => Promise<void>;
  restoreOrgDataFromProvider: () => Promise<void>;
  restoreWorkspaceDataFromProvider: () => Promise<void>;
  persistNormalizedSessionsToProvider: () => Promise<void>;
};

export function createStorePersistence(options: StorePersistenceOptions) {
  let persistenceConnected = false;
  let lastRestoreAtIso: string | null = null;
  let lastSuccessfulWriteAtIso: string | null = null;
  let normalizedSessionsPersistSequence = 0;
  let normalizedSessionsPersistCompletedSequence = 0;
  const normalizedSessionsPersistWaiters: NormalizedPersistenceWaiter[] = [];
  let normalizedSessionsPersistInFlight = false;
  let normalizedSessionsPersistQueued = false;
  let storeInitialized = false;
  let retentionTimer: ReturnType<typeof setInterval> | null = null;

  function resolveNormalizedPersistenceWaitersUpTo(sequence: number): void {
    const ready = normalizedSessionsPersistWaiters.filter((waiter) => waiter.sequence <= sequence);
    for (const waiter of ready) {
      const index = normalizedSessionsPersistWaiters.indexOf(waiter);
      if (index >= 0) {
        normalizedSessionsPersistWaiters.splice(index, 1);
      }
      waiter.resolve();
    }
  }

  function rejectNormalizedPersistenceWaitersUpTo(sequence: number, error: unknown): void {
    const ready = normalizedSessionsPersistWaiters.filter((waiter) => waiter.sequence <= sequence);
    for (const waiter of ready) {
      const index = normalizedSessionsPersistWaiters.indexOf(waiter);
      if (index >= 0) {
        normalizedSessionsPersistWaiters.splice(index, 1);
      }
      waiter.reject(error);
    }
  }

  function waitForNormalizedPersistence(sequence: number): Promise<void> {
    if (!options.persistenceProvider || sequence <= normalizedSessionsPersistCompletedSequence) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      normalizedSessionsPersistWaiters.push({ sequence, resolve, reject });
    });
  }

  function flushNormalizedSessionsPersistence(sequence: number): void {
    if (!options.persistenceProvider) {
      return;
    }

    normalizedSessionsPersistInFlight = true;
    void options.persistNormalizedSessionsToProvider()
      .then(() => {
        normalizedSessionsPersistCompletedSequence = sequence;
        persistenceConnected = true;
        lastSuccessfulWriteAtIso = new Date().toISOString();
        resolveNormalizedPersistenceWaitersUpTo(sequence);
      })
      .catch((error) => {
        persistenceConnected = false;
        rejectNormalizedPersistenceWaitersUpTo(sequence, error);
        logger.warn("persistence.normalized_sessions_save_failed", { error });
      })
      .finally(() => {
        normalizedSessionsPersistInFlight = false;
        if (normalizedSessionsPersistQueued) {
          normalizedSessionsPersistQueued = false;
          flushNormalizedSessionsPersistence(normalizedSessionsPersistSequence);
        }
      });
  }

  function persistNormalizedSessions(): Promise<void> {
    if (!options.persistenceProvider) {
      return Promise.resolve();
    }

    normalizedSessionsPersistSequence += 1;
    const sequence = normalizedSessionsPersistSequence;
    const waitForSequence = waitForNormalizedPersistence(sequence);

    if (normalizedSessionsPersistInFlight) {
      normalizedSessionsPersistQueued = true;
      return waitForSequence;
    }

    flushNormalizedSessionsPersistence(sequence);
    return waitForSequence;
  }

  function persistSessions(): Promise<void> {
    if (!options.persistenceEnabled) {
      return Promise.resolve();
    }

    mkdirSync(options.dataDirectory, { recursive: true });
    const payload = options.buildSnapshot();
    writeFileSync(options.dataFile, JSON.stringify(payload, null, 2), "utf8");

    if (options.persistenceProvider) {
      void options.persistenceProvider.save(payload).catch((error) => {
        logger.warn("persistence.snapshot_save_failed", { error });
      });
    }

    return persistNormalizedSessions();
  }

  async function flushSnapshotToDb(): Promise<void> {
    if (!options.persistenceProvider) {
      return;
    }
    await options.persistenceProvider.save(options.buildSnapshot());
  }

  function setupRetentionMaintenance(): void {
    if (!options.persistenceProvider) {
      return;
    }

    const retentionDays = Number.isFinite(options.dataRetentionDays) ? Math.floor(options.dataRetentionDays) : 0;
    if (retentionDays <= 0) {
      return;
    }

    const runPrune = () => {
      void options.persistenceProvider?.pruneStaleGames(retentionDays)
        .then((deletedGames) => {
          if (deletedGames > 0) {
            logger.info("persistence.retention_pruned", { deletedGames, retentionDays });
          }
        })
        .catch((error) => {
          logger.warn("persistence.retention_prune_failed", { error, retentionDays });
        });
    };

    runPrune();

    const intervalMinutes = Number.isFinite(options.retentionPruneIntervalMinutes)
      ? Math.max(Math.floor(options.retentionPruneIntervalMinutes), 15)
      : 1440;

    if (retentionTimer) {
      clearInterval(retentionTimer);
    }

    retentionTimer = setInterval(runPrune, intervalMinutes * 60 * 1000);
  }

  async function initializeStore(initOptions: { failOnPersistenceError?: boolean } = {}): Promise<void> {
    if (storeInitialized) {
      return;
    }

    const failOnPersistenceError = Boolean(initOptions.failOnPersistenceError);
    let restoredSnapshot = false;

    if (options.persistenceProvider) {
      try {
        restoredSnapshot = await options.restoreSnapshotFromProvider();
        persistenceConnected = true;
      } catch (error) {
        persistenceConnected = false;
        logger.warn("persistence.snapshot_restore_failed", { error });
        if (failOnPersistenceError) {
          throw new Error("PostgreSQL snapshot restore failed during startup");
        }
      }
    }

    if (!restoredSnapshot && options.persistenceProvider) {
      try {
        restoredSnapshot = await options.restoreNormalizedSessionsFromProvider();
        persistenceConnected = true;
      } catch (error) {
        persistenceConnected = false;
        logger.warn("persistence.normalized_sessions_restore_failed", { error });
        if (failOnPersistenceError) {
          throw new Error("PostgreSQL game session restore failed during startup");
        }
      }
    }

    if (!restoredSnapshot && !options.persistenceProvider) {
      options.restoreSessionsFromFile();
    }

    if (options.persistenceProvider && !restoredSnapshot) {
      try {
        await options.restoreRosterTeamsFromProvider();
        persistenceConnected = true;
      } catch (error) {
        persistenceConnected = false;
        logger.warn("persistence.roster_restore_failed", { error });
        if (failOnPersistenceError) {
          throw new Error("PostgreSQL roster restore failed during startup");
        }
      }
    }

    if (options.persistenceProvider && !restoredSnapshot) {
      try {
        await options.restoreOrgDataFromProvider();
        persistenceConnected = true;
      } catch (error) {
        persistenceConnected = false;
        logger.warn("persistence.org_data_restore_failed", { error });
        if (failOnPersistenceError) {
          throw new Error("PostgreSQL org data restore failed during startup");
        }
      }
    }

    if (options.persistenceProvider && !restoredSnapshot) {
      try {
        await options.restoreWorkspaceDataFromProvider();
        persistenceConnected = true;
      } catch (error) {
        persistenceConnected = false;
        logger.warn("persistence.workspace_data_restore_failed", { error });
        if (failOnPersistenceError) {
          throw new Error("PostgreSQL workspace data restore failed during startup");
        }
      }
    }

    if (options.persistenceProvider && persistenceConnected) {
      lastRestoreAtIso = new Date().toISOString();
    }

    setupRetentionMaintenance();
    storeInitialized = true;
  }

  function getPersistenceStatus(): PersistenceStatus {
    if (options.persistenceProvider) {
      return {
        backend: "postgres",
        durable: true,
        connected: persistenceConnected,
        lastRestoreAtIso,
        lastSuccessfulWriteAtIso,
      };
    }

    if (options.persistenceEnabled) {
      return {
        backend: "file_snapshot",
        durable: false,
        connected: true,
        lastRestoreAtIso: null,
        lastSuccessfulWriteAtIso: null,
        dataFile: options.dataFile,
        warning: "Using local file snapshot persistence. Data durability depends on host-local storage.",
      };
    }

    return {
      backend: "memory",
      durable: false,
      connected: false,
      lastRestoreAtIso: null,
      lastSuccessfulWriteAtIso: null,
      warning: "Persistence is disabled. Data will be lost when the process exits.",
    };
  }

  return {
    persistSessions,
    flushSnapshotToDb,
    initializeStore,
    getPersistenceStatus,
    waitForNormalizedPersistence,
    getLatestNormalizedPersistenceSequence: () => normalizedSessionsPersistSequence,
  };
}
