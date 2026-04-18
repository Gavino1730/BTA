import type { GameEvent } from "@bta/shared-schema";
import type { GameSetup } from "../types.js";
import {
  apiHeaders,
  apiKeyHeader,
  fetchOperatorLinkSnapshot,
  mergeCoachLinkSnapshot,
} from "./network.js";
import {
  appendPendingConflicts,
  loadAppData,
  saveAppData,
  type PendingConflictRecord,
} from "./storage.js";

export function summarizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error ?? "unknown error");
}

export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canCallTenantScopedEventApi(
  gamePhase: string,
  gameId: string,
  gameSetup: GameSetup,
  overrideSetup?: GameSetup,
  overrideGameId?: string,
): boolean {
  const setup = overrideSetup ?? gameSetup;
  const targetGameId = overrideGameId ?? gameId;
  const normalizedGameId = targetGameId.trim();
  const hasTenantScope = Boolean(setup.schoolId?.trim());
  const hasApiUrl = Boolean(setup.apiUrl?.trim());
  const isPlaceholderPreGame = gamePhase === "pre-game"
    && normalizedGameId === "game-1"
    && !setup.syncedConnectionId?.trim();
  return Boolean(normalizedGameId) && hasApiUrl && hasTenantScope && !isPlaceholderPreGame;
}

export async function recoverSetupFromConnection(
  options?: { clearStaleToken?: boolean },
): Promise<GameSetup | null> {
  const latest = loadAppData();
  const baseSetup = options?.clearStaleToken
    ? { ...latest.gameSetup, apiKey: undefined }
    : latest.gameSetup;

  if (options?.clearStaleToken && baseSetup.apiKey !== latest.gameSetup.apiKey) {
    saveAppData({ ...latest, gameSetup: baseSetup });
  }

  const snapshot = await fetchOperatorLinkSnapshot(baseSetup).catch(() => null);
  if (!snapshot) {
    return options?.clearStaleToken ? baseSetup : null;
  }

  const nextAppData = mergeCoachLinkSnapshot({ ...latest, gameSetup: baseSetup }, snapshot.payload);
  const nextSetup: GameSetup = nextAppData.gameSetup;

  if (JSON.stringify(nextSetup) !== JSON.stringify(latest.gameSetup)) {
    saveAppData(nextAppData);
  }
  return nextSetup;
}

export interface ReconcileResult {
  eventsToSubmit: GameEvent[];
  duplicateIds: Set<string>;
  conflictIds: Set<string>;
  conflictRecords: PendingConflictRecord[];
}

export async function reconcilePendingWithServer(
  queue: GameEvent[],
  deps: {
    gameId: string;
    gamePhase: string;
    gameSetup: GameSetup;
    normalizeEvent: (event: GameEvent) => GameEvent;
    onRemoveDuplicates: (ids: Set<string>) => void;
    onRecordConflicts: (ids: Set<string>, records: PendingConflictRecord[]) => void;
    showConflictNotice: (count: number) => void;
    showDuplicateNotice: (count: number) => void;
    lastConflictNoticeAtMs: { current: number };
  },
): Promise<GameEvent[]> {
  const {
    gameId, gamePhase, gameSetup, normalizeEvent,
    onRemoveDuplicates, onRecordConflicts,
    showConflictNotice, showDuplicateNotice, lastConflictNoticeAtMs,
  } = deps;

  if (queue.length === 0 || !canCallTenantScopedEventApi(gamePhase, gameId, gameSetup)) {
    return queue;
  }

  try {
    let activeSetup = loadAppData().gameSetup;
    let res = await fetch(`${activeSetup.apiUrl}/api/games/${gameId}/events`, apiHeaders(activeSetup));
    if (res.status === 401) {
      const recoveredSetup = await recoverSetupFromConnection({ clearStaleToken: true });
      if (recoveredSetup) {
        activeSetup = recoveredSetup;
        res = await fetch(`${activeSetup.apiUrl}/api/games/${gameId}/events`, apiHeaders(activeSetup));
      }
    }

    if (!res.ok) {
      return queue;
    }

    const remoteEvents = ((await res.json()) as GameEvent[]).map((event) => normalizeEvent(event));
    const remoteById = new Map(remoteEvents.map((event) => [event.id, event]));

    const duplicateIds = new Set<string>();
    const conflictIds = new Set<string>();
    const conflictRecords: PendingConflictRecord[] = [];
    const eventsToSubmit: GameEvent[] = [];

    for (const localEvent of queue) {
      const normalizedLocalEvent = normalizeEvent(localEvent);
      const remoteEvent = remoteById.get(normalizedLocalEvent.id);
      if (!remoteEvent) {
        eventsToSubmit.push(normalizedLocalEvent);
        continue;
      }
      if (stableSerialize(remoteEvent) === stableSerialize(normalizedLocalEvent)) {
        duplicateIds.add(normalizedLocalEvent.id);
        continue;
      }
      conflictIds.add(normalizedLocalEvent.id);
      conflictRecords.push({
        localEvent: normalizedLocalEvent,
        remoteEvent,
        detectedAtIso: new Date().toISOString(),
        reason: "payload_mismatch",
      });
    }

    if (duplicateIds.size > 0) {
      onRemoveDuplicates(duplicateIds);
      showDuplicateNotice(duplicateIds.size);
    }

    if (conflictIds.size > 0) {
      appendPendingConflicts(gameId, conflictRecords);
      onRecordConflicts(conflictIds, conflictRecords);

      const now = Date.now();
      if (now - lastConflictNoticeAtMs.current > 8000) {
        showConflictNotice(conflictIds.size);
        lastConflictNoticeAtMs.current = now;
      }
    }

    return eventsToSubmit;
  } catch (error) {
    console.warn("[ipad-operator] reconcilePendingWithServer failed", summarizeError(error));
    return queue;
  }
}
