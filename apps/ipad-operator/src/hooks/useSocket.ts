import { useEffect } from "react";
import { io } from "socket.io-client";
import { type RosterTeam } from "@bta/shared-schema";
import type { AppData, GameSetup, OperatorAlert, OperatorLinkResponse } from "../types.js";
import {
  apiKeyHeader,
  mergeCoachLinkSnapshot,
  normalizeConnectionId,
} from "../helpers/network.js";
import { saveAppData } from "../helpers/storage.js";
import { convertRosterTeamToAppTeam } from "../roster-sync.js";
import { DEFAULT_SCHOOL_ID } from "../constants.js";

export interface SocketDeps {
  gameId: string;
  gamePhase: string;
  gameSetup: GameSetup;
  socketRef: React.MutableRefObject<ReturnType<typeof io> | null>;
  setAppData: React.Dispatch<React.SetStateAction<AppData>>;
  setLiveAlerts: React.Dispatch<React.SetStateAction<OperatorAlert[]>>;
  setDismissedAlertIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setConnectionSyncStatus: (status: string) => void;
  persistPhase: (phase: "pre-game" | "live" | "post-game") => void;
  showInlineNotice: (
    message: string,
    tone?: "info" | "success" | "warning" | "error",
    timeoutMs?: number,
  ) => void;
}

/**
 * Manages the Socket.IO connection lifecycle: connect, register, event handlers,
 * heartbeat, visibility-change reconnection, and cleanup.
 */
export function useSocket({
  gameId,
  gamePhase,
  gameSetup,
  socketRef,
  setAppData,
  setLiveAlerts,
  setDismissedAlertIds,
  setConnectionSyncStatus,
  persistPhase,
  showInlineNotice,
}: SocketDeps): void {
  useEffect(() => {
    if (gamePhase !== "live") {
      return;
    }

    const connectionId = normalizeConnectionId(gameSetup.connectionId);
    if (!connectionId) {
      return;
    }
    const startingLineup = Array.isArray(gameSetup.startingLineup)
      ? [...new Set(gameSetup.startingLineup.map((id) => String(id).trim()).filter(Boolean))].slice(0, 5)
      : [];
    const trackedTeamId = gameSetup.vcSide === "away"
      ? (gameSetup.myTeamId || "team-away")
      : (gameSetup.myTeamId || "team-home");
    const startingLineupByTeam = startingLineup.length > 0
      ? { [trackedTeamId]: startingLineup }
      : undefined;
    const payload = { connectionId, gameId, startingLineupByTeam };
    const socketAuth: Record<string, string> = { schoolId: gameSetup.schoolId?.trim() || DEFAULT_SCHOOL_ID };
    if (gameSetup.apiKey) {
      if (gameSetup.apiKey.startsWith("bta.")) {
        socketAuth.token = gameSetup.apiKey;
      } else {
        socketAuth.apiKey = gameSetup.apiKey;
      }
    }
    const socket = io(gameSetup.apiUrl, {
      auth: socketAuth,
      extraHeaders: apiKeyHeader(gameSetup),
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    const register = () => {
      socket.emit("operator:register", payload);
    };

    socket.on("connect", register);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !socket.connected) {
        socket.connect();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    socket.on("connect_error", (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Connection error";
      showInlineNotice(`Server connection failed: ${msg}. Retrying...`, "error");
    });

    socket.on("disconnect", (reason: string) => {
      if (reason !== "io client namespace disconnect") {
        showInlineNotice(`Disconnected from server (${reason}). Check your connection.`, "warning");
      }
    });

    socket.on("error", (error: unknown) => {
      const msg = error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as Record<string, unknown>).message)
          : typeof error === "object" && error !== null && "error" in error
            ? String((error as Record<string, unknown>).error)
            : String(error);
      showInlineNotice(`Server error: ${msg}`, "error");
    });

    socket.on("game:insights", (insightsPayload: unknown) => {
      if (!Array.isArray(insightsPayload)) return;
      const alerts: OperatorAlert[] = (insightsPayload as Array<Record<string, unknown>>)
        .filter((i) => i.priority === "urgent" || i.priority === "important")
        .map((i) => ({
          id: String(i.id ?? ""),
          type: String(i.type ?? ""),
          priority: (i.priority === "urgent" ? "urgent" : "important") as "urgent" | "important",
          message: String(i.message ?? ""),
          explanation: String(i.explanation ?? ""),
        }))
        .filter((i) => i.id && i.message);
      if (alerts.length > 0) {
        setDismissedAlertIds(new Set());
        setLiveAlerts(alerts);
      }
    });

    socket.on("game:state", (statePayload: unknown) => {
      if (!statePayload || typeof statePayload !== "object") return;
      const serverState = statePayload as { opponentName?: string; homeTeamId?: string; awayTeamId?: string };
      setAppData((current) => {
        let changed = false;
        const nextSetup = { ...current.gameSetup };
        if (serverState.opponentName && serverState.opponentName !== current.gameSetup.opponent) {
          nextSetup.opponent = serverState.opponentName;
          changed = true;
        }
        if (current.gameSetup.myTeamId) {
          if (serverState.awayTeamId === current.gameSetup.myTeamId && current.gameSetup.vcSide !== "away") {
            nextSetup.vcSide = "away";
            changed = true;
          } else if (serverState.homeTeamId === current.gameSetup.myTeamId && current.gameSetup.vcSide !== "home") {
            nextSetup.vcSide = "home";
            changed = true;
          }
        }
        if (!changed) return current;
        const next = { ...current, gameSetup: nextSetup };
        saveAppData(next);
        return next;
      });
    });

    socket.on("game:deleted", () => {
      if (gamePhase === "live") {
        persistPhase("post-game");
      }
    });

    socket.on("operator:link:updated", (linkPayload: unknown) => {
      if (!linkPayload || typeof linkPayload !== "object") {
        return;
      }
      const snapshot = linkPayload as OperatorLinkResponse;
      if (normalizeConnectionId(snapshot.connectionId) !== connectionId) {
        return;
      }

      setAppData((current) => {
        const next = mergeCoachLinkSnapshot(current, snapshot);
        saveAppData(next);
        return next;
      });
      setConnectionSyncStatus("Coach updates received. The latest team and roster info are saved locally on this iPad.");
    });

    socket.on("roster:teams", (teamsPayload: unknown) => {
      if (!Array.isArray(teamsPayload)) {
        return;
      }

      const nextTeams = (teamsPayload as RosterTeam[]).map(convertRosterTeamToAppTeam);
      setAppData((current) => {
        const hasSelectedTeam = nextTeams.some((team) => team.id === current.gameSetup.myTeamId);
        const nextMyTeamId = hasSelectedTeam ? current.gameSetup.myTeamId : (nextTeams[0]?.id ?? "");
        const allowedPlayerIds = new Set((nextTeams.find((team) => team.id === nextMyTeamId)?.players ?? []).map((player) => player.id));
        const startingLineup = Array.isArray(current.gameSetup.startingLineup)
          ? current.gameSetup.startingLineup.filter((playerId) => allowedPlayerIds.has(playerId))
          : [];
        const next = {
          ...current,
          teams: nextTeams,
          gameSetup: { ...current.gameSetup, myTeamId: nextMyTeamId, startingLineup },
        };
        saveAppData(next);
        return next;
      });
    });

    register();

    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit("operator:heartbeat", payload);
      }
    }, 10000);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      socket.off("connect", register);
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("error");
      socket.off("game:state");
      socket.off("game:insights");
      socket.off("game:deleted");
      socket.off("operator:link:updated");
      socket.off("roster:teams");
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [gameSetup.apiKey, gameSetup.apiUrl, gameSetup.connectionId, gameId, gamePhase]);
}
