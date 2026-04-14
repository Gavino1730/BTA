import { isLocalNetworkHost, normalizeTeamColor } from "@bta/shared-schema";
import { buildAuthHeaders, convertRosterTeamToAppTeam } from "../roster-sync.js";
import { DEFAULT_COACH_DASHBOARD, DEFAULT_HOME_TEAM_COLOR, DEFAULT_AWAY_TEAM_COLOR, DEFAULT_SCHOOL_ID } from "../constants.js";
import type { AppData, GameSetup, OperatorLinkResponse, OpponentTrackStat } from "../types.js";
import { OPPONENT_TRACK_STAT_OPTIONS, DEFAULT_OPPONENT_TRACK_STATS } from "../types.js";

const COACH_DASHBOARD_OVERRIDE_KEY = "operator-console:coach-dashboard-url";

function resolveCoachDashboardBaseUrl(): string {
  try {
    const overrideValue = localStorage.getItem(COACH_DASHBOARD_OVERRIDE_KEY)?.trim() ?? "";
    if (overrideValue) {
      return overrideValue.replace(/\/+$/, "");
    }
  } catch {
    // Fallback to env/runtime default below.
  }

  return DEFAULT_COACH_DASHBOARD.replace(/\/+$/, "");
}

export function normalizeConnectionId(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

export function normalizeUrlBase(url: string | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "");
}

export function normalizeOpponentTrackStats(value: string[] | undefined): OpponentTrackStat[] {
  if (!value || value.length === 0) return [...DEFAULT_OPPONENT_TRACK_STATS];
  const normalized = value
    .map((x) => x.trim())
    .filter((x): x is OpponentTrackStat => (OPPONENT_TRACK_STAT_OPTIONS as readonly string[]).includes(x));
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...DEFAULT_OPPONENT_TRACK_STATS];
}

export function apiKeyHeader(setup: { apiKey?: string; schoolId?: string }): Record<string, string> {
  return buildAuthHeaders(setup, { allowBearerToken: true });
}

export function operatorLinkHeaders(setup: { schoolId?: string }): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const schoolId = setup.schoolId?.trim();
  if (schoolId) {
    headers["x-school-id"] = schoolId;
  }
  return headers;
}

export async function fetchOperatorLinkSnapshot(setup: {
  apiUrl?: string;
  connectionId?: string;
  syncedConnectionId?: string;
  schoolId?: string;
}): Promise<{ connectionId: string; payload: OperatorLinkResponse } | null> {
  const apiUrl = normalizeUrlBase(setup.apiUrl);
  const connectionId = normalizeConnectionId(setup.syncedConnectionId || setup.connectionId);
  if (!apiUrl || !connectionId) {
    return null;
  }

  const endpoint = `${apiUrl}/api/operator-links/${encodeURIComponent(connectionId)}`;
  const scopedResponse = await fetch(endpoint, {
    headers: operatorLinkHeaders({ schoolId: setup.schoolId }),
  }).catch(() => null);

  if (scopedResponse?.ok) {
    const payload = (await scopedResponse.json()) as OperatorLinkResponse;
    return { connectionId, payload };
  }

  const shouldTryUnscoped = Boolean(setup.schoolId?.trim())
    && (scopedResponse?.status === 400 || scopedResponse?.status === 401 || scopedResponse?.status === 404 || scopedResponse?.status === 409);
  if (!shouldTryUnscoped) {
    return null;
  }

  const unscopedResponse = await fetch(endpoint, {
    headers: operatorLinkHeaders({}),
  }).catch(() => null);
  if (!unscopedResponse?.ok) {
    return null;
  }

  const payload = (await unscopedResponse.json()) as OperatorLinkResponse;
  return { connectionId, payload };
}

export function apiHeaders(setup: { apiKey?: string; schoolId?: string }): RequestInit {
  return { headers: apiKeyHeader(setup) };
}

export function isConnectionReadyForStart(setup: { connectionId?: string; syncedConnectionId?: string }): boolean {
  const connectionId = normalizeConnectionId(setup.connectionId);
  const syncedConnectionId = normalizeConnectionId(setup.syncedConnectionId);
  return Boolean(connectionId) && connectionId === syncedConnectionId;
}

export function buildCoachViewUrl(
  gameId: string,
  setup: {
    connectionId?: string;
    myTeamId?: string;
    myTeamName?: string;
    opponentName?: string;
    vcSide?: "home" | "away";
    homeTeamColor?: string;
    awayTeamColor?: string;
    schoolId?: string;
  }
): string {
  const base = resolveCoachDashboardBaseUrl();
  const params = new URLSearchParams();
  const connId = normalizeConnectionId(setup.connectionId);
  const schoolId = setup.schoolId?.trim() || DEFAULT_SCHOOL_ID;
  if (connId) params.set("connectionId", connId);
  if (schoolId) params.set("schoolId", schoolId);
  if (gameId) params.set("gameId", gameId);
  if (setup.myTeamId) params.set("myTeamId", setup.myTeamId);
  if (setup.myTeamName) params.set("myTeamName", setup.myTeamName);
  if (setup.opponentName) params.set("opponentName", setup.opponentName);
  if (setup.vcSide) params.set("vcSide", setup.vcSide);
  if (setup.homeTeamColor) params.set("homeColor", setup.homeTeamColor);
  if (setup.awayTeamColor) params.set("awayColor", setup.awayTeamColor);
  return `${base}/?${params.toString()}`;
}

export function buildAiContextFromSetup(setup: GameSetup): {
  clockEnabled: boolean;
  opponentStatsLimited: boolean;
  opponentTrackedStats: string[];
} {
  const opponentTrackedStats = normalizeOpponentTrackStats(setup.opponentTrackStats);
  const limitedSet = new Set<OpponentTrackStat>(["points", "foul"]);
  const opponentStatsLimited = opponentTrackedStats.every((stat) => limitedSet.has(stat));
  return {
    clockEnabled: (setup.clockEnabled ?? true) && (setup.trackClock ?? true),
    opponentStatsLimited,
    opponentTrackedStats
  };
}

export function generateGameId(opponent: string, date: string): string {
  const slug = (opponent || "game").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "game";
  const d = date || new Date().toISOString().slice(0, 10);
  return `${d}-${slug}`;
}

export function generateFreshGameId(
  opponent: string,
  date: string,
  reason: "reset" | "discard" = "discard",
  nowMs: number = Date.now(),
): string {
  const base = generateGameId(opponent, date);
  // Keep IDs readable but unique enough to avoid restoring stale server events.
  const suffix = String(nowMs).slice(-6);
  return `${base}-${reason}-${suffix}`;
}

export function mergeCoachLinkSnapshot(current: AppData, snapshot: OperatorLinkResponse): AppData {
  const convertedTeams = Array.isArray(snapshot.teams)
    ? snapshot.teams.map(convertRosterTeamToAppTeam)
    : current.teams;
  const nextSide = snapshot.setup?.vcSide === "away"
    ? "away"
    : snapshot.setup?.vcSide === "home"
      ? "home"
      : (current.gameSetup.vcSide ?? "home");
  const nextTeamId = snapshot.setup?.myTeamId?.trim() || current.gameSetup.myTeamId || convertedTeams[0]?.id || "";
  const selectedTeam = convertedTeams.find((team) => team.id === nextTeamId);
  const allowedPlayerIds = new Set((selectedTeam?.players ?? []).map((player) => player.id));
  const snapshotLineup = Array.isArray(snapshot.setup?.startingLineup) && snapshot.setup!.startingLineup!.length > 0
    ? snapshot.setup!.startingLineup!.filter((playerId) => allowedPlayerIds.has(playerId))
    : null;
  const safeStartingLineup = snapshotLineup
    ?? (Array.isArray(current.gameSetup.startingLineup)
      ? current.gameSetup.startingLineup.filter((playerId) => allowedPlayerIds.has(playerId))
      : []);

  const resolvedConnectionId = normalizeConnectionId(snapshot.connectionId || current.gameSetup.connectionId);

  return {
    ...current,
    teams: convertedTeams,
    gameSetup: {
      ...current.gameSetup,
      schoolId: snapshot.schoolId?.trim() || current.gameSetup.schoolId,
      connectionId: resolvedConnectionId || undefined,
      syncedConnectionId: resolvedConnectionId || undefined,
      gameId: snapshot.setup?.gameId?.trim() || current.gameSetup.gameId,
      myTeamId: nextTeamId,
      opponent: snapshot.setup?.opponentName?.trim() || current.gameSetup.opponent,
      vcSide: nextSide,
      homeTeamColor: normalizeTeamColor(snapshot.setup?.homeTeamColor) ?? current.gameSetup.homeTeamColor ?? DEFAULT_HOME_TEAM_COLOR,
      awayTeamColor: normalizeTeamColor(snapshot.setup?.awayTeamColor) ?? current.gameSetup.awayTeamColor ?? DEFAULT_AWAY_TEAM_COLOR,
      startingLineup: safeStartingLineup,
      apiKey: snapshot.operatorToken ?? current.gameSetup.apiKey,
    },
  };
}
