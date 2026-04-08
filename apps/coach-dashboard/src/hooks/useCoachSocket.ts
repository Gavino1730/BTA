import { type MutableRefObject, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { apiBase, API_KEY, apiKeyHeader, readStoredAuthSession, resolveActiveSchoolId } from "../platform.js";
import {
  type GameState,
  type Insight,
  type RosterTeam,
  mergeGameState,
  normalizeRosterTeams,
} from "../helpers/index.js";

interface PresenceStatus {
  deviceId: string | null;
  connectionId?: string | null;
  online: boolean;
  gameId: string | null;
  lastSeenIso: string | null;
  operatorCount?: number;
  operators?: Array<{
    deviceId: string | null;
    gameId: string | null;
    lastSeenIso: string | null;
    connectedAtIso: string | null;
  }>;
}

export interface UseCoachSocketOptions {
  connectionId: string;
  gameIdRef: MutableRefObject<string>;
  endedGameIdsRef: MutableRefObject<Set<string>>;
  clearActiveGame: (statusMessage: string) => void;
  setGameId: (updater: string | ((current: string) => string)) => void;
  setState: (updater: GameState | null | ((current: GameState | null) => GameState | null)) => void;
  setServerConnected: (connected: boolean) => void;
  setDeviceConnected: (connected: boolean) => void;
  setConnectedOperatorCount: (count: number) => void;
  setConnectedOperators: (operators: Array<{ deviceId: string | null; gameId: string | null; lastSeenIso: string | null; connectedAtIso: string | null }>) => void;
  setDashboardStatus: (status: string) => void;
  setInsights: (insights: Insight[]) => void;
  setRosterTeamsFromRemote: (teams: RosterTeam[]) => void;
}

/** Manages the Socket.io connection lifecycle for the coach dashboard. */
export function useCoachSocket({
  connectionId,
  gameIdRef,
  endedGameIdsRef,
  clearActiveGame,
  setGameId,
  setState,
  setServerConnected,
  setDeviceConnected,
  setConnectedOperatorCount,
  setConnectedOperators,
  setDashboardStatus,
  setInsights,
  setRosterTeamsFromRemote,
}: UseCoachSocketOptions): void {
  // Keep a stable ref to clearActiveGame so the socket event handlers
  // always call the latest version — the socket effect only re-runs when
  // connectionId changes, so callbacks captured at setup time would have
  // stale gameId/resetAiState closures from before the current game started.
  const clearActiveGameRef = useRef(clearActiveGame);
  useEffect(() => {
    clearActiveGameRef.current = clearActiveGame;
  });

  useEffect(() => {
    const authSession = readStoredAuthSession();
    const schoolId = resolveActiveSchoolId();
    const socket = io(apiBase, {
      auth: {
        ...(schoolId ? { schoolId } : {}),
        ...(API_KEY ? { apiKey: API_KEY } : {}),
        ...(authSession?.token ? { token: authSession.token } : {}),
      },
      extraHeaders: apiKeyHeader(),
    });

    // Poll the presence channel every 5s so the coach dashboard can recover
    // quickly if the operator console reconnects after a temporary network interruption.
    let pollInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
      if (socket.connected) {
        socket.emit("join:coach", { connectionId, gameId: gameIdRef.current });
      }
    }, 5000);

    function stopPoll() {
      if (pollInterval !== null) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    socket.on("connect", () => {
      setServerConnected(true);
      const recoveredGameId = gameIdRef.current;
      socket.emit("join:coach", { connectionId, gameId: recoveredGameId });
      if (recoveredGameId && !endedGameIdsRef.current.has(recoveredGameId)) {
        socket.emit("join:game", recoveredGameId);
      }
    });

    socket.on("disconnect", () => {
      setServerConnected(false);
      setDeviceConnected(false);
      setConnectedOperatorCount(0);
      setConnectedOperators([]);
      // Preserve state so the scoreboard stays visible during brief reconnections.
      // The server re-pushes game:state on reconnect, keeping data fresh.
      setDashboardStatus("Reconnecting...");
    });

    socket.emit("join:coach", { connectionId, gameId: gameIdRef.current });

    function handlePresence(status: PresenceStatus) {
      if (!status) {
        return;
      }

      if (!connectionId || status.connectionId !== connectionId) {
        return;
      }

      setDeviceConnected(status.online);
      const nextOperatorCount = typeof status.operatorCount === "number"
        ? Math.max(0, Math.floor(status.operatorCount))
        : status.online
          ? 1
          : 0;
      setConnectedOperatorCount(nextOperatorCount);
      const nextOperators = Array.isArray(status.operators) ? status.operators : [];
      setConnectedOperators(nextOperators);
      const activeGameId = status.gameId;
      if (status.online && activeGameId) {
        if (endedGameIdsRef.current.has(activeGameId)) {
          setDashboardStatus("Game ended. Start a new game when ready.");
          return;
        }
        setGameId((current) => (current === activeGameId ? current : activeGameId));
        socket.emit("join:game", activeGameId);
      } else {
        // Only reset to "waiting" state when no game has been launched by the coach.
        // If the coach already has a game open, keep it — the operator may just be
        // between actions or not yet connected.
        setGameId((current) => {
          if (current) return current;
          return "";
        });
        setDashboardStatus(`Waiting for connection ${connectionId}`);
      }
    }

    socket.on("presence:status", handlePresence);

    socket.on("game:state", (nextState: GameState) => {
      if (endedGameIdsRef.current.has(nextState.gameId)) {
        return;
      }
      // Only accept state for the game this dashboard is tracking. Ignore
      // broadcasts for other games the socket may have inadvertently joined
      // (e.g. from a stale school-room broadcast or previous session).
      const currentGameId = gameIdRef.current;
      if (currentGameId && nextState.gameId !== currentGameId) {
        return;
      }
      stopPoll();
      setGameId((current) => (current === nextState.gameId ? current : nextState.gameId));
      setState((current) => mergeGameState(current, nextState));
      setDashboardStatus("Live state synced");
    });

    socket.on("game:submitted", (payload: unknown) => {
      const submittedGameId =
        typeof (payload as { gameId?: unknown })?.gameId === "string"
          ? (payload as { gameId: string }).gameId
          : "";
      if (!submittedGameId) {
        return;
      }

      endedGameIdsRef.current.add(submittedGameId);
      if (gameIdRef.current === submittedGameId) {
        clearActiveGameRef.current("Game ended. Start a new game when ready.");
      }
    });

    socket.on("game:insights", (nextInsights: Insight[]) => {
      setInsights(nextInsights);
    });

    socket.on("roster:teams", (nextTeams: unknown) => {
      const teams = normalizeRosterTeams(nextTeams);
      setRosterTeamsFromRemote(teams);
    });

    return () => {
      stopPoll();
      socket.off("presence:status", handlePresence);
      socket.off("game:submitted");
      socket.off("game:state");
      socket.off("game:insights");
      socket.off("roster:teams");
      socket.disconnect();
    };
  }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps
}
