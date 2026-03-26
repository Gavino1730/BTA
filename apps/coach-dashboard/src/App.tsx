import { useEffect, useMemo, useRef, useState } from "react";
import { getPeriodDurationSeconds, type GameEvent, type Period } from "@bta/shared-schema";
import { io } from "socket.io-client";
import {
  formatBonusIndicator,
  formatDashboardAnchorSummary,
  formatDashboardClock,
  formatDashboardEventMeta,
  formatFoulTroubleLabel,
} from "./display.js";

interface TeamStats {
  shooting: {
    fgAttempts: number;
    fgMade: number;
    ftAttempts: number;
    ftMade: number;
    points: number;
  };
  turnovers: number;
  fouls: number;
  reboundsOff: number;
  reboundsDef: number;
  substitutions: number;
}

interface PlayerStats {
  playerId: string;
  teamId: string;
  points: number;
  fgAttempts: number;
  fgMade: number;
  ftAttempts: number;
  ftMade: number;
  reboundsOff: number;
  reboundsDef: number;
  turnovers: number;
  fouls: number;
  assists: number;
  steals: number;
  blocks: number;
}

interface GameState {
  gameId: string;
  opponentName?: string;
  opponentTeamId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  currentPeriod: Period;
  scoreByTeam: Record<string, number>;
  bonusByTeam: Record<string, boolean>;
  possessionsByTeam: Record<string, number>;
  activeLineupsByTeam: Record<string, string[]>;
  teamStats: Record<string, TeamStats>;
  playerStatsByTeam: Record<string, Record<string, PlayerStats>>;
  events: GameEvent[];
}

interface BoxScoreTeamTotals {
  points: number;
  fgMade: number;
  fgAttempts: number;
  ftMade: number;
  ftAttempts: number;
  reboundsOff: number;
  reboundsDef: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
}

interface BoxScorePlayerLine extends BoxScoreTeamTotals {
  playerId: string;
  teamId: string;
}

function emptyTeamStats(): TeamStats {
  return {
    shooting: {
      fgAttempts: 0,
      fgMade: 0,
      ftAttempts: 0,
      ftMade: 0,
      points: 0,
    },
    turnovers: 0,
    fouls: 0,
    reboundsOff: 0,
    reboundsDef: 0,
    substitutions: 0,
  };
}

function mergeTeamStats(target: TeamStats, source?: TeamStats): TeamStats {
  if (!source) {
    return target;
  }

  target.shooting.fgAttempts += source.shooting.fgAttempts;
  target.shooting.fgMade += source.shooting.fgMade;
  target.shooting.ftAttempts += source.shooting.ftAttempts;
  target.shooting.ftMade += source.shooting.ftMade;
  target.shooting.points += source.shooting.points;
  target.turnovers += source.turnovers;
  target.fouls += source.fouls;
  target.reboundsOff += source.reboundsOff;
  target.reboundsDef += source.reboundsDef;
  target.substitutions += source.substitutions;

  return target;
}

function mergePlayerStats(
  target: Record<string, PlayerStats>,
  source?: Record<string, PlayerStats>
): Record<string, PlayerStats> {
  if (!source) {
    return target;
  }

  for (const player of Object.values(source)) {
    const existing = target[player.playerId] ?? {
      ...player,
      points: 0,
      fgAttempts: 0,
      fgMade: 0,
      ftAttempts: 0,
      ftMade: 0,
      reboundsOff: 0,
      reboundsDef: 0,
      turnovers: 0,
      fouls: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
    };

    existing.teamId = player.teamId;
    existing.points += player.points;
    existing.fgAttempts += player.fgAttempts;
    existing.fgMade += player.fgMade;
    existing.ftAttempts += player.ftAttempts;
    existing.ftMade += player.ftMade;
    existing.reboundsOff += player.reboundsOff;
    existing.reboundsDef += player.reboundsDef;
    existing.turnovers += player.turnovers;
    existing.fouls += player.fouls;
    existing.assists += player.assists;
    existing.steals += player.steals;
    existing.blocks += player.blocks;

    target[player.playerId] = existing;
  }

  return target;
}

function mergeByTeamKeys<T>(
  previous: Record<string, T> | undefined,
  incoming: Record<string, T> | undefined
): Record<string, T> {
  return {
    ...(previous ?? {}),
    ...(incoming ?? {}),
  };
}

function mergeLineupsByTeam(
  previous: Record<string, string[]> | undefined,
  incoming: Record<string, string[]> | undefined
): Record<string, string[]> {
  const merged: Record<string, string[]> = mergeByTeamKeys(previous, incoming);
  for (const teamId of Object.keys(merged)) {
    merged[teamId] = [...new Set(merged[teamId] ?? [])].filter(Boolean);
  }
  return merged;
}

function mergeGameState(previous: GameState | null, incoming: GameState): GameState {
  if (!previous || previous.gameId !== incoming.gameId) {
    return incoming;
  }

  return {
    ...previous,
    ...incoming,
    scoreByTeam: mergeByTeamKeys(previous.scoreByTeam, incoming.scoreByTeam),
    bonusByTeam: mergeByTeamKeys(previous.bonusByTeam, incoming.bonusByTeam),
    possessionsByTeam: mergeByTeamKeys(previous.possessionsByTeam, incoming.possessionsByTeam),
    activeLineupsByTeam: mergeLineupsByTeam(previous.activeLineupsByTeam, incoming.activeLineupsByTeam),
    teamStats: mergeByTeamKeys(previous.teamStats, incoming.teamStats),
    playerStatsByTeam: mergeByTeamKeys(previous.playerStatsByTeam, incoming.playerStatsByTeam),
  };
}

function emptyBoxScoreTotals(): BoxScoreTeamTotals {
  return {
    points: 0,
    fgMade: 0,
    fgAttempts: 0,
    ftMade: 0,
    ftAttempts: 0,
    reboundsOff: 0,
    reboundsDef: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0,
  };
}

interface Insight {
  id: string;
  type: string;
  confidence?: "high" | "medium";
  message: string;
  explanation: string;
  createdAtIso: string;
  relatedTeamId?: string;
  relatedPlayerId?: string;
}

interface VideoAsset {
  id: string;
  gameId: string;
  filename: string;
  status: "uploaded" | "synced";
}

interface SyncAnchor {
  id: string;
  videoId: string;
  eventType: "tipoff" | "quarter_start" | "buzzer";
  period: Period;
  gameClockSeconds: number;
  videoSecond: number;
}

interface VideoResolution {
  videoId: string;
  period: Period;
  gameClockSeconds: number;
  resolvedVideoSecond: number;
  anchorId: string;
}

interface RotationWatchNote {
  playerId: string;
  level: "high" | "medium";
  reason: string;
}

interface PresenceStatus {
  deviceId: string;
  online: boolean;
  gameId: string | null;
  lastSeenIso: string | null;
}

type CoachInsightFocus =
  | "timeouts"
  | "substitutions"
  | "foul_management"
  | "momentum"
  | "shot_selection"
  | "ball_security"
  | "hot_hand"
  | "defense";

interface CoachAiSettings {
  playingStyle: string;
  teamContext: string;
  customPrompt: string;
  focusInsights: CoachInsightFocus[];
}

interface AiPromptPreview {
  model: string;
  userPrompt: string;
  systemGuide: string[];
  coachSettings: CoachAiSettings;
  recentEventCount: number;
  generatedAtIso: string;
}

interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAtIso: string;
}

interface AiChatResponse {
  answer: string;
  suggestions: string[];
  generatedAtIso: string;
  usedHistoricalContext: boolean;
}

interface AiSignalCard {
  id: string;
  title: string;
  detail: string;
  tone: "high" | "medium" | "default";
}

type BoxScoreFilter = "game" | "first-half" | "second-half" | Period;

const AI_FOCUS_OPTIONS: Array<{ id: CoachInsightFocus; label: string }> = [
  { id: "timeouts", label: "Timeout management" },
  { id: "substitutions", label: "Substitutions" },
  { id: "foul_management", label: "Foul management" },
  { id: "momentum", label: "Momentum swings" },
  { id: "shot_selection", label: "Shot selection" },
  { id: "ball_security", label: "Ball security" },
  { id: "hot_hand", label: "Hot hand usage" },
  { id: "defense", label: "Defensive calls" },
];

function defaultCoachAiSettings(): CoachAiSettings {
  return {
    playingStyle: "",
    teamContext: "",
    customPrompt: "",
    focusInsights: AI_FOCUS_OPTIONS.map((option) => option.id),
  };
}

function extractHistoricalContextFromPrompt(prompt: string): string {
  const line = prompt
    .split("\n")
    .find((entry) => entry.toLowerCase().startsWith("historical context from stats dashboard:"));
  if (!line) {
    return "";
  }

  return line
    .slice("Historical context from stats dashboard:".length)
    .trim();
}

// ── Roster Builder ──────────────────────────────────────────────────────────
// Local storage is fallback only; source of truth is realtime API roster config.
const ROSTER_STORAGE_KEY = "shared-app-data-v3";
const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
const ROLE_OPTIONS = ["Starter", "Bench", "Rotation", "Sixth Man", "Specialist"] as const;

export interface RosterPlayer {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;
  grade?: string;
  role?: string;
  notes?: string;
}

export interface RosterTeam {
  id: string;
  name: string;
  abbreviation: string;
  teamColor?: string;
  coachStyle?: string;
  players: RosterPlayer[];
}

function normalizeTeamColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return undefined;
}

function loadRosterTeams(): RosterTeam[] {
  try {
    const raw = localStorage.getItem(ROSTER_STORAGE_KEY);
    if (raw) return (JSON.parse(raw) as { teams?: RosterTeam[] }).teams ?? [];
  } catch { /* corrupt */ }
  return [];
}

function saveRosterTeams(teams: RosterTeam[]): void {
  try {
    const raw = localStorage.getItem(ROSTER_STORAGE_KEY);
    const existing: Record<string, unknown> = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ ...existing, teams }));
  } catch { /* storage full */ }
}

function isRosterPlayer(value: unknown): value is RosterPlayer {
  if (!value || typeof value !== "object") return false;
  const player = value as Record<string, unknown>;
  return typeof player.id === "string"
    && typeof player.number === "string"
    && typeof player.name === "string"
    && typeof player.position === "string"
    && (player.role === undefined || typeof player.role === "string")
    && (player.notes === undefined || typeof player.notes === "string");
}

function isRosterTeam(value: unknown): value is RosterTeam {
  if (!value || typeof value !== "object") return false;
  const team = value as Record<string, unknown>;
  return typeof team.id === "string"
    && typeof team.name === "string"
    && typeof team.abbreviation === "string"
    && (team.teamColor === undefined || typeof team.teamColor === "string")
    && (team.coachStyle === undefined || typeof team.coachStyle === "string")
    && Array.isArray(team.players)
    && team.players.every(isRosterPlayer);
}

function normalizeRosterTeams(value: unknown): RosterTeam[] {
  return Array.isArray(value) ? value.filter(isRosterTeam) : [];
}

function slugifyTeamName(name: string): string {
  return `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;
}

function newPlayerId(): string {
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
// ────────────────────────────────────────────────────────────────────────────

const defaultHost = window.location.hostname || "localhost";
const apiBase = import.meta.env.VITE_API ?? `http://${defaultHost}:4000`;
const videoBase = import.meta.env.VITE_VIDEO_API ?? `http://${defaultHost}:4100`;
const statsBase = import.meta.env.VITE_STATS_DASHBOARD ?? `http://${defaultHost}:5000`;
const operatorBase = import.meta.env.VITE_OPERATOR_CONSOLE ?? `http://${defaultHost}:5174`;
const API_KEY: string = import.meta.env.VITE_API_KEY ?? "";

/** Returns `{ "x-api-key": key }` when a key is configured, otherwise `{}`. */
function apiKeyHeader(): Record<string, string> {
  return API_KEY ? { "x-api-key": API_KEY } : {};
}

export function App() {
  const setupNames = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      myTeamId: params.get("myTeamId") ?? "",
      myTeamName: params.get("myTeamName") ?? "",
      opponentName: params.get("opponentName") ?? "",
      vcSide: params.get("vcSide") === "away" ? "away" as const : "home" as const,
    };
  }, []);

  const [deviceId, setDeviceId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("deviceId") ?? "device-1";
  });
  const [gameId, setGameId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("gameId") ?? "";
  });
  const [state, setState] = useState<GameState | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [serverConnected, setServerConnected] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [anchors, setAnchors] = useState<SyncAnchor[]>([]);
  const [videoSrcUrl, setVideoSrcUrl] = useState("");  // URL for the in-page video player
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoId, setVideoId] = useState("vid-1");
  const [filename, setFilename] = useState("full-game.mp4");
  const [anchorVideoId, setAnchorVideoId] = useState("vid-1");
  const [videoSecond, setVideoSecond] = useState("12");
  const [dashboardStatus, setDashboardStatus] = useState("Waiting for live game data");
  const [isRefreshingAiInsights, setIsRefreshingAiInsights] = useState(false);
  const [aiRefreshError, setAiRefreshError] = useState("");
  const [eventClipMap, setEventClipMap] = useState<Record<string, VideoResolution>>({});
  const [activePage, setActivePage] = useState<"live" | "ai" | "film" | "roster" | "settings">("live");
  const [aiSettings, setAiSettings] = useState<CoachAiSettings>(defaultCoachAiSettings);
  const [aiSettingsDraft, setAiSettingsDraft] = useState<CoachAiSettings>(defaultCoachAiSettings);
  const [aiSettingsStatus, setAiSettingsStatus] = useState("No saved settings for this game yet.");
  const [boxScoreFilter, setBoxScoreFilter] = useState<BoxScoreFilter>("game");
  const [promptPreview, setPromptPreview] = useState<AiPromptPreview | null>(null);
  const [promptPreviewStatus, setPromptPreviewStatus] = useState("Prompt preview not loaded.");
  const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatStatus, setAiChatStatus] = useState("Ask the live assistant about subs, foul danger, hot hands, or matchup decisions.");
  const [isSendingAiChat, setIsSendingAiChat] = useState(false);
  const [aiChatSuggestions, setAiChatSuggestions] = useState<string[]>([]);
  const historicalPromptContext = useMemo(
    () => extractHistoricalContextFromPrompt(promptPreview?.userPrompt ?? ""),
    [promptPreview?.userPrompt]
  );
  const operatorConsoleUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (deviceId) params.set("deviceId", deviceId);
    if (gameId) params.set("gameId", gameId);
    if (setupNames.myTeamId) params.set("myTeamId", setupNames.myTeamId);
    if (setupNames.myTeamName) params.set("myTeamName", setupNames.myTeamName);
    if (setupNames.opponentName) params.set("opponent", setupNames.opponentName);
    if (setupNames.vcSide) params.set("vcSide", setupNames.vcSide);
    return `${operatorBase.replace(/\/$/, "")}/?${params.toString()}`;
  }, [deviceId, gameId, setupNames]);

  // ── Roster Builder state ─────────────────────────────────────────────────
  const [rosterTeams, setRosterTeamsState] = useState<RosterTeam[]>(loadRosterTeams);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editPlayerDraft, setEditPlayerDraft] = useState<RosterPlayer | null>(null);
  const [showNewTeamForm, setShowNewTeamForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamAbbr, setNewTeamAbbr] = useState("");
  const [newTeamColor, setNewTeamColor] = useState("#4f8cff");
  const [addingPlayerForTeam, setAddingPlayerForTeam] = useState<string | null>(null);
  const [newPlayerNum, setNewPlayerNum] = useState("");
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerPos, setNewPlayerPos] = useState("PG");
  const [newPlayerHeight, setNewPlayerHeight] = useState("");
  const [newPlayerGrade, setNewPlayerGrade] = useState("");
  const [newPlayerRole, setNewPlayerRole] = useState("Bench");
  const [newPlayerNotes, setNewPlayerNotes] = useState("");

  function setRosterTeams(next: RosterTeam[]) {
    setRosterTeamsState(next);
    saveRosterTeams(next);

    const preferredTeamId = setupNames.myTeamId || next[0]?.id || "";

    void (async () => {
      try {
        const realtimeRes = await fetch(`${apiBase}/config/roster-teams`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...apiKeyHeader() },
          body: JSON.stringify({ teams: next }),
        });
        if (!realtimeRes.ok) {
          console.warn("Roster save to realtime API failed", realtimeRes.status);
        }
      } catch {
        // Keep local fallback when API is unavailable.
      }

      try {
        const statsRes = await fetch(`${statsBase}/api/roster-sync`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...apiKeyHeader() },
          body: JSON.stringify({ teams: next, preferredTeamId }),
        });
        if (!statsRes.ok) {
          console.warn("Roster sync to stats dashboard failed", statsRes.status, statsBase);
        }
      } catch {
        console.warn("Roster sync request to stats dashboard failed", statsBase);
      }
    })();
  }

  useEffect(() => {
    let isMounted = true;
    async function hydrateRosterFromApi() {
      try {
        const response = await fetch(`${apiBase}/config/roster-teams`, { headers: apiKeyHeader() });
        if (!response.ok) return;
        const payload = (await response.json()) as { teams?: unknown };
        const teams = normalizeRosterTeams(payload.teams);
        if (!isMounted) return;
        if (teams.length > 0 || rosterTeams.length === 0) {
          setRosterTeamsState(teams);
          saveRosterTeams(teams);
        }
      } catch {
        // Keep local fallback when API is unavailable.
      }
    }

    void hydrateRosterFromApi();
    
    // Poll for roster changes from other devices (deletions by operator console or stats dashboard)
    const pollInterval = setInterval(() => {
      void hydrateRosterFromApi();
    }, 30000); // Poll every 30 seconds for roster deletions from other apps
    
    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, []);

  function addTeam() {
    if (!newTeamName.trim()) return;
    let id = slugifyTeamName(newTeamName);
    let suffix = 2;
    while (rosterTeams.some((t) => t.id === id)) { id = `${slugifyTeamName(newTeamName)}-${suffix++}`; }
    const abbr = newTeamAbbr.trim().toUpperCase().slice(0, 4) || newTeamName.trim().slice(0, 3).toUpperCase();
    const team: RosterTeam = {
      id,
      name: newTeamName.trim(),
      abbreviation: abbr,
      teamColor: normalizeTeamColor(newTeamColor),
      players: []
    };
    setRosterTeams([...rosterTeams, team]);
    setNewTeamName("");
    setNewTeamAbbr("");
    setNewTeamColor("#4f8cff");
    setShowNewTeamForm(false);
    setExpandedTeamId(id);
  }

  function removeTeam(id: string) {
    if (!window.confirm(`Remove team "${rosterTeams.find((t) => t.id === id)?.name ?? id}"?`)) return;
    setRosterTeams(rosterTeams.filter((t) => t.id !== id));
    if (expandedTeamId === id) setExpandedTeamId(null);
  }

  function updateTeamCoachStyle(teamId: string, coachStyle: string) {
    const nextCoachStyle = coachStyle.trim();
    setRosterTeams(
      rosterTeams.map((team) =>
        team.id === teamId
          ? { ...team, coachStyle: nextCoachStyle || undefined }
          : team
      )
    );
  }

  function updateTeamColor(teamId: string, teamColor: string) {
    const nextTeamColor = normalizeTeamColor(teamColor);
    setRosterTeams(
      rosterTeams.map((team) =>
        team.id === teamId
          ? { ...team, teamColor: nextTeamColor }
          : team
      )
    );
  }

  function addPlayer(teamId: string) {
    if (!newPlayerName.trim() || !newPlayerNum.trim()) return;
    const player: RosterPlayer = {
      id: newPlayerId(),
      number: newPlayerNum.trim(),
      name: newPlayerName.trim(),
      position: newPlayerPos,
      height: newPlayerHeight.trim() || undefined,
      grade: newPlayerGrade.trim() || undefined,
      role: newPlayerRole.trim() || undefined,
      notes: newPlayerNotes.trim() || undefined,
    };
    setRosterTeams(rosterTeams.map((t) => t.id === teamId ? { ...t, players: [...t.players, player] } : t));
    setAddingPlayerForTeam(null);
    setNewPlayerNum("");
    setNewPlayerName("");
    setNewPlayerPos("PG");
    setNewPlayerHeight("");
    setNewPlayerGrade("");
    setNewPlayerRole("Bench");
    setNewPlayerNotes("");
  }

  function removePlayer(teamId: string, playerId: string) {
    setRosterTeams(rosterTeams.map((t) => t.id === teamId ? { ...t, players: t.players.filter((p) => p.id !== playerId) } : t));
    if (editingPlayerId === playerId) { setEditingPlayerId(null); setEditPlayerDraft(null); }
  }

  function saveEditedPlayer(teamId: string) {
    if (!editPlayerDraft) return;
    const normalizedDraft: RosterPlayer = {
      ...editPlayerDraft,
      number: editPlayerDraft.number.trim(),
      name: editPlayerDraft.name.trim(),
      position: editPlayerDraft.position.trim(),
      height: editPlayerDraft.height?.trim() || undefined,
      grade: editPlayerDraft.grade?.trim() || undefined,
      role: editPlayerDraft.role?.trim() || undefined,
      notes: editPlayerDraft.notes?.trim() || undefined,
    };
    setRosterTeams(rosterTeams.map((t) =>
      t.id === teamId ? { ...t, players: t.players.map((p) => p.id === normalizedDraft.id ? normalizedDraft : p) } : t
    ));
    setEditingPlayerId(null);
    setEditPlayerDraft(null);
  }

  function exportRoster() {
    const json = JSON.stringify({ teams: rosterTeams }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roster.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importRoster(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target!.result as string) as { teams?: RosterTeam[] };
        if (Array.isArray(data.teams)) setRosterTeams(data.teams);
      } catch { /* invalid JSON */ }
    };
    reader.readAsText(file);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    if (params.get("deviceId") !== deviceId) {
      params.set("deviceId", deviceId);
      changed = true;
    }
    if (params.get("gameId") !== gameId) {
      if (gameId) {
        params.set("gameId", gameId);
      } else {
        params.delete("gameId");
      }
      changed = true;
    }

    if (changed) {
      window.history.replaceState({}, "", `?${params.toString()}`);
    }
  }, [deviceId, gameId]);

  useEffect(() => {
    const socket = io(apiBase, {
      auth: API_KEY ? { apiKey: API_KEY } : {}
    });

    // Poll the presence channel every 5s so the coach dashboard can recover
    // quickly if the operator console reconnects after a temporary network interruption.
    let pollInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
      if (socket.connected) {
        socket.emit("join:coach", { deviceId });
      }
    }, 5000);

    function stopPoll() {
      if (pollInterval !== null) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    socket.on("connect", () => {
      setServerConnected(true);
      socket.emit("join:coach", { deviceId });
    });

    socket.on("disconnect", () => {
      setServerConnected(false);
      setDeviceConnected(false);
    });

    socket.emit("join:coach", { deviceId });

    function handlePresence(status: PresenceStatus) {
      if (!status || status.deviceId !== deviceId) {
        return;
      }

      setDeviceConnected(status.online);
      const activeGameId = status.gameId;
      if (status.online && activeGameId) {
        setGameId((current) => (current === activeGameId ? current : activeGameId));
        socket.emit("join:game", activeGameId);
      } else {
        setDashboardStatus(`Waiting for device ${deviceId}`);
      }
    }

    socket.on("presence:status", handlePresence);

    socket.on("game:state", (nextState: GameState) => {
      stopPoll();
      setGameId((current) => (current === nextState.gameId ? current : nextState.gameId));
      setState((current) => mergeGameState(current, nextState));
      setDashboardStatus("Live state synced");
    });

    socket.on("game:insights", (nextInsights: Insight[]) => {
      setInsights(nextInsights);
    });

    socket.on("roster:teams", (nextTeams: unknown) => {
      const teams = normalizeRosterTeams(nextTeams);
      setRosterTeamsState(teams);
      saveRosterTeams(teams);
    });

    return () => {
      stopPoll();
      socket.off("presence:status", handlePresence);
      socket.off("roster:teams");
      socket.disconnect();
    };
  }, [deviceId]);

  useEffect(() => {
    if (!gameId) {
      return;
    }

    async function hydrate() {
      const stateRes = await fetch(`${apiBase}/games/${gameId}/state`, { headers: apiKeyHeader() });
      if (stateRes.ok) {
        const payload = (await stateRes.json()) as GameState;
        setState(payload);
        setDashboardStatus("Loaded server game state");
      }

      const insightRes = await fetch(`${apiBase}/games/${gameId}/insights`, { headers: apiKeyHeader() });
      if (insightRes.ok) {
        const payload = (await insightRes.json()) as Insight[];
        setInsights(payload);
      }

      const videoRes = await fetch(`${videoBase}/games/${gameId}/videos`, { headers: apiKeyHeader() });
      if (videoRes.ok) {
        const payload = (await videoRes.json()) as VideoAsset[];
        setVideos(payload);
      }

      const anchorRes = await fetch(`${videoBase}/games/${gameId}/sync-anchors`, { headers: apiKeyHeader() });
      if (anchorRes.ok) {
        const payload = (await anchorRes.json()) as SyncAnchor[];
        setAnchors(payload);
      }
    }

    hydrate().catch(() => {
      // Ignore network errors in dashboard bootstrap.
    });
  }, [gameId]);

  useEffect(() => {
    if (!gameId) {
      setAiSettings(defaultCoachAiSettings());
      setAiSettingsDraft(defaultCoachAiSettings());
      setAiSettingsStatus("Connect to a live game to save AI settings.");
      setPromptPreview(null);
      setPromptPreviewStatus("Connect to a live game to load prompt preview.");
      return;
    }

    let cancelled = false;
    async function hydrateAiSettings() {
      try {
        const response = await fetch(`${apiBase}/games/${gameId}/ai-settings`, {
          headers: apiKeyHeader(),
        });
        if (!response.ok) {
          if (!cancelled) {
            setAiSettings(defaultCoachAiSettings());
            setAiSettingsDraft(defaultCoachAiSettings());
            setAiSettingsStatus("Using defaults. Save to create custom AI settings for this game.");
          }
          return;
        }

        const payload = (await response.json()) as CoachAiSettings | null;
        const next = payload ?? defaultCoachAiSettings();
        if (!cancelled) {
          setAiSettings(next);
          setAiSettingsDraft(next);
          setAiSettingsStatus("Loaded AI settings for this game.");
        }
      } catch {
        if (!cancelled) {
          setAiSettingsStatus("Could not load AI settings from realtime API.");
        }
      }
    }

    void hydrateAiSettings();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  async function saveAiSettings(): Promise<void> {
    if (!gameId) {
      setAiSettingsStatus("Connect to a live game first, then save AI settings.");
      return;
    }

    setAiSettingsStatus("Saving AI settings...");
    try {
      const response = await fetch(`${apiBase}/games/${gameId}/ai-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...apiKeyHeader() },
        body: JSON.stringify(aiSettingsDraft),
      });

      if (!response.ok) {
        setAiSettingsStatus(`Save failed (${response.status}).`);
        return;
      }

      const saved = (await response.json()) as CoachAiSettings;
      setAiSettings(saved);
      setAiSettingsDraft(saved);
      setAiSettingsStatus("AI settings saved and applied to live coaching insights.");
      setPromptPreviewStatus("Settings saved. Refresh prompt preview to inspect current AI input.");
    } catch {
      setAiSettingsStatus("Save failed: could not reach realtime API.");
    }
  }

  async function loadPromptPreview(): Promise<void> {
    if (!gameId) {
      setPromptPreviewStatus("Connect to a live game first.");
      return;
    }

    setPromptPreviewStatus("Loading prompt preview...");
    try {
      const response = await fetch(`${apiBase}/games/${gameId}/ai-prompt-preview`, {
        headers: apiKeyHeader(),
      });
      if (!response.ok) {
        setPromptPreview(null);
        setPromptPreviewStatus(`Prompt preview unavailable (${response.status}).`);
        return;
      }

      const payload = (await response.json()) as AiPromptPreview;
      setPromptPreview(payload);
      setPromptPreviewStatus("Prompt preview loaded.");
    } catch {
      setPromptPreview(null);
      setPromptPreviewStatus("Could not load prompt preview from realtime API.");
    }
  }

  async function sendAiChat(questionOverride?: string): Promise<void> {
    const question = (questionOverride ?? aiChatInput).trim();
    if (!gameId) {
      setAiChatStatus("Connect to a live game first.");
      return;
    }

    if (!question) {
      setAiChatStatus("Enter a question for the in-game assistant.");
      return;
    }

    const userMessage: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      createdAtIso: new Date().toISOString(),
    };

    const historyPayload = aiChatMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setAiChatMessages((current) => [...current, userMessage]);
    setAiChatInput("");
    setAiChatStatus("Thinking through live and historical context...");
    setIsSendingAiChat(true);

    try {
      const response = await fetch(`${apiBase}/games/${gameId}/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader() },
        body: JSON.stringify({
          question,
          history: historyPayload,
        }),
      });

      if (!response.ok) {
        setAiChatStatus(`AI chat unavailable (${response.status}).`);
        return;
      }

      const payload = (await response.json()) as AiChatResponse;
      setAiChatMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.answer,
          createdAtIso: payload.generatedAtIso,
        }
      ]);
      setAiChatSuggestions(payload.suggestions);
      setAiChatStatus(payload.usedHistoricalContext
        ? "Answered with live game state plus historical team and player context."
        : "Answered with current live game context.");
    } catch {
      setAiChatStatus("AI chat request failed. Realtime API may be unavailable.");
    } finally {
      setIsSendingAiChat(false);
    }
  }

  function toggleFocusInsight(focus: CoachInsightFocus): void {
    setAiSettingsDraft((current) => {
      const exists = current.focusInsights.includes(focus);
      if (exists) {
        const next = current.focusInsights.filter((item) => item !== focus);
        return {
          ...current,
          focusInsights: next.length > 0 ? next : current.focusInsights,
        };
      }

      return {
        ...current,
        focusInsights: [...current.focusInsights, focus],
      };
    });
  }

  const canonicalSideIds = useMemo(() => {
    // The game state's homeTeamId / awayTeamId are the authoritative structural
    // identifiers. URL params (myTeamId, vcSide) are display hints only.
    // Using opponentTeamId in aliases caused both raw team IDs to collapse to
    // the same canonical ID when VC plays away, doubling scores and merging
    // player cards into a single slot.
    const stateHomeId = state?.homeTeamId;
    const stateAwayId = state?.awayTeamId;

    const homeId = stateHomeId || (setupNames.vcSide === "home" ? (setupNames.myTeamId || "home") : "home");
    const awayId = stateAwayId || (setupNames.vcSide === "away" ? (setupNames.myTeamId || "away") : "away");

    // Only alias myTeamId to the side matching vcSide when state confirms
    // that myTeamId is NOT already assigned to the opposite side. This prevents
    // a stale/wrong vcSide in the URL from creating alias collisions.
    const myId = setupNames.myTeamId || "";
    const myTeamOnHome = myId && myId !== stateAwayId
      ? (setupNames.vcSide === "home" ? myId : undefined)
      : undefined;
    const myTeamOnAway = myId && myId !== stateHomeId
      ? (setupNames.vcSide === "away" ? myId : undefined)
      : undefined;

    const homeAliases = new Set<string>([
      "home",
      "team-home",
      stateHomeId,
      myTeamOnHome,
    ].filter((value): value is string => Boolean(value)));

    const awayAliases = new Set<string>([
      "away",
      "team-away",
      stateAwayId,
      myTeamOnAway,
    ].filter((value): value is string => Boolean(value)));

    return {
      homeId,
      awayId,
      homeAliases,
      awayAliases,
    };
  }, [
    setupNames.myTeamId,
    setupNames.vcSide,
    state?.awayTeamId,
    state?.homeTeamId,
  ]);

  function canonicalTeamId(teamId: string): string {
    if (canonicalSideIds.homeAliases.has(teamId)) {
      return canonicalSideIds.homeId;
    }

    if (canonicalSideIds.awayAliases.has(teamId)) {
      return canonicalSideIds.awayId;
    }

    return teamId;
  }

  const rawTeamIds = useMemo(() => {
    return [...new Set([
      ...Object.keys(state?.scoreByTeam ?? {}),
      ...Object.keys(state?.bonusByTeam ?? {}),
      ...Object.keys(state?.possessionsByTeam ?? {}),
      ...Object.keys(state?.activeLineupsByTeam ?? {}),
      ...Object.keys(state?.teamStats ?? {}),
      ...Object.keys(state?.playerStatsByTeam ?? {}),
    ])];
  }, [state]);

  const aggregatedTeams = useMemo(() => {
    const aggregated: Record<string, {
      score: number;
      bonus: boolean;
      possessions: number;
      activeLineup: string[];
      teamStats: TeamStats;
      playerStats: Record<string, PlayerStats>;
    }> = {};

    function ensureTeam(teamId: string) {
      aggregated[teamId] ??= {
        score: 0,
        bonus: false,
        possessions: 0,
        activeLineup: [],
        teamStats: emptyTeamStats(),
        playerStats: {},
      };

      return aggregated[teamId];
    }

    for (const rawTeamId of rawTeamIds) {
      const teamId = canonicalTeamId(rawTeamId);
      const target = ensureTeam(teamId);
      target.score += state?.scoreByTeam?.[rawTeamId] ?? 0;
      target.bonus = target.bonus || (state?.bonusByTeam?.[rawTeamId] ?? false);
      target.possessions += state?.possessionsByTeam?.[rawTeamId] ?? 0;
      target.activeLineup = [...new Set([
        ...target.activeLineup,
        ...(state?.activeLineupsByTeam?.[rawTeamId] ?? []),
      ])];
      mergeTeamStats(target.teamStats, state?.teamStats?.[rawTeamId]);
      mergePlayerStats(target.playerStats, state?.playerStatsByTeam?.[rawTeamId]);
    }

    return aggregated;
  }, [rawTeamIds, setupNames.myTeamId, setupNames.vcSide, state]);

  const teams = useMemo(() => {
    const homeSlot = canonicalSideIds.homeId;
    // Guard: when both canonical IDs collapse to the same value (e.g. bad game
    // setup where homeTeamId === awayTeamId), fall back to the raw state IDs so
    // both team cards are always rendered.
    const awaySlot =
      canonicalSideIds.awayId !== canonicalSideIds.homeId
        ? canonicalSideIds.awayId
        : (state?.awayTeamId && state.awayTeamId !== state?.homeTeamId
            ? state.awayTeamId
            : "away");

    // Always put our team (vc side) at index 0 so it renders on the left.
    const preferred = (setupNames.vcSide === "away" ? [awaySlot, homeSlot] : [homeSlot, awaySlot])
      .filter((teamId): teamId is string => Boolean(teamId));
    return [...new Set([...preferred, ...Object.keys(aggregatedTeams)])];
  }, [aggregatedTeams, canonicalSideIds.awayId, canonicalSideIds.homeId, setupNames.vcSide, state?.awayTeamId, state?.homeTeamId]);

  const rosterLabels = useMemo(() => {
    const teamNameById: Record<string, string> = {};
    const playerNameByTeamAndId: Record<string, string> = {};
    const playerNameById: Record<string, string> = {};

    for (const team of rosterTeams) {
      const teamDisplay = team.name.trim() || team.abbreviation.trim() || team.id;
      teamNameById[team.id] = teamDisplay;

      for (const player of team.players) {
        const playerDisplay = player.name.trim() || (player.number.trim() ? `#${player.number.trim()}` : player.id);
        playerNameByTeamAndId[`${team.id}:${player.id}`] = playerDisplay;

        if (!playerNameById[player.id]) {
          playerNameById[player.id] = playerDisplay;
        }
      }
    }

    return {
      teamNameById,
      playerNameByTeamAndId,
      playerNameById,
    };
  }, [rosterTeams]);

  const playersByTeamId = useMemo(() => {
    const byTeamId: Record<string, RosterPlayer[]> = {};
    for (const team of rosterTeams) {
      byTeamId[team.id] = team.players;
    }
    return byTeamId;
  }, [rosterTeams]);

  const teamColorById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const team of rosterTeams) {
      if (team.teamColor) map[team.id] = team.teamColor;
    }
    return map;
  }, [rosterTeams]);

  function toTitleCase(value: string): string {
    return value
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function displayTeamName(teamId: string): string {
    const canonicalId = canonicalTeamId(teamId);
    const opponentName = setupNames.opponentName || state?.opponentName || "";

    // When myTeamId is available in the URL it is the definitive check —
    // do NOT mix in teams[0] which depends on vcSide and can mislabel both
    // slots as "our team" when vcSide is wrong.  Fall back to vcSide-based
    // heuristics only when myTeamId was not provided.
    // Three-way check when myTeamId is set:
    //   1. Direct ID match
    //   2. Canonical ID equals myTeamId (edge case)
    //   3. myTeamId resolves to the same canonical slot (covers old games where
    //      events were sent with a different ID, e.g. "team-usa" vs "team-vc")
    const ourRawSideId = setupNames.vcSide === "away" ? state?.awayTeamId : state?.homeTeamId;
    const isOurTeam = setupNames.myTeamId !== ""
      ? (teamId === setupNames.myTeamId ||
         canonicalId === setupNames.myTeamId ||
         canonicalTeamId(setupNames.myTeamId) === canonicalId)
      : ((teams.length > 0 && teamId === teams[0]) ||
         (Boolean(ourRawSideId) && teamId === ourRawSideId));

    if (isOurTeam) {
      // Only return myTeamName if it doesn't duplicate the opponent name—if both would
      // show the same label, prefer a roster label or a title-cased fallback so the two
      // sections are visually distinct.
      const rosterLabel = rosterLabels.teamNameById[canonicalId] ?? rosterLabels.teamNameById[teamId];
      if (setupNames.myTeamName && setupNames.myTeamName !== opponentName) return setupNames.myTeamName;
      if (rosterLabel) return rosterLabel;
      if (setupNames.myTeamName) return setupNames.myTeamName;
      const fallback = canonicalId.replace(/^team[-_]/i, "");
      return toTitleCase(fallback);
    }

    if (opponentName) return opponentName;

    const rosterLabel = rosterLabels.teamNameById[canonicalId] ?? rosterLabels.teamNameById[teamId];
    if (rosterLabel) return rosterLabel;

    const fallback = canonicalId.replace(/^team[-_]/i, "");
    return toTitleCase(fallback);
  }

  function displayPlayerName(teamId: string, playerId: string): string {
    const canonicalId = canonicalTeamId(teamId);
    const normalizedPlayerId = playerId.toLowerCase();
    const normalizedTeamId = teamId.toLowerCase();
    const normalizedCanonicalId = canonicalId.toLowerCase();
    const teamLevelAliases = new Set<string>([
      "home-team",
      "away-team",
      "team-home",
      "team-away",
      normalizedTeamId,
      normalizedCanonicalId,
      `${normalizedTeamId}-team`,
      `${normalizedCanonicalId}-team`,
    ]);

    if (teamLevelAliases.has(normalizedPlayerId)) {
      return displayTeamName(teamId);
    }

    return rosterLabels.playerNameByTeamAndId[`${canonicalId}:${playerId}`]
      ?? rosterLabels.playerNameByTeamAndId[`${teamId}:${playerId}`]
      ?? rosterLabels.playerNameById[playerId]
      ?? playerId;
  }

  function getScoreboardLineup(teamId: string): { playerIds: string[]; isEstimated: boolean } {
    const canonicalId = canonicalTeamId(teamId);
    // Fall back to canonical-keyed bucket when teamId is a side-alias like "away".
    const teamBucket = aggregatedTeams[teamId] ?? aggregatedTeams[canonicalId];
    // Exclude any player ID that is itself a team identifier (e.g. "team-oes" leaking
    // into the active lineup from starting-lineup initialization).
    const knownTeamIds = new Set([
      "home", "away", "home-team", "away-team", "team-home", "team-away",
      ...rawTeamIds,
      ...Object.keys(aggregatedTeams),
      // Also exclude "<teamId>-team" pseudo-IDs emitted by the operator when
      // tracking opponent shots without a specific player selected.
      ...rawTeamIds.map((id) => `${id}-team`),
      ...Object.keys(aggregatedTeams).map((id) => `${id}-team`),
    ].map((id) => id.toLowerCase()));
    const isRealPlayer = (pid: string) => Boolean(pid) && !knownTeamIds.has(pid.toLowerCase());
    const liveLineup = [...new Set(teamBucket?.activeLineup ?? [])].filter(isRealPlayer);
    if (liveLineup.length >= 5) {
      return { playerIds: liveLineup.slice(0, 5), isEstimated: false };
    }

    const statEntries = Object.entries(teamBucket?.playerStats ?? {});
    const activeByStats = statEntries
      .filter(([, statLine]) => {
        const touches =
          statLine.points
          + statLine.fgAttempts
          + statLine.ftAttempts
          + statLine.reboundsOff
          + statLine.reboundsDef
          + statLine.assists
          + statLine.steals
          + statLine.blocks
          + statLine.turnovers
          + statLine.fouls;
        return touches > 0;
      })
      .sort((left, right) => {
        const leftTouches =
          left[1].points
          + left[1].fgAttempts
          + left[1].ftAttempts
          + left[1].reboundsOff
          + left[1].reboundsDef
          + left[1].assists
          + left[1].steals
          + left[1].blocks
          + left[1].turnovers
          + left[1].fouls;
        const rightTouches =
          right[1].points
          + right[1].fgAttempts
          + right[1].ftAttempts
          + right[1].reboundsOff
          + right[1].reboundsDef
          + right[1].assists
          + right[1].steals
          + right[1].blocks
          + right[1].turnovers
          + right[1].fouls;
        return rightTouches - leftTouches;
      })
      .map(([playerId]) => playerId);

    const rosterOrder = (playersByTeamId[canonicalId] ?? playersByTeamId[teamId] ?? []).map((player) => player.id);
    const combined = [...new Set([...liveLineup, ...activeByStats, ...rosterOrder])].filter(isRealPlayer).slice(0, 5);

    return {
      playerIds: combined,
      isEstimated: combined.length > liveLineup.length,
    };
  }

  function replaceToken(text: string, token: string, replacement: string): string {
    const source = token.trim();
    const target = replacement.trim();
    if (!source || !target || source === target) {
      return text;
    }

    const escapedToken = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^A-Za-z0-9_-])(${escapedToken})(?=[^A-Za-z0-9_-]|$)`, "gi");
    return text.replace(pattern, (_match, prefix: string) => `${prefix}${target}`);
  }

  function prettifyInsightText(
    text: string,
    relatedTeamId?: string,
    relatedPlayerId?: string
  ): string {
    let formatted = text;

    const teamIdsToNormalize = new Set<string>([
      ...teams,
      ...rawTeamIds,
      state?.homeTeamId ?? "",
      state?.awayTeamId ?? "",
      state?.opponentTeamId ?? "",
      relatedTeamId ?? "",
    ].filter(Boolean));

    for (const teamId of teamIdsToNormalize) {
      formatted = replaceToken(formatted, teamId, displayTeamName(teamId));
    }

    if (relatedTeamId && relatedPlayerId) {
      formatted = replaceToken(
        formatted,
        relatedPlayerId,
        displayPlayerName(relatedTeamId, relatedPlayerId)
      );
    }

    for (const [playerId, playerName] of Object.entries(rosterLabels.playerNameById)) {
      formatted = replaceToken(formatted, playerId, playerName);
    }

    return formatted;
  }

  function formatInsightTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      ai_coaching: "AI Coaching",
      pre_game: "Pre-Game",
      foul_trouble: "Foul Trouble",
      foul_warning: "Foul Warning",
      team_foul_warning: "Team Fouls / Bonus",
      sub_suggestion: "Sub Suggestion",
      timeout_suggestion: "Timeout",
      hot_hand: "Hot Hand",
      ot_awareness: "Overtime",
      run_detection: "Run Alert",
      turnover_pressure: "Turnover Pressure",
      shot_profile: "Shot Profile",
    };
    if (labels[type]) return labels[type];

    return type
      .split("_")
      .filter(Boolean)
      .map((part) => {
        if (part.toLowerCase() === "ai") return "AI";
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(" ");
  }

  function getRuleInsightImportanceClass(insight: Insight): string {
    // High-urgency types always get high styling
    if (
      insight.type === "foul_warning" ||
      insight.type === "team_foul_warning" ||
      insight.type === "sub_suggestion" ||
      insight.type === "timeout_suggestion" ||
      insight.type === "ot_awareness"
    ) {
      return "insight-item-rule-high";
    }

    if (insight.confidence === "high") {
      return "insight-item-rule-high";
    }

    if (insight.confidence === "medium") {
      return "insight-item-rule-medium";
    }

    return "insight-item-rule-default";
  }

  function getRuleBadgeImportanceClass(insight: Insight): string {
    if (insight.confidence === "high") {
      return "insight-badge-rules-high";
    }

    if (insight.confidence === "medium") {
      return "insight-badge-rules-medium";
    }

    return "insight-badge-rules-default";
  }

  const leadersByTeam = useMemo(() => {
    return Object.fromEntries(
      teams.map((teamId) => {
        const canonId = canonicalTeamId(teamId);
        const td = aggregatedTeams[teamId] ?? aggregatedTeams[canonId];
        const players = Object.values(td?.playerStats ?? {});
        const scoringLeader = players
          .filter((player) => player.points > 0)
          .slice()
          .sort((left, right) => right.points - left.points || left.playerId.localeCompare(right.playerId))[0];
        const foulLeader = players
          .filter((player) => player.fouls > 0)
          .slice()
          .sort((left, right) => right.fouls - left.fouls || left.playerId.localeCompare(right.playerId))[0];

        return [teamId, { scoringLeader, foulLeader }];
      })
    ) as Record<
      string,
      {
        scoringLeader?: PlayerStats;
        foulLeader?: PlayerStats;
      }
    >;
  }, [aggregatedTeams, teams]);

  const coachedTeamId = useMemo(() => {
    if (setupNames.myTeamId) {
      return canonicalTeamId(setupNames.myTeamId);
    }

    // When myTeamId isn't in the URL, prefer the team whose starting lineup is
    // seeded in the game state — avoids defaulting to the opponent's (home) slot.
    const lineupEntry = Object.entries(state?.activeLineupsByTeam ?? {})
      .find(([, lineup]) => lineup.length > 0);
    if (lineupEntry) {
      return canonicalTeamId(lineupEntry[0]);
    }

    return setupNames.vcSide === "away" ? canonicalSideIds.awayId : canonicalSideIds.homeId;
  }, [canonicalSideIds.awayId, canonicalSideIds.homeId, setupNames.myTeamId, setupNames.vcSide, state?.activeLineupsByTeam]);

  const rotationContext = useMemo(() => {
    if (!coachedTeamId) {
      return null;
    }

    const teamId = coachedTeamId;
    const liveOnCourt = [...new Set(aggregatedTeams[teamId]?.activeLineup ?? [])].filter(Boolean);
    const playerStats = aggregatedTeams[teamId]?.playerStats ?? {};
    const rosterTeam = rosterTeams.find((team) => team.id === canonicalTeamId(teamId) || team.id === teamId);

    const activeByStats = Object.values(playerStats)
      .map((player) => ({
        playerId: player.playerId,
        activityScore: (
          player.points
          + player.fgAttempts
          + player.ftAttempts
          + player.reboundsOff
          + player.reboundsDef
          + player.assists
          + player.steals
          + player.blocks
          + player.turnovers
          + player.fouls
        )
      }))
      .filter((player) => player.activityScore > 0)
      .sort((left, right) => right.activityScore - left.activityScore)
      .map((player) => player.playerId);

    const rosterOrder = rosterTeam?.players.map((player) => player.id) ?? [];

    // Build team-level alias set so we never show a team ID as a player chip.
    const teamAliasSet = new Set<string>([
      ...Array.from(canonicalSideIds.homeAliases).map((s) => s.toLowerCase()),
      ...Array.from(canonicalSideIds.awayAliases).map((s) => s.toLowerCase()),
    ]);
    const isValidPlayerId = (id: string) => id && !teamAliasSet.has(id.toLowerCase());

    const onCourt = [...new Set([...liveOnCourt, ...activeByStats, ...rosterOrder])]
      .filter(isValidPlayerId)
      .slice(0, 5);
    const isEstimatedLineup = liveOnCourt.length < 5 && onCourt.length > liveOnCourt.length;

    const knownPlayerIds = new Set<string>([
      ...onCourt,
      ...Object.keys(playerStats).filter(isValidPlayerId),
      ...rosterOrder.filter(isValidPlayerId),
    ]);

    const bench = [...knownPlayerIds].filter((playerId) => !onCourt.includes(playerId));

    const watchNotes: RotationWatchNote[] = onCourt.flatMap((playerId) => {
      const stats = playerStats[playerId];
      if (!stats) {
        return [];
      }

      const notes: RotationWatchNote[] = [];
      if (stats.fouls >= 4) {
        notes.push({
          playerId,
          level: "high",
          reason: `Foul-out risk (${stats.fouls} fouls)`
        });
      } else if (stats.fouls === 3) {
        notes.push({
          playerId,
          level: "medium",
          reason: "Foul pressure (3 fouls)"
        });
      }

      if (stats.turnovers >= 3) {
        notes.push({
          playerId,
          level: "medium",
          reason: `${stats.turnovers} turnovers in current sample`
        });
      }

      return notes;
    });

    return {
      teamId,
      onCourt,
      bench,
      watchNotes,
      isEstimatedLineup,
      liveCount: liveOnCourt.length,
    };
  }, [aggregatedTeams, canonicalTeamId, coachedTeamId, rosterTeams]);

  const aiInsights = useMemo(
    () => insights.filter((insight) => insight.type === "ai_coaching"),
    [insights]
  );

  const rulesInsights = useMemo(
    () => insights.filter((insight) => insight.type !== "ai_coaching"),
    [insights]
  );

  const isOpeningInsightWindow = useMemo(() => {
    if (!state) {
      return false;
    }

    const eventCount = state.events.length;
    return state.currentPeriod === "Q1" && eventCount < 10;
  }, [state]);

  const hasGameStarted = (state?.events.length ?? 0) > 0;

  useEffect(() => {
    if (activePage !== "ai" || !gameId) {
      return;
    }

    if (!promptPreview) {
      void loadPromptPreview();
    }
  }, [activePage, gameId, promptPreview]);

  const boxScorePeriods = useMemo(() => {
    const periods = [...new Set((state?.events ?? []).map((event) => event.period))];
    const periodRank = (period: string): number => {
      if (period === "Q1") return 1;
      if (period === "Q2") return 2;
      if (period === "Q3") return 3;
      if (period === "Q4") return 4;
      const otMatch = /^OT(\d+)$/.exec(period);
      if (otMatch) return 4 + Number(otMatch[1]);
      return 99;
    };

    return periods.sort((left, right) => periodRank(left) - periodRank(right));
  }, [state?.events]);

  const boxScoreFilterOptions = useMemo(
    () => [
      { value: "game" as BoxScoreFilter, label: "Full Game" },
      { value: "first-half" as BoxScoreFilter, label: "1st Half" },
      { value: "second-half" as BoxScoreFilter, label: "2nd Half" },
      ...boxScorePeriods.map((period) => ({ value: period as BoxScoreFilter, label: period })),
    ],
    [boxScorePeriods]
  );

  const filteredBoxScoreEvents = useMemo(() => {
    const events = state?.events ?? [];
    if (boxScoreFilter === "game") {
      return events;
    }

    if (boxScoreFilter === "first-half") {
      return events.filter((event) => event.period === "Q1" || event.period === "Q2");
    }

    if (boxScoreFilter === "second-half") {
      return events.filter((event) => event.period === "Q3" || event.period === "Q4" || /^OT\d+$/.test(event.period));
    }

    return events.filter((event) => event.period === boxScoreFilter);
  }, [boxScoreFilter, state?.events]);

  const boxScoreByTeam = useMemo(() => {
    const byTeam: Record<string, { totals: BoxScoreTeamTotals; players: Record<string, BoxScorePlayerLine> }> = {};

    function ensureTeam(teamId: string) {
      byTeam[teamId] ??= { totals: emptyBoxScoreTotals(), players: {} };
      return byTeam[teamId];
    }

    function ensurePlayer(teamId: string, playerId: string) {
      const team = ensureTeam(teamId);
      team.players[playerId] ??= {
        ...emptyBoxScoreTotals(),
        playerId,
        teamId,
      };
      return team.players[playerId];
    }

    for (const event of filteredBoxScoreEvents) {
      const teamId = canonicalTeamId(event.teamId);
      const team = ensureTeam(teamId);

      switch (event.type) {
        case "shot_attempt": {
          team.totals.fgAttempts += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.fgAttempts += 1;

          if (event.made) {
            team.totals.fgMade += 1;
            team.totals.points += event.points;
            player.fgMade += 1;
            player.points += event.points;
          }
          break;
        }
        case "free_throw_attempt": {
          team.totals.ftAttempts += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.ftAttempts += 1;
          if (event.made) {
            team.totals.ftMade += 1;
            team.totals.points += 1;
            player.ftMade += 1;
            player.points += 1;
          }
          break;
        }
        case "rebound": {
          if (event.offensive) {
            team.totals.reboundsOff += 1;
          } else {
            team.totals.reboundsDef += 1;
          }
          const player = ensurePlayer(teamId, event.playerId);
          if (event.offensive) {
            player.reboundsOff += 1;
          } else {
            player.reboundsDef += 1;
          }
          break;
        }
        case "assist": {
          team.totals.assists += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.assists += 1;
          break;
        }
        case "steal": {
          team.totals.steals += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.steals += 1;
          break;
        }
        case "block": {
          team.totals.blocks += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.blocks += 1;
          break;
        }
        case "turnover": {
          team.totals.turnovers += 1;
          if (event.playerId) {
            const player = ensurePlayer(teamId, event.playerId);
            player.turnovers += 1;
          }
          break;
        }
        case "foul": {
          team.totals.fouls += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.fouls += 1;
          break;
        }
      }
    }

    for (const teamId of teams) {
      ensureTeam(teamId);
    }

    return byTeam;
  }, [canonicalTeamId, filteredBoxScoreEvents, teams]);

  const selectedVideoForResolution = useMemo(() => {
    const synced = videos.find((video) => video.status === "synced");
    return synced?.id ?? videos[0]?.id;
  }, [videos]);

  const aiSubSuggestionCards = useMemo(() => {
    const cards: AiSignalCard[] = [];

    for (const insight of [...aiInsights, ...rulesInsights]) {
      if (insight.type === "sub_suggestion" || /\bsub\b|lineup|rest/i.test(`${insight.message} ${insight.explanation}`)) {
        cards.push({
          id: `sub-${insight.id}`,
          title: prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId),
          detail: prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId),
          tone: insight.confidence === "high" ? "high" : "medium",
        });
      }
    }

    if (cards.length === 0 && rotationContext?.watchNotes.some((note) => note.level === "high")) {
      for (const note of rotationContext.watchNotes.filter((entry) => entry.level === "high").slice(0, 2)) {
        cards.push({
          id: `fallback-sub-${note.playerId}`,
          title: `Consider a sub for ${displayPlayerName(rotationContext.teamId, note.playerId)}`,
          detail: note.reason,
          tone: "high",
        });
      }
    }

    return cards.slice(0, 4);
  }, [aiInsights, displayPlayerName, prettifyInsightText, rotationContext, rulesInsights]);

  const aiFoulAlertCards = useMemo(() => {
    const cards: AiSignalCard[] = [];

    for (const insight of [...rulesInsights, ...aiInsights]) {
      if (["foul_warning", "foul_trouble", "team_foul_warning"].includes(insight.type) || /foul|bonus/i.test(`${insight.message} ${insight.explanation}`)) {
        cards.push({
          id: `foul-${insight.id}`,
          title: prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId),
          detail: prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId),
          tone: insight.confidence === "high" ? "high" : "medium",
        });
      }
    }

    return cards.slice(0, 5);
  }, [aiInsights, prettifyInsightText, rulesInsights]);

  const aiEfficiencyCards = useMemo(() => {
    const cards: AiSignalCard[] = [];

    for (const insight of [...rulesInsights, ...aiInsights]) {
      if (["hot_hand", "shot_profile"].includes(insight.type) || /efficient|hot hand|shooting|scoring/i.test(`${insight.message} ${insight.explanation}`)) {
        cards.push({
          id: `eff-${insight.id}`,
          title: prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId),
          detail: prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId),
          tone: insight.confidence === "high" ? "high" : "default",
        });
      }
    }

    if (coachedTeamId) {
      const efficientPlayers = Object.values(aggregatedTeams[coachedTeamId]?.playerStats ?? {})
        .filter((player) => player.fgAttempts >= 4 && player.fgMade / Math.max(player.fgAttempts, 1) >= 0.55)
        .sort((left, right) => right.points - left.points || right.fgMade - left.fgMade)
        .slice(0, 3);

      for (const player of efficientPlayers) {
        const fgPct = Math.round((player.fgMade / Math.max(player.fgAttempts, 1)) * 100);
        cards.push({
          id: `eff-live-${player.playerId}`,
          title: `${displayPlayerName(coachedTeamId, player.playerId)} is producing efficiently`,
          detail: `${player.points} pts on ${player.fgMade}/${player.fgAttempts} FG (${fgPct}%), plus ${player.assists} ast and ${player.reboundsOff + player.reboundsDef} reb.`,
          tone: player.points >= 12 ? "high" : "default",
        });
      }
    }

    return cards.slice(0, 5);
  }, [aggregatedTeams, aiInsights, coachedTeamId, displayPlayerName, prettifyInsightText, rulesInsights]);

  const aiQuickQuestions = useMemo(() => {
    if (aiChatSuggestions.length > 0) {
      return aiChatSuggestions;
    }

    return [
      "Who should we sub next and why?",
      "Which player is most efficient right now?",
      "Are we in team foul trouble soon?",
      "What should be our next coaching adjustment?",
    ];
  }, [aiChatSuggestions]);

  async function refreshAiBenchCalls() {
    if (!gameId || isRefreshingAiInsights) {
      return;
    }

    setIsRefreshingAiInsights(true);
    setAiRefreshError("");

    try {
      const query = new URLSearchParams({ force: "1" });
      const response = await fetch(`${apiBase}/games/${gameId}/insights?${query.toString()}`, {
        headers: apiKeyHeader()
      });

      if (!response.ok) {
        throw new Error(`Insight refresh failed with status ${response.status}`);
      }

      const payload = (await response.json()) as Insight[];
      setInsights(payload);
      setDashboardStatus("AI bench calls refreshed");
    } catch {
      setAiRefreshError("Could not refresh AI bench calls right now.");
    } finally {
      setIsRefreshingAiInsights(false);
    }
  }

  async function resolveEventClip(eventId: string, period: Period, gameClockSeconds: number) {
    if (!selectedVideoForResolution) {
      setDashboardStatus("No registered video available for clip resolution");
      return;
    }

    const query = new URLSearchParams({
      period: String(period),
      gameClockSeconds: String(gameClockSeconds)
    });

    const response = await fetch(
      `${videoBase}/games/${gameId}/videos/${selectedVideoForResolution}/resolve?${query.toString()}`,
      { headers: apiKeyHeader() }
    );

    if (!response.ok) {
      setDashboardStatus("Could not resolve clip time for this event");
      return;
    }

    const payload = (await response.json()) as VideoResolution;
    setEventClipMap((current) => ({ ...current, [eventId]: payload }));
    setDashboardStatus(`Resolved clip time for event ${eventId}`);
    // Seek the in-page video player to the resolved time when source is loaded
    if (videoRef.current) {
      videoRef.current.currentTime = payload.resolvedVideoSecond;
      void videoRef.current.play().catch(() => { /* autoplay blocked */ });
    }
  }

  async function addVideoAsset() {
    const response = await fetch(`${videoBase}/games/${gameId}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...apiKeyHeader() },
      body: JSON.stringify({ id: videoId, filename })
    });

    if (!response.ok) {
      setDashboardStatus("Video registration failed");
      return;
    }

    const payload = (await response.json()) as VideoAsset;
    setVideos((current) => [payload, ...current.filter((video) => video.id !== payload.id)]);
    setAnchorVideoId(payload.id);
    setDashboardStatus("Video asset registered");
  }

  async function addSyncAnchor() {
    const response = await fetch(`${videoBase}/games/${gameId}/sync-anchors`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...apiKeyHeader() },
      body: JSON.stringify({
        id: `anchor-${Date.now()}`,
        videoId: anchorVideoId,
        eventType: "tipoff",
        period: "Q1",
        gameClockSeconds: getPeriodDurationSeconds("Q1"),
        videoSecond: Number(videoSecond)
      })
    });

    if (!response.ok) {
      setDashboardStatus("Sync anchor failed");
      return;
    }

    const payload = (await response.json()) as SyncAnchor;
    setAnchors((current) => [payload, ...current]);
    setVideos((current) =>
      current.map((video) =>
        video.id === payload.videoId ? { ...video, status: "synced" } : video
      )
    );
    setDashboardStatus("Video sync anchor saved");
  }

  return (
    <>
      <nav className="coach-navbar">
        <div className="coach-nav-container">
          <div className="coach-nav-logo">Bench IQ</div>
          <ul className="coach-nav-links">
            <li><button className={activePage === "live" ? "nav-active" : ""} onClick={() => setActivePage("live")}>Live</button></li>
            <li><button className={activePage === "ai" ? "nav-active" : ""} onClick={() => setActivePage("ai")}>AI</button></li>
            <li><button className={activePage === "film" ? "nav-active" : ""} onClick={() => setActivePage("film")}>Film</button></li>
            <li><button className={activePage === "roster" ? "nav-active" : ""} onClick={() => setActivePage("roster")}>Roster</button></li>
            <li><button className={activePage === "settings" ? "nav-active" : ""} onClick={() => setActivePage("settings")}>Settings</button></li>
            <li><a href={operatorConsoleUrl} className="coach-nav-ext-link">Score Operator</a></li>
            <li><a href={statsBase} className="coach-nav-ext-link" target="_blank" rel="noopener noreferrer">Stats ↗</a></li>
          </ul>
          <div className={`connection-pill ${deviceConnected ? "online" : "offline"}`} style={{ flexShrink: 0 }}>
            {deviceConnected ? "Device live" : serverConnected ? "Waiting" : "Offline"}
          </div>
        </div>
      </nav>

    <div className="page">
      <header className="header card hero-card">
        <div>
          <p className="eyebrow">Bench Intelligence</p>
          <h1>Coach Dashboard</h1>
          <p>{dashboardStatus}</p>
        </div>
        <div className="header-controls">
          <label>
            Device ID
            <input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} />
          </label>
          <div className="connection-pill">
            {state ? `Current period ${state.currentPeriod}` : "Waiting for period state"}
          </div>
          <div className={`connection-pill ${deviceConnected ? "online" : "offline"}`}>
            {deviceConnected ? "Device connected" : (serverConnected ? "Waiting for device" : "Server offline")}
          </div>
        </div>
      </header>

      {activePage === "live" && <>
      <section className="card">
        <h2>Scoreboard</h2>
        {teams.length === 0 ? <p>No live game state yet.</p> : null}
        <div className="scoreboard">
          {teams.map((teamId, index) => {
            const scoreboardLineup = getScoreboardLineup(teamId);
            const teamColor = teamColorById[canonicalTeamId(teamId)];
            // Fall back to canonical-keyed bucket when teamId is a side-alias.
            const td = aggregatedTeams[teamId] ?? aggregatedTeams[canonicalTeamId(teamId)];
            return (
              <article
                key={teamId}
                className={`score-item ${index === 0 ? "score-item-home" : "score-item-away"}`}
                style={teamColor ? {
                  background: `linear-gradient(180deg, ${teamColor}40, ${teamColor}18)`,
                  borderColor: `${teamColor}99`,
                } : undefined}
              >
                <header className="score-item-header">
                  <div className="score-item-title">
                    <h3>{displayTeamName(teamId)}</h3>
                    {index === 0 && <span className="your-team-badge">YOUR TEAM</span>}
                  </div>
                  <p className="score">{td?.score ?? 0}</p>
                </header>

                <div className="score-meta-grid">
                  <p className="metric-row"><span>FGM / FGA</span><strong>{td?.teamStats.shooting.fgMade ?? 0}/{td?.teamStats.shooting.fgAttempts ?? 0}</strong></p>
                  <p className="metric-row"><span>FTM / FTA</span><strong>{td?.teamStats.shooting.ftMade ?? 0}/{td?.teamStats.shooting.ftAttempts ?? 0}</strong></p>
                  <p className="metric-row"><span>Possessions</span><strong>{td?.possessions ?? 0}</strong></p>
                  <p className="metric-row"><span>Turnovers</span><strong>{td?.teamStats.turnovers ?? 0}</strong></p>
                  <p className="metric-row"><span>Team fouls</span><strong>{td?.teamStats.fouls ?? 0}</strong></p>
                  <p className="metric-row"><span>Bonus</span><strong>{formatBonusIndicator(td?.bonus ?? false)}</strong></p>
                  <p className="metric-row"><span>Subs</span><strong>{td?.teamStats.substitutions ?? 0}</strong></p>
                  <p className="metric-row metric-wrap">
                    <span>Active lineup</span>
                    <strong>
                      {scoreboardLineup.playerIds.length > 0
                        ? `${scoreboardLineup.playerIds.map((playerId) => displayPlayerName(teamId, playerId)).join(", ")}${scoreboardLineup.isEstimated ? " (estimated)" : ""}`
                        : "not set"}
                    </strong>
                  </p>
                  <p className="metric-row metric-wrap">
                    <span>Top scorer</span>
                    <strong>
                      {leadersByTeam[teamId]?.scoringLeader
                        ? `${displayPlayerName(teamId, leadersByTeam[teamId].scoringLeader.playerId)} (${leadersByTeam[teamId].scoringLeader?.points})`
                        : "none"}
                    </strong>
                  </p>
                  <p className="metric-row metric-wrap">
                    <span>Foul trouble</span>
                    <strong>
                      {leadersByTeam[teamId]?.foulLeader
                        ? formatFoulTroubleLabel(
                          displayPlayerName(teamId, leadersByTeam[teamId].foulLeader.playerId),
                          leadersByTeam[teamId].foulLeader.fouls
                        )
                        : "none"}
                    </strong>
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card box-score-card">
        <div className="box-score-header">
          <h2>Box Score</h2>
          <div className="box-score-filter-group" aria-label="Box score filter">
            {boxScoreFilterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`box-score-filter-chip${boxScoreFilter === option.value ? " box-score-filter-chip-active" : ""}`}
                onClick={() => setBoxScoreFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {teams.map((teamId) => {
          const teamTotals = boxScoreByTeam[teamId]?.totals ?? emptyBoxScoreTotals();
          const teamIdLower = teamId.toLowerCase();
          const playerLines = Object.values(boxScoreByTeam[teamId]?.players ?? {})
            .filter((line) => {
              // Skip team-level placeholder IDs that appear when no specific player is selected.
              const nId = line.playerId.toLowerCase();
              return nId !== "home" && nId !== "away"
                && nId !== "home-team" && nId !== "away-team"
                && nId !== "team-home" && nId !== "team-away"
                && nId !== teamIdLower;
            })
            .map((line) => {
              // Search all roster teams by player ID to handle canonical team ID mismatches.
              const rosterPlayer = rosterTeams.flatMap((t) => t.players).find((p) => p.id === line.playerId);
              return {
                ...line,
                name: rosterPlayer?.name ?? displayPlayerName(teamId, line.playerId),
                number: rosterPlayer?.number ?? "",
              };
            })
            .sort((left, right) => right.points - left.points || left.name.localeCompare(right.name));

          return (
            <section key={`box-${teamId}`} className="box-score-team-section">
              <h3>{displayTeamName(teamId)}</h3>
              <div className="box-score-table-wrap">
                <table className="box-score-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>PTS</th>
                      <th>FG</th>
                      <th>FT</th>
                      <th>REB</th>
                      <th>AST</th>
                      <th>STL</th>
                      <th>BLK</th>
                      <th>TO</th>
                      <th>PF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerLines.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="box-score-empty">
                          No tracked stats for this filter yet.
                        </td>
                      </tr>
                    ) : (
                      playerLines.map((line) => {
                        const rebounds = line.reboundsDef + line.reboundsOff;
                        const playerLabel = line.number ? `${line.number} ${line.name}` : line.name;
                        return (
                          <tr key={`${teamId}-${line.playerId}`}>
                            <td>{playerLabel}</td>
                            <td>{line.points}</td>
                            <td>{line.fgMade}-{line.fgAttempts}</td>
                            <td>{line.ftMade}-{line.ftAttempts}</td>
                            <td>{rebounds}</td>
                            <td>{line.assists}</td>
                            <td>{line.steals}</td>
                            <td>{line.blocks}</td>
                            <td>{line.turnovers}</td>
                            <td>{line.fouls}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Team Totals</td>
                      <td>{teamTotals.points}</td>
                      <td>{teamTotals.fgMade}-{teamTotals.fgAttempts}</td>
                      <td>{teamTotals.ftMade}-{teamTotals.ftAttempts}</td>
                      <td>{teamTotals.reboundsDef + teamTotals.reboundsOff}</td>
                      <td>{teamTotals.assists}</td>
                      <td>{teamTotals.steals}</td>
                      <td>{teamTotals.blocks}</td>
                      <td>{teamTotals.turnovers}</td>
                      <td>{teamTotals.fouls}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          );
        })}
      </section>

      <section className="card">
        <h2>Live Insights</h2>
        {!hasGameStarted ? (
          <p className="insight-context-note">Game has not started yet. Insights will appear once play begins.</p>
        ) : null}
        {hasGameStarted && isOpeningInsightWindow ? (
          <p className="insight-context-note">Opening sample: early possessions can create noisy reads.</p>
        ) : null}
        {hasGameStarted && insights.length === 0 ? (
          <p className="insight-context-note">No live calls yet. Capture a few more possessions.</p>
        ) : null}
        {aiInsights.length > 0 || (hasGameStarted && gameId) || aiRefreshError ? (
          <>
            <div className="insight-subhead-row">
              <h3 className="insight-subhead">AI Bench Calls</h3>
              <button
                className="secondary insight-refresh-button"
                onClick={() => void refreshAiBenchCalls()}
                disabled={!gameId || isRefreshingAiInsights}
              >
                {isRefreshingAiInsights ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            {aiRefreshError ? <p className="insight-context-note insight-context-note-error">{aiRefreshError}</p> : null}
            {aiInsights.length > 0 ? (
              <div className="insight-list">
                {aiInsights.map((insight) => (
                  <article key={insight.id} className="insight-item insight-item-ai">
                    <div className="insight-title-row">
                      <h3>{formatInsightTypeLabel(insight.type)}</h3>
                      <span className="insight-badge insight-badge-ai">AI</span>
                    </div>
                    <p>{prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId)}</p>
                    <small>{prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId)}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="insight-context-note">Refresh AI bench calls to load the latest suggestions.</p>
            )}
          </>
        ) : null}

        {rulesInsights.filter(i => ["sub_suggestion", "timeout_suggestion", "foul_warning", "team_foul_warning", "ot_awareness"].includes(i.type)).length > 0 ? (
          <>
            <h3 className="insight-subhead">Urgent Coaching Calls</h3>
            <div className="insight-list">
              {rulesInsights
                .filter(i => ["sub_suggestion", "timeout_suggestion", "foul_warning", "team_foul_warning", "ot_awareness"].includes(i.type))
                .map((insight) => (
                  <article
                    key={insight.id}
                    className={`insight-item ${getRuleInsightImportanceClass(insight)}`}
                  >
                    <div className="insight-title-row">
                      <h3>{formatInsightTypeLabel(insight.type)}</h3>
                      <span className={`insight-badge insight-badge-rules ${getRuleBadgeImportanceClass(insight)}`}>
                        RULE
                      </span>
                    </div>
                    <p>{prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId)}</p>
                    <small>{prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId)}</small>
                  </article>
                ))}
            </div>
          </>
        ) : null}

        {rulesInsights.filter(i => !["sub_suggestion", "timeout_suggestion", "foul_warning", "team_foul_warning", "ot_awareness"].includes(i.type)).length > 0 ? (
          <>
            <h3 className="insight-subhead">System Alerts</h3>
            <div className="insight-list">
              {rulesInsights
                .filter(i => !["sub_suggestion", "timeout_suggestion", "foul_warning", "team_foul_warning", "ot_awareness"].includes(i.type))
                .map((insight) => (
                  <article
                    key={insight.id}
                    className={`insight-item ${getRuleInsightImportanceClass(insight)}`}
                  >
                    <div className="insight-title-row">
                      <h3>{formatInsightTypeLabel(insight.type)}</h3>
                      <span className={`insight-badge insight-badge-rules ${getRuleBadgeImportanceClass(insight)}`}>
                        RULE
                      </span>
                    </div>
                    <p>{prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId)}</p>
                    <small>{prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId)}</small>
                  </article>
                ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="card">
        <h2>On-Court Rotation</h2>
        {!rotationContext ? <p>No lineup data yet.</p> : null}
        <div className="rotation-grid">
          {rotationContext ? (
            <article key={rotationContext.teamId} className="film-card rotation-card">
              <h3>{displayTeamName(rotationContext.teamId)}</h3>

              <p className="rotation-label">Currently in game</p>
              {rotationContext.onCourt.length === 0 ? (
                <p className="text-muted">No active lineup reported.</p>
              ) : (
                <>
                  {rotationContext.isEstimatedLineup ? (
                    <p className="rotation-estimate-note">
                      Live lineup feed currently has {rotationContext.liveCount}. Filled remaining spots from activity/roster context.
                    </p>
                  ) : null}
                  <div className="rotation-chip-row">
                    {rotationContext.onCourt.map((playerId) => (
                      <span key={`${rotationContext.teamId}-on-${playerId}`} className="rotation-chip rotation-chip-on">
                        {displayPlayerName(rotationContext.teamId, playerId)}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <p className="rotation-label">Sub context</p>
              {rotationContext.watchNotes.length === 0 ? (
                <p className="text-muted">No urgent substitution pressure detected.</p>
              ) : (
                <div className="stack-list">
                  {rotationContext.watchNotes.map((note) => (
                    <p key={`${rotationContext.teamId}-${note.playerId}-${note.reason}`} className={`rotation-note rotation-note-${note.level}`}>
                      <strong>{displayPlayerName(rotationContext.teamId, note.playerId)}:</strong> {note.reason}
                    </p>
                  ))}
                </div>
              )}

              <p className="rotation-label">Available bench</p>
              {rotationContext.bench.length === 0 ? (
                <p className="text-muted">No bench list available from roster/state.</p>
              ) : (
                <p className="text-muted">{rotationContext.bench.map((playerId) => displayPlayerName(rotationContext.teamId, playerId)).join(", ")}</p>
              )}
            </article>
          ) : null}
        </div>
      </section>

      </>
      }

      {activePage === "ai" && <>
      <section className="card ai-page-hero">
        <div>
          <p className="eyebrow">Game Intelligence</p>
          <h2>AI Bench Assistant</h2>
          <p className="text-muted">Live Q&amp;A, sub recommendations, foul danger, and hot-hand context powered by the current game plus previous-game player trends.</p>
        </div>
        <div className="ai-page-actions">
          <button
            className="secondary insight-refresh-button"
            onClick={() => void refreshAiBenchCalls()}
            disabled={!gameId || isRefreshingAiInsights}
          >
            {isRefreshingAiInsights ? "Refreshing..." : "Refresh AI Insights"}
          </button>
          <button className="secondary" onClick={() => void loadPromptPreview()} disabled={!gameId}>
            Refresh Context
          </button>
        </div>
      </section>

      <section className="ai-page-layout">
        <div className="card ai-chat-card">
          <div className="ai-chat-header">
            <div>
              <h2>In-Game Chat</h2>
              <p className="text-muted">Ask what adjustment to make right now, who should sub, which player is efficient, or what foul risk is building.</p>
            </div>
          </div>

          <div className="ai-quick-question-row">
            {aiQuickQuestions.map((question) => (
              <button
                key={question}
                className="secondary ai-quick-question"
                onClick={() => void sendAiChat(question)}
                disabled={!gameId || isSendingAiChat}
              >
                {question}
              </button>
            ))}
          </div>

          <div className="ai-chat-thread">
            {aiChatMessages.length === 0 ? (
              <p className="ai-chat-empty">No chat yet. Start with a question about subs, foul trouble, efficiency, or late-game decisions.</p>
            ) : (
              aiChatMessages.map((message) => (
                <article key={message.id} className={`ai-chat-bubble ai-chat-bubble-${message.role}`}>
                  <div className="ai-chat-bubble-label">{message.role === "assistant" ? "Assistant" : "Coach"}</div>
                  <p>{message.content}</p>
                </article>
              ))
            )}
          </div>

          <form
            className="ai-chat-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void sendAiChat();
            }}
          >
            <textarea
              value={aiChatInput}
              onChange={(event) => setAiChatInput(event.target.value)}
              placeholder="Ask AI a live coaching question..."
            />
            <div className="ai-chat-compose-row">
              <p className="text-muted ai-chat-status">{aiChatStatus}</p>
              <button type="submit" disabled={!gameId || isSendingAiChat}>
                {isSendingAiChat ? "Asking..." : "Ask AI"}
              </button>
            </div>
          </form>
        </div>

        <div className="ai-page-sidebar">
          <section className="card ai-signal-card-wrap">
            <h2>Suggested Subs</h2>
            {aiSubSuggestionCards.length === 0 ? (
              <p className="text-muted">No immediate sub recommendation right now.</p>
            ) : (
              <div className="ai-signal-list">
                {aiSubSuggestionCards.map((card) => (
                  <article key={card.id} className={`ai-signal-card ai-signal-card-${card.tone}`}>
                    <h3>{card.title}</h3>
                    <p>{card.detail}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card ai-signal-card-wrap">
            <h2>Foul And Bonus Alerts</h2>
            {aiFoulAlertCards.length === 0 ? (
              <p className="text-muted">No major foul or bonus pressure right now.</p>
            ) : (
              <div className="ai-signal-list">
                {aiFoulAlertCards.map((card) => (
                  <article key={card.id} className={`ai-signal-card ai-signal-card-${card.tone}`}>
                    <h3>{card.title}</h3>
                    <p>{card.detail}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card ai-signal-card-wrap">
            <h2>Hot Hand And Efficiency</h2>
            {aiEfficiencyCards.length === 0 ? (
              <p className="text-muted">No clear efficiency edge yet.</p>
            ) : (
              <div className="ai-signal-list">
                {aiEfficiencyCards.map((card) => (
                  <article key={card.id} className={`ai-signal-card ai-signal-card-${card.tone}`}>
                    <h3>{card.title}</h3>
                    <p>{card.detail}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card ai-signal-card-wrap">
            <h2>Historical Context</h2>
            <p className="text-muted">{promptPreviewStatus}</p>
            <div className="ai-history-context">
              {historicalPromptContext || "Historical team and player context will appear here after the AI context refreshes."}
            </div>
          </section>
        </div>
      </section>
      </>}

      {activePage === "film" &&
      <section className="card film-grid">
        <div>
          <h2>Film Sync</h2>
          <p>Register uploaded game film and place manual sync anchors against NFHS game timing.</p>

          {/* Video player — shown when a source URL is provided */}
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label style={{ gridColumn: "1 / -1" }}>
              Video Source URL
              <input
                placeholder="Paste a video URL or file:// path…"
                value={videoSrcUrl}
                onChange={(e) => setVideoSrcUrl(e.target.value)}
              />
            </label>
          </div>
          {videoSrcUrl && (
            <video
              ref={videoRef}
              src={videoSrcUrl}
              controls
              style={{ width: "100%", borderRadius: 8, marginBottom: 16, background: "#000" }}
            />
          )}

          <div className="form-grid">
            <label>
              Video ID
              <input value={videoId} onChange={(event) => setVideoId(event.target.value)} />
            </label>
            <label>
              Filename
              <input value={filename} onChange={(event) => setFilename(event.target.value)} />
            </label>
            <button onClick={() => void addVideoAsset()}>Register Video</button>
          </div>

          <div className="form-grid sync-grid">
            <label>
              Anchor Video ID
              <input
                value={anchorVideoId}
                onChange={(event) => setAnchorVideoId(event.target.value)}
              />
            </label>
            <label>
              Video Second
              <input value={videoSecond} onChange={(event) => setVideoSecond(event.target.value)} />
            </label>
            <button className="teal" onClick={() => void addSyncAnchor()}>
              Save Q1 Tipoff Anchor
            </button>
          </div>
        </div>

        <div className="film-columns">
          <div>
            <h3>Videos</h3>
            {videos.length === 0 ? <p>No video assets yet.</p> : null}
            <div className="stack-list">
              {videos.map((video) => (
                <article key={video.id} className="film-card">
                  <strong>{video.filename}</strong>
                  <p>{video.id}</p>
                  <span className={`status-tag ${video.status}`}>{video.status}</span>
                </article>
              ))}
            </div>
          </div>

          <div>
            <h3>Sync Anchors</h3>
            {anchors.length === 0 ? <p>No anchors saved yet.</p> : null}
            <div className="stack-list">
              {anchors.map((anchor) => (
                <article key={anchor.id} className="film-card">
                  <strong>{anchor.eventType.replaceAll("_", " ")}</strong>
                  <p>{anchor.videoId}</p>
                  <small>{formatDashboardAnchorSummary(anchor)}</small>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3>Recent Events</h3>
          <div className="stack-list">
            {(state?.events ?? []).slice(-8).reverse().map((event) => (
              <article key={event.id} className="film-card event-card">
                <div>
                  <strong>
                    #{event.sequence} {event.type.replaceAll("_", " ")}
                  </strong>
                  <p>{formatDashboardEventMeta({
                    teamId: displayTeamName(event.teamId),
                    period: event.period,
                    clockSecondsRemaining: event.clockSecondsRemaining,
                  })}</p>
                  {eventClipMap[event.id] ? (
                    <small>
                      Clip at {formatDashboardClock(eventClipMap[event.id].resolvedVideoSecond)} (video {eventClipMap[event.id].videoId})
                    </small>
                  ) : null}
                </div>
                <button
                  className="teal"
                  onClick={() =>
                    void resolveEventClip(event.id, event.period, event.clockSecondsRemaining)
                  }
                >
                  Clip
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>
      }

      {/* ── Roster Builder ─────────────────────────────────────────────── */}
      {activePage === "roster" &&
      <section className="card">
        <div className="roster-header-row">
          <div>
            <h2>Roster Builder</h2>
            <p className="text-muted" style={{ marginTop: "0.25rem", fontSize: "0.85rem" }}>
              Teams created here are shared with the Operator Console and all other apps automatically.
            </p>
          </div>
          <div className="roster-actions">
            <button className="secondary" onClick={exportRoster}>Export JSON</button>
            <label className="btn-import secondary">
              Import JSON
              <input
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={(e) => { if (e.target.files?.[0]) importRoster(e.target.files[0]); e.target.value = ""; }}
              />
            </label>
            <button onClick={() => { setShowNewTeamForm(true); setExpandedTeamId(null); }}>+ New Team</button>
          </div>
        </div>

        {rosterTeams.length === 0 && !showNewTeamForm && (
          <p className="text-muted" style={{ marginTop: "0.75rem" }}>
            No teams yet — click <strong>+ New Team</strong> or <strong>Import JSON</strong> to get started.
          </p>
        )}

        {showNewTeamForm && (
          <div className="roster-new-team-form form-grid">
            <label>
              Team Name
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g. Warriors"
                onKeyDown={(e) => e.key === "Enter" && addTeam()}
              />
            </label>
            <label>
              Abbreviation
              <input
                value={newTeamAbbr}
                onChange={(e) => setNewTeamAbbr(e.target.value)}
                placeholder="e.g. WAR"
                maxLength={4}
              />
            </label>
            <label>
              Team Color
              <input
                type="color"
                value={newTeamColor}
                onChange={(e) => setNewTeamColor(e.target.value)}
              />
            </label>
            <button onClick={addTeam}>Create Team</button>
            <button className="secondary" onClick={() => { setShowNewTeamForm(false); setNewTeamName(""); setNewTeamAbbr(""); setNewTeamColor("#4f8cff"); }}>
              Cancel
            </button>
          </div>
        )}

        <div className="roster-team-list">
          {rosterTeams.map((team) => (
            <div key={team.id} className="roster-team-card">
              <div className="roster-team-header">
                <div className="roster-team-identity">
                  <strong className="roster-team-name">{team.name}</strong>
                  <span className="roster-abbr" style={{ borderColor: team.teamColor ?? undefined, color: team.teamColor ?? undefined }}>{team.abbreviation}</span>
                  {team.teamColor ? <span className="roster-team-color-swatch" style={{ background: team.teamColor }} aria-hidden="true" /> : null}
                  <span className="text-dim">{team.players.length} player{team.players.length !== 1 ? "s" : ""}</span>
                  {team.coachStyle ? <span className="roster-coach-style-pill">Coach Style Saved</span> : null}
                </div>
                <div className="roster-team-btns">
                  <button
                    className="secondary"
                    onClick={() => {
                      setExpandedTeamId(expandedTeamId === team.id ? null : team.id);
                      setEditingPlayerId(null);
                      setEditPlayerDraft(null);
                      setAddingPlayerForTeam(null);
                    }}
                  >
                    {expandedTeamId === team.id ? "▲ Collapse" : "▼ Edit Roster"}
                  </button>
                  <button className="secondary danger-btn" onClick={() => removeTeam(team.id)}>
                    Remove
                  </button>
                </div>
              </div>

              {expandedTeamId === team.id && (
                <div className="roster-players-area">
                  <label className="roster-team-note-field">
                    Team Color
                    <input
                      className="roster-inline-input"
                      type="color"
                      value={team.teamColor ?? "#4f8cff"}
                      onChange={(event) => updateTeamColor(team.id, event.target.value)}
                      style={{ width: "4.5rem", padding: "0.25rem" }}
                    />
                  </label>
                  <label className="roster-team-note-field">
                    Coaching Style For AI
                    <textarea
                      className="roster-team-textarea"
                      defaultValue={team.coachStyle ?? ""}
                      placeholder="Example: We want to play fast, pressure the ball, and trust our bench in second-quarter runs."
                      onBlur={(event) => {
                        if ((team.coachStyle ?? "") !== event.target.value) {
                          updateTeamCoachStyle(team.id, event.target.value);
                        }
                      }}
                    />
                  </label>
                  {team.players.length === 0 && (
                    <p className="text-dim" style={{ marginBottom: "0.5rem" }}>No players yet.</p>
                  )}
                  <table className="roster-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Pos</th>
                        <th>Role</th>
                        <th>Height</th>
                        <th>Grade</th>
                        <th>AI Context</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.players.map((player) =>
                        editingPlayerId === player.id && editPlayerDraft ? (
                          <tr key={player.id} className="roster-row-edit">
                            <td><input className="roster-inline-input" value={editPlayerDraft.number} onChange={(e) => setEditPlayerDraft({ ...editPlayerDraft, number: e.target.value })} style={{ width: "3.5rem" }} /></td>
                            <td><input className="roster-inline-input" value={editPlayerDraft.name} onChange={(e) => setEditPlayerDraft({ ...editPlayerDraft, name: e.target.value })} style={{ width: "100%" }} /></td>
                            <td><select className="roster-inline-input" value={editPlayerDraft.position} onChange={(e) => setEditPlayerDraft({ ...editPlayerDraft, position: e.target.value })}>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></td>
                            <td><input className="roster-inline-input" value={editPlayerDraft.role ?? ""} onChange={(e) => setEditPlayerDraft({ ...editPlayerDraft, role: e.target.value || undefined })} style={{ width: "8rem" }} placeholder="Bench" list="roster-role-options" /></td>
                            <td><input className="roster-inline-input" value={editPlayerDraft.height ?? ""} onChange={(e) => setEditPlayerDraft({ ...editPlayerDraft, height: e.target.value || undefined })} style={{ width: "4.5rem" }} placeholder={"6'2\""} /></td>
                            <td><input className="roster-inline-input" value={editPlayerDraft.grade ?? ""} onChange={(e) => setEditPlayerDraft({ ...editPlayerDraft, grade: e.target.value || undefined })} style={{ width: "3rem" }} placeholder="11" /></td>
                            <td><input className="roster-inline-input" value={editPlayerDraft.notes ?? ""} onChange={(e) => setEditPlayerDraft({ ...editPlayerDraft, notes: e.target.value || undefined })} style={{ width: "100%" }} placeholder="Minutes cap, ankle soreness, spark off bench" /></td>
                            <td className="roster-row-actions">
                              <button style={{ padding: "0.35rem 0.65rem", minHeight: 0, fontSize: "0.8rem" }} onClick={() => saveEditedPlayer(team.id)}>Save</button>
                              <button className="secondary" style={{ padding: "0.35rem 0.65rem", minHeight: 0, fontSize: "0.8rem" }} onClick={() => { setEditingPlayerId(null); setEditPlayerDraft(null); }}>✕</button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={player.id} className="roster-row">
                            <td><strong>#{player.number}</strong></td>
                            <td>{player.name}</td>
                            <td><span className="pos-badge">{player.position}</span></td>
                            <td className="text-dim">{player.role ?? "—"}</td>
                            <td className="text-dim">{player.height ?? "—"}</td>
                            <td className="text-dim">{player.grade ? `Gr ${player.grade}` : "—"}</td>
                            <td className="text-dim roster-notes-cell">{player.notes ?? "—"}</td>
                            <td className="roster-row-actions">
                              <button className="secondary" style={{ padding: "0.3rem 0.6rem", minHeight: 0, fontSize: "0.78rem" }} onClick={() => { setEditingPlayerId(player.id); setEditPlayerDraft({ ...player }); }}>Edit</button>
                              <button className="secondary danger-btn" style={{ padding: "0.3rem 0.6rem", minHeight: 0, fontSize: "0.78rem" }} onClick={() => removePlayer(team.id, player.id)}>✕</button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>

                  {addingPlayerForTeam === team.id ? (
                    <div className="roster-add-player-form form-grid" style={{ marginTop: "0.75rem" }}>
                      <label>Jersey #<input value={newPlayerNum} onChange={(e) => setNewPlayerNum(e.target.value)} placeholder="23" /></label>
                      <label>Name<input value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Player Name" onKeyDown={(e) => e.key === "Enter" && addPlayer(team.id)} /></label>
                      <label>Position<select value={newPlayerPos} onChange={(e) => setNewPlayerPos(e.target.value)}>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></label>
                      <label>Role<input value={newPlayerRole} onChange={(e) => setNewPlayerRole(e.target.value)} placeholder="Bench" list="roster-role-options" /></label>
                      <label>Height<input value={newPlayerHeight} onChange={(e) => setNewPlayerHeight(e.target.value)} placeholder={"6'2\""} /></label>
                      <label>Grade<input value={newPlayerGrade} onChange={(e) => setNewPlayerGrade(e.target.value)} placeholder="11" /></label>
                      <label style={{ gridColumn: "1 / -1" }}>AI Context / Notes<input value={newPlayerNotes} onChange={(e) => setNewPlayerNotes(e.target.value)} placeholder="Injury status, matchup notes, minutes cap, confidence notes" /></label>
                      <button onClick={() => addPlayer(team.id)}>Add Player</button>
                      <button className="secondary" onClick={() => setAddingPlayerForTeam(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="secondary" style={{ marginTop: "0.75rem", width: "100%" }} onClick={() => { setAddingPlayerForTeam(team.id); setNewPlayerNum(""); setNewPlayerName(""); setNewPlayerPos("PG"); setNewPlayerRole("Bench"); setNewPlayerHeight(""); setNewPlayerGrade(""); setNewPlayerNotes(""); }}>+ Add Player</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <datalist id="roster-role-options">
          {ROLE_OPTIONS.map((role) => <option key={role} value={role} />)}
        </datalist>
      </section>
      }

      {activePage === "settings" &&
      <section className="card">
        <div className="settings-header-row">
          <div>
            <h2>Coach AI Settings</h2>
            <p className="text-muted">Customize how live coaching insights are generated for this game.</p>
          </div>
          <div className="settings-header-actions">
            <button className="secondary" onClick={() => void loadPromptPreview()}>Show Current Prompt</button>
            <button onClick={() => void saveAiSettings()}>Save AI Settings</button>
          </div>
        </div>

        <p className="settings-status text-muted">{aiSettingsStatus}</p>

        <div className="form-grid">
          <label style={{ gridColumn: "1 / -1" }}>
            Team Playing Style
            <textarea
              className="settings-textarea"
              value={aiSettingsDraft.playingStyle}
              onChange={(event) => setAiSettingsDraft((current) => ({ ...current, playingStyle: event.target.value }))}
              placeholder="Example: We play fast in transition, pressure passing lanes, and prioritize paint touches."
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Team Notes and Context
            <textarea
              className="settings-textarea"
              value={aiSettingsDraft.teamContext}
              onChange={(event) => setAiSettingsDraft((current) => ({ ...current, teamContext: event.target.value }))}
              placeholder="Anything a coach wants AI to remember: player limits, matchup concerns, depth, who can handle pressure, etc."
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Custom Prompt Modification
            <textarea
              className="settings-textarea"
              value={aiSettingsDraft.customPrompt}
              onChange={(event) => setAiSettingsDraft((current) => ({ ...current, customPrompt: event.target.value }))}
              placeholder="Custom instruction for AI output style or priorities."
            />
          </label>
        </div>

        <h3 style={{ marginTop: "1rem" }}>Focus Insight Types</h3>
        <div className="settings-chip-grid">
          {AI_FOCUS_OPTIONS.map((option) => {
            const active = aiSettingsDraft.focusInsights.includes(option.id);
            return (
              <button
                key={option.id}
                className={`settings-chip ${active ? "settings-chip-active" : "settings-chip-inactive"}`}
                onClick={() => toggleFocusInsight(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="text-muted" style={{ marginTop: "1rem" }}>
          Saved settings now drive live coach insights. Stats dashboard and operator customization screens can use the same model next.
        </p>

        {(aiSettings.playingStyle || aiSettings.teamContext || aiSettings.customPrompt) ? (
          <div className="card" style={{ marginTop: "1rem" }}>
            <h3>Current Applied Settings</h3>
            {aiSettings.playingStyle ? <p><strong>Style:</strong> {aiSettings.playingStyle}</p> : null}
            {aiSettings.teamContext ? <p><strong>Context:</strong> {aiSettings.teamContext}</p> : null}
            {aiSettings.customPrompt ? <p><strong>Custom Prompt:</strong> {aiSettings.customPrompt}</p> : null}
          </div>
        ) : null}

        <div className="card" style={{ marginTop: "1rem" }}>
          <h3>Prompt Preview (Read-Only)</h3>
          <p className="text-muted">{promptPreviewStatus}</p>
          {promptPreview ? (
            <>
              <p className="text-muted">
                Model: {promptPreview.model} • Recent events: {promptPreview.recentEventCount}
              </p>
              <div className="prompt-preview-historical-card">
                <strong>Historical Context (Season + Recent Games)</strong>
                <p className="text-muted prompt-preview-historical-text">
                  {historicalPromptContext || "Historical context is not currently available in this prompt."}
                </p>
              </div>
              <label>
                Current AI Input Prompt
                <textarea className="settings-textarea prompt-preview-textarea" value={promptPreview.userPrompt} readOnly />
              </label>
              <div className="stack-list" style={{ marginTop: "0.6rem" }}>
                <strong>System Guide Summary</strong>
                {promptPreview.systemGuide.map((line) => (
                  <p key={line} className="text-muted" style={{ margin: 0 }}>{line}</p>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </section>
      }

    </div>
    </>
  );
}
