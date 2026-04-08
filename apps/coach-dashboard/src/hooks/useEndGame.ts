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
  isEndGamePromptOpen: boolean;
  endGameStatus: string;
  requestEndGameFromDashboard: () => void;
  cancelEndGamePrompt: () => void;
  discardGameFromDashboard: () => Promise<void>;
  endGameFromDashboard: () => Promise<void>;
}

export function useEndGame({
  gameId,
  endedGameIdsRef,
  clearActiveGame,
  setDashboardStatus,
}: UseEndGameParams): UseEndGameReturn {
  const [isEndingGame, setIsEndingGame] = useState(false);
  const [isEndGamePromptOpen, setIsEndGamePromptOpen] = useState(false);
  const [endGameStatus, setEndGameStatus] = useState("");

  // Clear status when the active game changes (e.g. after clearActiveGame resets gameId)
  const prevGameIdRef = useRef(gameId);
  useEffect(() => {
    if (prevGameIdRef.current !== gameId) {
      prevGameIdRef.current = gameId;
      setIsEndGamePromptOpen(false);
      setEndGameStatus("");
    }
  }, [gameId]);

  function requestEndGameFromDashboard(): void {
    if (!gameId || isEndingGame) {
      return;
    }
    setIsEndGamePromptOpen(true);
    setEndGameStatus("");
  }

  function cancelEndGamePrompt(): void {
    if (isEndingGame) {
      return;
    }
    setIsEndGamePromptOpen(false);
  }

  async function discardGameFromDashboard(): Promise<void> {
    if (!gameId || isEndingGame) {
      return;
    }
    const discardingGameId = gameId;
    setIsEndGamePromptOpen(false);
    // Delete the game from the server so it no longer appears as an active game.
    // Best-effort: clear locally even if the server call fails.
    try {
      await fetch(`${apiBase}/api/games/${discardingGameId}`, {
        method: "DELETE",
        headers: apiKeyHeader(),
      });
    } catch {
      // ignore network errors — proceed with local clear
    }
    clearActiveGame("Game closed without saving.");
  }

  async function endGameFromDashboard(): Promise<void> {
    if (!gameId || isEndingGame) {
      return;
    }

    const endingGameId = gameId;
    setIsEndingGame(true);
    setIsEndGamePromptOpen(false);
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
      setIsEndGamePromptOpen(true);
    } finally {
      setIsEndingGame(false);
    }
  }

  return {
    isEndingGame,
    isEndGamePromptOpen,
    endGameStatus,
    requestEndGameFromDashboard,
    cancelEndGamePrompt,
    discardGameFromDashboard,
    endGameFromDashboard,
  };
}
