import { type Dispatch, type SetStateAction } from "react";
import type { AppData, GameSetup } from "../types.js";
import {
  apiKeyHeader,
  buildAiContextFromSetup,
  fetchOperatorLinkSnapshot,
  generateGameId,
  isConnectionReadyForStart,
  mergeCoachLinkSnapshot,
  normalizeConnectionId,
} from "./network.js";
import { loadAppData, saveAppData } from "./storage.js";

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

export async function refreshOperatorAuthFromConnection(
  current: AppData,
  setAppData: Dispatch<SetStateAction<AppData>>,
): Promise<AppData> {
  const snapshot = await fetchOperatorLinkSnapshot(current.gameSetup).catch(() => null);
  if (!snapshot) {
    const connectionId = normalizeConnectionId(current.gameSetup.syncedConnectionId || current.gameSetup.connectionId);
    if (!connectionId) {
      return current;
    }
    return current;
  }

  try {
    const next = mergeCoachLinkSnapshot(current, snapshot.payload);
    if (
      next.gameSetup.apiKey !== current.gameSetup.apiKey
      || next.gameSetup.schoolId !== current.gameSetup.schoolId
      || next.gameSetup.connectionId !== current.gameSetup.connectionId
      || next.gameSetup.syncedConnectionId !== current.gameSetup.syncedConnectionId
      || next.gameSetup.liveSessionId !== current.gameSetup.liveSessionId
    ) {
      saveAppData(next);
      setAppData(next);
    }
    return next;
  } catch {
    return current;
  }
}

export function hasWriteCredential(headers: Record<string, string>): boolean {
  return Boolean(headers.Authorization || headers["x-api-key"]);
}

export interface StartGameDeps {
  preGameNotes: string;
  showInlineNotice: (msg: string, tone: "success" | "warning" | "error" | "info", ms?: number) => void;
  persistPhase: (phase: "pre-game" | "live" | "post-game") => void;
  resetTimeline: (gameIdToReset: string) => void;
  setAppData: Dispatch<SetStateAction<AppData>>;
}

export async function startGame(deps: StartGameDeps, newGameId?: string): Promise<void> {
  const { preGameNotes, showInlineNotice, persistPhase, resetTimeline, setAppData } = deps;
  let latest = loadAppData();
  const gid = newGameId ?? latest.gameSetup.gameId;
  let effectiveGameId = gid;
  let shouldResetEventTimeline = false;
  let serverOpponentName: string | undefined;
  let serverVcSide: "home" | "away" | undefined;

  if (!latest.gameSetup.apiKey?.trim()) {
    latest = await refreshOperatorAuthFromConnection(latest, setAppData);
  }

  if (!latest.gameSetup.schoolId?.trim()) {
    showInlineNotice(
      "School scope is not synced yet. Tap Sync Now on Ready to Track, wait for sync to complete, then Start Game.",
      "warning",
      7000,
    );
    return;
  }

  const requestHeaders = { "Content-Type": "application/json", ...apiKeyHeader(latest.gameSetup) };
  if (!hasWriteCredential(requestHeaders)) {
    showInlineNotice(
      "Live auth token is missing. Tap Sync Now on Ready to Track, then try Start Game again.",
      "warning",
      7000,
    );
    return;
  }

  try {
    let res = await fetch(`${latest.gameSetup.apiUrl}/api/games`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(buildRealtimeGameRegistrationPayload(latest.gameSetup, gid, preGameNotes)),
    });

    if (res.status === 401) {
      latest = await refreshOperatorAuthFromConnection(latest, setAppData);
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
      if (res.status === 409) {
        let parsed: {
          activeGameId?: string;
          activeState?: { gameId?: string; homeTeamId?: string; awayTeamId?: string; opponentName?: string };
        } = {};
        try { parsed = JSON.parse(body); } catch { /* ignore */ }
        const activeGameId = typeof parsed.activeGameId === "string"
          ? parsed.activeGameId
          : (typeof parsed.activeState?.gameId === "string" ? parsed.activeState.gameId : null);
        if (!activeGameId) {
          showInlineNotice(
            "Live server already has an active game in progress. Resume or submit that game before starting a new one.",
            "error",
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
          "error",
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
  } catch {
    showInlineNotice(
      `Could not reach the live server at ${latest.gameSetup.apiUrl}. Make sure the realtime API is running, then go to Settings > Game Setup and tap Start Game again.`,
      "error",
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
