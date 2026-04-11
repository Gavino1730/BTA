import type { GameEvent } from "@bta/shared-schema";
import { getEventTeamSide, removeEventById, upsertSortedEvent } from "../helpers/events.js";
import { apiKeyHeader, fetchOperatorLinkSnapshot } from "../helpers/network.js";
import { loadAppData, saveAppData } from "../helpers/storage.js";
import type { EventEditContext, FeedEventSelection, Modal } from "../types.js";
import type { GameSetup } from "../types.js";

export interface UseEventEditorInput {
  homeTeamId: string;
  awayTeamId: string;
  gameId: string;
  apiUrl: string | undefined;
  apiSetup: { apiKey?: string; schoolId?: string };
  setModal: (m: Modal | null) => void;
  showInlineNotice: (msg: string, tone: "success" | "warning" | "error" | "info", ms?: number) => void;
  setPendingEvents: React.Dispatch<React.SetStateAction<GameEvent[]>>;
  setSubmittedEvents: React.Dispatch<React.SetStateAction<GameEvent[]>>;
  normalizeEventTeamId: (event: GameEvent) => GameEvent;
}

export function useEventEditor({
  homeTeamId, awayTeamId, gameId, apiUrl, apiSetup,
  setModal, showInlineNotice, setPendingEvents, setSubmittedEvents, normalizeEventTeamId,
}: UseEventEditorInput) {

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

  function authHeadersFor(setup: GameSetup): Record<string, string> {
    return apiKeyHeader({
      apiKey: setup.apiKey ?? apiSetup.apiKey,
      schoolId: setup.schoolId ?? apiSetup.schoolId,
    });
  }

  function buildEditModalForEvent(target: FeedEventSelection): Modal | null {
    const editContext: EventEditContext = {
      eventId: target.event.id,
      originalEvent: target.event,
      pending: target.pending,
    };

    switch (target.event.type) {
      case "shot_attempt": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return {
          kind: "shot",
          teamId: teamSide,
          points: target.event.points,
          made: target.event.made,
          zone: target.event.zone,
          editContext,
        };
      }
      case "free_throw_attempt": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "freeThrow", teamId: teamSide, made: target.event.made, editContext };
      }
      case "rebound": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "stat", stat: target.event.offensive ? "off_reb" : "def_reb", teamId: teamSide, editContext };
      }
      case "turnover":
      case "foul":
      case "steal":
      case "block": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        const stat = target.event.type === "turnover"
          ? "turnover"
          : target.event.type === "foul"
            ? "foul"
            : target.event.type;
        return {
          kind: "stat",
          stat,
          teamId: teamSide,
          foulType: target.event.type === "foul" ? target.event.foulType : undefined,
          turnoverType: target.event.type === "turnover" ? target.event.turnoverType : undefined,
          editContext,
        };
      }
      case "assist": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return {
          kind: "assistEdit",
          teamId: teamSide,
          assistPlayerId: target.event.playerId,
          scorerPlayerId: target.event.scorerPlayerId,
          editContext,
        };
      }
      case "substitution": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "sub1", teamId: teamSide, editContext };
      }
      case "timeout": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "timeoutEdit", teamId: teamSide, timeoutType: target.event.timeoutType, editContext };
      }
      case "possession_start": {
        const teamSide = getEventTeamSide(target.event.possessedByTeamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "possessionEdit", teamId: teamSide, editContext };
      }
      case "period_transition":
        return { kind: "periodTransitionEdit", newPeriod: target.event.newPeriod, editContext };
      default:
        return null;
    }
  }

  async function saveEditedEvent(nextEvent: GameEvent, editContext: EventEditContext): Promise<boolean> {
    const normalizedEvent = normalizeEventTeamId(nextEvent);

    if (editContext.pending) {
      setPendingEvents((current) => upsertSortedEvent(current, normalizedEvent));
      setModal(null);
      showInlineNotice("Event updated.", "success", 2200);
      return true;
    }

    if (!navigator.onLine) {
      showInlineNotice("Reconnect to edit submitted events.", "error");
      return false;
    }

    try {
      let activeSetup = loadAppData().gameSetup;
      const response = await fetch(`${apiUrl}/api/games/${gameId}/events/${editContext.eventId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeadersFor(activeSetup),
          "x-event-sequence": String(editContext.originalEvent.sequence),
        },
        body: JSON.stringify(normalizedEvent),
      });

      let finalResponse = response;
      if (response.status === 401) {
        const recoveredSetup = await recoverSetupFromConnection({ clearStaleToken: true });
        if (recoveredSetup) {
          activeSetup = recoveredSetup;
          finalResponse = await fetch(`${apiUrl}/api/games/${gameId}/events/${editContext.eventId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...authHeadersFor(activeSetup),
              "x-event-sequence": String(editContext.originalEvent.sequence),
            },
            body: JSON.stringify(normalizedEvent),
          });
        }
      }

      if (!finalResponse.ok) {
        if (finalResponse.status === 401) {
          showInlineNotice("Session expired while editing. Re-sync connection code and retry.", "warning", 5000);
          return false;
        }
        const errorText = await finalResponse.text().catch(() => "");
        showInlineNotice(`Could not update event${errorText ? `: ${errorText}` : "."}`, "error");
        return false;
      }

      const payload = await finalResponse.json().catch(() => null) as { event?: GameEvent } | null;
      const savedEvent = normalizeEventTeamId(payload?.event ?? normalizedEvent);
      setSubmittedEvents((current) => upsertSortedEvent(current, savedEvent));
      setPendingEvents((current) => removeEventById(current, savedEvent.id));
      setModal(null);
      showInlineNotice("Event updated.", "success", 2200);
      return true;
    } catch {
      showInlineNotice("Could not reach the live server to update this event.", "error");
      return false;
    }
  }

  async function deleteEventRecord(target: FeedEventSelection): Promise<boolean> {
    if (target.pending) {
      setPendingEvents((current) => removeEventById(current, target.event.id));
      setModal(null);
      showInlineNotice("Event deleted.", "success", 2200);
      return true;
    }

    if (!navigator.onLine) {
      showInlineNotice("Reconnect to delete submitted events.", "error");
      return false;
    }

    try {
      let activeSetup = loadAppData().gameSetup;
      let response = await fetch(`${apiUrl}/api/games/${gameId}/events/${target.event.id}`, {
        method: "DELETE",
        headers: {
          ...authHeadersFor(activeSetup),
          "x-event-sequence": String(target.event.sequence),
        },
      });

      if (response.status === 401) {
        const recoveredSetup = await recoverSetupFromConnection({ clearStaleToken: true });
        if (recoveredSetup) {
          activeSetup = recoveredSetup;
          response = await fetch(`${apiUrl}/api/games/${gameId}/events/${target.event.id}`, {
            method: "DELETE",
            headers: {
              ...authHeadersFor(activeSetup),
              "x-event-sequence": String(target.event.sequence),
            },
          });
        }
      }

      if (!response.ok) {
        if (response.status === 401) {
          showInlineNotice("Session expired while deleting. Re-sync connection code and retry.", "warning", 5000);
          return false;
        }
        const errorText = await response.text().catch(() => "");
        showInlineNotice(`Could not delete event${errorText ? `: ${errorText}` : "."}`, "error");
        return false;
      }

      setSubmittedEvents((current) => removeEventById(current, target.event.id));
      setPendingEvents((current) => removeEventById(current, target.event.id));
      setModal(null);
      showInlineNotice("Event deleted.", "success", 2200);
      return true;
    } catch {
      showInlineNotice("Could not reach the live server to delete this event.", "error");
      return false;
    }
  }

  function openFeedEventEditor(target: FeedEventSelection) {
    const nextModal = buildEditModalForEvent(target);
    if (!nextModal) {
      showInlineNotice("That event cannot be edited from the feed yet.", "warning", 3200);
      return;
    }
    setModal(nextModal);
  }

  function getModalEditContext(activeModal: Modal | null): EventEditContext | null {
    if (!activeModal) return null;
    switch (activeModal.kind) {
      case "shot":
      case "freeThrow":
      case "stat":
      case "sub1":
      case "sub2":
        return activeModal.editContext ?? null;
      case "assistEdit":
      case "timeoutEdit":
      case "possessionEdit":
      case "periodTransitionEdit":
        return activeModal.editContext;
      default:
        return null;
    }
  }

  return { buildEditModalForEvent, saveEditedEvent, deleteEventRecord, openFeedEventEditor, getModalEditContext };
}
