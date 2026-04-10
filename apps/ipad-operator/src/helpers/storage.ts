import { normalizeTeamColor } from "@bta/shared-schema";
import { APP_DATA_KEY, DEFAULT_API, DEFAULT_AWAY_TEAM_COLOR, DEFAULT_HOME_TEAM_COLOR, DEFAULT_SCHOOL_ID, DEVICE_NAME_KEY, OPERATOR_ID_KEY, STORE } from "../constants.js";
import type { AppData, GameSetup, OpponentTrackStat } from "../types.js";
import { DEFAULT_OPPONENT_TRACK_STATS } from "../types.js";
import { normalizeConnectionId, normalizeOpponentTrackStats } from "./network.js";
import type { GameEvent } from "@bta/shared-schema";

const DEFAULT_DATA: AppData = {
  teams: [],
  gameSetup: {
    gameId: "game-1",
    myTeamId: "",
    apiUrl: DEFAULT_API,
    schoolId: DEFAULT_SCHOOL_ID,
    opponent: "",
    vcSide: "home",
    dashboardUrl: "",
    clockVisible: true,
    clockEnabled: true,
    trackClock: true,
    trackPossession: true,
    trackTimeouts: true,
    opponentTrackStats: [...DEFAULT_OPPONENT_TRACK_STATS],
    homeTeamColor: DEFAULT_HOME_TEAM_COLOR,
    awayTeamColor: DEFAULT_AWAY_TEAM_COLOR,
  },
};

export { DEFAULT_DATA };

function withStandardizedTeams(data: AppData): AppData {
  const teams = data.teams;
  const hasSelectedTeam = teams.some((t) => t.id === data.gameSetup.myTeamId);
  const gameSetup = hasSelectedTeam
    ? data.gameSetup
    : { ...data.gameSetup, myTeamId: "" };
  return { ...data, teams, gameSetup };
}

function isValidApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    return parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function clearOperatorLocalCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key === DEVICE_NAME_KEY) continue;
    if (key === APP_DATA_KEY || key.startsWith(`${STORE}:`) || key.startsWith("operator-console:")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

function normalizeDeviceName(value: string | null | undefined): string | undefined {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function loadAppData(): AppData {
  const persistedDeviceName = normalizeDeviceName(localStorage.getItem(DEVICE_NAME_KEY));
  const qp = new URLSearchParams(window.location.search);
  const urlSetup: Partial<GameSetup> = {};

  const qrApiUrl = qp.get("apiUrl");
  if (qrApiUrl && isValidApiUrl(qrApiUrl)) {
    urlSetup.apiUrl = qrApiUrl;
  }

  if (qp.get("apiKey"))      urlSetup.apiKey      = qp.get("apiKey")!;
  if (qp.get("schoolId"))    urlSetup.schoolId    = qp.get("schoolId")!;
  if (qp.get("dashboardUrl")) urlSetup.dashboardUrl = qp.get("dashboardUrl")!;
  if (qp.get("gameId"))      urlSetup.gameId      = qp.get("gameId")!;
  if (qp.get("connectionId")) urlSetup.connectionId = normalizeConnectionId(qp.get("connectionId"));
  if (qp.get("opponent"))    urlSetup.opponent    = qp.get("opponent")!;
  if (qp.get("vcSide") === "home" || qp.get("vcSide") === "away") urlSetup.vcSide = qp.get("vcSide") as "home" | "away";
  if (qp.get("clockVisible") === "1" || qp.get("clockVisible") === "0") urlSetup.clockVisible = qp.get("clockVisible") === "1";
  if (qp.get("clockEnabled") === "1" || qp.get("clockEnabled") === "0") urlSetup.clockEnabled = qp.get("clockEnabled") === "1";
  if (qp.get("trackClock") === "1" || qp.get("trackClock") === "0") urlSetup.trackClock = qp.get("trackClock") === "1";
  if (qp.get("trackPossession") === "1" || qp.get("trackPossession") === "0") urlSetup.trackPossession = qp.get("trackPossession") === "1";
  if (qp.get("trackTimeouts") === "1" || qp.get("trackTimeouts") === "0") urlSetup.trackTimeouts = qp.get("trackTimeouts") === "1";
  if (qp.get("opponentTrackStats")) urlSetup.opponentTrackStats = normalizeOpponentTrackStats((qp.get("opponentTrackStats") ?? "").split(","));
  if (qp.get("homeColor")) urlSetup.homeTeamColor = normalizeTeamColor(qp.get("homeColor") ?? undefined) ?? DEFAULT_HOME_TEAM_COLOR;
  if (qp.get("awayColor")) urlSetup.awayTeamColor = normalizeTeamColor(qp.get("awayColor") ?? undefined) ?? DEFAULT_AWAY_TEAM_COLOR;

  // Keep local operator data across app restarts by default.
  // A deliberate reset can be requested with ?reset=1 (or true/yes).
  const shouldResetCache = /^(1|true|yes)$/i.test((qp.get("reset") ?? "").trim());
  if (shouldResetCache) {
    clearOperatorLocalCache();
  }

  try {
    const s = localStorage.getItem(APP_DATA_KEY);
    if (s) {
      const parsed = JSON.parse(s) as AppData;
      const gs = { ...DEFAULT_DATA.gameSetup, ...parsed.gameSetup };
      if (!gs.myTeamId) {
        const side = gs.vcSide ?? "home";
        const legacyId = side === "home" ? (gs as GameSetup).homeTeamId : (gs as GameSetup).awayTeamId;
        if (legacyId) gs.myTeamId = legacyId;
      }
      gs.connectionId = normalizeConnectionId(gs.connectionId);
      gs.syncedConnectionId = normalizeConnectionId(gs.syncedConnectionId);
      gs.trackClock = gs.trackClock ?? true;
      gs.schoolId = gs.schoolId?.trim() || DEFAULT_SCHOOL_ID;
      gs.trackPossession = gs.trackPossession ?? true;
      gs.trackTimeouts = gs.trackTimeouts ?? true;
      gs.opponentTrackStats = normalizeOpponentTrackStats(gs.opponentTrackStats);
      gs.homeTeamColor = normalizeTeamColor(gs.homeTeamColor) ?? DEFAULT_HOME_TEAM_COLOR;
      gs.awayTeamColor = normalizeTeamColor(gs.awayTeamColor) ?? DEFAULT_AWAY_TEAM_COLOR;
      gs.deviceName = normalizeDeviceName(gs.deviceName) ?? persistedDeviceName;
      return withStandardizedTeams({
        ...DEFAULT_DATA,
        ...parsed,
        gameSetup: { ...gs, ...urlSetup },
      });
    }
  } catch { /* empty */ }
  return withStandardizedTeams({
    ...DEFAULT_DATA,
    gameSetup: {
      ...DEFAULT_DATA.gameSetup,
      ...urlSetup,
      deviceName: persistedDeviceName,
    },
  });
}

export function saveAppData(d: AppData) {
  localStorage.setItem(APP_DATA_KEY, JSON.stringify(d));
  const normalizedDeviceName = normalizeDeviceName(d.gameSetup.deviceName);
  if (normalizedDeviceName) {
    localStorage.setItem(DEVICE_NAME_KEY, normalizedDeviceName);
  } else {
    localStorage.removeItem(DEVICE_NAME_KEY);
  }
}

// ---- Per-game event/seq persistence ----
export function pendingKey(gid: string) { return `${STORE}:${gid}:pending`; }
export function seqKey(gid: string) { return `${STORE}:${gid}:seq`; }
export function loadPending(gid: string): GameEvent[] {
  try { const s = localStorage.getItem(pendingKey(gid)); return s ? JSON.parse(s) as GameEvent[] : []; } catch { return []; }
}
export function savePending(gid: string, evts: GameEvent[]) { localStorage.setItem(pendingKey(gid), JSON.stringify(evts)); }
export function loadSeq(gid: string) { const s = localStorage.getItem(seqKey(gid)); return s ? +s : 1; }
export function saveSeq(gid: string, seq: number) { localStorage.setItem(seqKey(gid), String(seq)); }

export function uid() { return `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export function normalizeOperatorId(value: string | null | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
  return normalized.length > 0 ? normalized : null;
}

export function createOperatorId(): string {
  return `op-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateOperatorId(): string {
  try {
    const existing = normalizeOperatorId(localStorage.getItem(OPERATOR_ID_KEY));
    if (existing) {
      return existing;
    }
    const created = createOperatorId();
    localStorage.setItem(OPERATOR_ID_KEY, created);
    return created;
  } catch {
    return createOperatorId();
  }
}
