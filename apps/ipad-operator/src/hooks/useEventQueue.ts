import { useEffect, useRef, useState } from "react";
import type { GameEvent } from "@bta/shared-schema";
import type { GameSetup } from "../types.js";
import {
  apiHeaders,
  apiKeyHeader,
  fetchOperatorLinkSnapshot,
} from "../helpers/network.js";
import { buildRealtimeGameRegistrationPayload } from "./useGameFlow.js";
import { loadAppData, saveAppData } from "../helpers/storage.js";
import {
  consumePendingIntegrityIssue,
  loadPending,
  loadSeq,
  savePending,
  saveSeq,
} from "../helpers/storage.js";

function summarizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error ?? "unknown error");
}

export interface EventQueueDeps {
  gameId: string;
  gamePhase: string;
  gameSetup: GameSetup;
  socketRef: React.RefObject<ReturnType<typeof import("socket.io-client").io> | null>;
  normalizeEventTeamId: (event: GameEvent) => GameEvent;
  showInlineNotice: (message: string, tone?: "info" | "success" | "warning" | "error", timeoutMs?: number) => void;
  triggerFeedback: (tone: "event" | "undo" | "warning", vibrateMs?: number) => void;
  preGameNotes: string;
  /** Called to sync lineup from server state during hydration. */
  onHydrateState?: (statePayload: {
    events?: unknown[];
    activeLineupsByTeam?: Record<string, string[]>;
  }) => void;
}

/**
 * Manages the offline-first event queue: pending events, submitted events,
 * sequence counter, submit/flush/undo operations, and periodic retry.
 */
export function useEventQueue(deps: EventQueueDeps) {
  const {
    gameId,
    gamePhase,
    gameSetup,
    socketRef,
    normalizeEventTeamId,
    showInlineNotice,
    triggerFeedback,
    preGameNotes,
    onHydrateState,
  } = deps;

  function canCallTenantScopedEventApi(setup: GameSetup = gameSetup, targetGameId: string = gameId): boolean {
    const normalizedGameId = targetGameId.trim();
    const hasTenantScope = Boolean(setup.schoolId?.trim());
    const hasApiUrl = Boolean(setup.apiUrl?.trim());
    const isPlaceholderPreGame = gamePhase === "pre-game"
      && normalizedGameId === "game-1"
      && !setup.syncedConnectionId?.trim();

    return Boolean(normalizedGameId) && hasApiUrl && hasTenantScope && !isPlaceholderPreGame;
  }

  async function recoverSetupFromConnection(options?: { clearStaleToken?: boolean }): Promise<GameSetup | null> {
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

    const payload = snapshot.payload;
    const nextSetup: GameSetup = {
      ...baseSetup,
      connectionId: snapshot.connectionId,
      syncedConnectionId: snapshot.connectionId,
      schoolId: payload.schoolId?.trim() || baseSetup.schoolId,
      apiKey: payload.operatorToken ?? baseSetup.apiKey,
    };

    if (nextSetup.apiKey !== latest.gameSetup.apiKey || nextSetup.schoolId !== latest.gameSetup.schoolId) {
      saveAppData({ ...latest, gameSetup: nextSetup });
    }
    return nextSetup;
  }

  async function ensureRealtimeGameExists(gid: string): Promise<boolean> {
    const latest = loadAppData();
    const apiUrl = latest.gameSetup.apiUrl?.trim();
    if (!apiUrl || !gid || !canCallTenantScopedEventApi(latest.gameSetup, gid)) return false;
    try {
      let activeSetup = latest.gameSetup;
      let res = await fetch(`${apiUrl}/api/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(activeSetup) },
        body: JSON.stringify(buildRealtimeGameRegistrationPayload(activeSetup, gid, preGameNotes)),
      });
      if (res.status === 401) {
        const recoveredSetup = await recoverSetupFromConnection({ clearStaleToken: true });
        if (recoveredSetup) {
          activeSetup = recoveredSetup;
          res = await fetch(`${apiUrl}/api/games`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...apiKeyHeader(activeSetup) },
            body: JSON.stringify(buildRealtimeGameRegistrationPayload(activeSetup, gid, preGameNotes)),
          });
        }
      }
      return res.ok;
    } catch (error) {
      console.warn("[ipad-operator] ensureRealtimeGameExists failed", summarizeError(error));
      return false;
    }
  }

  const [pendingEvents, setPendingEvents] = useState<GameEvent[]>(() => loadPending(gameId));
  const [submittedEvents, setSubmittedEvents] = useState<GameEvent[]>([]);
  const [sequence, setSequence] = useState(() => loadSeq(gameId));

  const sequenceRef = useRef(sequence);
  const normalizeEventTeamIdRef = useRef(normalizeEventTeamId);
  const onHydrateStateRef = useRef(onHydrateState);
  const isFlushingRef = useRef(false);
  const flushBackoffUntilRef = useRef(0);
  const lastConflictNoticeAtMsRef = useRef(0);

  function stableSerialize(value: unknown): string {
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

  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);
  useEffect(() => { normalizeEventTeamIdRef.current = normalizeEventTeamId; }, [normalizeEventTeamId]);
  useEffect(() => { onHydrateStateRef.current = onHydrateState; }, [onHydrateState]);

  // --- Submit a single event to the API ---
  async function submitEvent(event: GameEvent): Promise<boolean> {
    const normalizedEvent = normalizeEventTeamIdRef.current(event);
    if (!canCallTenantScopedEventApi()) {
      return false;
    }
    try {
      let activeSetup = loadAppData().gameSetup;
      const submitWithCurrentPayload = () => fetch(`${activeSetup.apiUrl}/api/games/${gameId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(activeSetup) },
        body: JSON.stringify(normalizedEvent),
      });

      let res = await submitWithCurrentPayload();
      if (res.status === 401) {
        const recoveredSetup = await recoverSetupFromConnection({ clearStaleToken: true });
        if (recoveredSetup) {
          activeSetup = recoveredSetup;
          res = await submitWithCurrentPayload();
        }
      }

      if (!res.ok) {
        const firstErrorBody = (await res.text().catch(() => "")).trim();
        const missingGame = res.status === 404 || /game not found/i.test(firstErrorBody);
        if (missingGame && await ensureRealtimeGameExists(gameId)) {
          res = await submitWithCurrentPayload();
        }
      }

      if (!res.ok) {
        const responseBody = (await res.text().catch(() => "")).trim();
        if (res.status === 401) {
          showInlineNotice(
            "Live auth expired. Connection token was refreshed automatically; tap Reconnect & Resubmit to retry.",
            "warning",
            8000,
          );
          return false;
        }
        const details = responseBody ? ` ${responseBody}` : "";
        const errorMsg = `Submit failed (${res.status}).${details}`;
        showInlineNotice(errorMsg, "error", 10000);
        return false;
      }
      setSubmittedEvents(cur => [...cur, normalizedEvent].sort((a, b) => a.sequence - b.sequence));
      setPendingEvents(cur => cur.filter(p => p.id !== normalizedEvent.id));
      return true;
    } catch (error) {
      console.warn("[ipad-operator] submitEvent failed", summarizeError(error));
      const errorMsg = "Network error. Event queued offline - will sync when reconnected.";
      showInlineNotice(errorMsg, "warning", 10000);
      setPendingEvents(cur => {
        if (cur.some(p => p.id === normalizedEvent.id)) return cur;
        return [...cur, normalizedEvent].sort((a, b) => a.sequence - b.sequence);
      });
      return false;
    }
  }

  // --- Flush entire pending queue ---
  async function reconcilePendingWithServer(queue: GameEvent[]): Promise<GameEvent[]> {
    if (queue.length === 0 || !canCallTenantScopedEventApi()) {
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

      const remoteEvents = ((await res.json()) as GameEvent[]).map((event) => normalizeEventTeamIdRef.current(event));
      const remoteById = new Map(remoteEvents.map((event) => [event.id, event]));

      const duplicateIds = new Set<string>();
      const conflictIds = new Set<string>();
      const eventsToSubmit: GameEvent[] = [];

      for (const localEvent of queue) {
        const normalizedLocalEvent = normalizeEventTeamIdRef.current(localEvent);
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
      }

      if (duplicateIds.size > 0) {
        setPendingEvents((current) => current.filter((event) => !duplicateIds.has(event.id)));
        showInlineNotice(
          `${duplicateIds.size} queued event${duplicateIds.size === 1 ? " was" : "s were"} already synced. Removed local duplicate${duplicateIds.size === 1 ? "" : "s"}.`,
          "info",
          4500,
        );
      }

      if (conflictIds.size > 0) {
        const now = Date.now();
        if (now - lastConflictNoticeAtMsRef.current > 8000) {
          showInlineNotice(
            `${conflictIds.size} queued event${conflictIds.size === 1 ? "" : "s"} conflict with server state. Review/edit recent events before retrying full sync.`,
            "warning",
            9000,
          );
          lastConflictNoticeAtMsRef.current = now;
        }
      }

      return eventsToSubmit;
    } catch (error) {
      console.warn("[ipad-operator] reconcilePendingWithServer failed", summarizeError(error));
      return queue;
    }
  }

  async function flushQueue() {
    if (isFlushingRef.current) return;
    if (Date.now() < flushBackoffUntilRef.current) return;
    if (!navigator.onLine || pendingEvents.length === 0) return;
    if (!canCallTenantScopedEventApi()) return;

    const eventsToFlush = await reconcilePendingWithServer(pendingEvents);
    if (eventsToFlush.length === 0) {
      return;
    }

    isFlushingRef.current = true;
    let successCount = 0;
    let serverErrorCount = 0;
    try {
      for (const evt of eventsToFlush) {
        const ok = await submitEvent(evt);
        if (ok) {
          successCount++;
        } else {
          serverErrorCount++;
        }
      }
    } finally {
      isFlushingRef.current = false;
    }
    if (serverErrorCount > 0 && successCount === 0) {
      flushBackoffUntilRef.current = Date.now() + 30_000;
    }
    if (successCount > 0) {
      flushBackoffUntilRef.current = 0;
      try {
        const res = await fetch(`${gameSetup.apiUrl}/api/games/${gameId}/events`, apiHeaders(gameSetup));
        if (res.ok) setSubmittedEvents(((await res.json()) as GameEvent[]).map((event) => normalizeEventTeamIdRef.current(event)));
      } catch (error) {
        console.warn("[ipad-operator] flushQueue events refresh failed", summarizeError(error));
      }
      showInlineNotice(`${successCount} queued event${successCount !== 1 ? "s" : ""} synced`, "success", 2500);
    }
  }

  // --- Reconnect socket + flush ---
  async function reconnectAndResubmit() {
    socketRef.current?.connect();
    if (!navigator.onLine) {
      showInlineNotice("Still offline. Check Wi-Fi and tap again to retry.", "warning", 3200);
      return;
    }
    if (!canCallTenantScopedEventApi()) {
      showInlineNotice("Waiting for school sync before submitting events.", "info", 2200);
      return;
    }
    if (pendingEvents.length === 0) {
      showInlineNotice("Connection looks good. No pending events to resubmit.", "info", 2200);
      return;
    }
    await flushQueue();
  }

  // --- Post a new event (optimistic + background submit) ---
  async function postEvent(event: GameEvent) {
    const reservedSequence = sequenceRef.current;
    const next = reservedSequence + 1;
    sequenceRef.current = next;
    setSequence(next);
    saveSeq(gameId, next);
    const normalizedWithSequence = normalizeEventTeamIdRef.current({ ...event, sequence: reservedSequence });
    setPendingEvents(cur => [...cur, normalizedWithSequence].sort((a, b) => a.sequence - b.sequence));
    triggerFeedback("event", 30);
    if (!canCallTenantScopedEventApi()) {
      showInlineNotice("Event saved locally. It will sync after school setup is connected.", "info", 2500);
      return;
    }
    await submitEvent(normalizedWithSequence);
  }

  // --- Undo the most recent event ---
  async function undoLast() {
    const lastSubmitted = [...submittedEvents].sort((a, b) => b.sequence - a.sequence)[0];
    const lastPending = [...pendingEvents].sort((a, b) => b.sequence - a.sequence)[0];
    const last = !lastSubmitted ? lastPending
      : !lastPending ? lastSubmitted
      : lastPending.sequence > lastSubmitted.sequence ? lastPending : lastSubmitted;
    if (!last) {
      showInlineNotice("Nothing to undo.", "info", 2000);
      return;
    }
    setPendingEvents(cur => cur.filter(e => e.id !== last.id));
    if (submittedEvents.some(e => e.id === last.id)) {
      if (!canCallTenantScopedEventApi()) {
        showInlineNotice("Removed locally. Server sync will resume after school setup is connected.", "warning", 3000);
        return;
      }
      const res = await fetch(`${gameSetup.apiUrl}/api/games/${gameId}/events/${last.id}`, {
        method: "DELETE",
        headers: apiKeyHeader(gameSetup),
      });
      if (res.ok) {
        setSubmittedEvents(cur => cur.filter(e => e.id !== last.id));
      } else {
        if (res.status === 401) {
          await recoverSetupFromConnection({ clearStaleToken: true });
          showInlineNotice("Live auth expired while undoing. Reconnect & Resubmit to sync removals.", "warning", 5000);
        } else {
          showInlineNotice("Could not remove event from server. It may sync on reconnect.", "warning", 4000);
        }
      }
    }
    triggerFeedback("undo", 20);
    showInlineNotice("Last event undone.", "success", 2500);
  }

  // --- Reset state for a new game ---
  function resetTimeline(newGameId: string) {
    setPendingEvents([]);
    setSubmittedEvents([]);
    setSequence(1);
    sequenceRef.current = 1;
    savePending(newGameId, []);
    saveSeq(newGameId, 1);
  }

  // --- Hydrate events from server on mount / gameId change ---
  useEffect(() => {
    const localPending = loadPending(gameId).map((event) => normalizeEventTeamIdRef.current(event));
    const localSeq = loadSeq(gameId);
    const integrityNotice = consumePendingIntegrityIssue(gameId);
    setPendingEvents(localPending);
    setSequence(localSeq);
    if (integrityNotice) {
      showInlineNotice(`${integrityNotice} Reconnect and resubmit after confirming setup.`, "warning", 8000);
    }

    if (!canCallTenantScopedEventApi()) {
      setSubmittedEvents([]);
      return;
    }

    async function hydrate() {
      try {
        const res = await fetch(`${gameSetup.apiUrl}/api/games/${gameId}/events`, apiHeaders(gameSetup));
        if (!res.ok) return;
        const events = ((await res.json()) as GameEvent[]).map((event) => normalizeEventTeamIdRef.current(event));
        setSubmittedEvents(events);
        const highest = events.reduce((m, e) => Math.max(m, e.sequence), 0);
        const next = Math.max(localSeq, highest + 1);
        setSequence(next);
        saveSeq(gameId, next);

        const stateRes = await fetch(`${gameSetup.apiUrl}/api/games/${gameId}/state`, apiHeaders(gameSetup));
        if (stateRes.ok) {
          const statePayload = await stateRes.json() as {
            events?: unknown[];
            activeLineupsByTeam?: Record<string, string[]>;
          };
          onHydrateStateRef.current?.(statePayload);
        }
      } catch (error) {
        console.warn("[ipad-operator] events hydration failed", summarizeError(error));
        // Hydration failed (offline) - keep local pending queue intact
      }
    }
    void hydrate();
  }, [gameId, gamePhase, gameSetup.apiUrl, gameSetup.schoolId, gameSetup.syncedConnectionId]);

  // --- Persist pending / sequence to localStorage ---
  useEffect(() => { savePending(gameId, pendingEvents); }, [gameId, pendingEvents]);
  useEffect(() => { saveSeq(gameId, sequence); }, [gameId, sequence]);

  // --- Flush when coming back online ---
  useEffect(() => {
    function handleOnline() { void flushQueue(); }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // --- Periodic flush retry (15 s) ---
  useEffect(() => {
    if (gamePhase !== "live") return;
    const interval = setInterval(() => {
      if (navigator.onLine && pendingEvents.length > 0 && !isFlushingRef.current && Date.now() >= flushBackoffUntilRef.current) {
        void flushQueue();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [gamePhase, pendingEvents.length]);

  return {
    pendingEvents,
    setPendingEvents,
    submittedEvents,
    setSubmittedEvents,
    sequence,
    setSequence,
    postEvent,
    undoLast,
    flushQueue,
    reconnectAndResubmit,
    resetTimeline,
  };
}
