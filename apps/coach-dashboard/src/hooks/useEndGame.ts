import { useEffect, useRef, useState } from "react";
import type { GameState } from "../helpers/game-state.js";
import { apiBase, apiKeyHeader } from "../platform.js";
import type { FinishedGameSummary } from "./useCoachSocket.js";

interface SetupNames {
  opponentName: string;
  vcSide: "home" | "away";
}

interface UseEndGameParams {
  gameId: string;
  state: GameState | null;
  setupNames: SetupNames;
  endedGameIdsRef: React.MutableRefObject<Set<string>>;
  clearActiveGame: (statusMessage: string, options?: { rotateConnectionCode?: boolean }) => void;
  setDashboardStatus: (status: string) => void;
  setLastFinishedGameSummary: (summary: FinishedGameSummary | null) => void;
}

interface UseEndGameReturn {
  isEndingGame: boolean;
  isSavingFinalizeDetails: boolean;
  isEndGamePromptOpen: boolean;
  endGameStatus: string;
  finalizeGameName: string;
  finalizeGameDate: string;
  finalizeOpponent: string;
  finalizeVcScore: string;
  finalizeOppScore: string;
  setFinalizeGameDate: (value: string) => void;
  setFinalizeOpponent: (value: string) => void;
  setFinalizeVcScore: (value: string) => void;
  setFinalizeOppScore: (value: string) => void;
  requestEndGameFromDashboard: () => void;
  cancelEndGamePrompt: () => void;
  saveFinalizeDetailsFromDashboard: () => Promise<boolean>;
  discardGameFromDashboard: () => Promise<void>;
  endGameFromDashboard: () => Promise<void>;
}

function toIsoDate(value?: string): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

function parseScoreInput(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Math.max(0, fallback);
  }
  return parsed;
}

function getVcAndOpponentScores(state: GameState | null, vcSide: "home" | "away"): { vcScore: number; oppScore: number } {
  const homeId = state?.homeTeamId;
  const awayId = state?.awayTeamId;
  const homeScore = homeId ? (state?.scoreByTeam?.[homeId] ?? 0) : 0;
  const awayScore = awayId ? (state?.scoreByTeam?.[awayId] ?? 0) : 0;
  if (vcSide === "away") {
    return { vcScore: awayScore, oppScore: homeScore };
  }
  return { vcScore: homeScore, oppScore: awayScore };
}

export function useEndGame({
  gameId,
  state,
  setupNames,
  endedGameIdsRef,
  clearActiveGame,
  setDashboardStatus,
  setLastFinishedGameSummary,
}: UseEndGameParams): UseEndGameReturn {
  const [isEndingGame, setIsEndingGame] = useState(false);
  const [isSavingFinalizeDetails, setIsSavingFinalizeDetails] = useState(false);
  const [isEndGamePromptOpen, setIsEndGamePromptOpen] = useState(false);
  const [endGameStatus, setEndGameStatus] = useState("");
  const [finalizeGameName, setFinalizeGameName] = useState(gameId);
  const [finalizeGameDate, setFinalizeGameDate] = useState(toIsoDate());
  const [finalizeOpponent, setFinalizeOpponent] = useState("");
  const [finalizeVcScore, setFinalizeVcScore] = useState("0");
  const [finalizeOppScore, setFinalizeOppScore] = useState("0");

  function hydrateFinalizeFields(): void {
    const scores = getVcAndOpponentScores(state, setupNames.vcSide);
    setFinalizeGameName(gameId);
    setFinalizeGameDate(toIsoDate());
    setFinalizeOpponent((setupNames.opponentName || state?.opponentName || "").trim());
    setFinalizeVcScore(String(scores.vcScore));
    setFinalizeOppScore(String(scores.oppScore));
  }

  // Clear status when the active game changes (e.g. after clearActiveGame resets gameId)
  const prevGameIdRef = useRef(gameId);
  useEffect(() => {
    if (prevGameIdRef.current !== gameId) {
      prevGameIdRef.current = gameId;
      setIsEndGamePromptOpen(false);
      setEndGameStatus("");
      hydrateFinalizeFields();
    }
  }, [gameId, setupNames.opponentName, setupNames.vcSide, state?.awayTeamId, state?.homeTeamId, state?.opponentName, state?.scoreByTeam]);

  async function persistFinalizeDetails(showSuccessMessage: boolean): Promise<boolean> {
    if (!gameId) {
      return false;
    }

    const fallbackScores = getVcAndOpponentScores(state, setupNames.vcSide);
    const vcScore = parseScoreInput(finalizeVcScore, fallbackScores.vcScore);
    const oppScore = parseScoreInput(finalizeOppScore, fallbackScores.oppScore);
    const opponent = finalizeOpponent.trim() || setupNames.opponentName.trim() || state?.opponentName?.trim() || "Opponent";

    try {
      const response = await fetch(`${apiBase}/api/games/${encodeURIComponent(gameId)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...apiKeyHeader(),
        },
        body: JSON.stringify({
          date: finalizeGameDate,
          opponent,
          location: setupNames.vcSide,
          vc_score: vcScore,
          opp_score: oppScore,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
        const reason = payload.error ?? payload.message ?? `status ${response.status}`;
        if (response.status === 404) {
          endedGameIdsRef.current.add(gameId);
          clearActiveGame("Server no longer has this game. Cleared local session.", { rotateConnectionCode: true });
          return false;
        }
        const message = `Could not save finalized details: ${reason}.`;
        setEndGameStatus(message);
        setDashboardStatus(message);
        return false;
      }

      setFinalizeOpponent(opponent);
      setFinalizeVcScore(String(vcScore));
      setFinalizeOppScore(String(oppScore));
      if (showSuccessMessage) {
        setEndGameStatus("Updated game details.");
        setDashboardStatus("Updated game details.");
      }
      return true;
    } catch {
      const message = "Could not reach realtime API to save finalized details.";
      setEndGameStatus(message);
      setDashboardStatus(message);
      return false;
    }
  }

  function requestEndGameFromDashboard(): void {
    if (!gameId || isEndingGame || isSavingFinalizeDetails) {
      return;
    }
    hydrateFinalizeFields();
    setIsEndGamePromptOpen(true);
    setEndGameStatus("");
  }

  function cancelEndGamePrompt(): void {
    if (isEndingGame || isSavingFinalizeDetails) {
      return;
    }
    setIsEndGamePromptOpen(false);
  }

  async function saveFinalizeDetailsFromDashboard(): Promise<boolean> {
    if (!gameId || isEndingGame || isSavingFinalizeDetails) {
      return false;
    }

    setIsSavingFinalizeDetails(true);
    setEndGameStatus("Saving updated game details...");
    setDashboardStatus("Saving updated game details...");
    try {
      return await persistFinalizeDetails(true);
    } finally {
      setIsSavingFinalizeDetails(false);
    }
  }

  async function discardGameFromDashboard(): Promise<void> {
    if (!gameId || isEndingGame || isSavingFinalizeDetails) {
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
    clearActiveGame("Game closed without saving.", { rotateConnectionCode: true });
  }

  async function endGameFromDashboard(): Promise<void> {
    if (!gameId || isEndingGame || isSavingFinalizeDetails) {
      return;
    }

    const endingGameId = gameId;
    setIsEndingGame(true);
    setIsEndGamePromptOpen(false);
    setEndGameStatus("Saving and submitting game...");
    setDashboardStatus("Saving and submitting game...");

    try {
      const detailsSaved = await persistFinalizeDetails(false);
      if (!detailsSaved) {
        setIsEndGamePromptOpen(true);
        return;
      }

      const response = await fetch(`${apiBase}/api/games/${endingGameId}/submit`, {
        method: "POST",
        headers: apiKeyHeader(),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
        const reason = payload.error ?? payload.message ?? `status ${response.status}`;
        if (response.status === 404) {
          endedGameIdsRef.current.add(endingGameId);
          clearActiveGame("Server no longer has this game. Cleared local session.", { rotateConnectionCode: true });
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
      const fallbackScores = getVcAndOpponentScores(state, setupNames.vcSide);
      const vcScore = parseScoreInput(finalizeVcScore, fallbackScores.vcScore);
      const oppScore = parseScoreInput(finalizeOppScore, fallbackScores.oppScore);
      setLastFinishedGameSummary({
        gameId: endingGameId,
        finishedAtIso: new Date().toISOString(),
        myTeamName: "Your Team",
        opponentName: (finalizeOpponent.trim() || setupNames.opponentName || state?.opponentName || "Opponent").trim(),
        myScore: vcScore,
        oppScore,
      });
      clearActiveGame("Game ended. Start a new game when ready.", { rotateConnectionCode: true });
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
    isSavingFinalizeDetails,
    isEndGamePromptOpen,
    endGameStatus,
    finalizeGameName,
    finalizeGameDate,
    finalizeOpponent,
    finalizeVcScore,
    finalizeOppScore,
    setFinalizeGameDate,
    setFinalizeOpponent,
    setFinalizeVcScore,
    setFinalizeOppScore,
    requestEndGameFromDashboard,
    cancelEndGamePrompt,
    saveFinalizeDetailsFromDashboard,
    discardGameFromDashboard,
    endGameFromDashboard,
  };
}
