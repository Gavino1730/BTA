import { useEffect, useRef, useState } from "react";
import type { GameEvent } from "@bta/shared-schema";
import type { GameSetup } from "../types.js";
import {
  apiHeaders,
  apiKeyHeader,
} from "../helpers/network.js";
import {
  loadPending,
  loadSeq,
  savePending,
  saveSeq,
} from "../helpers/storage.js";

export interface EventQueueDeps {
  gameId: string;
  gamePhase: string;
  gameSetup: GameSetup;
  socketRef: React.RefObject<ReturnType<typeof import("socket.io-client").io> | null>;
  normalizeEventTeamId: (event: GameEvent) => GameEvent;
  showInlineNotice: (message: string, tone?: "info" | "success" | "warning" | "error", timeoutMs?: number) => void;
  triggerFeedback: (tone: "event" | "undo" | "warning", vibrateMs?: number) => void;
  /** Called to ensure the game exists on the server before event submission. */
  ensureRealtimeGameExists: (gid: string) => Promise<boolean>;
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
    ensureRealtimeGameExists,
    onHydrateState,
  } = deps;

  const [pendingEvents, setPendingEvents] = useState<GameEvent[]>(() => loadPending(gameId));
  const [submittedEvents, setSubmittedEvents] = useState<GameEvent[]>([]);
  const [sequence, setSequence] = useState(() => loadSeq(gameId));

  const sequenceRef = useRef(sequence);
  const isFlushingRef = useRef(false);
  const flushBackoffUntilRef = useRef(0);

  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);

  // --- Submit a single event to the API ---
  async function submitEvent(event: GameEvent): Promise<boolean> {
    const normalizedEvent = normalizeEventTeamId(event);
    try {
      const submitWithCurrentPayload = () => fetch(`${gameSetup.apiUrl}/api/games/${gameId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(gameSetup) },
        body: JSON.stringify(normalizedEvent),
      });

      let res = await submitWithCurrentPayload();
      if (!res.ok) {
        const firstErrorBody = (await res.text().catch(() => "")).trim();
        const missingGame = res.status === 404 || /game not found/i.test(firstErrorBody);
        if (missingGame && await ensureRealtimeGameExists(gameId)) {
          res = await submitWithCurrentPayload();
        }
      }

      if (!res.ok) {
        const responseBody = (await res.text().catch(() => "")).trim();
        const details = responseBody ? ` ${responseBody}` : "";
        const errorMsg = `Submit failed (${res.status}).${details}`;
        showInlineNotice(errorMsg, "error", 10000);
        return false;
      }
      setSubmittedEvents(cur => [...cur, normalizedEvent].sort((a, b) => a.sequence - b.sequence));
      setPendingEvents(cur => cur.filter(p => p.id !== normalizedEvent.id));
      return true;
    } catch {
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
  async function flushQueue() {
    if (isFlushingRef.current) return;
    if (Date.now() < flushBackoffUntilRef.current) return;
    if (!navigator.onLine || pendingEvents.length === 0) return;
    isFlushingRef.current = true;
    let successCount = 0;
    let serverErrorCount = 0;
    try {
      for (const evt of pendingEvents) {
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
        if (res.ok) setSubmittedEvents(((await res.json()) as GameEvent[]).map(normalizeEventTeamId));
      } catch { /* empty */ }
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
    const eventWithReservedSequence = normalizeEventTeamId({ ...event, sequence: reservedSequence });
    setPendingEvents(cur => [...cur, eventWithReservedSequence].sort((a, b) => a.sequence - b.sequence));
    triggerFeedback("event", 30);
    await submitEvent(eventWithReservedSequence);
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
      const res = await fetch(`${gameSetup.apiUrl}/api/games/${gameId}/events/${last.id}`, {
        method: "DELETE",
        headers: apiKeyHeader(gameSetup),
      });
      if (res.ok) {
        setSubmittedEvents(cur => cur.filter(e => e.id !== last.id));
      } else {
        showInlineNotice("Could not remove event from server. It may sync on reconnect.", "warning", 4000);
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
    const localPending = loadPending(gameId).map(normalizeEventTeamId);
    const localSeq = loadSeq(gameId);
    setPendingEvents(localPending);
    setSequence(localSeq);
    async function hydrate() {
      try {
        const res = await fetch(`${gameSetup.apiUrl}/api/games/${gameId}/events`, apiHeaders(gameSetup));
        if (!res.ok) return;
        const events = ((await res.json()) as GameEvent[]).map(normalizeEventTeamId);
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
          onHydrateState?.(statePayload);
        }
      } catch {
        // Hydration failed (offline) - keep local pending queue intact
      }
    }
    void hydrate();
  }, [gameId]);

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
