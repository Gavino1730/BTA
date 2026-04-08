import type { GameEvent } from "@bta/shared-schema";
import {
  apiKeyHeader,
  buildOperatorAuthSnapshot,
  buildAiContextFromSetup,
  debugOperatorAuth,
  generateGameId,
  isConnectionReadyForStart,
  isLegacyStatsExportConfigured,
  mergeCoachLinkSnapshot,
  normalizeConnectionId,
} from "../helpers/network.js";
import { computeDashboardPlayerStats, computeTeamStats } from "../helpers/players.js";
import { loadAppData, saveAppData } from "../helpers/storage.js";
import type { AppData, GameSetup, OperatorLinkResponse, Team, TeamSide } from "../types.js";

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

export function buildRealtimeGameRegistrationPayload(activeSetup: GameSetup, gid: string, preGameNotes: string) {
  const vcSide = activeSetup.vcSide ?? "home";
  const opponentName = activeSetup.opponent?.trim() || "";
  const opponentTeamId = opponentName
    ? `team-${opponentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opponent"}`
    : "opponent";
  const hId = vcSide === "home"
    ? activeSetup.myTeamId || "team-home"
    : opponentTeamId;
  const aId = vcSide === "away"
    ? activeSetup.myTeamId || "team-away"
    : opponentTeamId;
  const trackedTeamId = vcSide === "home" ? hId : aId;
  const startingLineup = Array.isArray(activeSetup.startingLineup)
    ? [...new Set(activeSetup.startingLineup.map((p) => String(p).trim()).filter(Boolean))].slice(0, 5)
    : [];
  const startingLineupByTeam = startingLineup.length > 0
    ? { [trackedTeamId]: startingLineup }
    : undefined;

  return {
    gameId: gid,
    homeTeamId: hId,
    awayTeamId: aId,
    opponentName,
    opponentTeamId,
    startingLineupByTeam,
    aiContext: {
      ...buildAiContextFromSetup(activeSetup),
      preGameNotes: preGameNotes.trim() || undefined,
    },
  };
}

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

  async function refreshOperatorAuthFromConnection(current: AppData): Promise<AppData> {
    const connectionId = normalizeConnectionId(current.gameSetup.syncedConnectionId || current.gameSetup.connectionId);
    if (!connectionId) {
      return current;
    }

    try {
      debugOperatorAuth("refreshOperatorAuth.request", {
        connectionId,
        ...buildOperatorAuthSnapshot(current.gameSetup),
      });

      const response = await fetch(
        `${current.gameSetup.apiUrl}/api/operator-links/${encodeURIComponent(connectionId)}`,
        { headers: apiKeyHeader(current.gameSetup) },
      );
      debugOperatorAuth("refreshOperatorAuth.response", {
        connectionId,
        status: response.status,
        ok: response.ok,
      });
      if (!response.ok) {
        return current;
      }

      const payload = (await response.json()) as OperatorLinkResponse;
      debugOperatorAuth("refreshOperatorAuth.payload", {
        connectionId,
        responseSchoolId: payload.schoolId?.trim() || null,
        hasOperatorToken: Boolean(payload.operatorToken),
      });
      const next = mergeCoachLinkSnapshot(current, payload);
      if (
        next.gameSetup.apiKey !== current.gameSetup.apiKey
        || next.gameSetup.schoolId !== current.gameSetup.schoolId
      ) {
        saveAppData(next);
        setAppData(next);
      }
      return next;
    } catch (error) {
      debugOperatorAuth("refreshOperatorAuth.error", {
        connectionId,
        ...buildOperatorAuthSnapshot(current.gameSetup),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return current;
    }
  }

  function hasWriteCredential(headers: Record<string, string>): boolean {
    return Boolean(headers.Authorization || headers["x-api-key"]);
  }

  async function startGame(newGameId?: string) {
    let latest = loadAppData();
    const gid = newGameId ?? latest.gameSetup.gameId;
    let effectiveGameId = gid;
    let shouldResetEventTimeline = false;
    let serverOpponentName: string | undefined;
    let serverVcSide: "home" | "away" | undefined;

    if (!latest.gameSetup.apiKey?.trim()) {
      latest = await refreshOperatorAuthFromConnection(latest);
    }

    const requestHeaders = { "Content-Type": "application/json", ...apiKeyHeader(latest.gameSetup) };
    if (!hasWriteCredential(requestHeaders)) {
      debugOperatorAuth("startGame.missingWriteCredential", {
        ...buildOperatorAuthSnapshot(latest.gameSetup),
        hasAuthorizationHeader: Boolean(requestHeaders.Authorization),
        hasApiKeyHeader: Boolean(requestHeaders["x-api-key"]),
      });
      showInlineNotice(
        "Live auth token is missing. Tap Sync Now on Ready to Track, then try Start Game again.",
        "warning",
        7000,
      );
      return;
    }

    try {
      debugOperatorAuth("startGame.request", {
        gameId: gid,
        ...buildOperatorAuthSnapshot(latest.gameSetup),
        hasAuthorizationHeader: Boolean(requestHeaders.Authorization),
        hasApiKeyHeader: Boolean(requestHeaders["x-api-key"]),
      });

      let res = await fetch(`${latest.gameSetup.apiUrl}/api/games`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(buildRealtimeGameRegistrationPayload(latest.gameSetup, gid, preGameNotes)),
      });

      if (res.status === 401) {
        debugOperatorAuth("startGame.unauthorizedRetry", {
          gameId: gid,
          status: res.status,
        });
        latest = await refreshOperatorAuthFromConnection(latest);
        const retryHeaders = { "Content-Type": "application/json", ...apiKeyHeader(latest.gameSetup) };
        if (hasWriteCredential(retryHeaders)) {
          res = await fetch(`${latest.gameSetup.apiUrl}/api/games`, {
            method: "POST",
            headers: retryHeaders,
            body: JSON.stringify(buildRealtimeGameRegistrationPayload(latest.gameSetup, gid, preGameNotes)),
          });
        }
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        debugOperatorAuth("startGame.responseError", {
          gameId: gid,
          status: res.status,
          body,
          ...buildOperatorAuthSnapshot(latest.gameSetup),
        });
        if (res.status === 409) {
          let parsed: { activeGameId?: string; activeState?: { gameId?: string; homeTeamId?: string; awayTeamId?: string; opponentName?: string } } = {};
          try { parsed = JSON.parse(body); } catch { /* ignore */ }
          const activeGameId = typeof parsed.activeGameId === "string"
            ? parsed.activeGameId
            : (typeof parsed.activeState?.gameId === "string" ? parsed.activeState.gameId : null);
          if (!activeGameId) {
            showInlineNotice(
              "Live server already has an active game in progress. Resume or submit that game before starting a new one.",
              "error"
            );
            return;
          }

          if (!isConnectionReadyForStart(latest.gameSetup)) {
            showInlineNotice(
              "Another device has a live game. Enter and sync the coach connection code on this iPad before joining it.",
              "warning",
              7000,
            );
            return;
          }

          effectiveGameId = activeGameId;
          if (parsed.activeState) {
            serverOpponentName = parsed.activeState.opponentName;
            if (latest.gameSetup.myTeamId && parsed.activeState.awayTeamId === latest.gameSetup.myTeamId) {
              serverVcSide = "away";
            } else if (latest.gameSetup.myTeamId && parsed.activeState.homeTeamId === latest.gameSetup.myTeamId) {
              serverVcSide = "home";
            }
          }
          showInlineNotice(
            `Live server already has an active game (${activeGameId}). Resuming that game instead.`,
            "warning",
            6000,
          );
        } else {
          showInlineNotice(
            `Could not register game on the live server (${res.status}): ${body || "unknown error"}. Check Settings > API URL and try again.`,
            "error"
          );
          return;
        }
      } else {
        if (res.status === 201) {
          shouldResetEventTimeline = true;
        } else {
          try {
            const serverState = await res.json() as { homeTeamId?: string; awayTeamId?: string; opponentName?: string };
            serverOpponentName = serverState.opponentName;
            if (latest.gameSetup.myTeamId && serverState.awayTeamId === latest.gameSetup.myTeamId) {
              serverVcSide = "away";
            } else if (latest.gameSetup.myTeamId && serverState.homeTeamId === latest.gameSetup.myTeamId) {
              serverVcSide = "home";
            }
          } catch { /* keep local values */ }
        }
      }
      debugOperatorAuth("startGame.success", {
        gameId: effectiveGameId,
        ...buildOperatorAuthSnapshot(latest.gameSetup),
      });
    } catch {
      showInlineNotice(
        `Could not reach the live server at ${latest.gameSetup.apiUrl}. Make sure the realtime API is running, then go to Settings > Game Setup and tap Start Game again.`,
        "error"
      );
      return;
    }

    const mergedSetup = { ...latest.gameSetup, gameId: effectiveGameId, statsGameId: undefined as number | undefined };
    if (serverOpponentName) mergedSetup.opponent = serverOpponentName;
    if (serverVcSide) mergedSetup.vcSide = serverVcSide;
    const nextData: AppData = { ...latest, gameSetup: mergedSetup };
    setAppData(nextData);
    saveAppData(nextData);
    if (shouldResetEventTimeline) {
      resetTimeline(effectiveGameId);
    }
    persistPhase("live");
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
    const vcSide = appData.gameSetup.vcSide ?? "home";
    const oppSide: TeamSide = vcSide === "home" ? "away" : "home";
    const opponent = overrides?.opponent?.trim() || appData.gameSetup.opponent?.trim() || "";
    const dashboardUrl = appData.gameSetup.dashboardUrl?.trim() || "";

    if (!opponent) {
      const message = "Enter the opponent name in Game Setup before submitting.";
      setSubmitMessage(message);
      showInlineNotice("Enter the opponent name in Game Setup (Settings > Game Setup) before submitting.", "warning");
      return false;
    }

    const vcTeam = vcSide === "home" ? homeTeam : awayTeam;
    if (!vcTeam) {
      const message = "Tracked team is not configured. Check Game Setup in Settings.";
      setSubmitMessage(message);
      showInlineNotice("Tracked team is not configured. Check Game Setup in Settings.", "warning");
      return false;
    }

    if (!isLegacyStatsExportConfigured(appData.gameSetup)) {
      setSubmitStatus("success");
      setSubmitMessage("Live stats are already available in the coach dashboard.");
      setTimeout(() => {
        setSubmitStatus("idle");
        setSubmitMessage("Ready to publish final stats.");
      }, 4000);
      return true;
    }

    setSubmitStatus("pending");
    setSubmitMessage(`Saving final stats to ${dashboardUrl}...`);

    const effectiveDate = overrides?.date || gameDate;
    const dateParts = new Date(effectiveDate + "T12:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });

    const computedVcScore = scores[vcSide];
    const computedOppScore = scores[oppSide];
    const vcScore = vcSide === "home"
      ? (overrides?.homeScore ?? computedVcScore)
      : (overrides?.awayScore ?? computedVcScore);
    const oppScore = vcSide === "home"
      ? (overrides?.awayScore ?? computedOppScore)
      : (overrides?.homeScore ?? computedOppScore);
    const playerStats = computeDashboardPlayerStats(allEventObjs, vcTeam.players, vcTeamId);
    const teamStats = computeTeamStats(allEventObjs, vcTeamId);

    const rosterPayload = vcTeam.players.map(p => ({
      number: parseInt(p.number, 10) || 0,
      name: p.name,
      position: p.position || undefined,
      height: p.height || undefined,
      grade: p.grade || undefined,
    }));

    const payload: Record<string, unknown> = {
      date: dateParts,
      opponent,
      location: vcSide,
      vc_score: vcScore,
      opp_score: oppScore,
      team_stats: teamStats,
      player_stats: playerStats,
      roster: rosterPayload,
    };
    if (appData.gameSetup.statsGameId != null) {
      payload.gameId = appData.gameSetup.statsGameId;
    }

    try {
      const res = await fetch(`${dashboardUrl}/api/ingest-game`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(appData.gameSetup) },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({})) as { message?: string; gameId?: number; error?: string };
      if (res.ok) {
        if (result.gameId != null && result.gameId !== appData.gameSetup.statsGameId) {
          persistData({
            ...appData,
            gameSetup: { ...appData.gameSetup, statsGameId: result.gameId },
          });
        }
        setSubmitStatus("success");
        setSubmitMessage(`Saved final stats to ${dashboardUrl}.`);
        setTimeout(() => {
          setSubmitStatus("idle");
          setSubmitMessage("Ready to publish final stats.");
        }, 4000);
        return true;
      } else {
        const errorMessage = result.error || result.message || `Request failed with status ${res.status}.`;
        console.error("Dashboard ingest error:", errorMessage);
        setSubmitMessage(`Dashboard save failed: ${errorMessage}`);
        showInlineNotice(
          `Could not save final stats to the legacy stats export endpoint. ${errorMessage} Check Settings > Game Setup > Legacy Stats Export URL and make sure that service is running.`,
          "error"
        );
        setSubmitStatus("error");
        return false;
      }
    } catch (err) {
      console.error("Could not reach Stats dashboard:", err);
      setSubmitMessage(`Could not reach dashboard at ${dashboardUrl}. Start the dashboard or update the URL in Game Setup.`);
      showInlineNotice(
        `Could not reach the legacy stats export endpoint at ${dashboardUrl}. Start that service or update Settings > Game Setup > Legacy Stats Export URL, then retry.`,
        "error"
      );
      setSubmitStatus("error");
      return false;
    }
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
    const baseId = edits.gameId || generateGameId(edits.opponent, edits.date);
    const freshId = `${baseId}-reset-${Date.now().toString().slice(-4)}`;
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
      try {
        await fetch(`${dashboardUrl}/api/games/${savedStatsGameId}`, {
          method: "DELETE",
          headers: apiKeyHeader(appData.gameSetup),
        });
      } catch { /* keep discarding locally */ }
    }

    const edits = applyPostGameEdits();
    const freshId = generateGameId(edits.opponent, new Date().toISOString().slice(0, 10));
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
