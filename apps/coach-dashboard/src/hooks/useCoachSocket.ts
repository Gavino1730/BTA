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
    deviceName: string | null;
    gameId: string | null;
    lastSeenIso: string | null;
    connectedAtIso: string | null;
  }>;
}

export interface FinishedGameSummary {
  gameId: string;
  finishedAtIso: string;
  myTeamName: string;
  opponentName: string;
  myScore: number;
  oppScore: number;
}

export interface UseCoachSocketOptions {
  connectionId: string;
  setupNames: { myTeamName: string; opponentName: string; vcSide: "home" | "away" };
  gameIdRef: MutableRefObject<string>;
  endedGameIdsRef: MutableRefObject<Set<string>>;
  clearActiveGame: (statusMessage: string, options?: { rotateConnectionCode?: boolean }) => void;
  setGameId: (updater: string | ((current: string) => string)) => void;
  setState: (updater: GameState | null | ((current: GameState | null) => GameState | null)) => void;
  setServerConnected: (connected: boolean) => void;
  setDeviceConnected: (connected: boolean) => void;
  setConnectedOperatorCount: (count: number) => void;
  setConnectedOperators: (operators: Array<{ deviceId: string | null; deviceName: string | null; gameId: string | null; lastSeenIso: string | null; connectedAtIso: string | null }>) => void;
  setDashboardStatus: (status: string) => void;
  setInsights: (insights: Insight[]) => void;
  setRosterTeamsFromRemote: (teams: RosterTeam[]) => void;
  setLastFinishedGameSummary: (summary: FinishedGameSummary | null) => void;
}

/** Manages the Socket.io connection lifecycle for the coach dashboard. */
export function useCoachSocket({
  connectionId,
  setupNames,
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
  setLastFinishedGameSummary,
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
    const lastStateSyncAtRef = { current: 0 };
    const activeOperatorGameIdRef = { current: "" };
    const latestStateRef: { current: GameState | null } = { current: null };
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
        activeOperatorGameIdRef.current = activeGameId;
        lastStateSyncAtRef.current = Date.now();
        if (endedGameIdsRef.current.has(activeGameId)) {
          setDashboardStatus("Game ended. Start a new game when ready.");
          return;
        }
        setGameId((current) => (current === activeGameId ? current : activeGameId));
        socket.emit("join:game", activeGameId);
      } else {
        activeOperatorGameIdRef.current = "";
        const hasLiveGame = Boolean(gameIdRef.current);
        const recentlySyncedLiveState = Date.now() - lastStateSyncAtRef.current < 15000;
        if (hasLiveGame && recentlySyncedLiveState) {
          // Presence can lag briefly behind event/state fanout. If we just
          // received live game state, keep the nav badge in Live mode.
          setDeviceConnected(true);
          setConnectedOperatorCount(1);
          return;
        }

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
      // Prefer the operator-advertised active game during reconnect/transition.
      // This avoids dropping the first game:state packet due to React state lag.
      const currentGameId = gameIdRef.current;
      const expectedGameId = activeOperatorGameIdRef.current || currentGameId;
      if (expectedGameId && nextState.gameId !== expectedGameId) {
        return;
      }
      stopPoll();
      lastStateSyncAtRef.current = Date.now();
      setDeviceConnected(true);
      setConnectedOperatorCount(1);
      setGameId((current) => (current === nextState.gameId ? current : nextState.gameId));
      setState((current) => {
        const merged = mergeGameState(current, nextState);
        latestStateRef.current = merged;
        return merged;
      });
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
      const activeGameId = gameIdRef.current;
      const stateGameId = latestStateRef.current?.gameId ?? "";
      const operatorGameId = activeOperatorGameIdRef.current;
      const shouldClearActive = activeGameId === submittedGameId
        || stateGameId === submittedGameId
        || operatorGameId === submittedGameId;

      if (shouldClearActive) {
        const snapshot = latestStateRef.current;
        const homeScore = snapshot?.homeTeamId ? (snapshot.scoreByTeam[snapshot.homeTeamId] ?? 0) : 0;
        const awayScore = snapshot?.awayTeamId ? (snapshot.scoreByTeam[snapshot.awayTeamId] ?? 0) : 0;
        const vcIsAway = setupNames.vcSide === "away";
        setLastFinishedGameSummary({
          gameId: submittedGameId,
          finishedAtIso: new Date().toISOString(),
          myTeamName: setupNames.myTeamName || "Your Team",
          opponentName: setupNames.opponentName || snapshot?.opponentName || "Opponent",
          myScore: vcIsAway ? awayScore : homeScore,
          oppScore: vcIsAway ? homeScore : awayScore,
        });
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
  }, [connectionId, setLastFinishedGameSummary, setupNames.myTeamName, setupNames.opponentName, setupNames.vcSide]); // eslint-disable-line react-hooks/exhaustive-deps
}
