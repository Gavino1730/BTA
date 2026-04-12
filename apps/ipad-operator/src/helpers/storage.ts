import { normalizeTeamColor } from "@bta/shared-schema";
import { APP_DATA_KEY, DEFAULT_API, DEFAULT_AWAY_TEAM_COLOR, DEFAULT_HOME_TEAM_COLOR, DEFAULT_SCHOOL_ID, DEVICE_NAME_KEY, OPERATOR_ID_KEY, STORE } from "../constants.js";
import type { AppData, GameSetup, OpponentTrackStat, SoundProfile } from "../types.js";
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
    soundEnabled: true,
    soundProfile: "click",
    soundVolume: 70,
    hapticsEnabled: true,
  },
};

export { DEFAULT_DATA };

function normalizeSoundProfile(value: string | null | undefined): SoundProfile {
  if (value === "soft" || value === "sharp" || value === "click") {
    return value;
  }
  return "click";
}

function normalizeSoundVolume(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 70;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

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
  if (qp.get("sound") === "1" || qp.get("sound") === "0") urlSetup.soundEnabled = qp.get("sound") === "1";
  if (qp.get("haptics") === "1" || qp.get("haptics") === "0") urlSetup.hapticsEnabled = qp.get("haptics") === "1";
  if (qp.get("soundProfile")) urlSetup.soundProfile = normalizeSoundProfile(qp.get("soundProfile"));
  if (qp.get("soundVolume")) urlSetup.soundVolume = normalizeSoundVolume(qp.get("soundVolume"));
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
      gs.soundEnabled = gs.soundEnabled ?? true;
      gs.soundProfile = normalizeSoundProfile(gs.soundProfile);
      gs.soundVolume = normalizeSoundVolume(gs.soundVolume);
      gs.hapticsEnabled = gs.hapticsEnabled ?? true;
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
const PENDING_QUEUE_VERSION = 2;

interface PendingQueueEnvelope {
  version: number;
  checksum: number;
  events: GameEvent[];
}

interface PendingQueueIntegrityIssue {
  reason: "invalid_json" | "invalid_shape" | "checksum_mismatch";
  detectedAtIso: string;
}

export interface PendingConflictRecord {
  localEvent: GameEvent;
  remoteEvent: GameEvent;
  detectedAtIso: string;
  reason: "payload_mismatch";
}

export function pendingKey(gid: string) { return `${STORE}:${gid}:pending`; }
export function pendingBackupKey(gid: string) { return `${STORE}:${gid}:pending:backup`; }
export function pendingConflictKey(gid: string) { return `${STORE}:${gid}:pending:conflicts`; }
function pendingIntegrityIssueKey(gid: string) { return `${STORE}:${gid}:pending:integrity-issue`; }
export function seqKey(gid: string) { return `${STORE}:${gid}:seq`; }

function checksumForQueue(events: GameEvent[]): number {
  const text = JSON.stringify(events);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function markPendingIntegrityIssue(gid: string, reason: PendingQueueIntegrityIssue["reason"], rawValue: string): void {
  try {
    localStorage.setItem(pendingBackupKey(gid), rawValue);
    const issue: PendingQueueIntegrityIssue = {
      reason,
      detectedAtIso: new Date().toISOString(),
    };
    localStorage.setItem(pendingIntegrityIssueKey(gid), JSON.stringify(issue));
  } catch {
    // no-op: localStorage may be unavailable in constrained browser modes
  }
}

function parsePendingEnvelope(rawValue: string): GameEvent[] | null {
  const parsed = JSON.parse(rawValue) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as GameEvent[];
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const envelope = parsed as Partial<PendingQueueEnvelope>;
  if (!Array.isArray(envelope.events)) {
    return null;
  }
  if (envelope.version !== PENDING_QUEUE_VERSION) {
    return null;
  }
  if (typeof envelope.checksum !== "number") {
    return null;
  }
  if (checksumForQueue(envelope.events) !== envelope.checksum) {
    throw new Error("pending_queue_checksum_mismatch");
  }
  return envelope.events;
}

export function loadPending(gid: string): GameEvent[] {
  const rawValue = localStorage.getItem(pendingKey(gid));
  if (!rawValue) {
    return [];
  }

  try {
    const events = parsePendingEnvelope(rawValue);
    if (!events) {
      markPendingIntegrityIssue(gid, "invalid_shape", rawValue);
      return [];
    }
    return events;
  } catch (error) {
    const reason = error instanceof Error && error.message === "pending_queue_checksum_mismatch"
      ? "checksum_mismatch"
      : "invalid_json";
    markPendingIntegrityIssue(gid, reason, rawValue);
    return [];
  }
}

export function consumePendingIntegrityIssue(gid: string): string | null {
  try {
    const raw = localStorage.getItem(pendingIntegrityIssueKey(gid));
    if (!raw) {
      return null;
    }
    localStorage.removeItem(pendingIntegrityIssueKey(gid));
    const issue = JSON.parse(raw) as Partial<PendingQueueIntegrityIssue>;
    if (issue.reason === "checksum_mismatch") {
      return "Local queue integrity check failed (checksum mismatch). Backup saved and local queue reset.";
    }
    if (issue.reason === "invalid_shape") {
      return "Local queue format was invalid. Backup saved and local queue reset.";
    }
    return "Local queue data was unreadable. Backup saved and local queue reset.";
  } catch {
    return "Local queue could not be recovered cleanly. Queue was reset.";
  }
}
export function savePending(gid: string, evts: GameEvent[]) {
  const envelope: PendingQueueEnvelope = {
    version: PENDING_QUEUE_VERSION,
    checksum: checksumForQueue(evts),
    events: evts,
  };
  localStorage.setItem(pendingKey(gid), JSON.stringify(envelope));
}

export function loadPendingConflicts(gid: string): PendingConflictRecord[] {
  try {
    const raw = localStorage.getItem(pendingConflictKey(gid));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is PendingConflictRecord => {
      return Boolean(
        entry
        && typeof entry === "object"
        && (entry as { reason?: unknown }).reason === "payload_mismatch"
        && typeof (entry as { detectedAtIso?: unknown }).detectedAtIso === "string"
        && (entry as { localEvent?: unknown }).localEvent
        && typeof (entry as { localEvent?: unknown }).localEvent === "object"
        && (entry as { remoteEvent?: unknown }).remoteEvent
        && typeof (entry as { remoteEvent?: unknown }).remoteEvent === "object"
      );
    });
  } catch {
    return [];
  }
}

export function appendPendingConflicts(gid: string, conflicts: PendingConflictRecord[]): void {
  if (conflicts.length === 0) {
    return;
  }

  const existing = loadPendingConflicts(gid);
  const mergedById = new Map<string, PendingConflictRecord>();
  for (const record of [...existing, ...conflicts]) {
    mergedById.set(record.localEvent.id, record);
  }
  localStorage.setItem(pendingConflictKey(gid), JSON.stringify([...mergedById.values()]));
}

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
