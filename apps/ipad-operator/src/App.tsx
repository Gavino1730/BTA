import { useEffect, useMemo, useRef, useState } from "react";
import TutorialOverlay from "./TutorialOverlay.js";
import IpadTipsPage from "./IpadTipsPage.js";
import { getPeriodDefaultClock, isOvertimePeriod, normalizeTeamColor, type GameEvent, type RosterTeam } from "@bta/shared-schema";
import { io } from "socket.io-client";
import {
  addPlayerViaRealtime,
  convertRosterTeamToAppTeam,
  createTeamViaRealtime,
  deletePlayerViaRealtime,
  deleteTeamViaRealtime,
  fetchTeamsFromRealtime,
  updatePlayerViaRealtime,
  updateTeamViaRealtime,
} from "./roster-sync.js";

const defaultHost = window.location.hostname || "localhost";
const defaultOrigin = window.location.origin || `http://${defaultHost}`;

function isLocalNetworkHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "0.0.0.0"
    || normalized === "::1"
    || normalized === "[::1]"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
    || /^10(?:\.\d{1,3}){3}$/.test(normalized)
    || /^192\.168(?:\.\d{1,3}){2}$/.test(normalized)
    || /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(normalized)
    || normalized.endsWith(".local")
    || !normalized.includes(".");
}

function resolveDefaultAppBase(hostname: string, origin: string, port: number): string {
  if (isLocalNetworkHost(hostname)) {
    return `http://${hostname}:${port}`;
  }

  return origin.replace(/\/+$/, "") || `https://${hostname}`;
}

function resolveDefaultSchoolId(hostname: string): string {
  return isLocalNetworkHost(hostname) ? "default" : "";
}

const DEFAULT_API = import.meta.env.VITE_API ?? resolveDefaultAppBase(defaultHost, defaultOrigin, 4000);
const DEFAULT_COACH_DASHBOARD = import.meta.env.VITE_COACH_DASHBOARD ?? resolveDefaultAppBase(defaultHost, defaultOrigin, 5173);
const DEFAULT_STATS_DASHBOARD = import.meta.env.VITE_STATS_DASHBOARD ?? resolveDefaultAppBase(defaultHost, defaultOrigin, 4000);
const DEFAULT_SCHOOL_ID = (import.meta.env.VITE_SCHOOL_ID ?? resolveDefaultSchoolId(defaultHost)).toString().trim();
const STORE = "operator-console";
const APP_DATA_KEY = "shared-app-data-v3";
const DEFAULT_HOME_TEAM_COLOR = "#4f8cff";
const DEFAULT_AWAY_TEAM_COLOR = "#f87171";
const OPPONENT_TRACK_STAT_OPTIONS = [
  "points",
  "free_throws",
  "def_reb",
  "off_reb",
  "turnover",
  "steal",
  "assist",
  "block",
  "foul",
] as const;
type OpponentTrackStat = (typeof OPPONENT_TRACK_STAT_OPTIONS)[number];

const DEFAULT_OPPONENT_TRACK_STATS: OpponentTrackStat[] = [...OPPONENT_TRACK_STAT_OPTIONS];

function normalizeOpponentTrackStats(value: string[] | undefined): OpponentTrackStat[] {
  if (!value || value.length === 0) return [...DEFAULT_OPPONENT_TRACK_STATS];
  const normalized = value
    .map((x) => x.trim())
    .filter((x): x is OpponentTrackStat => (OPPONENT_TRACK_STAT_OPTIONS as readonly string[]).includes(x));
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...DEFAULT_OPPONENT_TRACK_STATS];
}

const TEAM_COLOR_OPTIONS = [
  "#4f8cff",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
] as const;

/** Returns `{ "x-api-key": key }` when a key is configured, otherwise `{}`. */
function apiKeyHeader(setup: { apiKey?: string; schoolId?: string }): Record<string, string> {
  const headers: Record<string, string> = {};
  const schoolId = setup.schoolId?.trim() || DEFAULT_SCHOOL_ID;
  if (schoolId) {
    headers["x-school-id"] = schoolId;
  }
  if (setup.apiKey) {
    headers["x-api-key"] = setup.apiKey;
  }
  return headers;
}
/** Returns RequestInit for a plain GET request, adding the API key header when configured. */
function apiHeaders(setup: { apiKey?: string; schoolId?: string }): RequestInit {
  return { headers: apiKeyHeader(setup) };
}

function normalizeUrlBase(url: string | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "");
}

function isLegacyStatsExportConfigured(setup: { apiUrl?: string; dashboardUrl?: string }): boolean {
  const apiBase = normalizeUrlBase(setup.apiUrl);
  const dashboardBase = normalizeUrlBase(setup.dashboardUrl);
  if (!dashboardBase) return false;
  return dashboardBase !== apiBase;
}

function buildAiContextFromSetup(setup: GameSetup): {
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

function buildCoachViewUrl(
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
  const base = DEFAULT_COACH_DASHBOARD.replace(/\/$/, "");
  const params = new URLSearchParams();
  const normalizedConnectionId = normalizeConnectionId(setup.connectionId);
  const schoolId = setup.schoolId?.trim() || DEFAULT_SCHOOL_ID;
  if (normalizedConnectionId) {
    params.set("connectionId", normalizedConnectionId);
  }
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

function normalizeConnectionId(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

type TeamSide = "home" | "away";
type SettingsView = "menu" | "game-setup" | "ipad-tips";

export interface Player {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;   // e.g. "6'2\""
  grade?: string;    // e.g. "11"
}

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  teamColor?: string;
  players: Player[];
}

export interface GameSetup {
  gameId: string;
  connectionId?: string;
  myTeamId: string;      // the team you are tracking
  apiUrl: string;        // Realtime API (http://<laptop-ip>:4000)
  apiKey?: string;       // shared secret sent as x-api-key header
  schoolId?: string;
  opponent: string;
  vcSide: "home" | "away";
  dashboardUrl: string;
  clockVisible?: boolean;
  clockEnabled?: boolean;
  trackClock?: boolean;
  trackPossession?: boolean;
  trackTimeouts?: boolean;
  opponentTrackStats?: OpponentTrackStat[];
  homeTeamColor?: string;
  awayTeamColor?: string;
  statsGameId?: number;  // returned by dashboard on first successful submit
  startingLineup?: string[];  // player IDs in the starting lineup
  /** @deprecated use myTeamId + vcSide instead */
  homeTeamId?: string;
  /** @deprecated use myTeamId + vcSide instead */
  awayTeamId?: string;
}

export interface AppData {
  teams: Team[];
  gameSetup: GameSetup;
}

interface OperatorLinkResponse {
  connectionId: string;
  setup?: {
    gameId?: string;
    myTeamId?: string;
    myTeamName?: string;
    opponentName?: string;
    vcSide?: "home" | "away";
    homeTeamColor?: string;
    awayTeamColor?: string;
    dashboardUrl?: string;
    updatedAtIso?: string;
  } | null;
  teams?: RosterTeam[];
}

const DEFAULT_CONNECTION_SYNC_STATUS = "Paste the coach connection code to sync roster, team setup, and keep a local backup on this iPad.";

function mergeCoachLinkSnapshot(current: AppData, snapshot: OperatorLinkResponse): AppData {
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
  const safeStartingLineup = Array.isArray(current.gameSetup.startingLineup)
    ? current.gameSetup.startingLineup.filter((playerId) => allowedPlayerIds.has(playerId))
    : [];

  return {
    ...current,
    teams: convertedTeams,
    gameSetup: {
      ...current.gameSetup,
      connectionId: normalizeConnectionId(snapshot.connectionId || current.gameSetup.connectionId) || undefined,
      gameId: snapshot.setup?.gameId?.trim() || current.gameSetup.gameId,
      myTeamId: nextTeamId,
      opponent: snapshot.setup?.opponentName?.trim() || current.gameSetup.opponent,
      vcSide: nextSide,
      dashboardUrl: snapshot.setup?.dashboardUrl?.trim() || current.gameSetup.dashboardUrl,
      homeTeamColor: normalizeTeamColor(snapshot.setup?.homeTeamColor, current.gameSetup.homeTeamColor ?? DEFAULT_HOME_TEAM_COLOR),
      awayTeamColor: normalizeTeamColor(snapshot.setup?.awayTeamColor, current.gameSetup.awayTeamColor ?? DEFAULT_AWAY_TEAM_COLOR),
      startingLineup: safeStartingLineup,
    },
  };
}

const DEFAULT_DATA: AppData = {
  teams: [],
  gameSetup: {
    gameId: "game-1",
    myTeamId: "",
    apiUrl: DEFAULT_API,
    schoolId: DEFAULT_SCHOOL_ID,
    opponent: "",
    vcSide: "home",
    dashboardUrl: DEFAULT_STATS_DASHBOARD,
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

const STANDARD_TEST_TEAM: Team = {
  id: "team-usa",
  name: "USA",
  abbreviation: "USA",
  players: [
    { id: "usa-4", number: "4", name: "Stephen Curry", position: "PG", height: "6'2\"", grade: "Pro" },
    { id: "usa-6", number: "6", name: "LeBron James", position: "SF", height: "6'9\"", grade: "Pro" },
    { id: "usa-7", number: "7", name: "Kevin Durant", position: "SF", height: "6'10\"", grade: "Pro" },
    { id: "usa-8", number: "8", name: "Kobe Bryant", position: "SG", height: "6'6\"", grade: "Pro" },
    { id: "usa-9", number: "9", name: "Michael Jordan", position: "SG", height: "6'6\"", grade: "Pro" },
    { id: "usa-10", number: "10", name: "Magic Johnson", position: "PG", height: "6'9\"", grade: "Pro" },
    { id: "usa-11", number: "11", name: "Kyrie Irving", position: "PG", height: "6'2\"", grade: "Pro" },
    { id: "usa-13", number: "13", name: "Anthony Davis", position: "PF", height: "6'10\"", grade: "Pro" },
    { id: "usa-15", number: "15", name: "Carmelo Anthony", position: "PF", height: "6'7\"", grade: "Pro" },
    { id: "usa-34", number: "34", name: "Shaquille O'Neal", position: "C", height: "7'1\"", grade: "Pro" },
  ],
};

function withStandardizedTeams(data: AppData): AppData {
  const hasTestTeam = data.teams.some((t) => t.id === STANDARD_TEST_TEAM.id);
  const teams = hasTestTeam ? data.teams : [...data.teams, STANDARD_TEST_TEAM];
  const hasSelectedTeam = teams.some((t) => t.id === data.gameSetup.myTeamId);
  const gameSetup = hasSelectedTeam
    ? data.gameSetup
    : { ...data.gameSetup, myTeamId: STANDARD_TEST_TEAM.id };
  return { ...data, teams, gameSetup };
}

// ---- Storage helpers ----
function isValidApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    // Ensure hostname is not empty
    return parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function loadAppData(): AppData {
  // Check URL params first - a QR-code scan may carry config overrides.
  const qp = new URLSearchParams(window.location.search);
  const urlSetup: Partial<GameSetup> = {};
  
  // Validate API URL from QR code - only allow whitelisted or same-origin URLs
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

  try {
    const s = localStorage.getItem(APP_DATA_KEY);
    if (s) {
      const parsed = JSON.parse(s) as AppData;
      const gs = { ...DEFAULT_DATA.gameSetup, ...parsed.gameSetup };
      // Migrate old saves that used homeTeamId/awayTeamId instead of myTeamId
      if (!gs.myTeamId) {
        const side = gs.vcSide ?? "home";
        const legacyId = side === "home" ? (gs as GameSetup).homeTeamId : (gs as GameSetup).awayTeamId;
        if (legacyId) gs.myTeamId = legacyId;
      }
      gs.connectionId = normalizeConnectionId(gs.connectionId);
      gs.trackClock = gs.trackClock ?? true;
      gs.schoolId = gs.schoolId?.trim() || DEFAULT_SCHOOL_ID;
      gs.trackPossession = gs.trackPossession ?? true;
      gs.trackTimeouts = gs.trackTimeouts ?? true;
      gs.opponentTrackStats = normalizeOpponentTrackStats(gs.opponentTrackStats);
      gs.homeTeamColor = normalizeTeamColor(gs.homeTeamColor) ?? DEFAULT_HOME_TEAM_COLOR;
      gs.awayTeamColor = normalizeTeamColor(gs.awayTeamColor) ?? DEFAULT_AWAY_TEAM_COLOR;
      return withStandardizedTeams({
        ...DEFAULT_DATA,
        ...parsed,
        // Deep-merge gameSetup so new fields get their defaults for old saves
        gameSetup: { ...gs, ...urlSetup },
      });
    }
  } catch { /* empty */ }
  return withStandardizedTeams({ ...DEFAULT_DATA, gameSetup: { ...DEFAULT_DATA.gameSetup, ...urlSetup } });
}
function saveAppData(d: AppData) { localStorage.setItem(APP_DATA_KEY, JSON.stringify(d)); }
function pendingKey(gid: string) { return `${STORE}:${gid}:pending`; }
function seqKey(gid: string) { return `${STORE}:${gid}:seq`; }
function loadPending(gid: string): GameEvent[] {
  try { const s = localStorage.getItem(pendingKey(gid)); return s ? JSON.parse(s) as GameEvent[] : []; } catch { return []; }
}
function savePending(gid: string, evts: GameEvent[]) { localStorage.setItem(pendingKey(gid), JSON.stringify(evts)); }
function loadSeq(gid: string) { const s = localStorage.getItem(seqKey(gid)); return s ? +s : 1; }
function saveSeq(gid: string, seq: number) { localStorage.setItem(seqKey(gid), String(seq)); }
function uid() { return `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// ---- Utilities ----
function clockToSec(clock: string): number {
  const colonIdx = clock.indexOf(":");
  if (colonIdx === -1) return Number(clock) || 0;
  const m = Number(clock.slice(0, colonIdx)) || 0;
  const s = Number(clock.slice(colonIdx + 1)) || 0;
  return m * 60 + s;
}

// Parse raw numpad string (digits + optional single dot for tenths) -> formatted clock string
function formatClockFromPadInput(raw: string): string {
  if (!raw) return "0:00";
  const dotIdx = raw.indexOf(".");
  if (dotIdx !== -1) {
    // decimal mode: everything before dot = whole seconds, after = tenths
    const secStr = raw.slice(0, dotIdx) || "0";
    const tenthStr = raw.slice(dotIdx + 1).slice(0, 1) || "0";
    const sec = Math.min(59, parseInt(secStr, 10) || 0);
    const tenth = parseInt(tenthStr, 10) || 0;
    return `0:${String(sec).padStart(2, "0")}.${tenth}`;
  }
  // no dot: treat as MMSS-style digits
  return formatClockFromDigits(raw);
}

function formatClockFromSeconds(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  if (safe < 60) {
    const tenthsTotal = Math.floor((safe * 10) + 1e-6);
    const s = Math.floor(tenthsTotal / 10);
    const t = tenthsTotal % 10;
    return `0:${String(s).padStart(2, "0")}.${t}`;
  }
  const whole = Math.floor(safe + 1e-6);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatClockFromDigits(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "0:00";
  const minuteDigits = digits.length <= 2 ? "0" : digits.slice(0, -2);
  const secondDigits = digits.length <= 2 ? digits : digits.slice(-2);
  const m = Number.parseInt(minuteDigits || "0", 10) || 0;
  const s = Number.parseInt(secondDigits || "0", 10) || 0;
  return formatClockFromSeconds((m * 60) + Math.min(s, 59));
}

function playerDisplayName(id: string, allPlayers: Player[]): string {
  const p = allPlayers.find(x => x.id === id);
  return p ? `#${p.number} ${p.name}` : id;
}

interface RunningTotals {
  points: number; fgm: number; fga: number; threePm: number; threePa: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; ast: number; stl: number; blk: number; to: number; fouls: number;
}
function computePlayerTotals(events: GameEvent[]): Record<string, RunningTotals> {
  const map: Record<string, RunningTotals> = {};
  function get(id: string) {
    if (!map[id]) map[id] = { points: 0, fgm: 0, fga: 0, threePm: 0, threePa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, fouls: 0 };
    return map[id];
  }
  for (const e of events) {
    if (e.type === "shot_attempt") {
      const t = get(e.playerId);
      t.fga++;
      if (e.points === 3) t.threePa++;
      if (e.made) {
        t.fgm++;
        t.points += e.points;
        if (e.points === 3) t.threePm++;
      }
    } else if (e.type === "free_throw_attempt") {
      const t = get(e.playerId);
      t.fta++;
      if (e.made) {
        t.ftm++;
        t.points += 1;
      }
    } else if (e.type === "rebound") {
      const t = get(e.playerId);
      if (e.offensive) t.oreb++; else t.dreb++;
    } else if (e.type === "assist") {
      get(e.playerId).ast++;
    } else if (e.type === "steal") {
      get(e.playerId).stl++;
    } else if (e.type === "block") {
      get(e.playerId).blk++;
    } else if (e.type === "turnover") {
      if (e.playerId) get(e.playerId).to++;
    } else if (e.type === "foul") {
      get(e.playerId).fouls++;
    }
  }
  return map;
}
function computeScores(events: GameEvent[], homeTeamId: string, awayTeamId: string) {
  const s = { home: 0, away: 0 };
  for (const e of events) {
    if (e.type === "shot_attempt" && e.made) {
      if (e.teamId === homeTeamId) s.home += e.points;
      if (e.teamId === awayTeamId) s.away += e.points;
    }
    if (e.type === "free_throw_attempt" && e.made) {
      if (e.teamId === homeTeamId) s.home += 1;
      if (e.teamId === awayTeamId) s.away += 1;
    }
  }
  return s;
}

function generateGameId(opponent: string, date: string): string {
  const slug = (opponent || "game").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "game";
  const d = date || new Date().toISOString().slice(0, 10);
  return `${d}-${slug}`;
}

function computePlusMinus(events: GameEvent[], vcTeamId: string): Record<string, number> {
  const pm: Record<string, number> = {};
  const vcLineup = new Set<string>();
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  for (const e of sorted) {
    if (e.type === "substitution") {
      if (e.teamId === vcTeamId) { vcLineup.delete(e.playerOutId); vcLineup.add(e.playerInId); }
    } else if (e.type === "shot_attempt" || e.type === "free_throw_attempt" || e.type === "rebound" ||
               e.type === "foul" || e.type === "assist" || e.type === "steal" || e.type === "block") {
      if (e.teamId === vcTeamId) vcLineup.add(e.playerId);
    } else if (e.type === "turnover" && e.playerId) {
      if (e.teamId === vcTeamId) vcLineup.add(e.playerId);
    }
    if ((e.type === "shot_attempt" && e.made) || (e.type === "free_throw_attempt" && e.made)) {
      const points = e.type === "shot_attempt" ? e.points : 1;
      const delta = e.teamId === vcTeamId ? points : -points;
      for (const pid of vcLineup) pm[pid] = (pm[pid] ?? 0) + delta;
    }
  }
  return pm;
}

function computeCurrentLineup(events: GameEvent[], teamId: string, startingLineup: string[], allTeamPlayers: Player[]): { onCourt: Player[], bench: Player[] } {
  const onCourt = new Set<string>(startingLineup);
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  
  for (const e of sorted) {
    if (e.type === "substitution" && e.teamId === teamId) {
      onCourt.delete(e.playerOutId);
      onCourt.add(e.playerInId);
    }
  }

  const onCourtPlayers = allTeamPlayers.filter(p => onCourt.has(p.id));
  const benchPlayers = allTeamPlayers.filter(p => !onCourt.has(p.id));
  
  return { onCourt: onCourtPlayers, bench: benchPlayers };
}


function describeEvent(
  event: GameEvent,
  homeTeamName: string,
  awayTeamName: string,
  allPlayers: Player[],
  pTotals: Record<string, RunningTotals>,
  homeTeamId = "home",
  awayTeamId = "away"
) {
  const tn = (id: string) => id === homeTeamId ? homeTeamName : id === awayTeamId ? awayTeamName : id;
  const pn = (id: string) => {
    if (id === "home-team" || id === "team-home" || id === `${homeTeamId}-team`) return homeTeamName;
    if (id === "away-team" || id === "team-away" || id === `${awayTeamId}-team`) return awayTeamName;
    return playerDisplayName(id, allPlayers);
  };
  switch (event.type) {
    case "shot_attempt": {
      const t = pTotals[event.playerId];
      const fgStr = event.points === 3
        ? (t ? `${t.threePm}-${t.threePa} 3pt` : "3pt")
        : (t ? `${t.fgm}-${t.fga} fg` : `${event.points}pt`);
      const ptsStr = t ? `${t.points}pts` : "";
      return {
        main: event.made ? `${event.points}pt` : `${event.points}pt miss`,
        detail: `${pn(event.playerId)}  ${ptsStr} ${fgStr}`.trim(),
        accent: event.made ? "teal" : "red",
      };
    }
    case "free_throw_attempt": {
      const t = pTotals[event.playerId];
      const ftStr = t ? `${t.ftm}-${t.fta} ft` : "ft";
      const ptsStr = t ? `${t.points}pts` : "";
      return {
        main: event.made ? "ft" : "ft miss",
        detail: `${pn(event.playerId)}  ${ptsStr} ${ftStr}`.trim(),
        accent: event.made ? "teal" : "red",
      };
    }
    case "foul":
      return { main: "foul", detail: `${tn(event.teamId)}  ${pn(event.playerId)}`, accent: "red" };
    case "turnover":
      return { main: "turnover", detail: `${tn(event.teamId)}${event.playerId ? `  ${pn(event.playerId)}` : ""}`, accent: "red" };
    case "rebound":
      return { main: event.offensive ? "off reb" : "def reb", detail: `${tn(event.teamId)}  ${pn(event.playerId)}`, accent: "white" };
    case "assist":
      return { main: "assist", detail: `${tn(event.teamId)}  ${pn(event.playerId)}`, accent: "teal" };
    case "steal":
      return { main: "steal", detail: `${tn(event.teamId)}  ${pn(event.playerId)}`, accent: "teal" };
    case "block":
      return { main: "block", detail: `${tn(event.teamId)}  ${pn(event.playerId)}`, accent: "teal" };
    case "substitution":
      return {
        main: `${pn(event.playerOutId)} -> ${pn(event.playerInId)}`,
        detail: tn(event.teamId),
        accent: "white",
      };
    case "possession_start":
      return { main: "possession", detail: tn(event.possessedByTeamId), accent: "white" };
    case "timeout":
      return {
        main: event.timeoutType === "full" ? "timeout 60" : "timeout 30",
        detail: tn(event.teamId),
        accent: "white",
      };
    case "period_transition":
      return { main: `${event.newPeriod} start`, detail: "", accent: "teal" };
    default:
      return { main: (event as GameEvent).type, detail: "", accent: "white" };
  }
}

function getEventSectionLabel(event: GameEvent): string {
  switch (event.type) {
    case "shot_attempt":
      return "Shot";
    case "free_throw_attempt":
      return "FT";
    case "foul":
      return "Foul";
    case "turnover":
      return "TO";
    case "rebound":
      return "Reb";
    case "assist":
      return "Ast";
    case "steal":
      return "Stl";
    case "block":
      return "Blk";
    case "substitution":
      return "Sub";
    case "possession_start":
      return "Poss";
    case "timeout":
      return "Timeout";
    case "period_transition":
      return "Period";
    default:
      return "Event";
  }
}

function getEventTeamBucket(
  event: GameEvent,
  homeTeamId: string,
  awayTeamId: string,
): "home" | "away" | "neutral" {
  if (event.type === "period_transition") return "neutral";
  const eventTeamId = event.type === "possession_start" ? event.possessedByTeamId : event.teamId;
  if (eventTeamId === homeTeamId) return "home";
  if (eventTeamId === awayTeamId) return "away";
  return "neutral";
}

function getEventTeamSide(eventTeamId: string, homeTeamId: string, awayTeamId: string): TeamSide | null {
  if (eventTeamId === homeTeamId) return "home";
  if (eventTeamId === awayTeamId) return "away";
  return null;
}

function upsertSortedEvent(events: GameEvent[], nextEvent: GameEvent): GameEvent[] {
  return [...events.filter((event) => event.id !== nextEvent.id), nextEvent]
    .sort((left, right) => left.sequence - right.sequence);
}

function removeEventById(events: GameEvent[], eventId: string): GameEvent[] {
  return events.filter((event) => event.id !== eventId);
}

function formatPct(made: number, attempts: number): string {
  if (attempts <= 0) return "0%";
  return `${Math.round((made / attempts) * 100)}%`;
}

interface SharedLiveInsight {
  id: string;
  type: string;
  message: string;
  explanation: string;
  confidence: "low" | "medium" | "high";
  relatedTeamId?: string;
  relatedPlayerId?: string;
}

function playerNameFromId(playerId: string | undefined, players: Player[]): string {
  if (!playerId) return "Team";
  const match = players.find((p) => p.id === playerId);
  return match?.name ?? playerId;
}

// ---- Dashboard stats helpers (legacy export + summaries) ----

function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0][0]} ${parts.slice(1).join(" ")}`;
}

interface DashboardPlayerStat {
  number: number; name: string;
  height?: string; grade?: string;
  fg_made: number; fg_att: number; fg_pct: string;
  fg3_made: number; fg3_att: number; fg3_pct: string;
  ft_made: number; ft_att: number; ft_pct: string;
  oreb: number; dreb: number; fouls: number;
  stl: number; to: number; blk: number; asst: number;
  pts: number; plus_minus: number;
}

function computeDashboardPlayerStats(events: GameEvent[], players: Player[], vcTeamId: string): DashboardPlayerStat[] {
  const map: Record<string, {
    fg_made: number; fg_att: number; fg3_made: number; fg3_att: number;
    ft_made: number; ft_att: number; pts: number;
    oreb: number; dreb: number; ast: number; stl: number; blk: number; to: number; fouls: number;
  }> = {};

  function get(id: string) {
    if (!map[id]) map[id] = { fg_made: 0, fg_att: 0, fg3_made: 0, fg3_att: 0,
      ft_made: 0, ft_att: 0, pts: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, fouls: 0 };
    return map[id];
  }

  for (const e of events) {
    if (e.type === "shot_attempt") {
      const t = get(e.playerId);
      t.fg_att++;
      if (e.points === 3) t.fg3_att++;
      if (e.made) { t.fg_made++; t.pts += e.points; if (e.points === 3) t.fg3_made++; }
    } else if (e.type === "free_throw_attempt") {
      const t = get(e.playerId);
      t.ft_att++;
      if (e.made) { t.ft_made++; t.pts += 1; }
    } else if (e.type === "rebound") {
      const t = get(e.playerId); if (e.offensive) t.oreb++; else t.dreb++;
    } else if (e.type === "assist")  { get(e.playerId).ast++;   }
    else if (e.type === "steal")     { get(e.playerId).stl++;   }
    else if (e.type === "block")     { get(e.playerId).blk++;   }
    else if (e.type === "turnover" && e.playerId) { get(e.playerId).to++; }
    else if (e.type === "foul")      { get(e.playerId).fouls++; }
  }

  const pct = (made: number, att: number) => att > 0 ? `${Math.round(made / att * 100)}%` : "-";
  const plusMinus = computePlusMinus(events, vcTeamId);

  return players
    .map(p => {
      const t = map[p.id] ?? { fg_made: 0, fg_att: 0, fg3_made: 0, fg3_att: 0,
        ft_made: 0, ft_att: 0, pts: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, fouls: 0 };
      return {
        number: parseInt(p.number, 10) || 0,
        name: abbreviateName(p.name),
        height: p.height,
        grade: p.grade,
        fg_made: t.fg_made, fg_att: t.fg_att, fg_pct: pct(t.fg_made, t.fg_att),
        fg3_made: t.fg3_made, fg3_att: t.fg3_att, fg3_pct: pct(t.fg3_made, t.fg3_att),
        ft_made: t.ft_made, ft_att: t.ft_att, ft_pct: pct(t.ft_made, t.ft_att),
        oreb: t.oreb, dreb: t.dreb, fouls: t.fouls,
        stl: t.stl, to: t.to, blk: t.blk, asst: t.ast,
        pts: t.pts, plus_minus: plusMinus[p.id] ?? 0,
      };
    })
    .filter(p =>
      p.fg_att > 0 || p.ft_att > 0 || p.oreb > 0 || p.dreb > 0 ||
      p.stl > 0 || p.blk > 0 || p.to > 0 || p.fouls > 0 || p.asst > 0
    );
}

function computeTeamStats(events: GameEvent[], teamId: string) {
  let fg = 0, fga = 0, fg3 = 0, fg3a = 0, ft = 0, fta = 0;
  let oreb = 0, dreb = 0, asst = 0, to = 0, stl = 0, blk = 0, fouls = 0;
  for (const e of events) {
    if (e.teamId !== teamId) continue;
    if (e.type === "shot_attempt") {
      fga++; if (e.points === 3) fg3a++; if (e.made) { fg++; if (e.points === 3) fg3++; }
    } else if (e.type === "free_throw_attempt") {
      fta++; if (e.made) ft++;
    } else if (e.type === "rebound")  { if (e.offensive) oreb++; else dreb++; }
    else if (e.type === "assist")     { asst++;  }
    else if (e.type === "steal")      { stl++;   }
    else if (e.type === "block")      { blk++;   }
    else if (e.type === "turnover")   { to++;    }
    else if (e.type === "foul")       { fouls++; }
  }
  return { fg, fga, fg3, fg3a, ft, fta, oreb, dreb, reb: oreb + dreb, asst, to, stl, blk, fouls };
}

// ---- Modal types ----
type Modal =
  | { kind: "shot"; teamId: TeamSide; points: 2 | 3; made: boolean; editContext?: EventEditContext }
  | { kind: "freeThrow"; teamId: TeamSide; made: boolean; editContext?: EventEditContext }
  | { kind: "stat"; stat: "def_reb" | "off_reb" | "turnover" | "steal" | "assist" | "block" | "foul"; teamId: TeamSide; editContext?: EventEditContext }
  | { kind: "assist2"; teamId: TeamSide; assistPlayerId: string }
  | { kind: "assist3"; teamId: TeamSide; assistPlayerId: string; scorerPlayerId: string }
  | { kind: "sub1"; teamId: TeamSide; playerOutId?: string; editContext?: EventEditContext }
  | { kind: "sub2"; teamId: TeamSide; playerOutId: string; editContext?: EventEditContext }
  | { kind: "assistEdit"; teamId: TeamSide; assistPlayerId: string; scorerPlayerId: string; editContext: EventEditContext }
  | { kind: "timeoutEdit"; teamId: TeamSide; timeoutType: "full" | "short"; editContext: EventEditContext }
  | { kind: "possessionEdit"; teamId: TeamSide; editContext: EventEditContext }
  | { kind: "periodTransitionEdit"; newPeriod: string; editContext: EventEditContext };

interface EventEditContext {
  eventId: string;
  originalEvent: GameEvent;
  pending: boolean;
}

interface FeedEventSelection {
  event: GameEvent;
  pending: boolean;
}

type NoticeTone = "info" | "success" | "warning" | "error";

interface InlineNotice {
  id: number;
  tone: NoticeTone;
  message: string;
}

interface OperatorAlert {
  id: string;
  type: string;
  priority: "urgent" | "important" | "info";
  message: string;
  explanation: string;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "default" | "danger";
  resolve: (value: boolean) => void;
}

function parseViewFromHash(hash: string): { view: "game" | "settings"; settingsView: SettingsView } {
  const h = hash.replace(/^#\/?/, "");
  if (h === "settings/game-setup") return { view: "settings", settingsView: "game-setup" };
  if (h === "settings/ipad-tips") return { view: "settings", settingsView: "ipad-tips" };
  if (h.startsWith("settings")) return { view: "settings", settingsView: "menu" };
  return { view: "game", settingsView: "menu" };
}

function viewToHash(v: "game" | "settings", sv: SettingsView): string {
  if (v === "settings" && sv !== "menu") return `#settings/${sv}`;
  if (v === "settings") return "#settings";
  return "#game";
}

export function App() {
  // ---- App data (teams, game setup) ----
  const [appData, setAppData] = useState<AppData>(loadAppData);

  function persistData(next: AppData) {
    setAppData(next);
    saveAppData(next);
  }

  async function syncFromCoachCode(connectionCode = appData.gameSetup.connectionId, options?: { silent?: boolean }): Promise<boolean> {
    const normalizedConnectionId = normalizeConnectionId(connectionCode);
    if (!normalizedConnectionId) {
      setConnectionSyncStatus(DEFAULT_CONNECTION_SYNC_STATUS);
      return false;
    }

    setConnectionSyncStatus(`Syncing ${normalizedConnectionId} from the coach dashboard...`);

    try {
      const response = await fetch(
        `${appData.gameSetup.apiUrl}/api/operator-links/${encodeURIComponent(normalizedConnectionId)}`,
        apiHeaders(appData.gameSetup),
      );

      if (response.status === 404) {
        setConnectionSyncStatus("Code saved locally. Waiting for the coach dashboard to publish the linked team and roster.");
        if (!options?.silent) {
          showInlineNotice("That code is saved on this iPad. Open the coach dashboard live page or try Sync again in a moment.", "warning", 5000);
        }
        return false;
      }

      if (!response.ok) {
        throw new Error(`Sync failed (${response.status})`);
      }

      const payload = await response.json() as OperatorLinkResponse;
      let syncedTeamName = "team";

      setAppData((current) => {
        const next = mergeCoachLinkSnapshot(current, payload);
        syncedTeamName = next.teams.find((team) => team.id === next.gameSetup.myTeamId)?.name ?? payload.setup?.myTeamName?.trim() ?? "team";
        saveAppData(next);
        return next;
      });

      setConnectionSyncStatus(`Synced ${syncedTeamName} roster and game setup. This iPad will keep the latest copy saved locally if it disconnects.`);
      if (!options?.silent) {
        showInlineNotice(`Synced ${syncedTeamName} from the coach dashboard.`, "success", 2500);
      }
      return true;
    } catch {
      setConnectionSyncStatus("Coach sync is temporarily offline. The last synced roster and lineup stay saved locally on this iPad.");
      if (!options?.silent) {
        showInlineNotice("Could not reach the coach session right now. Your last synced data is still saved locally.", "warning", 6000);
      }
      return false;
    }
  }

  useEffect(() => {
    let active = true;

    async function syncTeamsFromRealtime() {
      const apiUrl = appData.gameSetup.apiUrl?.trim() || DEFAULT_API;
      const apiKey = appData.gameSetup.apiKey?.trim() || undefined;
      const schoolId = appData.gameSetup.schoolId?.trim() || DEFAULT_SCHOOL_ID;
      const remoteTeams = await fetchTeamsFromRealtime(apiUrl, apiKey, schoolId);
      const converted = remoteTeams.map(convertRosterTeamToAppTeam);

      if (!active || converted.length === 0) {
        return;
      }

      if (JSON.stringify(converted) === JSON.stringify(appData.teams)) {
        return;
      }

      const hasSelectedTeam = converted.some((team) => team.id === appData.gameSetup.myTeamId);
      const nextMyTeamId = hasSelectedTeam ? appData.gameSetup.myTeamId : (converted[0]?.id ?? "");

      persistData({
        ...appData,
        teams: converted,
        gameSetup: { ...appData.gameSetup, myTeamId: nextMyTeamId },
      });
    }

    void syncTeamsFromRealtime();
    const intervalId = setInterval(() => {
      void syncTeamsFromRealtime();
    }, 5000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [
    appData,
  ]);

  useEffect(() => {
    const normalizedConnectionId = normalizeConnectionId(appData.gameSetup.connectionId);
    if (!normalizedConnectionId) {
      setConnectionSyncStatus(DEFAULT_CONNECTION_SYNC_STATUS);
      return;
    }

    void syncFromCoachCode(normalizedConnectionId, { silent: true });
    const intervalId = window.setInterval(() => {
      void syncFromCoachCode(normalizedConnectionId, { silent: true });
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [appData.gameSetup.apiKey, appData.gameSetup.apiUrl, appData.gameSetup.connectionId, appData.gameSetup.schoolId]);

  // ---- Navigation state ----
  const [view, setView] = useState<"game" | "settings">(() => parseViewFromHash(window.location.hash).view);
  const [settingsView, setSettingsView] = useState<SettingsView>(() => parseViewFromHash(window.location.hash).settingsView);
  const operatorAllowedSettingsViews = new Set<SettingsView>(["menu", "game-setup", "ipad-tips"]);

  function navigateView(nextView: "game" | "settings", nextSettingsView: SettingsView = "menu") {
    const hash = viewToHash(nextView, nextSettingsView);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setView(nextView);
    setSettingsView(nextSettingsView);
  }

  useEffect(() => {
    function handleHashChange() {
      const { view: v, settingsView: sv } = parseViewFromHash(window.location.hash);
      setView(v);
      setSettingsView(sv);
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // ---- Game session state ----
  const gameId = appData.gameSetup.gameId;
  const [sequence, setSequence] = useState(() => loadSeq(loadAppData().gameSetup.gameId));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingEvents, setPendingEvents] = useState<GameEvent[]>(() => loadPending(loadAppData().gameSetup.gameId));
  const [submittedEvents, setSubmittedEvents] = useState<GameEvent[]>([]);

  // ---- In-game UI state ----
  const [period, setPeriod] = useState("Q1" as string);
  const [clockInput, setClockInput] = useState("8:00");
  const [clockRunning, setClockRunning] = useState(false);
  const [dismissedTimeoutId, setDismissedTimeoutId] = useState<string | null>(null);
  const [clockPadOpen, setClockPadOpen] = useState(false);
  const [clockPadDigits, setClockPadDigits] = useState("");
  const [summaryClockPadOpen, setSummaryClockPadOpen] = useState(false);
  const [summaryClockPadDigits, setSummaryClockPadDigits] = useState("");
  const [gameMoment, setGameMoment] = useState<string>("");
  const [preGameNotes, setPreGameNotes] = useState<string>(() => localStorage.getItem("operator-console:pregame-notes") ?? "");
  const [modal, setModal] = useState<Modal | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('ipo:tutorial-complete'));
  const [overtimeCount, setOvertimeCount] = useState(0);
  const [gameDate, setGameDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showGameSummary, setShowGameSummary] = useState(false);
  const [possessionOverrideTeamId, setPossessionOverrideTeamId] = useState<string | null | undefined>(undefined);
  const [summaryTab, setSummaryTab] = useState<"teams" | "players">("teams");
  const [summaryPeriodFilter, setSummaryPeriodFilter] = useState<string[]>([]);
  const [summaryAiInsights, setSummaryAiInsights] = useState<string[] | null>(null);
  const [summaryAiLoading, setSummaryAiLoading] = useState(false);
  const [summaryPlayerAiInsights, setSummaryPlayerAiInsights] = useState<string[] | null>(null);
  const [summaryPlayerAiLoading, setSummaryPlayerAiLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [inlineNotice, setInlineNotice] = useState<InlineNotice | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [liveAlerts, setLiveAlerts] = useState<OperatorAlert[]>([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setPossessionOverrideTeamId(undefined);
  }, [gameId]);
  const [submitMessage, setSubmitMessage] = useState<string>("Ready to save final stats to the dashboard.");
  const [postGameNameInput, setPostGameNameInput] = useState("");
  const [postGameOpponentInput, setPostGameOpponentInput] = useState("");
  const [postGameDateInput, setPostGameDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [postGameHomeScoreInput, setPostGameHomeScoreInput] = useState("0");
  const [postGameAwayScoreInput, setPostGameAwayScoreInput] = useState("0");

  // ---- Game flow phase ----
  const [gamePhase, setGamePhase] = useState<"pre-game" | "live" | "post-game">(() => {
    const saved = localStorage.getItem("operator-console:phase");
    if (saved === "live" || saved === "post-game" || saved === "pre-game") return saved as "pre-game" | "live" | "post-game";
    // Legacy: if there are already events for this game, land in live view
    return loadPending(loadAppData().gameSetup.gameId).length > 0 ? "live" : "pre-game";
  });

  const [showLineupSetup, setShowLineupSetup] = useState(false);
  const [selectedStarters, setSelectedStarters] = useState<Set<string>>(new Set());
  const [connectionSyncStatus, setConnectionSyncStatus] = useState(DEFAULT_CONNECTION_SYNC_STATUS);

  // ---- In-game roster state ----
  const [showRosterPanel, setShowRosterPanel] = useState(false);

  // Ref for auto-save interval - always holds the latest values without re-registering the interval
  const autoSaveCtx = useRef<{ run: () => void }>({ run: () => {} });

  // Helper to generate team ID from name
  function generateTeamId(name: string): string {
    return `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opponent"}`;
  }

  function persistPhase(phase: "pre-game" | "live" | "post-game") {
    setGamePhase(phase);
    localStorage.setItem("operator-console:phase", phase);
  }

  function dismissInlineNotice() {
    setInlineNotice(null);
    if (noticeTimerRef.current != null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }

  function showInlineNotice(message: string, tone: NoticeTone = "error", timeoutMs = 7000) {
    if (noticeTimerRef.current != null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setInlineNotice({ id: Date.now(), tone, message });
    if (timeoutMs > 0) {
      noticeTimerRef.current = window.setTimeout(() => {
        setInlineNotice(null);
        noticeTimerRef.current = null;
      }, timeoutMs);
    }
  }

  async function requestConfirm(options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
  }): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      setConfirmDialog({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        tone: options.tone ?? "default",
        resolve,
      });
    });
  }

  function resolveConfirm(result: boolean) {
    if (!confirmDialog) return;
    confirmDialog.resolve(result);
    setConfirmDialog(null);
  }

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current != null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  // ---- Derived: home/away teams ----
  // myTeamId is the team we are tracking; side determines which slot they fill.
  const myTeam = appData.teams.find(t => t.id === appData.gameSetup.myTeamId);
  const vcSideSetup = appData.gameSetup.vcSide ?? "home";
  const homeTeam = vcSideSetup === "home" ? myTeam : undefined;
  const awayTeam  = vcSideSetup === "away" ? myTeam : undefined;
  const opponentName = appData.gameSetup.opponent?.trim() || "";
  const opponentTeamId = opponentName ? generateTeamId(opponentName) : "opponent";
  const homeTeamId = vcSideSetup === "home" ? (appData.gameSetup.myTeamId || "team-home") : opponentTeamId;
  const awayTeamId = vcSideSetup === "away" ? (appData.gameSetup.myTeamId || "team-away") : opponentTeamId;
  const vcTeamId = vcSideSetup === "home" ? homeTeamId : awayTeamId;
  const homeTeamName = myTeam && vcSideSetup === "home" ? myTeam.name : opponentName || "Home";
  const awayTeamName  = myTeam && vcSideSetup === "away" ? myTeam.name : opponentName || "Away";
  const homeTeamAbbr = vcSideSetup === "home"
    ? (myTeam?.abbreviation ?? homeTeamName.slice(0, 3).toUpperCase())
    : (opponentName ? opponentName.slice(0, 3).toUpperCase() : "OPP");
  const awayTeamAbbr = vcSideSetup === "away"
    ? (myTeam?.abbreviation ?? awayTeamName.slice(0, 3).toUpperCase())
    : (opponentName ? opponentName.slice(0, 3).toUpperCase() : "OPP");
  const homeTeamColor = normalizeTeamColor(appData.gameSetup.homeTeamColor) ?? DEFAULT_HOME_TEAM_COLOR;
  const awayTeamColor = normalizeTeamColor(appData.gameSetup.awayTeamColor) ?? DEFAULT_AWAY_TEAM_COLOR;
  const opponentTrackStats = normalizeOpponentTrackStats(appData.gameSetup.opponentTrackStats);
  const opponentTrackSet = new Set<OpponentTrackStat>(opponentTrackStats);
  const trackClock = appData.gameSetup.trackClock ?? true;
  const trackPossession = appData.gameSetup.trackPossession ?? true;
  const trackTimeouts = appData.gameSetup.trackTimeouts ?? true;
  const opponentSide: TeamSide = vcSideSetup === "home" ? "away" : "home";

  function isOpponentStatEnabled(key: OpponentTrackStat): boolean {
    return opponentTrackSet.has(key);
  }

  // ---- Game moment options for context (pre-game, quarters, halftime, timeout, end of game) ----
  function getGameMomentOptions(): Array<{ value: string; label: string }> {
    const opts: Array<{ value: string; label: string }> = [
      { value: "start-of-game", label: "Start of Game" },
    ];
    
    // Add quarter starts/ends based on period
    const totalQuarters = Math.max(4, (period?.replace("OT", "") ? 4 : 0));
    for (let i = 1; i <= totalQuarters; i++) {
      opts.push({ value: `start-of-q${i}`, label: `Start of Q${i}` });
    }
    
    // Halftime (between Q2 and Q3)
    opts.push({ value: "halftime", label: "Halftime" });
    
    // End of quarters
    for (let i = 1; i <= totalQuarters; i++) {
      opts.push({ value: `end-of-q${i}`, label: `End of Q${i}` });
    }
    
    // Overtime
    const ot = parseInt(period?.replace("OT", "") || "0", 10);
    if (ot > 0) {
      for (let i = 1; i <= ot; i++) {
        opts.push({ value: `ot${i}`, label: `OT${i}` });
      }
    }
    
    // Game situations
    opts.push({ value: "timeout", label: "Timeout" });
    opts.push({ value: "end-of-game", label: "End of Game" });
    
    return opts;
  }

  const liveHomeSideLabel = `${homeTeamName} (home)`;
  const liveAwaySideLabel = `${awayTeamName} (away)`;
  const homePlayers = homeTeam?.players ?? [];
  const awayPlayers = awayTeam?.players ?? [];
  const allPlayers = [...homePlayers, ...awayPlayers];

  function resolveTeamId(side: TeamSide): string {
    return side === "home" ? homeTeamId : awayTeamId;
  }

  function normalizeEventTeamId(event: GameEvent): GameEvent {
    if (event.teamId === homeTeamId || event.teamId === awayTeamId) return event;
    if (event.teamId === "home") return { ...event, teamId: homeTeamId };
    if (event.teamId === "away") return { ...event, teamId: awayTeamId };
    if (event.teamId === "team-home") return { ...event, teamId: homeTeamId };
    if (event.teamId === "team-away") return { ...event, teamId: awayTeamId };
    return event;
  }

  // ---- Network ----
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (gamePhase !== "live") {
      return;
    }

    const connectionId = normalizeConnectionId(appData.gameSetup.connectionId);
    if (!connectionId) {
      return;
    }
    const startingLineup = Array.isArray(appData.gameSetup.startingLineup)
      ? [...new Set(appData.gameSetup.startingLineup.map((id) => String(id).trim()).filter(Boolean))].slice(0, 5)
      : [];
    const trackedTeamId = appData.gameSetup.vcSide === "away"
      ? (appData.gameSetup.myTeamId || "team-away")
      : (appData.gameSetup.myTeamId || "team-home");
    const startingLineupByTeam = startingLineup.length > 0
      ? { [trackedTeamId]: startingLineup }
      : undefined;
    const payload = { connectionId, gameId, startingLineupByTeam };
    const socket = io(appData.gameSetup.apiUrl, {
      auth: appData.gameSetup.apiKey
        ? { apiKey: appData.gameSetup.apiKey, schoolId: appData.gameSetup.schoolId ?? DEFAULT_SCHOOL_ID }
        : { schoolId: appData.gameSetup.schoolId ?? DEFAULT_SCHOOL_ID },
      extraHeaders: apiKeyHeader(appData.gameSetup)
    });

    const register = () => {
      socket.emit("operator:register", payload);
    };

    socket.on("connect", register);
    
    // Error handlers for socket failures
    socket.on("connect_error", (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Connection error";
      showInlineNotice(`Server connection failed: ${msg}. Retrying...`, "error");
    });
    
    socket.on("disconnect", (reason: string) => {
      if (reason !== "io client namespace disconnect") {
        showInlineNotice(`Disconnected from server (${reason}). Check your connection.`, "warning");
      }
    });
    
    socket.on("error", (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      showInlineNotice(`Server error: ${msg}`, "error");
    });

    socket.on("game:insights", (payload: unknown) => {
      if (!Array.isArray(payload)) return;
      const alerts: OperatorAlert[] = (payload as Array<Record<string, unknown>>)
        .filter((i) => i.priority === "urgent" || i.priority === "important")
        .map((i) => ({
          id: String(i.id ?? ""),
          type: String(i.type ?? ""),
          priority: (i.priority === "urgent" ? "urgent" : "important") as "urgent" | "important",
          message: String(i.message ?? ""),
          explanation: String(i.explanation ?? ""),
        }))
        .filter((i) => i.id && i.message);
      if (alerts.length > 0) {
        setLiveAlerts(alerts);
      }
    });

    socket.on("operator:link:updated", (payload: unknown) => {
      if (!payload || typeof payload !== "object") {
        return;
      }
      const snapshot = payload as OperatorLinkResponse;
      if (normalizeConnectionId(snapshot.connectionId) !== connectionId) {
        return;
      }

      setAppData((current) => {
        const next = mergeCoachLinkSnapshot(current, snapshot);
        saveAppData(next);
        return next;
      });
      setConnectionSyncStatus("Coach updates received. The latest team and roster info are saved locally on this iPad.");
    });

    socket.on("roster:teams", (payload: unknown) => {
      if (!Array.isArray(payload)) {
        return;
      }

      const nextTeams = (payload as RosterTeam[]).map(convertRosterTeamToAppTeam);
      setAppData((current) => {
        const hasSelectedTeam = nextTeams.some((team) => team.id === current.gameSetup.myTeamId);
        const nextMyTeamId = hasSelectedTeam ? current.gameSetup.myTeamId : (nextTeams[0]?.id ?? "");
        const allowedPlayerIds = new Set((nextTeams.find((team) => team.id === nextMyTeamId)?.players ?? []).map((player) => player.id));
        const startingLineup = Array.isArray(current.gameSetup.startingLineup)
          ? current.gameSetup.startingLineup.filter((playerId) => allowedPlayerIds.has(playerId))
          : [];
        const next = {
          ...current,
          teams: nextTeams,
          gameSetup: { ...current.gameSetup, myTeamId: nextMyTeamId, startingLineup },
        };
        saveAppData(next);
        return next;
      });
    });

    register();

    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit("operator:heartbeat", payload);
      }
    }, 10000);

    return () => {
      clearInterval(heartbeat);
      socket.off("connect", register);
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("error");
      socket.off("game:insights");
      socket.off("operator:link:updated");
      socket.off("roster:teams");
      socket.disconnect();
    };
  }, [appData.gameSetup.apiKey, appData.gameSetup.apiUrl, appData.gameSetup.connectionId, gameId, gamePhase]);

  useEffect(() => {
    const localPending = loadPending(gameId).map(normalizeEventTeamId);
    const localSeq = loadSeq(gameId);
    setPendingEvents(localPending);
    setSequence(localSeq);
    async function hydrate() {
      try {
        const res = await fetch(`${appData.gameSetup.apiUrl}/api/games/${gameId}/events`, apiHeaders(appData.gameSetup));
        if (!res.ok) {
          // Don't wipe submitted events on error - keep local state
          return;
        }
        const events = ((await res.json()) as GameEvent[]).map(normalizeEventTeamId);
        setSubmittedEvents(events);
        const highest = events.reduce((m, e) => Math.max(m, e.sequence), 0);
        const next = Math.max(localSeq, highest + 1);
        setSequence(next);
        saveSeq(gameId, next);
      } catch {
        // Hydration failed (offline) - keep local pending queue intact
      }
    }
    void hydrate();
  }, [gameId]);

  useEffect(() => { savePending(gameId, pendingEvents); }, [gameId, pendingEvents]);
  useEffect(() => { saveSeq(gameId, sequence); }, [gameId, sequence]);

  async function submitEvent(event: GameEvent): Promise<boolean> {
    const normalizedEvent = normalizeEventTeamId(event);
    try {
      const res = await fetch(`${appData.gameSetup.apiUrl}/api/games/${gameId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(appData.gameSetup) },
        body: JSON.stringify(normalizedEvent),
      });
      if (!res.ok) {
        const errorMsg = `Submit failed (${res.status}). Check connection and tap Submit again.`;
        showInlineNotice(errorMsg, "error", 10000);
        return false;
      }
      setSubmittedEvents(cur => [...cur, normalizedEvent].sort((a, b) => a.sequence - b.sequence));
      setPendingEvents(cur => cur.filter(p => p.id !== normalizedEvent.id));
      return true;
    } catch (err) {
      const errorMsg = "Network error. Event queued offline - will sync when reconnected.";
      showInlineNotice(errorMsg, "warning", 10000);
      setPendingEvents(cur => {
        if (cur.some(p => p.id === normalizedEvent.id)) return cur;
        return [...cur, normalizedEvent].sort((a, b) => a.sequence - b.sequence);
      });
      return false;
    }
  }

  async function flushQueue() {
    if (!navigator.onLine || pendingEvents.length === 0) return;
    let successCount = 0;
    for (const evt of pendingEvents) {
      const ok = await submitEvent(evt);
      if (ok) successCount++;
      // Continue trying remaining events even if one fails
    }
    if (successCount > 0) {
      try {
        const res = await fetch(`${appData.gameSetup.apiUrl}/api/games/${gameId}/events`, apiHeaders(appData.gameSetup));
        if (res.ok) setSubmittedEvents(((await res.json()) as GameEvent[]).map(normalizeEventTeamId));
      } catch { /* empty */ }
        showInlineNotice(`${successCount} queued event${successCount !== 1 ? "s" : ""} synced`, "success", 2500);
    }
  }

  useEffect(() => { if (online) void flushQueue(); }, [online]);

  // Persist pre-game notes
  useEffect(() => {
    localStorage.setItem("operator-console:pregame-notes", preGameNotes);
  }, [preGameNotes]);

  // Keep screen awake during a live game
  useEffect(() => {
    if (gamePhase !== "live") return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    async function acquire() {
      try {
        lock = await (navigator as Navigator & { wakeLock: { request(type: string): Promise<WakeLockSentinel> } }).wakeLock.request("screen");
      } catch { /* device may not support it */ }
    }
    void acquire();
    function reacquire() { if (document.visibilityState === "visible") void acquire(); }
    document.addEventListener("visibilitychange", reacquire);
    return () => {
      document.removeEventListener("visibilitychange", reacquire);
      lock?.release().catch(() => {});
    };
  }, [gamePhase]);

  // Warn before leaving with unsubmitted events
  useEffect(() => {
    if (gamePhase !== "live") return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (pendingEvents.length === 0) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [gamePhase, pendingEvents.length]);

  useEffect(() => {
    if (gamePhase !== "live" || !gameId) {
      return;
    }

    const payload = {
      ...buildAiContextFromSetup(appData.gameSetup),
      gameMoment: gameMoment || undefined,
      preGameNotes: preGameNotes.trim() || undefined,
    };
    void fetch(`${appData.gameSetup.apiUrl}/api/games/${gameId}/ai-context`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...apiKeyHeader(appData.gameSetup) },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Fail open: insights continue with last known context if API is temporarily unreachable.
    });
  }, [
    appData.gameSetup.apiKey,
    appData.gameSetup.apiUrl,
    appData.gameSetup.clockEnabled,
    appData.gameSetup.opponentTrackStats,
    appData.gameSetup.trackClock,
    gameId,
    gamePhase,
    gameMoment,
    preGameNotes,
  ]);

  useEffect(() => {
    if (gamePhase !== "live" || !clockRunning || appData.gameSetup.clockEnabled === false || trackClock === false) return;
    const currentSeconds = clockToSec(clockInput);
    const step = currentSeconds <= 60 ? 0.1 : 1;
    const delayMs = step === 0.1 ? 100 : 1000;
    const id = setTimeout(() => {
      setClockInput((current) => {
        const sec = clockToSec(current);
        if (sec <= step) {
          setClockRunning(false);
          return formatClockFromSeconds(0);
        }
        const next = Math.max(0, Math.round((sec - step) * 10) / 10);
        return formatClockFromSeconds(next);
      });
    }, delayMs);
    return () => clearTimeout(id);
  }, [clockRunning, gamePhase, appData.gameSetup.clockEnabled, clockInput, trackClock]);

  useEffect(() => {
    if ((appData.gameSetup.clockEnabled === false || trackClock === false) && clockRunning) {
      setClockRunning(false);
    }
  }, [appData.gameSetup.clockEnabled, clockRunning, trackClock]);

  async function postEvent(event: GameEvent) {
    const next = event.sequence + 1;
    setSequence(next);
    saveSeq(gameId, next);
    // Optimistic update: add to pending immediately so score updates instantly
    setPendingEvents(cur => [...cur, event].sort((a, b) => a.sequence - b.sequence));
    // Haptic confirmation on supported devices
    try { navigator.vibrate?.(30); } catch { /* not supported */ }
    // Then submit in background
    await submitEvent(event);
  }

  async function undoLast() {
    // Try to undo the most recent event (submitted or pending)
    const lastSubmitted = [...submittedEvents].sort((a, b) => b.sequence - a.sequence)[0];
    const lastPending = [...pendingEvents].sort((a, b) => b.sequence - a.sequence)[0];
    // Pick whichever has the higher sequence
    const last = !lastSubmitted ? lastPending
      : !lastPending ? lastSubmitted
      : lastPending.sequence > lastSubmitted.sequence ? lastPending : lastSubmitted;
    if (!last) return;

    const ok = await requestConfirm({
      title: "Undo last event?",
      message: "This removes the most recent event from the game log.",
      confirmLabel: "Undo Event",
      tone: "danger",
    });
    if (!ok) return;

    // Remove from pending queue first
    setPendingEvents(cur => cur.filter(e => e.id !== last.id));
    // If it is already submitted to the API, delete it there
    if (submittedEvents.some(e => e.id === last.id)) {
      const res = await fetch(`${appData.gameSetup.apiUrl}/api/games/${gameId}/events/${last.id}`, { method: "DELETE", headers: apiKeyHeader(appData.gameSetup) });
      if (res.ok) setSubmittedEvents(cur => cur.filter(e => e.id !== last.id));
    }
  }

  async function startGame(newGameId?: string) {
    // Read fresh settings from localStorage - saveGameSetup writes there synchronously
    // before this async function resolves, so we always get the latest values.
    const latest = loadAppData();
    const gid = newGameId ?? latest.gameSetup.gameId;

    // Derive team IDs from the latest saved setup
    const latestVcSide = latest.gameSetup.vcSide ?? "home";
    const latestOpponent = latest.gameSetup.opponent?.trim() || "";
    const latestOpponentTeamId = latestOpponent
      ? `team-${latestOpponent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opponent"}`
      : "opponent";
    const latestHomeTeamId =
      latestVcSide === "home"
        ? latest.gameSetup.myTeamId || "team-home"
        : latestOpponentTeamId;
    const latestAwayTeamId =
      latestVcSide === "away"
        ? latest.gameSetup.myTeamId || "team-away"
        : latestOpponentTeamId;
    const latestStartingLineup = Array.isArray(latest.gameSetup.startingLineup)
      ? [...new Set(latest.gameSetup.startingLineup.map((playerId) => String(playerId).trim()).filter(Boolean))].slice(0, 5)
      : [];
    const trackedTeamId = latestVcSide === "home" ? latestHomeTeamId : latestAwayTeamId;
    const startingLineupByTeam = latestStartingLineup.length > 0
      ? { [trackedTeamId]: latestStartingLineup }
      : undefined;

    try {
      const res = await fetch(`${latest.gameSetup.apiUrl}/api/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(latest.gameSetup) },
        body: JSON.stringify({
          gameId: gid,
          homeTeamId: latestHomeTeamId,
          awayTeamId: latestAwayTeamId,
          opponentName: latestOpponent,
          opponentTeamId: latestOpponentTeamId,
          startingLineupByTeam,
          aiContext: {
            ...buildAiContextFromSetup(latest.gameSetup),
            preGameNotes: preGameNotes.trim() || undefined,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        showInlineNotice(
          `Could not register game on the live server (${res.status}): ${body || "unknown error"}. Check Settings > API URL and try again.`,
          "error"
        );
        return;
      }
    } catch {
      showInlineNotice(
        `Could not reach the live server at ${latest.gameSetup.apiUrl}. Make sure the realtime API is running, then go to Settings > Game Setup and tap Start Game again.`,
        "error"
      );
      return;
    }

    // Merge new gameId into the latest persisted data to avoid overwriting settings
    // that were saved by saveGameSetup() just before this call.
    const nextData: AppData = {
      ...latest,
      gameSetup: { ...latest.gameSetup, gameId: gid, statsGameId: undefined },
    };
    setAppData(nextData);
    saveAppData(nextData);
    setPendingEvents([]);
    setSubmittedEvents([]);
    setSequence(1);
    savePending(gid, []);
    saveSeq(gid, 1);
    persistPhase("live");
  }

  /** End the current game: auto-saves to stats dashboard if there's data, then resets. */
  async function endAndResetGame() {
    // Read fresh localStorage data so we always get the opponent name just saved by saveGameSetup()
    // (React state updates are async, so appData.gameSetup.opponent may still be the old value here)
    const latest = loadAppData();
    if (allEventObjs.length > 0 && latest.gameSetup.opponent?.trim()) {
      const saved = await submitToDashboard({ opponent: latest.gameSetup.opponent });
      if (!saved) {
        return false;
      }
    }
    const newId = generateGameId(latest.gameSetup.opponent ?? "", gameDate);
    await startGame(newId);
    return true;
  }

  /** End game from the live view - opens post-game review screen without auto-submitting. */
  async function endGame() {
    const ok = await requestConfirm({
      title: "End game now?",
      message: "This moves to post-game review. You can still re-save stats from the post-game screen.",
      confirmLabel: "End Game",
      tone: "danger",
    });
    if (!ok) return;

    setSubmitStatus("idle");
    setSubmitMessage("Review game details, then tap Submit Game to publish stats to the dashboard.");
    persistPhase("post-game");
  }

  /** Prepare a fresh game after viewing post-game screen - returns to pre-game setup. */
  function handleNewGame() {
    const latest = loadAppData();
    const newId = generateGameId(latest.gameSetup.opponent ?? "", new Date().toISOString().slice(0, 10));
    const nextData: AppData = {
      ...latest,
      gameSetup: { ...latest.gameSetup, gameId: newId, statsGameId: undefined },
    };
    persistData(nextData);
    setPendingEvents([]);
    setSubmittedEvents([]);
    setSequence(1);
    savePending(newId, []);
    saveSeq(newId, 1);
    setGameDate(new Date().toISOString().slice(0, 10));
    setSubmitStatus("idle");
    setSubmitMessage("Ready to publish final stats.");
    persistPhase("pre-game");
  }

  async function submitToDashboard(overrides?: { opponent?: string; date?: string; homeScore?: number; awayScore?: number }) {
    const vcSide = appData.gameSetup.vcSide ?? "home";
    const oppSide: TeamSide = vcSide === "home" ? "away" : "home";
    const opponent = overrides?.opponent?.trim() || appData.gameSetup.opponent?.trim() || "";
    const dashboardUrl = appData.gameSetup.dashboardUrl?.trim() || "http://localhost:4000";

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

    // Format date to match Stats dashboard convention: "Dec 3, 2025"
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

    // Full roster for the dashboard to upsert - keyed by jersey number so it
    // correctly updates existing players instead of creating abbreviated duplicates.
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
    // Include stored statsGameId so the dashboard upserts instead of duplicating
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
        // Store the assigned gameId so future re-submits overwrite instead of duplicate
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

  // ---- Computed values ----
  const allEvents = useMemo(() => [
    ...submittedEvents.map(e => ({ event: e, pending: false })),
    ...pendingEvents.filter(e => !submittedEvents.some(s => s.id === e.id)).map(e => ({ event: e, pending: true })),
  ].sort((a, b) => b.event.sequence - a.event.sequence), [submittedEvents, pendingEvents]);
  // scores and totals include pending events so the UI is always up-to-date offline
  const allEventObjs = useMemo(() => allEvents.map(x => x.event), [allEvents]);
  const scores = useMemo(() => computeScores(allEventObjs, homeTeamId, awayTeamId), [allEventObjs, homeTeamId, awayTeamId]);
  const pTotals = useMemo(() => computePlayerTotals(allEventObjs), [allEventObjs]);
  const summaryBoxScoreTotals = useMemo(() => {
    if (summaryPeriodFilter.length === 0) return pTotals;
    const filterSet = new Set(summaryPeriodFilter);
    const filtered = allEventObjs.filter(e => filterSet.has(e.period));
    return computePlayerTotals(filtered);
  }, [summaryPeriodFilter, allEventObjs, pTotals]);
  const homeTeamStats = useMemo(() => computeTeamStats(allEventObjs, homeTeamId), [allEventObjs, homeTeamId]);
  const awayTeamStats = useMemo(() => computeTeamStats(allEventObjs, awayTeamId), [allEventObjs, awayTeamId]);
  const periodTeamFouls = useMemo(() => {
    const totals = { home: 0, away: 0 };
    const inOT = isOvertimePeriod(period);
    for (const event of allEventObjs) {
      if (event.type !== "foul") continue;
      // NFHS OT rule: Q4 fouls carry into OT and all OT-period fouls accumulate.
      const counts = inOT
        ? event.period === "Q4" || isOvertimePeriod(event.period)
        : event.period === period;
      if (!counts) continue;
      if (event.teamId === homeTeamId) totals.home += 1;
      if (event.teamId === awayTeamId) totals.away += 1;
    }
    return totals;
  }, [allEventObjs, period, homeTeamId, awayTeamId]);
  const homeInBonus = periodTeamFouls.away >= 5;
  const awayInBonus = periodTeamFouls.home >= 5;
  const timeoutUsage = useMemo(() => {
    const regulation = {
      home: { full: 0, short: 0 },
      away: { full: 0, short: 0 },
    };
    const overtime = {
      home: { full: 0 },
      away: { full: 0 },
    };
    for (const event of allEventObjs) {
      if (event.type !== "timeout") continue;
      const side = event.teamId === homeTeamId ? "home" : event.teamId === awayTeamId ? "away" : null;
      if (!side) continue;
      if (isOvertimePeriod(event.period)) {
        if (event.timeoutType === "full") overtime[side].full += 1;
      } else {
        regulation[side][event.timeoutType] += 1;
      }
    }
    return { regulation, overtime };
  }, [allEventObjs, homeTeamId, awayTeamId]);
  const inOvertimeNow = isOvertimePeriod(period);
  const timeoutRemaining = useMemo(() => {
    if (inOvertimeNow) {
      return {
        home: {
          full: Math.max(0, 1 - timeoutUsage.overtime.home.full),
          short: 0,
        },
        away: {
          full: Math.max(0, 1 - timeoutUsage.overtime.away.full),
          short: 0,
        },
      };
    }
    return {
      home: {
        full: Math.max(0, 3 - timeoutUsage.regulation.home.full),
        short: Math.max(0, 2 - timeoutUsage.regulation.home.short),
      },
      away: {
        full: Math.max(0, 3 - timeoutUsage.regulation.away.full),
        short: Math.max(0, 2 - timeoutUsage.regulation.away.short),
      },
    };
  }, [inOvertimeNow, timeoutUsage]);
  const totalTimeoutsLeft = {
    home: timeoutRemaining.home.full + timeoutRemaining.home.short,
    away: timeoutRemaining.away.full + timeoutRemaining.away.short,
  };
  const latestEvent = allEvents[0]?.event;

  // When the clock starts while a timeout is the latest event, mark that timeout as dismissed
  // so that pausing the clock again shows "Clock Stopped" rather than reverting to the timeout indicator.
  useEffect(() => {
    if (clockRunning && latestEvent?.type === "timeout") {
      setDismissedTimeoutId(latestEvent.id);
    }
  }, [clockRunning, latestEvent]);
  const currentGameState = useMemo(() => {
    if (gamePhase === "post-game") {
      return { label: "End of Game", tone: "done" as const };
    }
    if (gamePhase === "pre-game") {
      return { label: "Pre-Game", tone: "idle" as const };
    }

    const clockDisabled = appData.gameSetup.clockEnabled === false || trackClock === false;
    if (clockDisabled) {
      return { label: "Clock Disabled", tone: "idle" as const };
    }

    const clockAtZero = clockToSec(clockInput) <= 0;
    if (clockAtZero) {
      if (period === "Q2") return { label: "Halftime", tone: "break" as const };
      if (period === "Q4") return { label: "End of Q4", tone: "break" as const };
      return { label: `End of ${period}`, tone: "break" as const };
    }

    if (!clockRunning && trackTimeouts && latestEvent?.type === "timeout" && latestEvent.id !== dismissedTimeoutId) {
      const teamName = latestEvent.teamId === homeTeamId
        ? homeTeamName
        : latestEvent.teamId === awayTeamId
          ? awayTeamName
          : "Team";
      const timeoutLen = latestEvent.timeoutType === "full" ? "60" : "30";
      return { label: `${teamName} Timeout (${timeoutLen}s)`, tone: "alert" as const };
    }

    if (clockRunning) {
      return { label: "Live", tone: "live" as const };
    }

    return { label: "Clock Stopped", tone: "idle" as const };
  }, [
    allEvents,
    appData.gameSetup.clockEnabled,
    awayTeamId,
    awayTeamName,
    clockInput,
    clockRunning,
    dismissedTimeoutId,
    gamePhase,
    homeTeamId,
    homeTeamName,
    latestEvent,
    period,
    trackClock,
    trackTimeouts,
  ]);
  const eventPossessionTeamId = useMemo(() => {
    const possessionEvent = allEventObjs.find((event) => event.type === "possession_start");
    return possessionEvent?.possessedByTeamId ?? null;
  }, [allEventObjs]);
  const possessionTeamId = possessionOverrideTeamId !== undefined
    ? possessionOverrideTeamId
    : eventPossessionTeamId;
  const possessionLabel = possessionTeamId === homeTeamId
    ? homeTeamName
    : possessionTeamId === awayTeamId
      ? awayTeamName
      : "Not set";
  const foulAlerts = useMemo(() => {
    const vcPl = appData.gameSetup.vcSide === "home" ? homePlayers : awayPlayers;
    return vcPl.filter(p => (pTotals[p.id]?.fouls ?? 0) >= 4);
  }, [appData.gameSetup.vcSide, homePlayers, awayPlayers, pTotals]);
  const trackedPlayers = useMemo(
    () => (vcSideSetup === "home" ? homePlayers : awayPlayers),
    [vcSideSetup, homePlayers, awayPlayers],
  );
  const trackedTopScorer = useMemo(() => {
    let current: { name: string; points: number } | undefined;
    for (const player of trackedPlayers) {
      const points = pTotals[player.id]?.points ?? 0;
      if (!current || points > current.points) {
        current = { name: player.name, points };
      }
    }
    return current;
  }, [trackedPlayers, pTotals]);
  const activeSummaryInsights = summaryAiInsights ?? [];
  const maxOtInEvents = useMemo(() => {
    return allEventObjs.reduce((maxOt, event) => {
      if (!isOvertimePeriod(event.period)) return maxOt;
      const otNumber = Number.parseInt(event.period.slice(2), 10);
      return Number.isFinite(otNumber) ? Math.max(maxOt, otNumber) : maxOt;
    }, 0);
  }, [allEventObjs]);

  function getPeriodOrder(label: string): number {
    const qMatch = /^Q([1-4])$/.exec(label);
    if (qMatch) return Number.parseInt(qMatch[1], 10);
    const otMatch = /^OT(\d+)$/.exec(label);
    if (otMatch) return 100 + Number.parseInt(otMatch[1], 10);
    return 0;
  }

  const furthestReachedPeriodOrder = useMemo(() => {
    let maxOrder = getPeriodOrder(period);
    for (const event of allEventObjs) {
      maxOrder = Math.max(maxOrder, getPeriodOrder(event.period));
      if (event.type === "period_transition") {
        maxOrder = Math.max(maxOrder, getPeriodOrder(event.newPeriod));
      }
    }
    return maxOrder;
  }, [allEventObjs, period]);

  async function changePeriod(nextPeriod: string) {
    if (nextPeriod === period) return;

    const currentOrder = getPeriodOrder(period);
    const nextOrder = getPeriodOrder(nextPeriod);
    if (nextOrder > currentOrder + 1) {
      showInlineNotice(`You must complete ${period} before jumping to ${nextPeriod}. Periods must advance one at a time.`, "warning", 3200);
      return;
    }

    if (nextOrder < furthestReachedPeriodOrder) {
      const ok = await requestConfirm({
        title: `Move back to ${nextPeriod}?`,
        message: "You already advanced to a later period. Going backward can make the game flow confusing and should only be used for corrections.",
        confirmLabel: `Move to ${nextPeriod}`,
      });
      if (!ok) {
        showInlineNotice("Period change canceled to keep game flow clear.", "warning", 2800);
        return;
      }
    }

    const endSeq = sequence;
    void postEvent({
      ...base(endSeq),
      teamId: homeTeamId,
      type: "period_transition",
      newPeriod: nextPeriod,
    });
    setClockRunning(false);
    setPeriod(nextPeriod);
    setClockInput(getPeriodDefaultClock(nextPeriod));
  }

  useEffect(() => {
    const currentOt = isOvertimePeriod(period) ? Number.parseInt(period.slice(2), 10) : 0;
    setOvertimeCount((current) => Math.max(current, maxOtInEvents, Number.isFinite(currentOt) ? currentOt : 0));
  }, [maxOtInEvents, period]);

  async function deleteOvertimePeriod(periodLabel: string) {
    if (!isOvertimePeriod(periodLabel)) return;

    const pendingToRemove = pendingEvents.filter((event) => event.period === periodLabel);
    const submittedToRemove = submittedEvents.filter((event) => event.period === periodLabel);

    if (submittedToRemove.length > 0 && !navigator.onLine) {
      showInlineNotice("Cannot delete overtime while offline because submitted events must be removed from the API first.", "warning");
      return;
    }

    setPendingEvents((current) => current.filter((event) => event.period !== periodLabel));

    const failedDeletes: string[] = [];
    for (const event of submittedToRemove) {
      try {
        const res = await fetch(`${appData.gameSetup.apiUrl}/api/games/${gameId}/events/${event.id}`, {
          method: "DELETE",
          headers: apiKeyHeader(appData.gameSetup),
        });
        if (!res.ok) {
          failedDeletes.push(event.id);
        }
      } catch {
        failedDeletes.push(event.id);
      }
    }

    if (failedDeletes.length > 0) {
      const failed = new Set(failedDeletes);
      setSubmittedEvents((current) => current.filter((event) => event.period !== periodLabel || failed.has(event.id)));
      showInlineNotice(`Could not delete ${failedDeletes.length} submitted OT events from the server. Remaining OT events were kept.`, "error");
      return;
    }

    setSubmittedEvents((current) => current.filter((event) => event.period !== periodLabel));
    const nextCount = Number.parseInt(periodLabel.slice(2), 10) - 1;
    setOvertimeCount(Math.max(0, nextCount));

    if (period === periodLabel) {
      setPeriod("Q4");
      setClockInput(getPeriodDefaultClock("Q4"));
    }

    if (pendingToRemove.length + submittedToRemove.length > 0) {
      setSubmitMessage(`Deleted ${periodLabel} and removed ${pendingToRemove.length + submittedToRemove.length} events.`);
    } else {
      setSubmitMessage(`Deleted ${periodLabel}.`);
    }
  }

  function addOvertimePeriod() {
    const next = overtimeCount + 1;
    const label = `OT${next}`;
    setOvertimeCount(next);
    void changePeriod(label);
  }

  async function fetchOpenAiSummaryInsights() {
    const trackedSide: TeamSide = vcSideSetup;
    const apiUrl = appData.gameSetup.apiUrl?.trim() || DEFAULT_API;

    // Pre-game guard: 0-0 score in Q1 with minimal events
    const totalScore = scores.home + scores.away;
    if (gamePhase !== "live" || (period === "Q1" && totalScore === 0 && allEventObjs.length < 5)) {
      setSummaryAiInsights(null);
      return;
    }

    setSummaryAiLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/games/${gameId}/insights`, {
        method: "GET",
        headers: { ...apiKeyHeader(appData.gameSetup) },
      });

      if (!res.ok) {
        setSummaryAiInsights(null);
        return;
      }

      const insights = await res.json() as SharedLiveInsight[];
      if (!Array.isArray(insights) || insights.length === 0) {
        setSummaryAiInsights(null);
        return;
      }

      const lines = insights
        .filter((insight) => insight.type === "ai_coaching" || insight.confidence !== "low")
        .slice(0, 7)
        .map((insight) => {
          const base = insight.message?.trim() || insight.explanation?.trim() || "No insight text available.";
          const why = insight.explanation?.trim() || "";
          const compact = why && !base.includes(why) ? `${base} - ${why}` : base;
          return compact;
        });

      setSummaryAiInsights(lines.length > 0 ? lines : null);
    } catch {
      setSummaryAiInsights(null);
    } finally {
      setSummaryAiLoading(false);
    }
  }

  async function fetchPlayerAiInsights() {
    if (trackedPlayers.length === 0) return;
    const trackedSide: TeamSide = vcSideSetup;
    const apiUrl = appData.gameSetup.apiUrl?.trim() || DEFAULT_API;
    const trackedTeamId = trackedSide === "home" ? homeTeamId : awayTeamId;

    // Pre-game guard
    const totalScore = scores.home + scores.away;
    if (gamePhase !== "live" || (period === "Q1" && totalScore === 0 && allEventObjs.length < 5)) {
      setSummaryPlayerAiInsights(null);
      return;
    }

    setSummaryPlayerAiLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/games/${gameId}/insights`, {
        method: "GET",
        headers: { ...apiKeyHeader(appData.gameSetup) },
      });
      if (!res.ok) { setSummaryPlayerAiInsights(null); return; }

      const insights = await res.json() as SharedLiveInsight[];
      if (!Array.isArray(insights) || insights.length === 0) {
        setSummaryPlayerAiInsights(null);
        return;
      }

      const playerLines = insights
        .filter((insight) => {
          if (!insight.relatedTeamId || insight.relatedTeamId !== trackedTeamId) {
            return false;
          }
          return insight.type === "hot_hand"
            || insight.type === "foul_trouble"
            || insight.type === "foul_warning"
            || insight.type === "sub_suggestion"
            || (insight.type === "ai_coaching" && Boolean(insight.relatedPlayerId));
        })
        .slice(0, 7)
        .map((insight) => {
          const playerName = playerNameFromId(insight.relatedPlayerId, trackedPlayers);
          const core = insight.message?.trim() || insight.explanation?.trim() || "No player guidance available.";
          const withPlayer = insight.relatedPlayerId ? `${playerName}: ${core}` : core;
          return withPlayer;
        });

      if (playerLines.length > 0) {
        setSummaryPlayerAiInsights(playerLines);
        return;
      }

      setSummaryPlayerAiInsights(null);
    } catch {
      setSummaryPlayerAiInsights(null);
    } finally {
      setSummaryPlayerAiLoading(false);
    }
  }

  // Keep the ref current so the interval always has the latest values
  useEffect(() => {
    autoSaveCtx.current.run = () => {
      if (allEventObjs.length > 0 && appData.gameSetup.opponent?.trim() && navigator.onLine) {
        void submitToDashboard();
      }
    };
  });

  useEffect(() => {
    if (gamePhase !== "post-game") return;
    setPostGameNameInput(appData.gameSetup.gameId || "");
    setPostGameOpponentInput(appData.gameSetup.opponent || "");
    setPostGameDateInput(gameDate);
    setPostGameHomeScoreInput(String(scores.home));
    setPostGameAwayScoreInput(String(scores.away));
  }, [gamePhase, appData.gameSetup.gameId, appData.gameSetup.opponent, gameDate, scores.home, scores.away]);

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
      gameSetup: {
        ...appData.gameSetup,
        gameId: name,
        opponent,
      },
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
    setPendingEvents([]);
    setSubmittedEvents([]);
    setSequence(1);
    savePending(gameIdToReset, []);
    saveSeq(gameIdToReset, 1);
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

    // Delete from the realtime API
    const apiUrl = appData.gameSetup.apiUrl?.trim();
    if (apiUrl && gameId) {
      try {
        await fetch(`${apiUrl}/api/games/${encodeURIComponent(gameId)}`, {
          method: "DELETE",
          headers: apiKeyHeader(appData.gameSetup),
        });
      } catch {
        // Keep discarding locally even if API cleanup fails.
      }
    }

    // Also delete from legacy stats export if a stats game ID was assigned
    const dashboardUrl = appData.gameSetup.dashboardUrl?.trim();
    const savedStatsGameId = appData.gameSetup.statsGameId;
    if (dashboardUrl && savedStatsGameId != null) {
      try {
        await fetch(`${dashboardUrl}/api/games/${savedStatsGameId}`, {
          method: "DELETE",
          headers: apiKeyHeader(appData.gameSetup),
        });
      } catch {
        // Keep discarding locally even if dashboard cleanup fails.
      }
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
      },
    });
    setGameDate(new Date().toISOString().slice(0, 10));
    resetGameStateFor(freshId);
    persistPhase("pre-game");
  }

  async function submitGameToRealtimeApi(): Promise<boolean> {
    const apiUrl = appData.gameSetup.apiUrl?.trim();
    if (!apiUrl || !gameId) return true; // Nothing to do without API config
    try {
      const res = await fetch(`${apiUrl}/api/games/${encodeURIComponent(gameId)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(appData.gameSetup) },
      });
      if (!res.ok && res.status !== 404) {
        // 404 is OK - game may have been discarded already
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  // Auto-save interval is disabled - games are only published to the stats
  // dashboard when the operator explicitly taps "Submit Game" on the
  // post-game screen.  The ref and ctx are kept so legacy export (if
  // configured) can still be triggered manually.
  useEffect(() => {
    const id = setInterval(() => { /* auto-save disabled */ }, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ---- Event builder ----
  function base(seq: number) {
    return {
      id: uid(),
      gameId,
      sequence: seq,
      timestampIso: new Date().toISOString(),
      period: period as string,
      clockSecondsRemaining: clockToSec(clockInput),
      operatorId: "op-1",
    };
  }

  function buildEditModalForEvent(target: FeedEventSelection): Modal | null {
    const editContext: EventEditContext = {
      eventId: target.event.id,
      originalEvent: target.event,
      pending: target.pending,
    };

    switch (target.event.type) {
      case "shot_attempt": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "shot", teamId: teamSide, points: target.event.points, made: target.event.made, editContext };
      }
      case "free_throw_attempt": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "freeThrow", teamId: teamSide, made: target.event.made, editContext };
      }
      case "rebound": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "stat", stat: target.event.offensive ? "off_reb" : "def_reb", teamId: teamSide, editContext };
      }
      case "turnover":
      case "foul":
      case "steal":
      case "block": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        const stat = target.event.type === "turnover"
          ? "turnover"
          : target.event.type === "foul"
            ? "foul"
            : target.event.type;
        return { kind: "stat", stat, teamId: teamSide, editContext };
      }
      case "assist": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return {
          kind: "assistEdit",
          teamId: teamSide,
          assistPlayerId: target.event.playerId,
          scorerPlayerId: target.event.scorerPlayerId,
          editContext,
        };
      }
      case "substitution": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "sub1", teamId: teamSide, editContext };
      }
      case "timeout": {
        const teamSide = getEventTeamSide(target.event.teamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "timeoutEdit", teamId: teamSide, timeoutType: target.event.timeoutType, editContext };
      }
      case "possession_start": {
        const teamSide = getEventTeamSide(target.event.possessedByTeamId, homeTeamId, awayTeamId);
        if (!teamSide) return null;
        return { kind: "possessionEdit", teamId: teamSide, editContext };
      }
      case "period_transition":
        return { kind: "periodTransitionEdit", newPeriod: target.event.newPeriod, editContext };
      default:
        return null;
    }
  }

  async function saveEditedEvent(nextEvent: GameEvent, editContext: EventEditContext): Promise<boolean> {
    const normalizedEvent = normalizeEventTeamId(nextEvent);

    if (editContext.pending) {
      setPendingEvents((current) => upsertSortedEvent(current, normalizedEvent));
      setModal(null);
      showInlineNotice("Event updated.", "success", 2200);
      return true;
    }

    if (!navigator.onLine) {
      showInlineNotice("Reconnect to edit submitted events.", "error");
      return false;
    }

    try {
      const response = await fetch(`${appData.gameSetup.apiUrl}/api/games/${gameId}/events/${editContext.eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(appData.gameSetup) },
        body: JSON.stringify(normalizedEvent),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        showInlineNotice(`Could not update event${errorText ? `: ${errorText}` : "."}`, "error");
        return false;
      }

      const payload = await response.json().catch(() => null) as { event?: GameEvent } | null;
      const savedEvent = normalizeEventTeamId(payload?.event ?? normalizedEvent);
      setSubmittedEvents((current) => upsertSortedEvent(current, savedEvent));
      setPendingEvents((current) => removeEventById(current, savedEvent.id));
      setModal(null);
      showInlineNotice("Event updated.", "success", 2200);
      return true;
    } catch {
      showInlineNotice("Could not reach the live server to update this event.", "error");
      return false;
    }
  }

  async function deleteEventRecord(target: FeedEventSelection): Promise<boolean> {
    if (target.pending) {
      setPendingEvents((current) => removeEventById(current, target.event.id));
      setModal(null);
      showInlineNotice("Event deleted.", "success", 2200);
      return true;
    }

    if (!navigator.onLine) {
      showInlineNotice("Reconnect to delete submitted events.", "error");
      return false;
    }

    try {
      const response = await fetch(`${appData.gameSetup.apiUrl}/api/games/${gameId}/events/${target.event.id}`, {
        method: "DELETE",
        headers: apiKeyHeader(appData.gameSetup),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        showInlineNotice(`Could not delete event${errorText ? `: ${errorText}` : "."}`, "error");
        return false;
      }

      setSubmittedEvents((current) => removeEventById(current, target.event.id));
      setPendingEvents((current) => removeEventById(current, target.event.id));
      setModal(null);
      showInlineNotice("Event deleted.", "success", 2200);
      return true;
    } catch {
      showInlineNotice("Could not reach the live server to delete this event.", "error");
      return false;
    }
  }

  function openFeedEventEditor(target: FeedEventSelection) {
    const nextModal = buildEditModalForEvent(target);
    if (!nextModal) {
      showInlineNotice("That event cannot be edited from the feed yet.", "warning", 3200);
      return;
    }

    setModal(nextModal);
  }

  function getModalEditContext(activeModal: Modal | null): EventEditContext | null {
    if (!activeModal) return null;
    switch (activeModal.kind) {
      case "shot":
      case "freeThrow":
      case "stat":
      case "sub1":
      case "sub2":
        return activeModal.editContext ?? null;
      case "assistEdit":
      case "timeoutEdit":
      case "possessionEdit":
      case "periodTransitionEdit":
        return activeModal.editContext;
      default:
        return null;
    }
  }

  function renderEditDeleteAction(editContext: EventEditContext | null) {
    if (!editContext) return null;
    return (
      <div className="modal-edit-actions">
        <button
          className="modal-delete-btn"
          onClick={async () => {
            const ok = await requestConfirm({
              title: "Delete event?",
              message: "This removes the selected event from the game log.",
              confirmLabel: "Delete Event",
              tone: "danger",
            });
            if (!ok) return;
            void deleteEventRecord({ event: editContext.originalEvent, pending: editContext.pending });
          }}
        >
          Delete Event
        </button>
      </div>
    );
  }

  // ---- Modal helpers ----
  function closeModal() { setModal(null); }

  function confirmShot(playerId: string) {
    if (!modal || modal.kind !== "shot") return;
    if (modal.teamId === opponentSide && !isOpponentStatEnabled("points")) {
      closeModal();
      return;
    }
    if (modal.editContext) {
      void saveEditedEvent({
        ...modal.editContext.originalEvent,
        teamId: resolveTeamId(modal.teamId),
        type: "shot_attempt",
        playerId,
        made: modal.made,
        points: modal.points,
        zone: modal.points === 3 ? "above_break_three" : "paint",
      } as GameEvent, modal.editContext);
      return;
    }
    void postEvent({
      ...base(sequence),
      teamId: resolveTeamId(modal.teamId),
      type: "shot_attempt",
      playerId,
      made: modal.made,
      points: modal.points,
      zone: modal.points === 3 ? "above_break_three" : "paint",
    } as GameEvent);
    closeModal();
  }

  function confirmFreeThrow(playerId: string) {
    if (!modal || modal.kind !== "freeThrow") return;
    if (modal.teamId === opponentSide && !isOpponentStatEnabled("free_throws")) {
      closeModal();
      return;
    }
    if (modal.editContext) {
      void saveEditedEvent({
        ...modal.editContext.originalEvent,
        teamId: resolveTeamId(modal.teamId),
        type: "free_throw_attempt",
        playerId,
        made: modal.made,
        attemptNumber: 1,
        totalAttempts: 1,
      } as GameEvent, modal.editContext);
      return;
    }
    void postEvent({
      ...base(sequence),
      teamId: resolveTeamId(modal.teamId),
      type: "free_throw_attempt",
      playerId,
      made: modal.made,
      attemptNumber: 1,
      totalAttempts: 1,
    } as GameEvent);
    closeModal();
  }

  function confirmStat(playerId: string) {
    if (!modal || modal.kind !== "stat") return;
    if (modal.teamId === opponentSide && !isOpponentStatEnabled(modal.stat as OpponentTrackStat)) {
      closeModal();
      return;
    }
    const b = base(sequence);
    const { stat } = modal;
    const teamId = resolveTeamId(modal.teamId);
    const otherSide: TeamSide = modal.teamId === "home" ? "away" : "home";
    const otherTeamId = resolveTeamId(otherSide);
    let event: GameEvent | null = null;
    if (stat === "def_reb")  event = { ...b, teamId, type: "rebound",  playerId, offensive: false };
    if (stat === "off_reb")  event = { ...b, teamId, type: "rebound",  playerId, offensive: true  };
    if (stat === "foul")     event = { ...b, teamId, type: "foul",     playerId, foulType: "personal" };
    if (stat === "turnover") event = { ...b, teamId, type: "turnover", playerId, turnoverType: "bad_pass" };
    if (stat === "steal") {
      if (modal.editContext) {
        void saveEditedEvent({
          ...modal.editContext.originalEvent,
          teamId,
          type: "steal",
          playerId,
        } as GameEvent, modal.editContext);
        return;
      }
      const stealEvent: GameEvent = { ...b, teamId, type: "steal", playerId };
      void postEvent(stealEvent);

      const isOpponentTurnover = otherSide === opponentSide;
      const shouldTrackOpponentTurnover = !isOpponentTurnover || isOpponentStatEnabled("turnover");
      if (shouldTrackOpponentTurnover) {
        const turnoverEvent: GameEvent = {
          ...base(sequence + 1),
          teamId: otherTeamId,
          type: "turnover",
          playerId: otherTeamId,
          turnoverType: "bad_pass",
        };
        void postEvent(turnoverEvent);
      }

      closeModal();
      return;
    }
    if (stat === "block")    event = { ...b, teamId, type: "block",    playerId };
    if (stat === "assist")   { setModal({ kind: "assist2", teamId: modal.teamId, assistPlayerId: playerId }); return; }
    if (event && modal.editContext) {
      void saveEditedEvent({
        ...modal.editContext.originalEvent,
        ...event,
        id: modal.editContext.originalEvent.id,
        gameId: modal.editContext.originalEvent.gameId,
        sequence: modal.editContext.originalEvent.sequence,
        timestampIso: modal.editContext.originalEvent.timestampIso,
        operatorId: modal.editContext.originalEvent.operatorId,
        period: modal.editContext.originalEvent.period,
        clockSecondsRemaining: modal.editContext.originalEvent.clockSecondsRemaining,
      } as GameEvent, modal.editContext);
      return;
    }
    if (event) void postEvent(event as GameEvent);
    closeModal();
  }

  function confirmAssistScorer(scorerPlayerId: string) {
    if (!modal || modal.kind !== "assist2") return;
    setModal({ kind: "assist3", teamId: modal.teamId, assistPlayerId: modal.assistPlayerId, scorerPlayerId });
  }

  async function confirmAssistPoints(points: 2 | 3) {
    if (!modal || modal.kind !== "assist3") return;
    const seq = sequence;
    const teamId = resolveTeamId(modal.teamId);

    await postEvent({
      ...base(seq),
      teamId,
      type: "shot_attempt",
      playerId: modal.scorerPlayerId,
      made: true,
      points,
      zone: points === 3 ? "above_break_three" : "paint",
      assistedByPlayerId: modal.assistPlayerId,
    } as GameEvent);

    void postEvent({
      ...base(seq + 1),
      teamId,
      type: "assist",
      playerId: modal.assistPlayerId,
      scorerPlayerId: modal.scorerPlayerId,
    });
    closeModal();
  }

  function confirmSubOut(playerOutId: string) {
    if (!modal || modal.kind !== "sub1") return;
    setModal({ kind: "sub2", teamId: modal.teamId, playerOutId, editContext: modal.editContext });
  }

  function confirmSubIn(playerInId: string) {
    if (!modal || (modal.kind !== "sub2" && modal.kind !== "sub1")) return;
    const playerOutId = modal.kind === "sub2" ? modal.playerOutId : modal.playerOutId;
    if (!playerOutId) return;
    if (modal.editContext) {
      void saveEditedEvent({
        ...modal.editContext.originalEvent,
        teamId: resolveTeamId(modal.teamId),
        type: "substitution",
        playerOutId,
        playerInId,
      } as GameEvent, modal.editContext);
      return;
    }
    void postEvent({
      ...base(sequence),
      teamId: resolveTeamId(modal.teamId),
      type: "substitution",
      playerOutId,
      playerInId,
    });
    closeModal();
  }

  function setPossession(side: TeamSide) {
    const teamId = resolveTeamId(side);
    if (possessionTeamId === teamId) {
      const teamName = side === "home" ? homeTeamName : awayTeamName;
      showInlineNotice(`Possession is already set to ${teamName}.`, "warning", 2500);
      return;
    }
    setPossessionOverrideTeamId(teamId);
    void postEvent({
      ...base(sequence),
      teamId,
      type: "possession_start",
      possessedByTeamId: teamId,
    });
  }

  function takeTimeout(side: TeamSide, timeoutType: "full" | "short") {
    const teamId = resolveTeamId(side);
    const bucket = side === "home" ? timeoutRemaining.home : timeoutRemaining.away;
    if (timeoutType === "short" && inOvertimeNow) return;
    if (bucket[timeoutType] <= 0) return;
    void postEvent({
      ...base(sequence),
      teamId,
      type: "timeout",
      timeoutType,
    });
  }

  function handleClockInput(rawValue: string) {
    if (appData.gameSetup.clockEnabled === false) return;
    setClockInput(formatClockFromDigits(rawValue));
  }

  function adjustClock(deltaSeconds: number) {
    if (appData.gameSetup.clockEnabled === false) return;
    setClockInput((current) => formatClockFromSeconds(clockToSec(current) + deltaSeconds));
  }

  function resetClockForPeriod() {
    setClockRunning(false);
    setClockInput(getPeriodDefaultClock(period));
  }

  // ---- Modal render ----
  function renderModal() {
    if (!modal) return null;
    const teamPlayers = (side: TeamSide) => side === "home" ? homePlayers : awayPlayers;
    const tLabel = (side: TeamSide) => side === "home" ? homeTeamName : awayTeamName;

    if (modal.kind === "shot" || modal.kind === "freeThrow") {
      const allTeamPlayers = teamPlayers(modal.teamId);
      const lineup = computeCurrentLineup(allEventObjs, resolveTeamId(modal.teamId), appData.gameSetup.startingLineup ?? [], allTeamPlayers);
      const players = lineup.onCourt;
      const allowTeamOnlyForOpponent = modal.teamId === opponentSide && allTeamPlayers.length === 0;
      const selectedTeamColor = modal.teamId === "home" ? homeTeamColor : awayTeamColor;
      const modalTitle = modal.editContext
        ? `Edit ${modal.kind === "shot" ? `${modal.points}pt` : "FT"} - ${tLabel(modal.teamId)}`
        : `${modal.kind === "shot" ? `${modal.points}pt` : "FT"} - ${tLabel(modal.teamId)}`;
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modalTitle}</span>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            {renderEditDeleteAction(modal.editContext ?? null)}
            <div className="made-miss-row">
              <button className={`toggle-btn ${modal.made ? "t-teal" : ""}`} onClick={() => setModal({ ...modal, made: true })}>Made</button>
              <button className={`toggle-btn ${!modal.made ? "t-red" : ""}`} onClick={() => setModal({ ...modal, made: false })}>Miss</button>
            </div>
            <div className="player-list">
              {players.length === 0 && !allowTeamOnlyForOpponent && <p className="no-players">No players on court yet</p>}
              {players.map(p => (
                <button key={p.id} className="player-row" onClick={() => (modal.kind === "shot" ? confirmShot(p.id) : confirmFreeThrow(p.id))}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                  {p.position && <span className="ppos">{p.position}</span>}
                  {pTotals[p.id]?.fouls ? (
                    <span className={`pfoul${pTotals[p.id].fouls >= 5 ? " pfoul-out" : pTotals[p.id].fouls >= 4 ? " pfoul-warn" : ""}`}>
                      {pTotals[p.id].fouls}f{pTotals[p.id].fouls >= 5 ? " OUT" : ""}
                    </span>
                  ) : null}
                  {pTotals[p.id] ? <span className="ppts">{pTotals[p.id].points} pts</span> : null}
                </button>
              ))}
              {allowTeamOnlyForOpponent && (
                <button
                  className="player-row team-row opponent-team-only-row"
                  style={{ borderColor: `${selectedTeamColor}bf`, background: `${selectedTeamColor}2b`, color: selectedTeamColor, boxShadow: `0 0 0 1px ${selectedTeamColor}59` }}
                  onClick={() => (modal.kind === "shot" ? confirmShot(resolveTeamId(modal.teamId)) : confirmFreeThrow(resolveTeamId(modal.teamId)))}
                >
                  {tLabel(modal.teamId)}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "stat") {
      const statLabels: Record<string, string> = {
        def_reb: "Def Rebound", off_reb: "Off Rebound", turnover: "Turnover",
        steal: "Steal", assist: "Assist - pick passer", block: "Block", foul: "Foul",
      };
      const trackedSide = vcSideSetup;
      const allowOpponentForStat = isOpponentStatEnabled(modal.stat as OpponentTrackStat);
      const trackedAllPlayers = teamPlayers(trackedSide);
      const trackedLineup = computeCurrentLineup(allEventObjs, resolveTeamId(trackedSide), appData.gameSetup.startingLineup ?? [], trackedAllPlayers);
      const trackedPlayers = trackedLineup.onCourt;
      const isTrackedSelection = modal.teamId === trackedSide;
      const trackedTeamColor = trackedSide === "home" ? homeTeamColor : awayTeamColor;
      const opponentTeamColor = opponentSide === "home" ? homeTeamColor : awayTeamColor;
      const selectedTeamColor = modal.teamId === "home" ? homeTeamColor : awayTeamColor;
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-title">{modal.editContext ? `Edit ${statLabels[modal.stat]}` : statLabels[modal.stat]}</span>
                <div className="modal-team-toggle">
                  <button
                    className={isTrackedSelection ? "team-color-active" : ""}
                    style={isTrackedSelection ? { background: `${trackedTeamColor}26`, borderColor: trackedTeamColor, color: trackedTeamColor } : undefined}
                    onClick={() => setModal({ ...modal, teamId: trackedSide })}
                  >{vcSideSetup === "home" ? homeTeamName : awayTeamName}</button>
                  <button
                    className={!isTrackedSelection ? "team-color-active" : ""}
                    style={!isTrackedSelection ? { background: `${opponentTeamColor}26`, borderColor: opponentTeamColor, color: opponentTeamColor } : undefined}
                    onClick={() => {
                      if (allowOpponentForStat) setModal({ ...modal, teamId: opponentSide });
                    }}
                    disabled={!allowOpponentForStat}
                    title={allowOpponentForStat ? undefined : "Opponent tracking for this stat is disabled in Settings"}
                  >{vcSideSetup === "home" ? awayTeamName : homeTeamName}</button>
                </div>
              </div>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            {renderEditDeleteAction(modal.editContext ?? null)}
            <div className="player-list">
              {isTrackedSelection ? (
                <>
                  {trackedPlayers.length === 0 && <p className="no-players">No players on court yet</p>}
                  {trackedPlayers.map(p => (
                    <button key={p.id} className="player-row" onClick={() => confirmStat(p.id)}>
                      <span className="pnum">#{p.number}</span>
                      <span className="pname">{p.name}</span>
                      {p.position && <span className="ppos">{p.position}</span>}
                      {pTotals[p.id]?.fouls ? (
                        <span className={`pfoul${pTotals[p.id].fouls >= 5 ? " pfoul-out" : pTotals[p.id].fouls >= 4 ? " pfoul-warn" : ""}`}>
                          {pTotals[p.id].fouls}f{pTotals[p.id].fouls >= 5 ? " OUT" : ""}
                        </span>
                      ) : null}
                      {pTotals[p.id]?.points ? <span className="ppts">{pTotals[p.id].points} pts</span> : null}
                    </button>
                  ))}
                </>
              ) : (
                <p className="no-players">Opponent tracked as team only.</p>
              )}
              {!isTrackedSelection && (
                <button
                  className="player-row team-row opponent-team-only-row"
                  style={{ borderColor: `${selectedTeamColor}bf`, background: `${selectedTeamColor}2b`, color: selectedTeamColor, boxShadow: `0 0 0 1px ${selectedTeamColor}59` }}
                  onClick={() => confirmStat(`${modal.teamId}-team`)}
                >
                  {tLabel(modal.teamId)}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "assistEdit") {
      const allTeamPlayers = teamPlayers(modal.teamId);
      const lineup = computeCurrentLineup(allEventObjs, resolveTeamId(modal.teamId), appData.gameSetup.startingLineup ?? [], allTeamPlayers);
      const players = lineup.onCourt;
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Edit Assist - {tLabel(modal.teamId)}</span>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            {renderEditDeleteAction(modal.editContext)}
            <div className="modal-subtitle">Select the passer, then the scorer.</div>
            <div className="player-list">
              {players.length === 0 && <p className="no-players">No players on court yet</p>}
              {players.map((player) => (
                <button
                  key={`assist-passer-${player.id}`}
                  className={`player-row${modal.assistPlayerId === player.id ? " player-row-selected" : ""}`}
                  onClick={() => setModal({ ...modal, assistPlayerId: player.id })}
                >
                  <span className="pnum">#{player.number}</span>
                  <span className="pname">Passer: {player.name}</span>
                </button>
              ))}
            </div>
            <div className="player-list">
              {players.map((player) => (
                <button
                  key={`assist-scorer-${player.id}`}
                  className={`player-row${modal.scorerPlayerId === player.id ? " player-row-selected" : ""}`}
                  onClick={() => setModal({ ...modal, scorerPlayerId: player.id })}
                >
                  <span className="pnum">#{player.number}</span>
                  <span className="pname">Scorer: {player.name}</span>
                </button>
              ))}
            </div>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn-cancel" onClick={closeModal}>Cancel</button>
              <button
                className="confirm-btn confirm-btn-primary"
                onClick={() => {
                  void saveEditedEvent({
                    ...modal.editContext.originalEvent,
                    teamId: resolveTeamId(modal.teamId),
                    type: "assist",
                    playerId: modal.assistPlayerId,
                    scorerPlayerId: modal.scorerPlayerId,
                  } as GameEvent, modal.editContext);
                }}
              >
                Save Assist
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "assist2") {
      const allTeamPlayers = teamPlayers(modal.teamId);
      const lineup = computeCurrentLineup(allEventObjs, resolveTeamId(modal.teamId), appData.gameSetup.startingLineup ?? [], allTeamPlayers);
      const players = lineup.onCourt.filter(p => p.id !== modal.assistPlayerId);
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Assist - pick scorer</span>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            <div className="player-list">
              {players.length === 0 && <p className="no-players">No players on court yet</p>}
              {players.map(p => (
                <button key={p.id} className="player-row" onClick={() => confirmAssistScorer(p.id)}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                  {pTotals[p.id] ? <span className="ppts">{pTotals[p.id].points} pts</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "assist3") {
      const players = teamPlayers(modal.teamId);
      const scorer = players.find((p) => p.id === modal.scorerPlayerId);
      const passer = players.find((p) => p.id === modal.assistPlayerId);
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Assist - pick points</span>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            <div className="modal-subtitle">
              {passer ? `Passer: #${passer.number} ${passer.name}` : "Passer selected"}
            </div>
            <div className="modal-subtitle">
              {scorer ? `Scorer: #${scorer.number} ${scorer.name}` : "Scorer selected"}
            </div>
            <div className="event-pills" style={{ marginTop: 12, display: "flex", gap: "1.5rem", justifyContent: "center" }}>
              <button className="circle teal" style={{ width: 120, height: 120, fontSize: "1.6rem" }} onClick={() => { void confirmAssistPoints(2); }}>2pt</button>
              <button className="circle teal" style={{ width: 120, height: 120, fontSize: "1.6rem" }} onClick={() => { void confirmAssistPoints(3); }}>3pt</button>
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "sub1") {
      const players = teamPlayers(modal.teamId);
      const currentLineup = computeCurrentLineup(allEventObjs, resolveTeamId(modal.teamId), appData.gameSetup.startingLineup ?? [], players);
      
      // If playerOutId is provided, skip directly to selecting who to sub in
      if (modal.playerOutId) {
          const subInPlayers = currentLineup.bench;
        return (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">{modal.editContext ? "Edit Sub In" : "Sub In"} for {players.find(p => p.id === modal.playerOutId)?.name} - {tLabel(modal.teamId)}</span>
                <button className="modal-close" onClick={closeModal}>X</button>
              </div>
              {renderEditDeleteAction(modal.editContext ?? null)}
              <div className="player-list">
                {subInPlayers.map(p => (
                  <button key={p.id} className="player-row" onClick={() => confirmSubIn(p.id)}>
                    <span className="pnum">#{p.number}</span>
                    <span className="pname">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      }

      // Otherwise show who's on court to choose who to sub out
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal.editContext ? "Edit Sub Out" : "Sub Out"} - {tLabel(modal.teamId)}</span>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            {renderEditDeleteAction(modal.editContext ?? null)}
            <div className="player-list">
              {currentLineup.onCourt.length > 0 ? (
                currentLineup.onCourt.map(p => (
                  <button key={p.id} className="player-row" onClick={() => confirmSubOut(p.id)}>
                    <span className="pnum">#{p.number}</span>
                    <span className="pname">{p.name}</span>
                    {pTotals[p.id] && <span className="ppts">{pTotals[p.id].points}pts</span>}
                  </button>
                ))
              ) : (
                <p className="no-players">No players on court yet</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "sub2") {
      const allSub2Players = teamPlayers(modal.teamId);
      const sub2Lineup = computeCurrentLineup(allEventObjs, resolveTeamId(modal.teamId), appData.gameSetup.startingLineup ?? [], allSub2Players);
      const players = sub2Lineup.bench;
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal.editContext ? "Edit Sub In" : "Sub In"} - {tLabel(modal.teamId)}</span>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            {renderEditDeleteAction(modal.editContext ?? null)}
            <div className="player-list">
              {players.map(p => (
                <button key={p.id} className="player-row" onClick={() => confirmSubIn(p.id)}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "timeoutEdit") {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-confirm" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Edit Timeout</span>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            {renderEditDeleteAction(modal.editContext)}
            <div className="confirm-message">Update the team and timeout length for this stoppage.</div>
            <div className="modal-team-toggle" style={{ padding: "0 1.2rem" }}>
              <button className={modal.teamId === "home" ? "team-color-active" : ""} onClick={() => setModal({ ...modal, teamId: "home" })}>{homeTeamName}</button>
              <button className={modal.teamId === "away" ? "team-color-active" : ""} onClick={() => setModal({ ...modal, teamId: "away" })}>{awayTeamName}</button>
            </div>
            <div className="made-miss-row" style={{ padding: "0.9rem 1.2rem 0" }}>
              <button className={`toggle-btn ${modal.timeoutType === "full" ? "t-teal" : ""}`} onClick={() => setModal({ ...modal, timeoutType: "full" })}>Full</button>
              <button className={`toggle-btn ${modal.timeoutType === "short" ? "t-red" : ""}`} onClick={() => setModal({ ...modal, timeoutType: "short" })}>Short</button>
            </div>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn-cancel" onClick={closeModal}>Cancel</button>
              <button
                className="confirm-btn confirm-btn-primary"
                onClick={() => {
                  void saveEditedEvent({
                    ...modal.editContext.originalEvent,
                    teamId: resolveTeamId(modal.teamId),
                    type: "timeout",
                    timeoutType: modal.timeoutType,
                  } as GameEvent, modal.editContext);
                }}
              >
                Save Timeout
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "possessionEdit") {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-confirm" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Edit Possession</span>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            {renderEditDeleteAction(modal.editContext)}
            <div className="confirm-message">Choose which team should own this possession event.</div>
            <div className="modal-team-toggle" style={{ padding: "0 1.2rem" }}>
              <button className={modal.teamId === "home" ? "team-color-active" : ""} onClick={() => setModal({ ...modal, teamId: "home" })}>{homeTeamName}</button>
              <button className={modal.teamId === "away" ? "team-color-active" : ""} onClick={() => setModal({ ...modal, teamId: "away" })}>{awayTeamName}</button>
            </div>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn-cancel" onClick={closeModal}>Cancel</button>
              <button
                className="confirm-btn confirm-btn-primary"
                onClick={() => {
                  const teamId = resolveTeamId(modal.teamId);
                  void saveEditedEvent({
                    ...modal.editContext.originalEvent,
                    teamId,
                    type: "possession_start",
                    possessedByTeamId: teamId,
                  } as GameEvent, modal.editContext);
                }}
              >
                Save Possession
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "periodTransitionEdit") {
      const availablePeriods = [
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        ...Array.from({ length: overtimeCount }, (_, index) => `OT${index + 1}`),
      ];
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-confirm" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Edit Period Start</span>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            {renderEditDeleteAction(modal.editContext)}
            <div className="confirm-message">Pick the period that should start at this point in the feed.</div>
            <div className="period-row" style={{ borderTop: "none", paddingTop: 0 }}>
              {availablePeriods.map((label) => (
                <button
                  key={label}
                  className={`period-btn${modal.newPeriod === label ? " period-on" : ""}`}
                  onClick={() => setModal({ ...modal, newPeriod: label })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn-cancel" onClick={closeModal}>Cancel</button>
              <button
                className="confirm-btn confirm-btn-primary"
                onClick={() => {
                  void saveEditedEvent({
                    ...modal.editContext.originalEvent,
                    type: "period_transition",
                    newPeriod: modal.newPeriod,
                    period: modal.newPeriod,
                  } as GameEvent, modal.editContext);
                }}
              >
                Save Period
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderInlineNotice() {
    if (!inlineNotice) return null;
    return (
      <div className={`inline-notice inline-notice-${inlineNotice.tone}`} role="alert" aria-live="assertive">
        <span>{inlineNotice.message}</span>
        <button className="inline-notice-close" onClick={dismissInlineNotice} aria-label="Dismiss notice">
          Dismiss
        </button>
      </div>
    );
  }

  function renderAlertBanner() {
    const visible = liveAlerts.filter((a) => !dismissedAlertIds.has(a.id));
    if (visible.length === 0) return null;
    const top = visible[0];
    const isUrgent = top.priority === "urgent";
    return (
      <div
        className={`operator-alert-banner operator-alert-banner-${top.priority}`}
        role="alert"
        aria-live="assertive"
      >
        <div className="operator-alert-content">
          <span className={`operator-alert-badge operator-alert-badge-${top.priority}`}>
            {isUrgent ? "URGENT" : "ALERT"}
          </span>
          <span className="operator-alert-message">{top.message}</span>
          {visible.length > 1 && (
            <span className="operator-alert-count">+{visible.length - 1} more</span>
          )}
        </div>
        <button
          className="operator-alert-dismiss"
          onClick={() => setDismissedAlertIds((prev) => new Set([...prev, top.id]))}
          aria-label="Dismiss alert"
        >
          X
        </button>
      </div>
    );
  }

  function renderConfirmDialog() {
    if (!confirmDialog) return null;
    return (
      <div className="modal-overlay" onClick={() => resolveConfirm(false)}>
        <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">{confirmDialog.title}</span>
          </div>
          <div className="confirm-message">{confirmDialog.message}</div>
          <div className="confirm-actions">
            <button className="confirm-btn confirm-btn-cancel" onClick={() => resolveConfirm(false)}>
              {confirmDialog.cancelLabel}
            </button>
            <button
              className={`confirm-btn ${confirmDialog.tone === "danger" ? "confirm-btn-danger" : "confirm-btn-primary"}`}
              onClick={() => resolveConfirm(true)}
            >
              {confirmDialog.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================================================================
  //  SETTINGS
  // ================================================================
  if (view === "settings") {
    if (settingsView === "ipad-tips") {
      return <IpadTipsPage onBack={() => navigateView("settings", "menu")} />;
    }

    const safeSettingsView: SettingsView = operatorAllowedSettingsViews.has(settingsView)
      ? settingsView
      : "menu";

    return <SettingsScreen
      appData={appData}
      settingsView={safeSettingsView}
      onPersist={persistData}
      onNav={(nextView) => navigateView("settings", operatorAllowedSettingsViews.has(nextView) ? nextView : "menu")}
      onBack={() => navigateView("game")}
      onStartGame={async () => {
        const reset = await endAndResetGame();
        if (reset) {
          navigateView("game");
        }
      }}
    />;
  }

  // ================================================================
  //  GAME VIEW (3-column)
  // ================================================================

  // ---- PRE-GAME SCREEN ----
  if (gamePhase === "pre-game") {
    const savedLineup = appData.gameSetup.startingLineup ?? [];
    const lineupIsSet = savedLineup.length > 0;
    const hasConnectionId = !!normalizeConnectionId(appData.gameSetup.connectionId);
    const canStart = hasConnectionId && !!appData.gameSetup.myTeamId && !!appData.gameSetup.opponent?.trim() && lineupIsSet;
    const myTeamDisplay = myTeam?.name ?? null;

    const handleStarterToggle = (playerId: string) => {
      const next = new Set(selectedStarters);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
          if (next.size >= 5) return;
          next.add(playerId);
      }
      setSelectedStarters(next);
    };

    const handleSaveLineup = () => {
      persistData({
        ...appData,
        gameSetup: {
          ...appData.gameSetup,
          startingLineup: Array.from(selectedStarters),
        },
      });
      setShowLineupSetup(false);
    };

    return (
      <div className="pregame-screen">
        {renderInlineNotice()}
        {renderConfirmDialog()}
        <div className="pregame-card">
          <div className="pregame-header">
            <span className="pregame-eyebrow">Operator Console</span>
            <h1 className="pregame-title">Ready to Track</h1>
          </div>

          <div className="pregame-device-id">
            <div className="pregame-device-field">
              <label className="pregame-device-label">Connection Code</label>
              <input
                className="pregame-device-input"
                value={appData.gameSetup.connectionId ?? ""}
                onChange={(event) => {
                  const nextConnectionId = normalizeConnectionId(event.target.value);
                  setConnectionSyncStatus(nextConnectionId
                    ? `Connection code ${nextConnectionId} saved locally. Syncing coach setup...`
                    : DEFAULT_CONNECTION_SYNC_STATUS);
                  persistData({
                    ...appData,
                    gameSetup: {
                      ...appData.gameSetup,
                      connectionId: nextConnectionId || undefined,
                    },
                  });
                }}
                placeholder="Enter 6-digit coach code"
                aria-label="Connection code"
              />
            </div>
            <button
              type="button"
              className="pregame-device-copy-btn"
              onClick={() => {
                void syncFromCoachCode(undefined, { silent: false });
              }}
              title="Pull roster and game setup from the coach dashboard"
            >
              Sync Now
            </button>
          </div>
          <p className="pregame-settings-hint">{connectionSyncStatus}</p>

          <div className="pregame-matchup">
            <div className="pregame-team my-team">
              {myTeamDisplay ?? <span className="pregame-no-team">No team</span>}
            </div>
            <div className="pregame-vs">vs</div>
            <div className="pregame-team opp-team">
              <input
                className="pregame-opp-input"
                placeholder="Opponent name"
                value={appData.gameSetup.opponent ?? ""}
                onChange={e => persistData({ ...appData, gameSetup: { ...appData.gameSetup, opponent: e.target.value } })}
              />
            </div>
          </div>

          <div className="pregame-meta">
            <div className="pregame-meta-row">
              <span className="pregame-meta-label">Date</span>
              <input
                type="date"
                className="pregame-date-inp"
                value={gameDate}
                onChange={e => setGameDate(e.target.value)}
              />
            </div>
            <div className="pregame-meta-row">
              <span className="pregame-meta-label">Side</span>
              <div className="pregame-side-toggle">
                <button
                  className={`tt-btn${(appData.gameSetup.vcSide ?? "home") === "home" ? " tt-teal" : ""}`}
                  onClick={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, vcSide: "home" } })}>
                  Home
                </button>
                <button
                  className={`tt-btn${(appData.gameSetup.vcSide ?? "home") === "away" ? " tt-red" : ""}`}
                  onClick={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, vcSide: "away" } })}>
                  Away
                </button>
              </div>
            </div>
            <div className="pregame-meta-row">
              <span className="pregame-meta-label">Colors</span>
              <div className="team-color-rows">
                {(() => {
                  const myColorKey = vcSideSetup === "home" ? "homeTeamColor" : "awayTeamColor";
                  const oppColorKey = vcSideSetup === "home" ? "awayTeamColor" : "homeTeamColor";
                  const myEffectiveColor = myTeam?.teamColor
                    ? normalizeTeamColor(myTeam.teamColor, DEFAULT_HOME_TEAM_COLOR)
                    : (vcSideSetup === "home" ? homeTeamColor : awayTeamColor);
                  const oppEffectiveColor = vcSideSetup === "home" ? awayTeamColor : homeTeamColor;
                  const myLabel = myTeam?.name ?? "My Team";
                  const oppLabel = opponentName || "Opponent";
                  return (<>
                    <div className="team-color-row">
                      <span className="team-color-label">{oppLabel}</span>
                      <div className="team-color-swatches">
                        {TEAM_COLOR_OPTIONS.map((color) => (
                          <button
                            key={`pregame-opp-${color}`}
                            type="button"
                            className={`team-color-swatch${oppEffectiveColor === color ? " selected" : ""}`}
                            style={{ background: color }}
                            onClick={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, [oppColorKey]: color } })}
                            title={`Opponent color ${color}`}
                          />
                        ))}
                      </div>
                    </div>
                  </>);
                })()}
              </div>
            </div>
            <div className="pregame-meta-row">
              <span className="pregame-meta-label">Clock</span>
              <div className="pregame-side-toggle">
                <button
                  className={`tt-btn${(appData.gameSetup.clockEnabled ?? true) ? " tt-teal" : ""}`}
                  onClick={() => {
                    const next = !(appData.gameSetup.clockEnabled ?? true);
                    persistData({ ...appData, gameSetup: { ...appData.gameSetup, clockEnabled: next, clockVisible: next } });
                  }}>
                  {(appData.gameSetup.clockEnabled ?? true) ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          </div>

          {!appData.gameSetup.myTeamId && (
            <p className="pregame-error">Warning: No team selected - go to Settings to choose your team.</p>
          )}
          {!hasConnectionId && (
            <p className="pregame-error">Warning: Paste the coach dashboard connection code above to sync the roster before starting the game.</p>
          )}
          {!appData.gameSetup.opponent?.trim() && appData.gameSetup.myTeamId && (
            <p className="pregame-error">Warning: Enter the opponent name above to continue.</p>
          )}
          {appData.gameSetup.myTeamId && appData.gameSetup.opponent?.trim() && !lineupIsSet && (
            <p className="pregame-error">Warning: Set the starting lineup below before starting the game.</p>
          )}

          {myTeam && !showLineupSetup && (
            <button
              className={`pregame-lineup-btn${lineupIsSet ? " lineup-is-set" : ""}${!lineupIsSet ? " lineup-required" : ""}`}
              onClick={() => {
                setSelectedStarters(new Set(savedLineup));
                setShowLineupSetup(true);
              }}>
              {lineupIsSet
                ? `Edit Starting Lineup (${savedLineup.length}/5)`
                : "Set Starting Lineup"}
            </button>
          )}

          {showLineupSetup && myTeam && (
            <div className="pregame-lineup-setup">
              <div className="lineup-setup-head">
                <div>
                  <h3 className="lineup-setup-title">Select Starting Lineup</h3>
                  <p className="lineup-setup-subtitle">Choose 5 players to begin the game.</p>
                </div>
                <button
                  type="button"
                  className="lineup-cancel-btn"
                  onClick={() => setShowLineupSetup(false)}
                >
                  Close
                </button>
              </div>
              <div className="lineup-setup-status">{selectedStarters.size}/5 selected</div>
              <div className="lineup-player-grid">
                {myTeam.players.map(p => (
                  <button
                    key={p.id}
                    className={`lineup-player-btn${selectedStarters.has(p.id) ? " lineup-player-selected" : ""}`}
                    onClick={() => handleStarterToggle(p.id)}
                    disabled={selectedStarters.size >= 5 && !selectedStarters.has(p.id)}>
                    <span className="lineup-player-num">#{p.number}</span>
                    <span className="lineup-player-name">{p.name}</span>
                    {selectedStarters.has(p.id) && <span className="lineup-player-badge">*</span>}
                  </button>
                ))}
              </div>
              <div className="lineup-setup-actions">
                <button className="lineup-clear-btn" onClick={() => setSelectedStarters(new Set())}>
                  Clear
                </button>
                <button className="lineup-save-btn" onClick={handleSaveLineup}>
                  Save Lineup ({selectedStarters.size}/5)
                </button>
              </div>
            </div>
          )}

          <div className="pregame-meta-row pregame-meta-row-full">
            <label className="pregame-meta-label" htmlFor="pregame-notes-input">Match Notes (visible to AI)</label>
            <textarea
              id="pregame-notes-input"
              className="pregame-notes-input"
              value={preGameNotes}
              onChange={e => setPreGameNotes(e.target.value)}
              placeholder="Opponent tendencies, team mindset, key matchups — shared with AI throughout the game"
              rows={3}
            />
          </div>

          <button
            className="pregame-start-btn"
            disabled={!canStart}
            onClick={async () => {
              const newId = generateGameId(appData.gameSetup.opponent ?? "", gameDate);
              await startGame(newId);
            }}>
            Start Game
          </button>

          <div className="pregame-settings-callout">
            <button
              className="pregame-settings-link"
              onClick={() => navigateView("settings", "game-setup")}>
              Open Game Settings
            </button>
            <p className="pregame-settings-hint">Team/Opponent required. API and Dashboard URLs are critical for live sync and final save.</p>
          </div>
        </div>
      </div>
    );
  }

  // ---- POST-GAME SCREEN ----
  if (gamePhase === "post-game") {
    const editedHomeScore = parseScoreInput(postGameHomeScoreInput, scores.home);
    const editedAwayScore = parseScoreInput(postGameAwayScoreInput, scores.away);
    const coachUrl = buildCoachViewUrl(gameId, {
      connectionId: appData.gameSetup.connectionId,
      myTeamId: appData.gameSetup.myTeamId,
      myTeamName: myTeam?.name,
      opponentName: appData.gameSetup.opponent,
      vcSide: appData.gameSetup.vcSide,
      homeTeamColor: normalizeTeamColor(appData.gameSetup.homeTeamColor, DEFAULT_HOME_TEAM_COLOR),
      awayTeamColor: normalizeTeamColor(appData.gameSetup.awayTeamColor, DEFAULT_AWAY_TEAM_COLOR),
    });
    return (
      <div className="postgame-screen">
        {renderInlineNotice()}
        {renderConfirmDialog()}
        <div className="postgame-card">
          <div className="postgame-header">
            <span className="postgame-eyebrow">Game Over</span>
            <h1 className="postgame-title">Finalize game details</h1>
          </div>

          <div className="postgame-edit-grid">
            <label className="postgame-field">
              <span className="postgame-field-label">Game Name</span>
              <input
                className="postgame-input"
                value={postGameNameInput}
                onChange={e => setPostGameNameInput(e.target.value)}
                placeholder="Game name"
              />
            </label>
            <label className="postgame-field">
              <span className="postgame-field-label">Date</span>
              <input
                type="date"
                className="postgame-input"
                value={postGameDateInput}
                onChange={e => setPostGameDateInput(e.target.value)}
              />
            </label>
            <label className="postgame-field postgame-field-wide">
              <span className="postgame-field-label">Opponent</span>
              <input
                className="postgame-input"
                value={postGameOpponentInput}
                onChange={e => setPostGameOpponentInput(e.target.value)}
                placeholder="Opponent name"
              />
            </label>
          </div>

          <div className="postgame-score">
            <div className="postgame-score-team">
              <span className="postgame-score-name">{homeTeamName}</span>
              <input
                className="postgame-score-input"
                inputMode="numeric"
                value={postGameHomeScoreInput}
                onChange={e => setPostGameHomeScoreInput(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="postgame-score-sep">-</div>
            <div className="postgame-score-team">
              <span className="postgame-score-name">{awayTeamName}</span>
              <input
                className="postgame-score-input"
                inputMode="numeric"
                value={postGameAwayScoreInput}
                onChange={e => setPostGameAwayScoreInput(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
          </div>

          <button
            className="postgame-apply-btn"
            onClick={() => {
              applyPostGameEdits();
              setSubmitMessage("Updated game details.");
            }}>
            Save Name/Date/Score Changes
          </button>

          <div className={`submit-banner submit-banner-${submitStatus}`} role="status">
            {submitMessage}
          </div>

          <a
            className="coach-connect-btn"
            href={coachUrl}
            target="_blank"
            rel="noreferrer">
            Open Dashboard
          </a>

          <button
            className="postgame-retry-btn"
            onClick={async () => {
              const edits = applyPostGameEdits();
              setSubmitStatus("pending");
              setSubmitMessage("Submitting game to dashboard...");
              const apiOk = await submitGameToRealtimeApi();
              // Also run legacy export if configured
              const legacyOk = await submitToDashboard({
                opponent: edits.opponent,
                date: edits.date,
                homeScore: editedHomeScore,
                awayScore: editedAwayScore,
              });
              if (apiOk) {
                setSubmitStatus("success");
                setSubmitMessage("Game submitted! Stats are now visible in the dashboard.");
                setTimeout(() => {
                  setSubmitStatus("idle");
                  setSubmitMessage("Game has been submitted to the dashboard.");
                }, 4000);
              } else if (!legacyOk) {
                setSubmitStatus("error");
                setSubmitMessage("Submit failed. Check your connection and try again.");
              }
            }}
            disabled={submitStatus === "pending"}>
            {submitStatus === "pending" ? "Submitting..." : "Submit Game"}
          </button>

          <button
            className="postgame-reset-btn"
            onClick={async () => {
              const ok = await requestConfirm({
                title: "Reset this game and start over?",
                message: "This keeps your settings but clears all tracked events and creates a fresh game id.",
                confirmLabel: "Reset Game",
                tone: "danger",
              });
              if (!ok) return;
              resetFromPostGame();
            }}>
            Reset This Game
          </button>

          <button className="postgame-discard-btn" onClick={discardFromPostGame}>
            Discard This Game
          </button>

          <button className="postgame-new-btn" onClick={handleNewGame}>
            Start New Game
          </button>
        </div>
      </div>
    );
  }

  const periodLabels = [
    "Q1",
    "Q2",
    "Q3",
    "Q4",
    ...Array.from({ length: overtimeCount }, (_, index) => `OT${index + 1}`),
  ];
  const liveCoachUrl = buildCoachViewUrl(gameId, {
    connectionId: appData.gameSetup.connectionId,
    myTeamId: appData.gameSetup.myTeamId,
    myTeamName: myTeam?.name,
    opponentName: appData.gameSetup.opponent,
    vcSide: appData.gameSetup.vcSide,
    homeTeamColor: normalizeTeamColor(appData.gameSetup.homeTeamColor, DEFAULT_HOME_TEAM_COLOR),
    awayTeamColor: normalizeTeamColor(appData.gameSetup.awayTeamColor, DEFAULT_AWAY_TEAM_COLOR),
  });

  return (
    <div
      className="game-layout"
      style={{
        ["--team-home-color" as string]: homeTeamColor,
        ["--team-away-color" as string]: awayTeamColor,
      }}
    >
      {showTutorial && <TutorialOverlay onDismiss={() => setShowTutorial(false)} />}
      <button className="help-fab" onClick={() => setShowTutorial(true)} title="Help &amp; Tutorial">?</button>
      {renderInlineNotice()}
      {renderAlertBanner()}
      {renderConfirmDialog()}
      {renderModal()}
      {showGameSummary && (
        <div className="modal-overlay" onClick={() => { setShowGameSummary(false); setSummaryTab("teams"); setSummaryPlayerAiInsights(null); }}>
          <div className="modal summary-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header summary-header">
              <div className="summary-header-main">
                <span className="modal-title">Game Summary</span>
                {/* Scoreboard strip: editable quarter + clock + live scores */}
                <div className="summary-top-strip">
                  <div className="summary-top-item">
                    <span className="summary-top-label">Qtr</span>
                    <select
                      className="summary-top-value"
                      value={period}
                      onChange={e => { void changePeriod(e.target.value); }}
                      style={{ background: "transparent", color: "inherit", border: "none", fontWeight: 800, fontSize: "0.9rem", cursor: "pointer" }}
                    >
                      {periodLabels.map(lbl => (
                        <option key={lbl} value={lbl} disabled={getPeriodOrder(lbl) > getPeriodOrder(period) + 1} style={{ background: "#302f68" }}>{lbl}</option>
                      ))}
                    </select>
                  </div>
                  <div className="summary-top-item">
                    <span className="summary-top-label">Clock</span>
                    <button
                      className="summary-top-clock-input summary-top-clock clock-inp-display"
                      onClick={() => { setSummaryClockPadDigits(""); setSummaryClockPadOpen(v => !v); }}>
                      {summaryClockPadOpen ? formatClockFromPadInput(summaryClockPadDigits) : clockInput}
                    </button>
                    {summaryClockPadOpen && (
                      <div className="clock-numpad-overlay" onClick={() => setSummaryClockPadOpen(false)}>
                        <div className="clock-numpad" onClick={e => e.stopPropagation()}>
                          <div className="clock-numpad-preview">{formatClockFromPadInput(summaryClockPadDigits)}</div>
                          <div className="clock-numpad-grid">
                            {([1,2,3,4,5,6,7,8,9,".",0,"DEL"] as (number|string)[]).map((k, i) => (
                              <button
                                key={i}
                                className="clock-numpad-key"
                                onClick={() => {
                                  if (k === "DEL") {
                                    setSummaryClockPadDigits(d => d.slice(0, -1));
                                  } else if (k === ".") {
                                    setSummaryClockPadDigits(d => d.includes(".") ? d : d + ".");
                                  } else {
                                    setSummaryClockPadDigits(d => {
                                      const dotIdx = d.indexOf(".");
                                      if (dotIdx !== -1) { return d.length > dotIdx + 1 ? d : d + String(k); }
                                      return (d + String(k)).slice(0, 4);
                                    });
                                  }
                                }}>
                                {k}
                              </button>
                            ))}
                          </div>
                          <div className="clock-numpad-actions">
                            <button className="clock-numpad-cancel" onClick={() => setSummaryClockPadOpen(false)}>Cancel</button>
                            <button className="clock-numpad-set" onClick={() => {
                              setClockInput(formatClockFromPadInput(summaryClockPadDigits));
                              setSummaryClockPadOpen(false);
                            }}>Set</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="summary-top-item">
                    <span className="summary-top-label">Moment</span>
                    <select
                      className="summary-top-value"
                      value={gameMoment}
                      onChange={e => setGameMoment(e.target.value)}
                      style={{ background: "transparent", color: "inherit", border: "none", fontWeight: 800, fontSize: "0.9rem", cursor: "pointer" }}
                    >
                      <option value="" style={{ background: "#302f68" }}>-</option>
                      {getGameMomentOptions().map(opt => (
                        <option key={opt.value} value={opt.value} style={{ background: "#302f68" }}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="summary-top-item">
                    <span className="summary-top-label">Score</span>
                    <div className="summary-top-dual">
                      <span className="summary-top-dual-row">{vcSideSetup === "home" ? homeTeamAbbr : awayTeamAbbr} {vcSideSetup === "home" ? scores.home : scores.away}</span>
                      <span className="summary-top-dual-row">{vcSideSetup === "home" ? awayTeamAbbr : homeTeamAbbr} {vcSideSetup === "home" ? scores.away : scores.home}</span>
                    </div>
                  </div>
                  <div className="summary-top-item">
                    <span className="summary-top-label">Fouls</span>
                    <div className="summary-top-dual">
                      {vcSideSetup === "home" ? (<>
                        <span className={`summary-top-dual-row${periodTeamFouls.home >= 5 ? " foul-count-danger" : periodTeamFouls.home === 4 ? " foul-count-warn" : ""}`}>{homeTeamAbbr} {periodTeamFouls.home}</span>
                        <span className={`summary-top-dual-row${periodTeamFouls.away >= 5 ? " foul-count-danger" : periodTeamFouls.away === 4 ? " foul-count-warn" : ""}`}>{awayTeamAbbr} {periodTeamFouls.away}</span>
                      </>) : (<>
                        <span className={`summary-top-dual-row${periodTeamFouls.away >= 5 ? " foul-count-danger" : periodTeamFouls.away === 4 ? " foul-count-warn" : ""}`}>{awayTeamAbbr} {periodTeamFouls.away}</span>
                        <span className={`summary-top-dual-row${periodTeamFouls.home >= 5 ? " foul-count-danger" : periodTeamFouls.home === 4 ? " foul-count-warn" : ""}`}>{homeTeamAbbr} {periodTeamFouls.home}</span>
                      </>)}
                    </div>
                  </div>
                  <div className="summary-top-item">
                    <span className="summary-top-label">TO Left</span>
                    <div className="summary-top-dual">
                      <span className="summary-top-dual-row">{vcSideSetup === "home" ? homeTeamAbbr : awayTeamAbbr} {vcSideSetup === "home" ? totalTimeoutsLeft.home : totalTimeoutsLeft.away}</span>
                      <span className="summary-top-dual-row">{vcSideSetup === "home" ? awayTeamAbbr : homeTeamAbbr} {vcSideSetup === "home" ? totalTimeoutsLeft.away : totalTimeoutsLeft.home}</span>
                    </div>
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => { setShowGameSummary(false); setSummaryTab("teams"); setSummaryPlayerAiInsights(null); }}>X</button>
            </div>

            {/* Tab bar */}
            <div className="summary-tab-bar">
              <button
                className={`summary-tab-btn${summaryTab === "teams" ? " active" : ""}`}
                onClick={() => setSummaryTab("teams")}
              >Teams</button>
              <button
                className={`summary-tab-btn${summaryTab === "players" ? " active" : ""}`}
                onClick={() => {
                  setSummaryTab("players");
                  if (!summaryPlayerAiInsights && !summaryPlayerAiLoading) {
                    void fetchPlayerAiInsights();
                  }
                }}
              >Players{foulAlerts.length > 0 ? ` ! ${foulAlerts.length}` : ""}</button>
            </div>

            <div className="summary-body">
              {/* Teams tab */}
              {summaryTab === "teams" && (<>
                <div className="summary-stats-grid">
                  {(() => {
                    const myStats = vcSideSetup === "home" ? homeTeamStats : awayTeamStats;
                    const myName = vcSideSetup === "home" ? homeTeamName : awayTeamName;
                    const oppStats = vcSideSetup === "home" ? awayTeamStats : homeTeamStats;
                    const oppName = vcSideSetup === "home" ? awayTeamName : homeTeamName;
                    const renderCard = (name: string, stats: typeof homeTeamStats) => (
                      <div className="summary-stat-card">
                        <h3>{name}</h3>
                        <div className="summary-stat-row"><span>FG</span><strong>{stats.fg}-{stats.fga} ({formatPct(stats.fg, stats.fga)})</strong></div>
                        <div className="summary-stat-row"><span>3PT</span><strong>{stats.fg3}-{stats.fg3a}</strong></div>
                        <div className="summary-stat-row"><span>FT</span><strong>{stats.ft}-{stats.fta}</strong></div>
                        <div className="summary-stat-row"><span>REB</span><strong>{stats.reb}</strong></div>
                        <div className="summary-stat-row"><span>AST / TO</span><strong>{stats.asst} / {stats.to}</strong></div>
                        <div className="summary-stat-row"><span>STL / BLK</span><strong>{stats.stl} / {stats.blk}</strong></div>
                      </div>
                    );
                    return <>{renderCard(myName, myStats)}{renderCard(oppName, oppStats)}</>;
                  })()}
                </div>

                <div className="summary-highlights">
                  <h3>AI Insights</h3>
                  {summaryAiLoading && <p className="summary-ai-status">Generating insights...</p>}
                  <div className="summary-ai-sections">
                    {!summaryAiLoading && activeSummaryInsights.length === 0 && (
                      <p className="summary-ai-status">No insights yet. Capture a few more possessions.</p>
                    )}
                    {activeSummaryInsights.map((insight, index) => (
                      <div key={index} className="insight-section">
                        <p className="insight-text">{insight}</p>
                      </div>
                    ))}
                  </div>
                  {!summaryAiLoading && (
                    <button
                      className="summary-ai-refresh-btn"
                      onClick={() => { setSummaryAiInsights(null); void fetchOpenAiSummaryInsights(); }}
                    >Refresh</button>
                  )}
                </div>
              </>)}

              {/* Players tab */}
              {summaryTab === "players" && (<>
                {/* Period filter pills */}
                <div className="summary-period-filter">
                  <button
                    className={`summary-period-pill${summaryPeriodFilter.length === 0 ? " active" : ""}`}
                    onClick={() => setSummaryPeriodFilter([])}
                  >Full</button>
                  {(["Q1", "Q2", "Q3", "Q4", ...Array.from({ length: overtimeCount }, (_, i) => `OT${i + 1}`)]).map(p => (
                    <button
                      key={p}
                      className={`summary-period-pill${summaryPeriodFilter.includes(p) ? " active" : ""}`}
                      onClick={() => setSummaryPeriodFilter(prev => {
                        if (prev.includes(p)) {
                          const next = prev.filter(x => x !== p);
                          return next;
                        }
                        return [...prev, p];
                      })}
                    >{p}</button>
                  ))}
                </div>
                {trackedPlayers.length === 0 ? (
                  <p className="summary-no-players">No tracked players - add a roster to see individual stats.</p>
                ) : (
                  <div className="summary-player-list">
                    {/* header row */}
                    <div className="summary-player-header">
                      <span className="sph-name">Player</span>
                      <span className="sph-stat">PTS</span>
                      <span className="sph-stat">FG</span>
                      <span className="sph-stat">3P</span>
                      <span className="sph-stat">FT</span>
                      <span className="sph-stat">REB</span>
                      <span className="sph-stat">AST</span>
                      <span className="sph-stat">STL</span>
                      <span className="sph-stat">BLK</span>
                      <span className="sph-stat">TO</span>
                      <span className="sph-stat">FL</span>
                    </div>
                    {[...trackedPlayers]
                      .sort((a, b) => (summaryBoxScoreTotals[b.id]?.points ?? 0) - (summaryBoxScoreTotals[a.id]?.points ?? 0))
                      .map(p => {
                        const t = summaryBoxScoreTotals[p.id];
                        const pts = t?.points ?? 0;
                        const fgm = t?.fgm ?? 0;
                        const fga = t?.fga ?? 0;
                        const tpm = t?.threePm ?? 0;
                        const tpa = t?.threePa ?? 0;
                        const ftm = t?.ftm ?? 0;
                        const fta = t?.fta ?? 0;
                        const reb = (t?.oreb ?? 0) + (t?.dreb ?? 0);
                        const ast = t?.ast ?? 0;
                        const stl = t?.stl ?? 0;
                        const blk = t?.blk ?? 0;
                        const turnovers = t?.to ?? 0;
                        const fouls = t?.fouls ?? 0;
                        const foulColor = fouls >= 5 ? "#ff3b30" : fouls === 4 ? "#ff9500" : fouls === 3 ? "#ffcc00" : fouls > 0 ? "rgba(232,234,240,0.75)" : "rgba(232,234,240,0.35)";
                        const isTopScorer = trackedTopScorer && p.name === trackedTopScorer.name && pts > 0;
                        const hasFoulAlert = fouls >= 4;
                        return (
                          <div
                            key={p.id}
                            className={`summary-player-row${hasFoulAlert ? " foul-alert-row" : ""}${isTopScorer ? " top-scorer-row" : ""}`}
                          >
                            <span className="spr-name">
                              {p.number != null ? <span className="spr-num">#{p.number}</span> : null}
                              {p.name}
                              {isTopScorer && <span className="spr-badge spr-badge-pts">Top</span>}
                              {fouls >= 5 && <span className="spr-badge spr-badge-out">OUT</span>}
                            </span>
                            <span className="spr-stat spr-pts">{pts}</span>
                            <span className="spr-stat">{fgm}-{fga}</span>
                            <span className="spr-stat">{tpm}-{tpa}</span>
                            <span className="spr-stat">{ftm}-{fta}</span>
                            <span className="spr-stat">{reb}</span>
                            <span className="spr-stat">{ast}</span>
                            <span className="spr-stat">{stl}</span>
                            <span className="spr-stat">{blk}</span>
                            <span className={`spr-stat${turnovers >= 3 ? " spr-to-warn" : ""}`}>{turnovers}</span>
                            <span className="spr-stat spr-fouls" style={{ color: foulColor }}>{fouls}</span>
                          </div>
                        );
                      })
                    }
                  </div>
                )}

                {/* Player-focused AI suggestions */}
                <div className="summary-highlights">
                  <h3>Player Suggestions</h3>
                  {summaryPlayerAiLoading && <p className="summary-ai-status">Generating player insights...</p>}
                  {!summaryPlayerAiLoading && trackedPlayers.length === 0 && (
                    <p className="summary-ai-status">Add a roster to get player-specific suggestions.</p>
                  )}
                  <div className="summary-ai-sections">
                    {!summaryPlayerAiLoading && trackedPlayers.length > 0 && (summaryPlayerAiInsights ?? []).length === 0 && (
                      <p className="summary-ai-status">No suggestions yet - capture more possessions or check your connection.</p>
                    )}
                    {(summaryPlayerAiInsights ?? []).map((insight, index) => (
                      <div key={index} className="insight-section">
                        <p className="insight-text">{insight}</p>
                      </div>
                    ))}
                  </div>
                  {!summaryPlayerAiLoading && trackedPlayers.length > 0 && (
                    <button
                      className="summary-ai-refresh-btn"
                      onClick={() => { setSummaryPlayerAiInsights(null); void fetchPlayerAiInsights(); }}
                    >Refresh</button>
                  )}
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}
      {!online && (
        <div className="offline-badge">
          OFFLINE{pendingEvents.length > 0 ? ` | ${pendingEvents.length} unsaved` : ""}
        </div>
      )}
      {pendingEvents.length > 0 && online && (
        <button className="offline-badge pending-badge" onClick={() => void flushQueue()}>
          {pendingEvents.length} pending upload
        </button>
      )}

      {/* LEFT: Scoring */}
      <div className="panel left-panel">
        <div className="shot-grid">
          {(() => {
            // Always render user's team on the left, opponent on the right
            const myColor   = vcSideSetup === "home" ? "teal" : "red";
            const oppColor  = vcSideSetup === "home" ? "red"  : "teal";
            const myName    = vcSideSetup === "home" ? homeTeamName : awayTeamName;
            const oppName   = vcSideSetup === "home" ? awayTeamName : homeTeamName;
            const myTO      = timeoutRemaining[vcSideSetup];
            const oppTO     = timeoutRemaining[opponentSide];
            return (<>
              {trackTimeouts && (
                <>
                  <div className="shot-timeout-title">Timeouts {inOvertimeNow ? "(OT)" : "(Regulation)"}</div>
                  <div className={`shot-timeout-cell shot-timeout-cell-${vcSideSetup}`}>
                    <div className="shot-timeout-counts">30s: {myTO.short} | 60s: {myTO.full}</div>
                    <div className="timeout-btn-row">
                      <button className="timeout-btn timeout-btn-short" disabled={inOvertimeNow || myTO.short <= 0} onClick={() => takeTimeout(vcSideSetup, "short")}>30s</button>
                      <button className="timeout-btn timeout-btn-full"  disabled={myTO.full <= 0}                   onClick={() => takeTimeout(vcSideSetup, "full")}>60s</button>
                    </div>
                  </div>
                  <div className={`shot-timeout-cell shot-timeout-cell-${opponentSide}`}>
                    <div className="shot-timeout-counts">30s: {oppTO.short} | 60s: {oppTO.full}</div>
                    <div className="timeout-btn-row">
                      <button className="timeout-btn timeout-btn-short" disabled={inOvertimeNow || oppTO.short <= 0} onClick={() => takeTimeout(opponentSide, "short")}>30s</button>
                      <button className="timeout-btn timeout-btn-full"  disabled={oppTO.full <= 0}                    onClick={() => takeTimeout(opponentSide, "full")}>60s</button>
                    </div>
                  </div>
                </>
              )}
              <div className={`shot-grid-team-label shot-grid-team-label-${vcSideSetup}`} title={`Buttons for ${myName}`}>{myName}</div>
              <div className={`shot-grid-team-label shot-grid-team-label-${opponentSide}`} title={`Buttons for ${oppName}`}>{oppName}</div>
              <button className={`circle ${myColor}`}  onClick={() => setModal({ kind: "shot", teamId: vcSideSetup,   points: 2, made: true })}>2pt</button>
              {isOpponentStatEnabled("points")       && <button className={`circle ${oppColor}`} onClick={() => setModal({ kind: "shot", teamId: opponentSide,   points: 2, made: true })}>2pt</button>}
              <button className={`circle ${myColor}`}  onClick={() => setModal({ kind: "shot", teamId: vcSideSetup,   points: 3, made: true })}>3pt</button>
              {isOpponentStatEnabled("points")       && <button className={`circle ${oppColor}`} onClick={() => setModal({ kind: "shot", teamId: opponentSide,   points: 3, made: true })}>3pt</button>}
              <button className={`circle ${myColor}`}  onClick={() => setModal({ kind: "freeThrow", teamId: vcSideSetup,   made: true })}>ft</button>
              {isOpponentStatEnabled("free_throws")  && <button className={`circle ${oppColor}`} onClick={() => setModal({ kind: "freeThrow", teamId: opponentSide,   made: true })}>ft</button>}
            </>);
          })()}
        </div>
      </div>

      {/* CENTER: Feed */}
      <div className="panel center-panel">
        <div className="scoreboard">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.4rem" }}>
            {appData.gameSetup.connectionId && (
              <div className="score-device-id" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.4rem" }} title="Operator connection status">
                <span>{`Connection: ${appData.gameSetup.connectionId}`}</span>
                <span className={`connection-indicator ${online ? "online" : "offline"}`} title={online ? "Connected" : "Offline - events queued locally"}>
                  *
                </span>
              </div>
            )}
            <div className={`game-state-banner game-state-${currentGameState.tone}`} style={{ margin: 0 }}>
              {currentGameState.label}
            </div>
          </div>
          {(() => {
            const myScoreRow = (
              <>
                <div className="score-row">
                  <span className={`team-lbl team-${vcSideSetup}-txt`}>{vcSideSetup === "home" ? homeTeamName : awayTeamName}</span>
                  <span className={`score team-${vcSideSetup}-txt`}>{vcSideSetup === "home" ? scores.home : scores.away}</span>
                </div>
                <div className="score-meta-row">
                  <span className={`score-meta${(vcSideSetup === "home" ? periodTeamFouls.home : periodTeamFouls.away) >= 5 ? " foul-count-danger" : (vcSideSetup === "home" ? periodTeamFouls.home : periodTeamFouls.away) === 4 ? " foul-count-warn" : ""}`}>
                    Fouls: {vcSideSetup === "home" ? periodTeamFouls.home : periodTeamFouls.away}
                  </span>
                  {(vcSideSetup === "home" ? homeInBonus : awayInBonus) && <span className="score-chip bonus-chip">BONUS</span>}
                  {possessionTeamId === (vcSideSetup === "home" ? homeTeamId : awayTeamId) && <span className={`score-chip possession-chip possession-chip-${vcSideSetup}`}>POSS</span>}
                </div>
              </>
            );
            const oppSide = vcSideSetup === "home" ? "away" : "home";
            const oppScoreRow = (
              <>
                <div className="score-row">
                  <span className={`team-lbl team-${oppSide}-txt`}>{oppSide === "home" ? homeTeamName : awayTeamName}</span>
                  <span className={`score team-${oppSide}-txt`}>{oppSide === "home" ? scores.home : scores.away}</span>
                </div>
                <div className="score-meta-row">
                  <span className={`score-meta${(oppSide === "home" ? periodTeamFouls.home : periodTeamFouls.away) >= 5 ? " foul-count-danger" : (oppSide === "home" ? periodTeamFouls.home : periodTeamFouls.away) === 4 ? " foul-count-warn" : ""}`}>
                    Fouls: {oppSide === "home" ? periodTeamFouls.home : periodTeamFouls.away}
                  </span>
                  {(oppSide === "home" ? homeInBonus : awayInBonus) && <span className="score-chip bonus-chip">BONUS</span>}
                  {possessionTeamId === (oppSide === "home" ? homeTeamId : awayTeamId) && <span className={`score-chip possession-chip possession-chip-${oppSide}`}>POSS</span>}
                </div>
              </>
            );
            return <>{myScoreRow}{oppScoreRow}</>;
          })()}
        </div>

        {foulAlerts.length > 0 && (
          <div className="foul-alerts">
            {foulAlerts.map(p => (
              <div key={p.id} className={`foul-alert ${(pTotals[p.id]?.fouls ?? 0) >= 5 ? "foul-out-alert" : "foul-warn-alert"}`}>
                {(pTotals[p.id]?.fouls ?? 0) >= 5 ? "OUT" : "WARN"} #{p.number} {p.name} - {(pTotals[p.id]?.fouls ?? 0) >= 5 ? "FOULED OUT" : "4 fouls"}
              </div>
            ))}
          </div>
        )}

        <div className="event-feed-header">
          <span className="event-feed-title">Game Log</span>
          <span className="event-feed-hint">Tap an event to edit or delete it</span>
        </div>

        <div className="event-feed">
          {allEvents.length === 0 && <p className="empty-feed">No events yet</p>}
          {allEvents.map(({ event, pending }) => {
            const d = describeEvent(event, homeTeamName, awayTeamName, allPlayers, pTotals, homeTeamId, awayTeamId);
            const eventStamp = `${event.period} ${formatClockFromSeconds(event.clockSecondsRemaining)}`;
            const sectionLabel = getEventSectionLabel(event);
            const teamBucket = getEventTeamBucket(event, homeTeamId, awayTeamId);
            const teamColor = teamBucket === "home" ? homeTeamColor : teamBucket === "away" ? awayTeamColor : undefined;
            const isLast = allEvents[allEvents.length - 1]?.event.id === event.id;
            return (
              <div
                key={event.id}
                className="feed-item-wrapper"
              >
                <button
                  type="button"
                  className={`feed-item feed-item-${teamBucket}${pending ? " feed-pending" : ""}`}
                  style={teamColor ? ({ ["--feed-team-color" as string]: teamColor }) : undefined}
                  onClick={() => openFeedEventEditor({ event, pending })}
                >
                  <span className="feed-stamp">{eventStamp}</span>
                  <span className="feed-main-row">
                    <span className="feed-section-tag">{sectionLabel}</span>
                    <span className={`feed-main ac-${d.accent}`}>{d.main}</span>
                    <span className="feed-item-action">Edit</span>
                  </span>
                  {d.detail && <span className="feed-detail">{d.detail}</span>}
                </button>
                {isLast && (
                  <button
                    className="feed-undo-btn"
                    title="Undo: Quick delete this event"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteEventRecord({ event, pending });
                    }}
                  >
                    Undo
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="period-row">
          {periodLabels.map((lbl) => {
            const isOt = isOvertimePeriod(lbl);
            const isSkip = getPeriodOrder(lbl) > getPeriodOrder(period) + 1;
            return (
              <div key={lbl} className="period-chip">
                <button
                  className={`period-btn${period === lbl ? " period-on" : ""}${isSkip ? " period-btn-skip" : ""}`}
                  disabled={isSkip}
                  onClick={() => { void changePeriod(lbl); }}
                >{lbl}</button>
                {isOt && (
                  <button
                    className="period-delete-btn"
                    title={`Delete ${lbl}`}
                    onClick={async () => {
                      const ok = await requestConfirm({
                        title: `Delete ${lbl}?`,
                        message: "This removes all events in that overtime period.",
                        confirmLabel: `Delete ${lbl}`,
                        tone: "danger",
                      });
                      if (!ok) return;
                      void deleteOvertimePeriod(lbl);
                    }}
                  >
                    x
                  </button>
                )}
              </div>
            );
          })}
          <button
            className="period-add-btn"
            onClick={addOvertimePeriod}
          >
            + OT
          </button>
        </div>
        {trackClock && <div className="clock-row">
          <div className="clock-tools-row clock-tools-row-compact">
            <button
              className={`clock-tool-btn clock-btn-visibility${(appData.gameSetup.clockVisible ?? true) ? " active" : ""}`}
              onClick={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, clockVisible: !(appData.gameSetup.clockVisible ?? true) } })}>
              {(appData.gameSetup.clockVisible ?? true) ? "Hide Clock" : "Show Clock"}
            </button>
            <button
              className={`clock-tool-btn clock-btn-enabled${(appData.gameSetup.clockEnabled ?? true) ? " active" : ""}`}
              onClick={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, clockEnabled: !(appData.gameSetup.clockEnabled ?? true) } })}>
              {(appData.gameSetup.clockEnabled ?? true) ? "Disable Clock" : "Enable Clock"}
            </button>
          </div>
          {(appData.gameSetup.clockVisible ?? true) && (
            <>
              <button
                className={`clock-inp clock-inp-display${appData.gameSetup.clockEnabled === false ? " clock-inp-disabled" : ""}`}
                disabled={appData.gameSetup.clockEnabled === false}
                onClick={() => {
                  if (appData.gameSetup.clockEnabled === false) return;
                  setClockPadDigits("");
                  setClockPadOpen(v => !v);
                }}>
                {clockPadOpen ? formatClockFromPadInput(clockPadDigits) : clockInput}
              </button>
              {clockPadOpen && (
                <div className="clock-numpad-overlay" onClick={() => setClockPadOpen(false)}>
                  <div className="clock-numpad" onClick={e => e.stopPropagation()}>
                    <div className="clock-numpad-preview">{formatClockFromPadInput(clockPadDigits)}</div>
                    <div className="clock-numpad-grid">
                      {([1,2,3,4,5,6,7,8,9,".",0,"DEL"] as (number|string)[]).map((k, i) => (
                        <button
                          key={i}
                          className="clock-numpad-key"
                          onClick={() => {
                            if (k === "DEL") {
                              setClockPadDigits(d => d.slice(0, -1));
                            } else if (k === ".") {
                              // only allow one dot, only when no minutes typed (sub-minute)
                              setClockPadDigits(d => {
                                if (d.includes(".")) return d;
                                return d + ".";
                              });
                            } else {
                              setClockPadDigits(d => {
                                const dotIdx = d.indexOf(".");
                                if (dotIdx !== -1) {
                                  // after dot: only 1 tenths digit allowed
                                  if (d.length > dotIdx + 1) return d;
                                  return d + String(k);
                                }
                                // before dot: max 4 digits (MMSS)
                                return (d + String(k)).slice(0, 4);
                              });
                            }
                          }}>
                          {k}
                        </button>
                      ))}
                    </div>
                    <div className="clock-numpad-actions">
                      <button className="clock-numpad-cancel" onClick={() => setClockPadOpen(false)}>Cancel</button>
                      <button className="clock-numpad-set" onClick={() => {
                        const formatted = formatClockFromPadInput(clockPadDigits);
                        setClockInput(formatted);
                        setClockPadOpen(false);
                      }}>Set</button>
                    </div>
                  </div>
                </div>
              )}
              <div className="clock-tools-row clock-tools-row-main">
                <button className={`clock-tool-btn ${clockRunning ? "clock-btn-stop" : "clock-btn-start"}`} onClick={() => setClockRunning((v) => !v)} disabled={appData.gameSetup.clockEnabled === false}>
                  {clockRunning ? "Stop" : "Start"}
                </button>
                <button className="clock-tool-btn clock-btn-reset" onClick={resetClockForPeriod} disabled={appData.gameSetup.clockEnabled === false}>Reset</button>
                <button className="clock-tool-btn clock-btn-minus" onClick={() => adjustClock(-1)} disabled={appData.gameSetup.clockEnabled === false}>-1s</button>
                <button className="clock-tool-btn clock-btn-plus" onClick={() => adjustClock(1)} disabled={appData.gameSetup.clockEnabled === false}>+1s</button>
              </div>
            </>
          )}
          {trackPossession && <div className="possession-row">
            <button
              className={`possession-btn possession-btn-home ${possessionTeamId === homeTeamId ? "active" : ""}`}
              onClick={() => setPossession("home")}
              title={`Set possession: ${homeTeamName}`}>
              Home: {homeTeamName}
            </button>
            <button
              className={`possession-btn possession-btn-away ${possessionTeamId === awayTeamId ? "active" : ""}`}
              onClick={() => setPossession("away")}
              title={`Set possession: ${awayTeamName}`}>
              Away: {awayTeamName}
            </button>
          </div>}
        </div>}
      </div>

      {/* RIGHT: Stats */}
      <div className="panel right-panel">
        <div style={{ marginBottom: "0.5rem", display: "flex", gap: "0.3rem", justifyContent: "center" }}>
          <button
            className={showRosterPanel ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setShowRosterPanel(!showRosterPanel)}
            title="Toggle roster view">
            Roster
          </button>
        </div>
        {!showRosterPanel ? (
          <div className="stat-grid">
            <button className="circle white rebound-btn" onClick={() => setModal({ kind: "stat", stat: "def_reb", teamId: vcSideSetup })}><span className="rebound-main">DEF</span><br/><span className="sub-lbl">reb</span></button>
            <button className="circle white rebound-btn" onClick={() => setModal({ kind: "stat", stat: "off_reb", teamId: vcSideSetup })}><span className="rebound-main">OFF</span><br/><span className="sub-lbl">reb</span></button>
            <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "turnover", teamId: vcSideSetup })}>to</button>
            <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "steal",   teamId: vcSideSetup })}>stl</button>
            <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "assist",  teamId: vcSideSetup })}>asst</button>
            <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "block",   teamId: vcSideSetup })}>blk</button>
            <button className="circle red-out" onClick={() => setModal({ kind: "sub1", teamId: vcSideSetup })}>sub</button>
            <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "foul",   teamId: vcSideSetup })}>foul</button>
          </div>
        ) : (
          <div className="roster-panel">
            {(() => {
              const teamPlayers = vcSideSetup === "home" ? homePlayers : awayPlayers;
              const lineup = computeCurrentLineup(allEventObjs, vcTeamId, appData.gameSetup.startingLineup ?? [], teamPlayers);
              return (
                <>
                  <div className="roster-section">
                    <h4 className="roster-section-title">On Court</h4>
                    <div className="roster-list">
                      {lineup.onCourt.map(p => (
                        <div key={p.id} className="roster-player on-court">
                          <span className="roster-player-num">#{p.number}</span>
                          <span className="roster-player-info">
                            <span className="roster-player-name">{p.name}</span>
                            {pTotals[p.id] && (
                              <span className="roster-player-stats">{pTotals[p.id].points}pts</span>
                            )}
                          </span>
                          <button
                            className="roster-sub-btn"
                            onClick={() => setModal({ kind: "sub1", teamId: vcSideSetup, playerOutId: p.id })}
                            title="Sub out">
                            X
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="roster-section">
                    <h4 className="roster-section-title">Bench</h4>
                    <div className="roster-list">
                      {lineup.bench.map(p => (
                        <div key={p.id} className="roster-player bench">
                          <span className="roster-player-num">#{p.number}</span>
                          <span className="roster-player-info">
                            <span className="roster-player-name">{p.name}</span>
                            {pTotals[p.id] && (
                              <span className="roster-player-stats">{pTotals[p.id].points}pts</span>
                            )}
                          </span>
                          <button
                            className="roster-sub-btn"
                            onClick={() => {
                              if (lineup.onCourt.length > 0) {
                                setModal({ kind: "sub1", teamId: vcSideSetup });
                              }
                            }}
                            title="Sub in">
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      <div className="live-bottom-nav" role="navigation" aria-label="Live game actions">
        <button className="live-nav-btn" onClick={() => navigateView("settings")} title="Settings">Menu Settings</button>
        <button className="live-nav-btn" onClick={() => void undoLast()} title="Undo last event">Undo</button>
        <button
          className="live-nav-btn"
          title="Game summary"
          onClick={() => {
            setShowGameSummary(true);
            setSummaryTab("teams");
            setSummaryAiInsights(null);
            setSummaryPlayerAiInsights(null);
            void fetchOpenAiSummaryInsights();
          }}>
          Summary
        </button>
        <a className="live-nav-btn live-nav-link" href={liveCoachUrl} target="_blank" rel="noreferrer" title={`Open Dashboard | ${gameId}`}>
          Dashboard
        </a>
        <button className="live-nav-btn live-nav-btn-end" onClick={() => void endGame()}>
          End Game
        </button>
      </div>
    </div>
  );
}

// ================================================================
//  SETTINGS SCREEN  (extracted component to keep App readable)
// ================================================================
interface SettingsScreenProps {
  appData: AppData;
  settingsView: SettingsView;
  onPersist: (d: AppData) => void;
  onNav: (v: SettingsView) => void;
  onBack: () => void;
  onStartGame: () => void | Promise<void>;
}

const POSITIONS = ["PG", "SG", "SF", "PF", "C", ""];

function SettingsScreen({ appData, settingsView, onPersist, onNav, onBack, onStartGame }: SettingsScreenProps) {
  // ---- Game setup local state ----
  const [gsGameId, setGsGameId] = useState(appData.gameSetup.gameId);
  const [gsConnectionId, setGsConnectionId] = useState(normalizeConnectionId(appData.gameSetup.connectionId));
  const [gsMyTeamId, setGsMyTeamId] = useState(appData.gameSetup.myTeamId);
  const [gsApiUrl, setGsApiUrl] = useState(appData.gameSetup.apiUrl ?? DEFAULT_API);
  const [gsApiKey, setGsApiKey] = useState(appData.gameSetup.apiKey ?? "");
  const [gsOpponent, setGsOpponent] = useState(appData.gameSetup.opponent ?? "");
  const [gsVcSide, setGsVcSide] = useState<"home" | "away">(appData.gameSetup.vcSide ?? "home");
  const [gsDashboardUrl, setGsDashboardUrl] = useState(appData.gameSetup.dashboardUrl ?? "http://localhost:4000");
  const [gsClockVisible, setGsClockVisible] = useState(appData.gameSetup.clockVisible ?? true);
  const [gsClockEnabled, setGsClockEnabled] = useState(appData.gameSetup.clockEnabled ?? true);
  const [gsTrackClock, setGsTrackClock] = useState(appData.gameSetup.trackClock ?? true);
  const [gsTrackPossession, setGsTrackPossession] = useState(appData.gameSetup.trackPossession ?? true);
  const [gsTrackTimeouts, setGsTrackTimeouts] = useState(appData.gameSetup.trackTimeouts ?? true);
  const [gsOpponentTrackStats, setGsOpponentTrackStats] = useState<OpponentTrackStat[]>(
    normalizeOpponentTrackStats(appData.gameSetup.opponentTrackStats)
  );
  const [gsHomeTeamColor, setGsHomeTeamColor] = useState(normalizeTeamColor(appData.gameSetup.homeTeamColor, DEFAULT_HOME_TEAM_COLOR));
  const [gsAwayTeamColor, setGsAwayTeamColor] = useState(normalizeTeamColor(appData.gameSetup.awayTeamColor, DEFAULT_AWAY_TEAM_COLOR));
  const gsMyTeam = appData.teams.find(t => t.id === gsMyTeamId);

  const gsMyTeamName = gsMyTeam?.name ?? "Your Team";
  const gsOpponentName = gsOpponent.trim() || "Opponent";
  const gsHomeSideLabel = gsVcSide === "home"
    ? `${gsMyTeamName} (home)`
    : `${gsOpponentName} (home)`;
  const gsAwaySideLabel = gsVcSide === "away"
    ? `${gsMyTeamName} (away)`
    : `${gsOpponentName} (away)`;

  function applyTrackedTeamColor(
    gameSetup: GameSetup,
    teams: Team[],
    myTeamId: string
  ): GameSetup {
    const selectedTeam = teams.find((team) => team.id === myTeamId);
    if (!selectedTeam?.teamColor) {
      return { ...gameSetup, myTeamId };
    }

    const normalizedColor = normalizeTeamColor(selectedTeam.teamColor, DEFAULT_HOME_TEAM_COLOR);
    return gameSetup.vcSide === "home"
      ? { ...gameSetup, myTeamId, homeTeamColor: normalizedColor }
      : { ...gameSetup, myTeamId, awayTeamColor: normalizedColor };
  }

  function toggleOpponentTrackStat(stat: OpponentTrackStat) {
    setGsOpponentTrackStats((current) => {
      if (current.includes(stat)) {
        const next = current.filter((item) => item !== stat);
        return next.length > 0 ? next : current;
      }
      return [...current, stat];
    });
  }

  function saveGameSetup() {
    const normalizedConnectionId = normalizeConnectionId(gsConnectionId || appData.gameSetup.connectionId);
    setGsConnectionId(normalizedConnectionId);
    onPersist({
      ...appData,
      gameSetup: applyTrackedTeamColor(
        {
          gameId: gsGameId.trim() || "game-1",
          connectionId: normalizedConnectionId || undefined,
          myTeamId: gsMyTeamId,
          apiUrl: gsApiUrl.trim() || DEFAULT_API,
          apiKey: gsApiKey.trim() || undefined,
          schoolId: appData.gameSetup.schoolId,
          opponent: gsOpponent.trim(),
          vcSide: gsVcSide,
          dashboardUrl: gsDashboardUrl.trim() || "http://localhost:4000",
          clockVisible: gsClockVisible,
          clockEnabled: gsClockEnabled,
          trackClock: gsTrackClock,
          trackPossession: gsTrackPossession,
          trackTimeouts: gsTrackTimeouts,
          opponentTrackStats: normalizeOpponentTrackStats(gsOpponentTrackStats),
          homeTeamColor: normalizeTeamColor(gsHomeTeamColor, DEFAULT_HOME_TEAM_COLOR),
          awayTeamColor: normalizeTeamColor(gsAwayTeamColor, DEFAULT_AWAY_TEAM_COLOR),
          statsGameId: appData.gameSetup.statsGameId,
          startingLineup: appData.gameSetup.startingLineup,
        },
        appData.teams,
        gsMyTeamId,
      ),
    });
  }

  // ================================================================
  //  RENDER: Game setup
  // ================================================================
  if (settingsView === "game-setup") {
    const setupErrors: string[] = [];
    if (!gsMyTeamId) setupErrors.push("Select your team");
    if (!gsOpponent.trim()) setupErrors.push("Enter the opponent name");
    const trackingBadges = [
      gsTrackClock ? "Clock" : null,
      gsTrackPossession ? "Possession" : null,
      gsTrackTimeouts ? "Timeouts" : null,
    ].filter(Boolean);

    return (
      <div className="settings-page">
        <header className="settings-header">
          <button className="back-btn" onClick={() => onNav("menu")}>{"<- Back"}</button>
          <h2>Game Setup</h2>
          <button className="save-btn" onClick={() => { saveGameSetup(); onNav("menu"); }}>Save</button>
        </header>

        <section className="settings-section settings-hero-section">
          <div className="settings-overview">
            <div className="settings-overview-copy">
              <h3>Current setup</h3>
              <div className="settings-overview-title">{gsMyTeamName} vs {gsOpponentName}</div>
              <p className="dim-text">
                {gsVcSide === "home" ? "VC is home" : "VC is away"} • Game ID {gsGameId.trim() || "game-1"}
              </p>
            </div>
            <div className="settings-overview-meta">
              <span className="settings-badge">{gsConnectionId ? `Linked • ${gsConnectionId}` : "Not linked yet"}</span>
              <span className="settings-badge">{trackingBadges.length > 0 ? trackingBadges.join(" • ") : "Manual stats only"}</span>
            </div>
          </div>
        </section>

        <div className="settings-grid-2">
          <section className="settings-section">
            <h3>Game ID</h3>
            <input value={gsGameId} onChange={e => setGsGameId(e.target.value)} placeholder="game-1" />
          </section>

          <section className="settings-section">
            <h3>Connection Code</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>Paste the coach's 6-digit code to link roster and matchup sync.</p>
            <input value={gsConnectionId} onChange={e => setGsConnectionId(normalizeConnectionId(e.target.value))} placeholder="482913" />
          </section>
        </div>

        <section className="settings-section">
          <h3>Your Team</h3>
          {appData.teams.length === 0 && <p className="dim-text">No teams are available yet. Complete team setup from the coach workspace.</p>}
          <div className="team-picker">
            {appData.teams.map(t => {
              const isSelected = gsMyTeamId === t.id;
              const displayColor = t.teamColor ?? DEFAULT_HOME_TEAM_COLOR;
              const normalizedColor = normalizeTeamColor(displayColor, DEFAULT_HOME_TEAM_COLOR);
              return (
                <button key={t.id}
                  className="team-pick-btn"
                  style={isSelected ? {
                    background: `color-mix(in srgb, ${normalizedColor} 12%, rgba(255,255,255,0.04))`,
                    borderColor: normalizedColor,
                  } : undefined}
                  onClick={() => {
                    setGsMyTeamId(t.id);
                    if (t.teamColor) {
                      const nextColor = normalizeTeamColor(t.teamColor, DEFAULT_HOME_TEAM_COLOR);
                      if (gsVcSide === "home") {
                        setGsHomeTeamColor(nextColor);
                      } else {
                        setGsAwayTeamColor(nextColor);
                      }
                    }
                  }}>
                  <span className="tp-abbr" style={{ borderColor: normalizedColor, color: normalizedColor }}>{t.abbreviation}</span>
                  <span className="tp-name">{t.name}</span>
                  <span className="tp-count">{t.players.length}p</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="settings-grid-2">
          <section className="settings-section">
            <h3>Opponent Name</h3>
            <input
              placeholder="e.g. Knappa"
              value={gsOpponent}
              onChange={e => setGsOpponent(e.target.value)}
            />
          </section>

          <section className="settings-section">
            <h3>Your Side</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>Are you playing home or away?</p>
            <div className="team-toggle">
              <button className={`tt-btn${gsVcSide === "home" ? " tt-teal" : ""}`} onClick={() => setGsVcSide("home")}>{gsHomeSideLabel}</button>
              <button className={`tt-btn${gsVcSide === "away" ? " tt-red" : ""}`}  onClick={() => setGsVcSide("away")}>{gsAwaySideLabel}</button>
            </div>
          </section>
        </div>

        <section className="settings-section">
          <h3>Opponent Color</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>Pick the opponent's jersey color to make scorekeeping faster.</p>
          <div className="team-color-rows">
            <div className="team-color-row">
              <span className="team-color-label">{gsVcSide === "home" ? gsAwaySideLabel : gsHomeSideLabel}</span>
              <div className="team-color-swatches">
                {TEAM_COLOR_OPTIONS.map((color) => {
                  const currentColor = gsVcSide === "home" ? gsAwayTeamColor : gsHomeTeamColor;
                  return (
                    <button
                      key={`opp-${color}`}
                      type="button"
                      className={`team-color-swatch${currentColor === color ? " selected" : ""}`}
                      style={{ background: color }}
                      onClick={() => gsVcSide === "home" ? setGsAwayTeamColor(color) : setGsHomeTeamColor(color)}
                      title={`Opponent color ${color}`}
                    />
                  );
                })}
              </div>
              {gsVcSide === "home"
                ? <input className="team-color-input" type="color" aria-label="Custom opponent color" value={gsAwayTeamColor} onChange={e => setGsAwayTeamColor(normalizeTeamColor(e.target.value, DEFAULT_AWAY_TEAM_COLOR))} />
                : <input className="team-color-input" type="color" aria-label="Custom opponent color" value={gsHomeTeamColor} onChange={e => setGsHomeTeamColor(normalizeTeamColor(e.target.value, DEFAULT_HOME_TEAM_COLOR))} />
              }
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Opponent Stats To Track</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>Choose which opponent stats can be recorded.</p>
          <div className="team-toggle">
            <button className={`tt-btn${gsOpponentTrackStats.includes("points") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("points")}>Points</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("free_throws") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("free_throws")}>Free Throws</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("def_reb") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("def_reb")}>Def Reb</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("off_reb") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("off_reb")}>Off Reb</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("turnover") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("turnover")}>Turnover</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("steal") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("steal")}>Steal</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("assist") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("assist")}>Assist</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("block") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("block")}>Block</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("foul") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("foul")}>Foul</button>
          </div>
        </section>

        <div className="settings-grid-2">
          <section className="settings-section">
            <h3>Tracking Toggles</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>Choose what the operator tracks during the game.</p>
            <div className="team-toggle">
              <button className={`tt-btn${gsTrackTimeouts ? " tt-teal" : ""}`} onClick={() => setGsTrackTimeouts(!gsTrackTimeouts)}>
                Timeouts {gsTrackTimeouts ? "On" : "Off"}
              </button>
              <button className={`tt-btn${gsTrackPossession ? " tt-teal" : ""}`} onClick={() => setGsTrackPossession(!gsTrackPossession)}>
                Possession {gsTrackPossession ? "On" : "Off"}
              </button>
              <button className={`tt-btn${gsTrackClock ? " tt-teal" : ""}`} onClick={() => setGsTrackClock(!gsTrackClock)}>
                Game Clock {gsTrackClock ? "Tracked" : "Off"}
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>Clock Panel</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>These only affect the operator screen controls when game clock tracking is on.</p>
            <div className="team-toggle">
              <button className={`tt-btn${gsClockVisible ? " tt-teal" : ""}`} onClick={() => setGsClockVisible(!gsClockVisible)}>{gsClockVisible ? "Panel Visible" : "Panel Hidden"}</button>
              <button className={`tt-btn${gsClockEnabled ? " tt-teal" : ""}`} onClick={() => setGsClockEnabled(!gsClockEnabled)}>{gsClockEnabled ? "Controls Unlocked" : "Controls Locked"}</button>
            </div>
          </section>
        </div>

        <div className="settings-grid-2">
          <section className="settings-section">
            <h3>Realtime API URL</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>Use the laptop's local IP on game day (example: http://192.168.1.5:4000).</p>
            <input
              placeholder={DEFAULT_API}
              value={gsApiUrl}
              onChange={e => setGsApiUrl(e.target.value)}
            />
          </section>

          <section className="settings-section">
            <h3>Legacy Stats Export URL</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>Optional separate post-game export endpoint. If you only use the coach dashboard, leave this on the same host as the Realtime API.</p>
            <input
              placeholder="http://localhost:4000"
              value={gsDashboardUrl}
              onChange={e => setGsDashboardUrl(e.target.value)}
            />
          </section>
        </div>

        <section className="settings-section">
          <h3>API Key</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>Optional shared secret. Leave blank during local development.</p>
          <input
            type="password"
            placeholder="Leave blank to disable auth"
            value={gsApiKey}
            onChange={e => setGsApiKey(e.target.value)}
          />
        </section>

        <section className="settings-section">
          {setupErrors.length > 0 && (
            <ul className="setup-errors">
              {setupErrors.map(err => <li key={err}>{err}</li>)}
            </ul>
          )}
          <div className="settings-actions">
            <button
              className="save-btn"
              disabled={setupErrors.length > 0}
              onClick={() => { if (setupErrors.length === 0) { saveGameSetup(); onNav("menu"); } }}>
              Save Game Setup
            </button>
          </div>
        </section>

      </div>
    );
  }

  // ================================================================
  //  RENDER: Settings menu (default)
  // ================================================================
  const myTeamForMenu = appData.teams.find(t => t.id === appData.gameSetup.myTeamId);
  const vcSideForMenu = appData.gameSetup.vcSide ?? "home";
  const menuSideLabel = vcSideForMenu === "home" ? "home" : "away";

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button className="back-btn" onClick={onBack}>{"<- Game"}</button>
        <h2>Settings</h2>
        <div style={{ width: 64 }} />
      </header>

      <section className="settings-section">
        <h3>Game</h3>
        <div className="menu-card" onClick={() => onNav("game-setup")}>
          <div className="menu-card-info">
            <span className="menu-card-title">Game Setup</span>
            <span className="menu-card-sub">
              {myTeamForMenu
                ? `${myTeamForMenu.name} (${menuSideLabel}) vs ${appData.gameSetup.opponent || "TBD"} | ${appData.gameSetup.gameId}`
                : "No team selected"}
            </span>
          </div>
          <span className="menu-chev">&gt;</span>
        </div>
      </section>

      <section className="settings-section">
        <h3>Device Setup</h3>
        <div className="menu-card" onClick={() => onNav("ipad-tips")}>
          <div className="menu-card-info">
            <span className="menu-card-title">iPad Setup Tips</span>
            <span className="menu-card-sub">Home screen, auto-lock, DND, rotation lock &amp; more</span>
          </div>
          <span className="menu-chev">&gt;</span>
        </div>
      </section>

      <section className="settings-section">
        <h3 style={{color:'#f87171'}}>Danger Zone</h3>
        <div
          className="menu-card"
          style={{border:'1px solid #7f1d1d'}}
          onClick={() => {
            if (!confirm('Clear all local data on this device? Game events, roster, and settings saved here will be erased.')) return;
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k) keysToRemove.push(k);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            window.location.reload();
          }}
        >
          <div className="menu-card-info">
            <span className="menu-card-title" style={{color:'#f87171'}}>Clear Local Data</span>
            <span className="menu-card-sub">Erase all data stored on this device</span>
          </div>
          <span className="menu-chev">&gt;</span>
        </div>
      </section>
    </div>
  );
}
