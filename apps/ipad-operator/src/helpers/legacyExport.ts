import { type Dispatch, type SetStateAction } from "react";
import type { GameEvent } from "@bta/shared-schema";
import type { AppData, Team, TeamSide } from "../types.js";
import { apiKeyHeader, isLegacyStatsExportConfigured } from "./network.js";
import { computeDashboardPlayerStats, computeTeamStats } from "./players.js";

export function buildLegacyDashboardApiUrl(rawDashboardUrl: string, apiPath: string): string | null {
  const trimmed = rawDashboardUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return new URL(apiPath, `${parsed.origin}/`).toString();
  } catch {
    const sanitized = trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (!sanitized) return null;
    return `${sanitized}${apiPath}`;
  }
}

export interface SubmitToDashboardDeps {
  appData: AppData;
  gameDate: string;
  scores: { home: number; away: number };
  homeTeam: Team | undefined;
  awayTeam: Team | undefined;
  vcTeamId: string;
  allEventObjs: GameEvent[];
  setSubmitStatus: Dispatch<SetStateAction<"idle" | "pending" | "success" | "error">>;
  setSubmitMessage: Dispatch<SetStateAction<string>>;
  showInlineNotice: (msg: string, tone: "success" | "warning" | "error" | "info", ms?: number) => void;
  persistData: (next: AppData) => void;
}

export async function submitToDashboard(
  deps: SubmitToDashboardDeps,
  overrides?: { opponent?: string; date?: string; homeScore?: number; awayScore?: number },
): Promise<boolean> {
  const {
    appData, gameDate, scores, homeTeam, awayTeam, vcTeamId, allEventObjs,
    setSubmitStatus, setSubmitMessage, showInlineNotice, persistData,
  } = deps;
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

  const ingestUrl = buildLegacyDashboardApiUrl(dashboardUrl, "/api/ingest-game");
  if (!ingestUrl) {
    setSubmitMessage("Legacy stats export URL is invalid. Update Settings > Game Setup.");
    showInlineNotice(
      "Legacy stats export URL is invalid. Update Settings > Game Setup > Legacy Stats Export URL and retry.",
      "error",
    );
    setSubmitStatus("error");
    return false;
  }

  try {
    const res = await fetch(ingestUrl, {
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
        "error",
      );
      setSubmitStatus("error");
      return false;
    }
  } catch (err) {
    console.error("Could not reach Stats dashboard:", err);
    setSubmitMessage(`Could not reach dashboard at ${dashboardUrl}. Start the dashboard or update the URL in Game Setup.`);
    showInlineNotice(
      `Could not reach the legacy stats export endpoint at ${dashboardUrl}. Start that service or update Settings > Game Setup > Legacy Stats Export URL, then retry.`,
      "error",
    );
    setSubmitStatus("error");
    return false;
  }
}
