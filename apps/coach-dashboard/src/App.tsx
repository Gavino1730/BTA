import { useEffect, useMemo, useRef, useState } from "react";
import { TutorialOverlay } from "./TutorialOverlay.js";
import { getPeriodDurationSeconds, normalizeTeamColor, type GameEvent, type Period } from "@bta/shared-schema";
import type { PlayerStats, TeamStats } from "@bta/game-state";
import { io } from "socket.io-client";
import {
  formatBonusIndicator,
  formatDashboardClock,
  formatDashboardEventMeta,
  formatFoulTroubleLabel,
} from "./display.js";

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
  timeoutsByTeam: Record<string, number>;
  teamFoulsByPeriod: Record<string, Record<string, number>>;
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
  priority?: "urgent" | "important" | "info";
  confidence?: "high" | "medium";
  message: string;
  explanation: string;
  createdAtIso: string;
  relatedTeamId?: string;
  relatedPlayerId?: string;
}

interface RotationWatchNote {
  playerId: string;
  level: "high" | "medium";
  reason: string;
}

interface PresenceStatus {
  deviceId: string | null;
  connectionId?: string | null;
  online: boolean;
  gameId: string | null;
  lastSeenIso: string | null;
}

function normalizeConnectionId(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function generateConnectionId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `conn-${Date.now().toString(36)}-${rand}`;
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

type BoxScoreFilter = string[];

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

// Roster Builder
// Local storage is fallback only; source of truth is realtime API roster config.
const ROSTER_STORAGE_KEY = "shared-app-data-v3";


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
// Shared app constants

const defaultHost = window.location.hostname || "localhost";
const apiBase = import.meta.env.VITE_API ?? `http://${defaultHost}:4000`;
const operatorBase = import.meta.env.VITE_OPERATOR_CONSOLE ?? `http://${defaultHost}:5174`;
const API_KEY: string = import.meta.env.VITE_API_KEY ?? "";
const SCHOOL_ID: string = (import.meta.env.VITE_SCHOOL_ID ?? "default").toString().trim() || "default";

/** Returns auth and tenant headers for realtime API requests. */
function apiKeyHeader(): Record<string, string> {
  const headers: Record<string, string> = { "x-school-id": SCHOOL_ID };
  if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  }
  return headers;
}

export function App() {
  const setupNames = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      myTeamId: params.get("myTeamId") ?? "",
      myTeamName: params.get("myTeamName") ?? "",
      opponentName: params.get("opponentName") ?? "",
      vcSide: params.get("vcSide") === "away" ? "away" as const : "home" as const,
      homeColor: params.get("homeColor") ?? "",
      awayColor: params.get("awayColor") ?? "",
    };
  }, []);

  const [deviceId, setDeviceId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("deviceId");
    if (fromUrl) {
      localStorage.setItem("coach-bound-device-id", fromUrl);
      return fromUrl;
    }
    return localStorage.getItem("coach-bound-device-id") ?? "device1";
  });
  const [connectionId, setConnectionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = normalizeConnectionId(params.get("connectionId"));
    if (fromUrl) {
      localStorage.setItem("coach-bound-connection-id", fromUrl);
      return fromUrl;
    }
    return normalizeConnectionId(localStorage.getItem("coach-bound-connection-id"));
  });

  useEffect(() => {
    if (!connectionId) {
      setConnectionId(generateConnectionId());
    }
  }, [connectionId]);
  const [gameId, setGameId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("gameId") ?? "";
  });
  const [state, setState] = useState<GameState | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const aiRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dashboardStatus, setDashboardStatus] = useState("Waiting for live game data");
  const [isRefreshingAiInsights, setIsRefreshingAiInsights] = useState(false);
  const [aiRefreshError, setAiRefreshError] = useState("");
  const [activePage, setActivePage] = useState<"live" | "ai" | "settings">("live");
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('coach:tutorial-complete'));
  const [aiSettings, setAiSettings] = useState<CoachAiSettings>(defaultCoachAiSettings);
  const [aiSettingsDraft, setAiSettingsDraft] = useState<CoachAiSettings>(defaultCoachAiSettings);
  const [aiSettingsStatus, setAiSettingsStatus] = useState("No saved settings for this game yet.");
  const [boxScoreFilter, setBoxScoreFilter] = useState<BoxScoreFilter>([]);
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
    if (connectionId) {
      params.set("connectionId", connectionId);
    }
    if (gameId) params.set("gameId", gameId);
    if (setupNames.myTeamId) params.set("myTeamId", setupNames.myTeamId);
    if (setupNames.myTeamName) params.set("myTeamName", setupNames.myTeamName);
    if (setupNames.opponentName) params.set("opponent", setupNames.opponentName);
    if (setupNames.vcSide) params.set("vcSide", setupNames.vcSide);
    return `${operatorBase.replace(/\/$/, "")}/?${params.toString()}`;
  }, [connectionId, gameId, setupNames]);

  useEffect(() => {
    try {
      localStorage.setItem("coach-bound-device-id", deviceId);
    } catch {
      // ignore storage issues
    }
  }, [deviceId]);

  useEffect(() => {
    try {
      if (connectionId) {
        localStorage.setItem("coach-bound-connection-id", connectionId);
      } else {
        localStorage.removeItem("coach-bound-connection-id");
      }
    } catch {
      // ignore storage issues
    }
  }, [connectionId]);

  // Roster Builder state
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
  const [newPlayerPos, setNewPlayerPos] = useState("");
  const [newPlayerHeight, setNewPlayerHeight] = useState("");
  const [newPlayerGrade, setNewPlayerGrade] = useState("");
  const [newPlayerRole, setNewPlayerRole] = useState("");
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
    setNewPlayerPos("");
    setNewPlayerHeight("");
    setNewPlayerGrade("");
    setNewPlayerRole("");
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
    if (params.get("connectionId") !== connectionId) {
      if (connectionId) {
        params.set("connectionId", connectionId);
      } else {
        params.delete("connectionId");
      }
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
  }, [connectionId, gameId]);

  useEffect(() => {
    const socket = io(apiBase, {
      auth: API_KEY ? { apiKey: API_KEY, schoolId: SCHOOL_ID } : { schoolId: SCHOOL_ID },
      extraHeaders: apiKeyHeader()
    });

    // Poll the presence channel every 5s so the coach dashboard can recover
    // quickly if the operator console reconnects after a temporary network interruption.
    let pollInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
      if (socket.connected) {
        socket.emit("join:coach", { connectionId });
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
      socket.emit("join:coach", { connectionId });
    });

    socket.on("disconnect", () => {
      setServerConnected(false);
      setDeviceConnected(false);
      setState(null);
      setGameId("");
    });

    socket.emit("join:coach", { connectionId });

    function handlePresence(status: PresenceStatus) {
      if (!status) {
        return;
      }

      if (!connectionId || status.connectionId !== connectionId) {
        return;
      }

      setDeviceConnected(status.online);
      const activeGameId = status.gameId;
      if (status.online && activeGameId) {
        setGameId((current) => (current === activeGameId ? current : activeGameId));
        socket.emit("join:game", activeGameId);
      } else {
        setState(null);
        setGameId("");
        setDashboardStatus(`Waiting for connection ${connectionId}`);
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
  }, [connectionId]);

  useEffect(() => {
    if (!gameId) {
      return;
    }

    // Clear ALL game-specific state immediately so the dashboard shows a clean
    // slate while new game data loads - no stale scores, events, AI chat,
    // or device-connection carry-over from the previous game.
    setState(null);
    setInsights([]);
    setAiChatMessages([]);
    setAiChatInput("");
    setAiChatSuggestions([]);
    setBoxScoreFilter([]);
    setPromptPreview(null);
    setAiRefreshError("");
    setDeviceConnected(false);
    setDashboardStatus("Loading new game...");
    setIsLoading(true);

    async function hydrate() {
      // Fetch state and insights in parallel for faster load
      const [stateRes, insightRes] = await Promise.all([
        fetch(`${apiBase}/api/games/${gameId}/state`, { headers: apiKeyHeader() }),
        fetch(`${apiBase}/api/games/${gameId}/insights`, { headers: apiKeyHeader() })
      ]);

      // Handle game state
      try {
        if (stateRes.ok) {
          const payload = (await stateRes.json()) as GameState;
          setState(payload);
          setDashboardStatus("Loaded server game state");
          // Cache to localStorage
          try {
            localStorage.setItem(`gameState-${gameId}`, JSON.stringify(payload));
          } catch {
            // localStorage full or disabled, ignore
          }
        } else {
          // Try to load from cache
          const cachedState = localStorage.getItem(`gameState-${gameId}`);
          if (cachedState) {
            try {
              const payload = JSON.parse(cachedState) as GameState;
              setState(payload);
              setDashboardStatus("Loaded cached game state (offline mode)");
            } catch {
              setDashboardStatus("Offline and no cached state available");
            }
          }
        }
      } catch {
        // Network error - try cache
        const cachedState = localStorage.getItem(`gameState-${gameId}`);
        if (cachedState) {
          try {
            const payload = JSON.parse(cachedState) as GameState;
            setState(payload);
            setDashboardStatus("Loaded cached game state (offline mode)");
          } catch {
            setDashboardStatus("Offline and no cached state available");
          }
        }
      }

      // Handle insights
      try {
        if (insightRes.ok) {
          const payload = (await insightRes.json()) as Insight[];
          setInsights(payload);
          // Cache to localStorage (persistent, not session-only)
          try {
            localStorage.setItem(`gameInsights-${gameId}`, JSON.stringify(payload));
          } catch {
            // localStorage full or disabled, ignore
          }
        } else {
          // Try to load from cache
          const cachedInsights = localStorage.getItem(`gameInsights-${gameId}`);
          if (cachedInsights) {
            try {
              const payload = JSON.parse(cachedInsights) as Insight[];
              setInsights(payload);
            } catch {
              // Invalid cached data
            }
          }
        }
      } catch {
        // Network error - try cache
        const cachedInsights = localStorage.getItem(`gameInsights-${gameId}`);
        if (cachedInsights) {
          try {
            const payload = JSON.parse(cachedInsights) as Insight[];
            setInsights(payload);
          } catch {
            // Invalid cached data
          }
        }
      }

      setIsLoading(false);
    }

    hydrate().catch(() => {
      setIsLoading(false);
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
        const response = await fetch(`${apiBase}/api/games/${gameId}/ai-settings`, {
          headers: apiKeyHeader(),
        });
        if (!response.ok) {
          try {
            const seed = await fetch(`${apiBase}/api/ai-settings`, {
              headers: apiKeyHeader(),
            });
            if (seed.ok) {
              const defaults = (await seed.json()) as CoachAiSettings | null;
              const next = defaults ?? defaultCoachAiSettings();
              if (!cancelled) {
                setAiSettings(next);
                setAiSettingsDraft(next);
                setAiSettingsStatus("Loaded team defaults from the unified coach platform.");
              }
              return;
            }
          } catch { /* ignore */ }
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
      const response = await fetch(`${apiBase}/api/games/${gameId}/ai-settings`, {
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
      const response = await fetch(`${apiBase}/api/games/${gameId}/ai-prompt-preview`, {
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
      const response = await fetch(`${apiBase}/api/games/${gameId}/ai-chat`, {
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
      timeoutsUsed: number;
      periodFouls: number;
    }> = {};

    function ensureTeam(teamId: string) {
      aggregated[teamId] ??= {
        score: 0,
        bonus: false,
        possessions: 0,
        activeLineup: [],
        teamStats: emptyTeamStats(),
        playerStats: {},
        timeoutsUsed: 0,
        periodFouls: 0,
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
      target.timeoutsUsed += state?.timeoutsByTeam?.[rawTeamId] ?? 0;
      // Sum fouls for the current period from teamFoulsByPeriod
      const periodFoulMap = state?.teamFoulsByPeriod?.[rawTeamId] ?? {};
      const currentPeriod = state?.currentPeriod ?? "Q1";
      target.periodFouls += periodFoulMap[currentPeriod] ?? 0;
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
    // Seed with operator-provided URL colors so they apply even without a roster entry
    if (setupNames.homeColor) map[canonicalSideIds.homeId] = setupNames.homeColor;
    if (setupNames.awayColor) map[canonicalSideIds.awayId] = setupNames.awayColor;
    // rosterTeams colors take priority over operator URL defaults
    for (const team of rosterTeams) {
      if (team.teamColor) map[team.id] = team.teamColor;
    }
    return map;
  }, [rosterTeams, setupNames.homeColor, setupNames.awayColor, canonicalSideIds.homeId, canonicalSideIds.awayId]);

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
    // Prefer the live game-state opponent name over the URL param - the URL may carry
    // a stale value from a previous game that was bookmarked or scanned weeks ago.
    const opponentName = state?.opponentName || setupNames.opponentName || "";

    // When myTeamId is available in the URL it is the definitive check -
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
      // Only return myTeamName if it doesn't duplicate the opponent name - if both would
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
    if (insight.priority === "urgent") {
      return "insight-item-rule-urgent";
    }

    if (insight.priority === "important") {
      return "insight-item-rule-high";
    }

    if (insight.priority === "info") {
      return "insight-item-rule-default";
    }

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
    // seeded in the game state - avoids defaulting to the opponent's (home) slot.
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

  const filteredBoxScoreEvents = useMemo(() => {
    const events = state?.events ?? [];
    if (boxScoreFilter.length === 0) return events;
    const filterSet = new Set(boxScoreFilter);
    return events.filter((event) => filterSet.has(event.period));
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

    // Debounce: ignore refresh requests within 2 seconds of the last request
    const now = Date.now();
    const lastRefresh = (aiRefreshDebounceRef.current as unknown as number) || 0;
    if (now - lastRefresh < 2000) {
      return;
    }
    aiRefreshDebounceRef.current = (now as unknown as ReturnType<typeof setTimeout>);

    setIsRefreshingAiInsights(true);
    setAiRefreshError("");

    try {
      const query = new URLSearchParams({ force: "1" });
      const response = await fetch(`${apiBase}/api/games/${gameId}/insights?${query.toString()}`, {
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

  return (
    <>
      {showTutorial && <TutorialOverlay onDismiss={() => setShowTutorial(false)} />}
      <nav className="coach-navbar">
        <div className="coach-nav-container">
          <div className="coach-nav-logo">Bench IQ</div>
          <ul className="coach-nav-links">
            <li><button className={activePage === "live" ? "nav-active" : ""} onClick={() => setActivePage("live")}>Live</button></li>
            <li><button className={activePage === "ai" ? "nav-active" : ""} onClick={() => setActivePage("ai")}>AI</button></li>
            <li><button className={activePage === "settings" ? "nav-active" : ""} onClick={() => setActivePage("settings")}>Settings</button></li>
            <li><a href={operatorConsoleUrl} className="coach-nav-ext-link">Score Operator</a></li>
            <li><a href="/stats" className="coach-nav-ext-link">Stats</a></li>
          </ul>
          <button
            onClick={() => setShowTutorial(true)}
            title="Help &amp; Tutorial"
            style={{background:'transparent',border:'1.5px solid #4f8cff',color:'#4f8cff',borderRadius:'50%',width:'28px',height:'28px',fontSize:'14px',fontWeight:700,cursor:'pointer',flexShrink:0,marginLeft:'8px',lineHeight:1}}
          >?</button>
            <div className={`connection-pill ${deviceConnected ? "online" : "offline"}`} style={{ flexShrink: 0 }}>
              <span className="connection-pill-status">
                {deviceConnected ? "Operator live" : serverConnected ? "Waiting" : "Offline"}
              </span>
              <label className="connection-pill-editor" title="Operator device identifier">
                <span className="connection-pill-label">Connection</span>
                <input
                  className="connection-pill-input"
                  value={connectionId}
                  readOnly
                  placeholder="conn-..."
                  aria-label="Connection ID"
                />
              </label>
            </div>
        </div>
      </nav>

    <div className="page">
      {!gameId && activePage !== "settings" && (
        <div className="idle-screen">
          <div className="idle-screen-icon">||</div>
          <p className="idle-screen-title">No Active Game</p>
          <p className="idle-screen-sub">
            {serverConnected ? "Waiting for the operator to start a game..." : "Not connected to server"}
          </p>
        </div>
      )}
      {gameId && activePage === "live" && <>
      <section className="card">
        <h2>Scoreboard</h2>
        {isLoading && (
          <div className="loading-indicator">
            <div className="loading-spinner" />
            <p className="loading-text">{dashboardStatus}</p>
          </div>
        )}
        {teams.length === 0 ? <p>No live game state yet.</p> : null}
        <div className="scoreboard">
          {teams.map((teamId, index) => {
            const scoreboardLineup = getScoreboardLineup(teamId);
            const teamColor = teamColorById[canonicalTeamId(teamId)];
            const td = aggregatedTeams[teamId] ?? aggregatedTeams[canonicalTeamId(teamId)];
            const fgMade = td?.teamStats.shooting.fgMade ?? 0;
            const fgAtt = td?.teamStats.shooting.fgAttempts ?? 0;
            const ftMade = td?.teamStats.shooting.ftMade ?? 0;
            const ftAtt = td?.teamStats.shooting.ftAttempts ?? 0;
            const fgPct = fgAtt > 0 ? Math.round((fgMade / fgAtt) * 100) : null;
            const ftPct = ftAtt > 0 ? Math.round((ftMade / ftAtt) * 100) : null;
            const totalFouls = td?.teamStats.fouls ?? 0;
            const periodFouls = td?.periodFouls ?? 0;
            const timeoutsUsed = td?.timeoutsUsed ?? 0;
            const TOTAL_TIMEOUTS = 5;
            const timeoutsLeft = Math.max(0, TOTAL_TIMEOUTS - timeoutsUsed);
            const inBonus = td?.bonus ?? false;
            const rebounds = (td?.teamStats.reboundsOff ?? 0) + (td?.teamStats.reboundsDef ?? 0);
            const foulUrgency = periodFouls >= 5 ? "foul-danger" : periodFouls >= 4 ? "foul-warn" : periodFouls >= 3 ? "foul-caution" : "";
            return (
              <article
                key={teamId}
                className={`score-item ${index === 0 ? "score-item-home" : "score-item-away"}`}
                style={teamColor ? {
                  background: `linear-gradient(180deg, ${teamColor}40, ${teamColor}18)`,
                  borderColor: `${teamColor}99`,
                } : undefined}
              >
                {/* Header */}
                <header className="score-item-header">
                  <div className="score-item-title">
                    <h3>{displayTeamName(teamId)}</h3>
                    {index === 0 && <span className="your-team-badge">YOUR TEAM</span>}
                  </div>
                  <div className="score-block">
                    <p className="score">{td?.score ?? 0}</p>
                    <span className="score-period-label">{state?.currentPeriod ?? "-"}</span>
                  </div>
                </header>

                {/* Fouls + Bonus + Timeouts row */}
                <div className="sb-urgency-row">
                  <div className={`sb-foul-block ${foulUrgency}`}>
                    <span className="sb-urgency-label">FOULS</span>
                    <div className="sb-foul-pips">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={`sb-foul-pip ${i < periodFouls ? "sb-foul-pip-on" : ""} ${periodFouls >= 5 && i < periodFouls ? "sb-foul-pip-danger" : periodFouls >= 4 && i < periodFouls ? "sb-foul-pip-warn" : ""}`}
                        />
                      ))}
                      <span className="sb-foul-count">{periodFouls}/5</span>
                    </div>
                    <span className="sb-foul-game-total">{totalFouls} game</span>
                  </div>

                  <div className={`sb-bonus-block ${inBonus ? "sb-bonus-on" : ""}`}>
                    <span className="sb-urgency-label">BONUS</span>
                    <span className="sb-bonus-value">{inBonus ? "IN BONUS" : "OFF"}</span>
                  </div>

                  <div className="sb-timeout-block">
                    <span className="sb-urgency-label">TIMEOUTS</span>
                    <div className="sb-timeout-pips">
                      {Array.from({ length: TOTAL_TIMEOUTS }).map((_, i) => (
                        <span
                          key={i}
                          className={`sb-timeout-pip ${i < timeoutsLeft ? "sb-timeout-pip-on" : "sb-timeout-pip-used"}`}
                        />
                      ))}
                    </div>
                    <span className="sb-timeout-count">{timeoutsLeft} left</span>
                  </div>
                </div>

                {/* Quick-stat grid */}
                <div className="sb-stat-grid">
                  <div className="sb-stat-cell">
                    <span className="sb-stat-label">FG</span>
                    <span className="sb-stat-value">{fgMade}/{fgAtt}</span>
                    {fgPct !== null && <span className="sb-stat-pct">{fgPct}%</span>}
                  </div>
                  <div className="sb-stat-cell">
                    <span className="sb-stat-label">FT</span>
                    <span className="sb-stat-value">{ftMade}/{ftAtt}</span>
                    {ftPct !== null && <span className="sb-stat-pct">{ftPct}%</span>}
                  </div>
                  <div className="sb-stat-cell">
                    <span className="sb-stat-label">REB</span>
                    <span className="sb-stat-value">{rebounds}</span>
                    <span className="sb-stat-pct">{td?.teamStats.reboundsOff ?? 0}O / {td?.teamStats.reboundsDef ?? 0}D</span>
                  </div>
                  <div className="sb-stat-cell">
                    <span className="sb-stat-label">TO</span>
                    <span className="sb-stat-value">{td?.teamStats.turnovers ?? 0}</span>
                  </div>
                  <div className="sb-stat-cell">
                    <span className="sb-stat-label">POSS</span>
                    <span className="sb-stat-value">{td?.possessions ?? 0}</span>
                  </div>
                  <div className="sb-stat-cell">
                    <span className="sb-stat-label">SUBS</span>
                    <span className="sb-stat-value">{td?.teamStats.substitutions ?? 0}</span>
                  </div>
                </div>

                {/* Lineup */}
                <div className="sb-lineup-row">
                  <span className="sb-section-label">ON COURT</span>
                  <div className="sb-lineup-chips">
                    {scoreboardLineup.playerIds.length > 0
                      ? scoreboardLineup.playerIds.map((playerId) => (
                          <span key={playerId} className="sb-player-chip">
                            {displayPlayerName(teamId, playerId)}
                          </span>
                        ))
                      : <span className="sb-lineup-empty">not set</span>}
                    {scoreboardLineup.isEstimated && <span className="sb-estimated-tag">est.</span>}
                  </div>
                </div>

                {/* Leaders */}
                <div className="sb-leaders-row">
                  {leadersByTeam[teamId]?.scoringLeader ? (
                    <div className="sb-leader-item sb-leader-scorer">
                      <span className="sb-leader-icon">*</span>
                      <span>
                        {displayPlayerName(teamId, leadersByTeam[teamId].scoringLeader.playerId)}
                        <strong> {leadersByTeam[teamId].scoringLeader?.points} pts</strong>
                      </span>
                    </div>
                  ) : null}
                  {leadersByTeam[teamId]?.foulLeader ? (
                    <div className={`sb-leader-item sb-leader-fouls ${leadersByTeam[teamId].foulLeader.fouls >= 4 ? "sb-leader-fouls-danger" : ""}`}>
                      <span className="sb-leader-icon">!</span>
                      <span>
                        {formatFoulTroubleLabel(
                          displayPlayerName(teamId, leadersByTeam[teamId].foulLeader.playerId),
                          leadersByTeam[teamId].foulLeader.fouls
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

        {teams.length >= 2 ? (() => {
          const homeData = aggregatedTeams[canonicalSideIds.homeId];
          const awayData = aggregatedTeams[canonicalSideIds.awayId];
          if (!homeData || !awayData) return null;
          const homeAssists = Object.values(homeData.playerStats).reduce((s, p) => s + (p.assists ?? 0), 0);
          const awayAssists = Object.values(awayData.playerStats).reduce((s, p) => s + (p.assists ?? 0), 0);
          type CompRow = { label: string; home: number | string; away: number | string; higherBetter?: boolean; lowerBetter?: boolean };
          const rows: CompRow[] = [
            { label: "Score", home: homeData.score, away: awayData.score, higherBetter: true },
            {
              label: "FG",
              home: `${homeData.teamStats.shooting.fgMade}-${homeData.teamStats.shooting.fgAttempts}`,
              away: `${awayData.teamStats.shooting.fgMade}-${awayData.teamStats.shooting.fgAttempts}`,
              higherBetter: true,
            },
            {
              label: "FT",
              home: `${homeData.teamStats.shooting.ftMade}-${homeData.teamStats.shooting.ftAttempts}`,
              away: `${awayData.teamStats.shooting.ftMade}-${awayData.teamStats.shooting.ftAttempts}`,
              higherBetter: true,
            },
            { label: "REB", home: homeData.teamStats.reboundsOff + homeData.teamStats.reboundsDef, away: awayData.teamStats.reboundsOff + awayData.teamStats.reboundsDef, higherBetter: true },
            { label: "AST", home: homeAssists, away: awayAssists, higherBetter: true },
            { label: "TO",  home: homeData.teamStats.turnovers, away: awayData.teamStats.turnovers, lowerBetter: true },
            { label: "PF",  home: homeData.teamStats.fouls,     away: awayData.teamStats.fouls,     lowerBetter: true },
          ];
          return (
            <section key="team-comparison" className="card team-comparison-card">
              <h2>Team Comparison</h2>
              <table className="team-comparison-table">
                <thead>
                  <tr>
                    <th className="tc-stat-col">Stat</th>
                    <th>{displayTeamName(canonicalSideIds.homeId)}</th>
                    <th>{displayTeamName(canonicalSideIds.awayId)}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const hNum = typeof row.home === "number" ? row.home : null;
                    const aNum = typeof row.away === "number" ? row.away : null;
                    let hClass = "";
                    let aClass = "";
                    if (hNum !== null && aNum !== null) {
                      if (row.higherBetter) {
                        if (hNum > aNum) hClass = "tc-lead";
                        else if (aNum > hNum) aClass = "tc-lead";
                      } else if (row.lowerBetter && hNum !== aNum) {
                        if (hNum < aNum) hClass = "tc-lead";
                        else aClass = "tc-lead";
                      }
                    }
                    return (
                      <tr key={row.label}>
                        <td className="tc-stat-col">{row.label}</td>
                        <td className={hClass}>{row.home}</td>
                        <td className={aClass}>{row.away}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })() : null}

      <section className="card box-score-card">
        <div className="box-score-header">
          <h2>Box Score</h2>
            {boxScorePeriods.length > 1 ? (
              <div className="replay-scrubber" aria-label="Game timeline scrubber">
                {boxScorePeriods.map((period, idx) => {
                  const isLivePeriod = period === state?.currentPeriod;
                  const activeUpToIdx = boxScoreFilter.length > 0
                    ? Math.max(...boxScoreFilter.map((f) => boxScorePeriods.indexOf(f)))
                    : boxScorePeriods.length - 1;
                  const inRange = idx <= activeUpToIdx;
                  const isSelected = boxScoreFilter.length > 0 && idx === activeUpToIdx;
                  return (
                    <>
                      {idx > 0 && (
                        <div
                          key={`seg-${period}`}
                          className={`replay-scrubber-segment${inRange ? " scrubber-segment-active" : ""}`}
                        />
                      )}
                      <button
                        key={period}
                        type="button"
                        className={`replay-scrubber-stop${isLivePeriod ? " scrubber-stop-live" : ""}${isSelected ? " scrubber-stop-selected" : inRange ? " scrubber-stop-active" : ""}`}
                        title={`${boxScoreFilter.length > 0 && idx === activeUpToIdx ? "Showing up to " : "View up to "}${period}`}
                        onClick={() => {
                          const upTo = boxScorePeriods.slice(0, idx + 1);
                          setBoxScoreFilter(upTo.length === boxScorePeriods.length ? [] : upTo);
                        }}
                      >
                        <span className="scrubber-stop-dot" />
                        <span className="scrubber-stop-label">{period}</span>
                        {isLivePeriod && <span className="scrubber-live-pip" aria-label="Live" />}
                      </button>
                    </>
                  );
                })}
              </div>
            ) : null}

          <div className="box-score-filter-group" aria-label="Box score filter">
            <button
              type="button"
              className={`box-score-filter-chip${boxScoreFilter.length === 0 ? " box-score-filter-chip-active" : ""}`}
              onClick={() => setBoxScoreFilter([])}
            >Full Game</button>
            {boxScorePeriods.map((period) => (
              <button
                key={period}
                type="button"
                className={`box-score-filter-chip${boxScoreFilter.includes(period) ? " box-score-filter-chip-active" : ""}`}
                onClick={() => setBoxScoreFilter(prev =>
                  prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period]
                )}
              >{period}</button>
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

          // Determine if this is the opponent team (not our team)
          const canonicalId = canonicalTeamId(teamId);
          const ourRawSideId = setupNames.vcSide === "away" ? state?.awayTeamId : state?.homeTeamId;
          const isOurTeam = setupNames.myTeamId !== ""
            ? (teamId === setupNames.myTeamId ||
               canonicalId === setupNames.myTeamId ||
               canonicalTeamId(setupNames.myTeamId) === canonicalId)
            : ((teams.length > 0 && teamId === teams[0]) ||
               (Boolean(ourRawSideId) && teamId === ourRawSideId));
          const isOpponent = !isOurTeam;

          // Show team totals unless it's opponent with tracked players
          const showTeamTotals = !isOpponent || (isOpponent && playerLines.length === 0);

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
                          No players added.
                        </td>
                      </tr>
                    ) : (
                      playerLines.map((line) => {
                        const rebounds = line.reboundsDef + line.reboundsOff;
                        const playerLabel = line.number ? `${line.number} ${line.name}` : line.name;
                        return (
                          <tr
                            key={`${teamId}-${line.playerId}`}
                            className={line.fouls >= 4 ? "foul-row-danger" : line.fouls >= 3 ? "foul-row-warning" : undefined}
                          >
                            <td>{playerLabel}</td>
                            <td>{line.points}</td>
                            <td>{line.fgMade}-{line.fgAttempts}</td>
                            <td>{line.ftMade}-{line.ftAttempts}</td>
                            <td>{rebounds}</td>
                            <td>{line.assists}</td>
                            <td>{line.steals}</td>
                            <td>{line.blocks}</td>
                            <td>{line.turnovers}</td>
                            <td>
                              <span className={`foul-badge${line.fouls >= 5 ? " foul-badge-out" : line.fouls >= 4 ? " foul-badge-danger" : line.fouls >= 3 ? " foul-badge-warn" : " foul-badge-safe"}`}>
                                {line.fouls}{line.fouls >= 5 ? " OUT" : line.fouls >= 4 ? " !" : ""}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {showTeamTotals ? (
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
                  ) : null}
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

        {rulesInsights.filter(i => ["sub_suggestion", "timeout_suggestion", "foul_warning", "foul_trouble", "team_foul_warning", "ot_awareness"].includes(i.type)).length > 0 ? (
          <>
            <h3 className="insight-subhead insight-subhead-urgent">
              <span>Urgent Coaching Calls</span>
              <span className="insight-count-badge insight-count-badge-urgent">
                {rulesInsights.filter(i => ["sub_suggestion", "timeout_suggestion", "foul_warning", "foul_trouble", "team_foul_warning", "ot_awareness"].includes(i.type)).length}
              </span>
            </h3>
            <div className="insight-list-stack">
              {rulesInsights
                .filter(i => ["sub_suggestion", "timeout_suggestion", "foul_warning", "foul_trouble", "team_foul_warning", "ot_awareness"].includes(i.type))
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

        {rulesInsights.filter(i => !["sub_suggestion", "timeout_suggestion", "foul_warning", "foul_trouble", "team_foul_warning", "ot_awareness"].includes(i.type)).length > 0 ? (
          <>
            <h3 className="insight-subhead insight-subhead-important">System Alerts</h3>
            <div className="insight-list">
              {rulesInsights
                .filter(i => !["sub_suggestion", "timeout_suggestion", "foul_warning", "foul_trouble", "team_foul_warning", "ot_awareness"].includes(i.type))
                .slice(0, 5)
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
            <article key={rotationContext.teamId} className="rotation-card">
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
                <div className="rotation-chip-row">
                  {rotationContext.bench.map((playerId) => (
                    <span key={`${rotationContext.teamId}-bench-${playerId}`} className="rotation-chip">
                      {displayPlayerName(rotationContext.teamId, playerId)}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ) : null}
        </div>
      </section>

      </>
      }

      {gameId && activePage === "ai" && <>
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

      {/* Roster page removed - roster management moved to Stats Dashboard */}

      {activePage === "settings" &&
      <>
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

        <div className="settings-device-row">
          <label className="settings-device-label">
            Connection ID
            <input
              className="settings-device-input"
              value={connectionId}
              readOnly
              placeholder="e.g. conn-abc123"
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => setConnectionId(generateConnectionId())}
            style={{ alignSelf: "end" }}
          >
            Generate Connection ID
          </button>
        </div>

        <div className="form-grid">
          {rosterTeams.length > 0 && rosterTeams.map((team) => (
            <label key={team.id} style={{ gridColumn: "1 / -1" }}>
              Coaching Style For AI{rosterTeams.length > 1 ? ` - ${team.name}` : ""}
              <textarea
                className="settings-textarea"
                defaultValue={team.coachStyle ?? ""}
                placeholder="Example: We want to play fast, pressure the ball, and trust our bench in second-quarter runs."
                onBlur={(event) => {
                  if ((team.coachStyle ?? "") !== event.target.value) {
                    updateTeamCoachStyle(team.id, event.target.value);
                  }
                }}
              />
            </label>
          ))}

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
                Model: {promptPreview.model} | Recent events: {promptPreview.recentEventCount}
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

      <section className="card" style={{border:'1.5px solid #7f1d1d', marginTop:'1rem'}}>
        <h2 style={{color:'#f87171'}}>Warning: Clear Local Data</h2>
        <p className="text-muted" style={{marginBottom:'1rem'}}>
          Removes all data stored in this browser: roster, AI settings, and cached game state.
          This only affects this device. Use the Stats Dashboard <strong>Settings to Factory Reset</strong> to wipe server data.
        </p>
        <button
          style={{background:'#7f1d1d',color:'#fca5a5',border:'none',padding:'8px 18px',borderRadius:'8px',cursor:'pointer',fontWeight:600}}
          onClick={() => {
            if (!confirm('Clear all local data on this device? This removes roster, settings, and cached game state stored here.')) return;
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k) keysToRemove.push(k);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            window.location.reload();
          }}
        >
          Clear Local Data
        </button>
      </section>
      </>
      }

    </div>
    </>
  );
}
