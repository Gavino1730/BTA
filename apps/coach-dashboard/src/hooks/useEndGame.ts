import { useEffect, useRef, useState } from "react";
import { apiBase, apiKeyHeader } from "../platform.js";

interface UseEndGameParams {
  gameId: string;
  endedGameIdsRef: React.MutableRefObject<Set<string>>;
  clearActiveGame: (statusMessage: string) => void;
  setDashboardStatus: (status: string) => void;
}

interface UseEndGameReturn {
  isEndingGame: boolean;
  endGameStatus: string;
  endGameFromDashboard: () => Promise<void>;
}

export function useEndGame({
  gameId,
  endedGameIdsRef,
  clearActiveGame,
  setDashboardStatus,
}: UseEndGameParams): UseEndGameReturn {
  const [isEndingGame, setIsEndingGame] = useState(false);
  const [endGameStatus, setEndGameStatus] = useState("");

  // Clear status when the active game changes (e.g. after clearActiveGame resets gameId)
  const prevGameIdRef = useRef(gameId);
  useEffect(() => {
    if (prevGameIdRef.current !== gameId) {
      prevGameIdRef.current = gameId;
      setEndGameStatus("");
    }
  }, [gameId]);

  async function endGameFromDashboard(): Promise<void> {
    if (!gameId || isEndingGame) {
      return;
    }

    const endingGameId = gameId;
    const shouldEnd = window.confirm("End this game now? This will finalize it and return the dashboard to Start New Game.");
    if (!shouldEnd) {
      return;
    }

    setIsEndingGame(true);
    setEndGameStatus("Ending game...");
    setDashboardStatus("Ending game...");

    try {
      const response = await fetch(`${apiBase}/api/games/${endingGameId}/submit`, {
        method: "POST",
        headers: apiKeyHeader(),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
        const reason = payload.error ?? payload.message ?? `status ${response.status}`;
        if (response.status === 404) {
          endedGameIdsRef.current.add(endingGameId);
          clearActiveGame("Server no longer has this game. Cleared local session.");
          return;
        }
        const message = response.status === 403
          ? `Could not end game: ${reason}. Your account needs write permissions.`
          : response.status === 401
            ? `Could not end game: ${reason}. Please sign in again.`
            : `Could not end game: ${reason}.`;
        setEndGameStatus(message);
        setDashboardStatus(message);
        return;
      }

      endedGameIdsRef.current.add(endingGameId);
      clearActiveGame("Game ended. Start a new game when ready.");
    } catch {
      const message = "Could not reach realtime API to end game.";
      setEndGameStatus(message);
      setDashboardStatus(message);
    } finally {
      setIsEndingGame(false);
    }
  }

  return { isEndingGame, endGameStatus, endGameFromDashboard };
}
