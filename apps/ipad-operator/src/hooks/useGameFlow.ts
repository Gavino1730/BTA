import type { GameEvent } from "@bta/shared-schema";
import { generateFreshGameId, generateGameId, apiKeyHeader } from "../helpers/network.js";
import { loadAppData } from "../helpers/storage.js";
import type { AppData, Team, TeamSide } from "../types.js";
import {
  startGame as startGameHelper,
  type StartGameDeps,
} from "../helpers/gameRegistration.js";
import {
  buildLegacyDashboardApiUrl,
  submitToDashboard as submitToDashboardHelper,
} from "../helpers/legacyExport.js";

export interface UseGameFlowInput {
  appData: AppData;
  setAppData: React.Dispatch<React.SetStateAction<AppData>>;
  gameId: string;
  gameDate: string;
  setGameDate: React.Dispatch<React.SetStateAction<string>>;
  allEventObjs: GameEvent[];
  scores: { home: number; away: number };
  homeTeam: Team | undefined;
  awayTeam: Team | undefined;
  vcTeamId: string;
  vcSideSetup: TeamSide;
  preGameNotes: string;
  postGameNameInput: string;
  postGameOpponentInput: string;
  postGameDateInput: string;
  postGameHomeScoreInput: string;
  postGameAwayScoreInput: string;
  persistData: (next: AppData) => void;
  persistPhase: (phase: "pre-game" | "live" | "post-game") => void;
  resetTimeline: (gameIdToReset: string) => void;
  setSubmitStatus: React.Dispatch<React.SetStateAction<"idle" | "pending" | "success" | "error">>;
  setSubmitMessage: React.Dispatch<React.SetStateAction<string>>;
  showInlineNotice: (msg: string, tone: "success" | "warning" | "error" | "info", ms?: number) => void;
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
  }) => Promise<boolean>;
}

export { buildRealtimeGameRegistrationPayload } from "../helpers/gameRegistration.js";

export function useGameFlow({
  appData, setAppData, gameId, gameDate, setGameDate,
  allEventObjs, scores, homeTeam, awayTeam, vcTeamId, vcSideSetup,
  preGameNotes,
  postGameNameInput, postGameOpponentInput, postGameDateInput,
  postGameHomeScoreInput, postGameAwayScoreInput,
  persistData, persistPhase, resetTimeline,
  setSubmitStatus, setSubmitMessage,
  showInlineNotice, requestConfirm,
}: UseGameFlowInput) {

  const gameDeps: StartGameDeps = {
    preGameNotes, showInlineNotice, persistPhase, resetTimeline, setAppData,
  };

  async function startGame(newGameId?: string) {
    return startGameHelper(gameDeps, newGameId);
  }

  async function endAndResetGame() {
    const latest = loadAppData();
    if (allEventObjs.length > 0 && latest.gameSetup.opponent?.trim()) {
      const saved = await submitToDashboard({ opponent: latest.gameSetup.opponent });
      if (!saved) return false;
    }
    const newId = generateGameId(latest.gameSetup.opponent ?? "", gameDate);
    await startGame(newId);
    return true;
  }

  function endGame() {
    setSubmitStatus("idle");
    setSubmitMessage("Review game details, then tap Submit Game to publish stats to the dashboard.");
    persistPhase("post-game");
  }

  function handleNewGame() {
    const latest = loadAppData();
    const newId = generateGameId(latest.gameSetup.opponent ?? "", new Date().toISOString().slice(0, 10));
    const nextData: AppData = {
      ...latest,
      gameSetup: { ...latest.gameSetup, gameId: newId, statsGameId: undefined },
    };
    persistData(nextData);
    resetTimeline(newId);
    setGameDate(new Date().toISOString().slice(0, 10));
    setSubmitStatus("idle");
    setSubmitMessage("Ready to publish final stats.");
    persistPhase("pre-game");
  }

  async function submitToDashboard(overrides?: { opponent?: string; date?: string; homeScore?: number; awayScore?: number }) {
    return submitToDashboardHelper(
      { appData, gameDate, scores, homeTeam, awayTeam, vcTeamId, allEventObjs, setSubmitStatus, setSubmitMessage, showInlineNotice, persistData },
      overrides,
    );
  }

  // ---- Post-game helpers ----

  function parseScoreInput(value: string, fallback: number) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
  }

  function applyPostGameEdits() {
    const name = postGameNameInput.trim() || appData.gameSetup.gameId;
    const opponent = postGameOpponentInput.trim();
    const date = postGameDateInput || gameDate;
    setGameDate(date);
    persistData({
      ...appData,
      gameSetup: { ...appData.gameSetup, gameId: name, opponent },
    });
    return {
      gameId: name,
      opponent,
      date,
      homeScore: parseScoreInput(postGameHomeScoreInput, scores.home),
      awayScore: parseScoreInput(postGameAwayScoreInput, scores.away),
    };
  }

  function resetGameStateFor(gameIdToReset: string) {
    resetTimeline(gameIdToReset);
    setSubmitStatus("idle");
    setSubmitMessage("Ready to save final stats to the dashboard.");
  }

  function resetFromPostGame() {
    const edits = applyPostGameEdits();
    const freshId = generateFreshGameId(edits.opponent || edits.gameId, edits.date, "reset");
    persistData({
      ...appData,
      gameSetup: {
        ...appData.gameSetup,
        gameId: freshId,
        opponent: edits.opponent,
        statsGameId: undefined,
      },
    });
    resetGameStateFor(freshId);
    persistPhase("pre-game");
  }

  async function discardFromPostGame() {
    const ok = await requestConfirm({
      title: "Discard this finished game?",
      message: "This clears tracked events and returns to pre-game setup.",
      confirmLabel: "Discard Game",
      tone: "danger",
    });
    if (!ok) return;

    const apiUrl = appData.gameSetup.apiUrl?.trim();
    if (apiUrl && gameId) {
      try {
        await fetch(`${apiUrl}/api/games/${encodeURIComponent(gameId)}`, {
          method: "DELETE",
          headers: apiKeyHeader(appData.gameSetup),
        });
      } catch { /* keep discarding locally */ }
    }

    const dashboardUrl = appData.gameSetup.dashboardUrl?.trim();
    const savedStatsGameId = appData.gameSetup.statsGameId;
    if (dashboardUrl && savedStatsGameId != null) {
      const deleteUrl = buildLegacyDashboardApiUrl(dashboardUrl, `/api/games/${savedStatsGameId}`);
      try {
        if (deleteUrl) {
          await fetch(deleteUrl, {
            method: "DELETE",
            headers: apiKeyHeader(appData.gameSetup),
          });
        }
      } catch { /* keep discarding locally */ }
    }

    const edits = applyPostGameEdits();
    const freshId = generateFreshGameId(edits.opponent || edits.gameId, new Date().toISOString().slice(0, 10), "discard");
    persistData({
      ...appData,
      gameSetup: {
        ...appData.gameSetup,
        gameId: freshId,
        opponent: "",
        statsGameId: undefined,
        syncedConnectionId: undefined,
      },
    });
    setGameDate(new Date().toISOString().slice(0, 10));
    resetGameStateFor(freshId);
    persistPhase("pre-game");
  }

  async function submitGameToRealtimeApi(): Promise<boolean> {
    const apiUrl = appData.gameSetup.apiUrl?.trim();
    if (!apiUrl || !gameId) return true;
    try {
      const res = await fetch(`${apiUrl}/api/games/${encodeURIComponent(gameId)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(appData.gameSetup) },
      });
      if (!res.ok && res.status !== 404) return false;
      return true;
    } catch {
      return false;
    }
  }

  return {
    startGame,
    endAndResetGame,
    endGame,
    handleNewGame,
    submitToDashboard,
    applyPostGameEdits,
    resetGameStateFor,
    resetFromPostGame,
    discardFromPostGame,
    submitGameToRealtimeApi,
  };
}
