import { useEffect, useMemo, useRef, useState } from "react";
import { getPeriodDurationSeconds, type Period } from "@bta/shared-schema";
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
  events: Array<{
    id: string;
    type: string;
    sequence: number;
    teamId: string;
    period: Period;
    clockSecondsRemaining: number;
  }>;
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

interface Insight {
  id: string;
  type: string;
  message: string;
  explanation: string;
  createdAtIso: string;
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

// ── Roster Builder ──────────────────────────────────────────────────────────
// Uses the same localStorage key as the iPad Operator so rosters are shared.
const ROSTER_STORAGE_KEY = "bta-app-data-v3";
const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

export interface RosterPlayer {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;
  grade?: string;
}

export interface RosterTeam {
  id: string;
  name: string;
  abbreviation: string;
  players: RosterPlayer[];
}

const SAMPLE_TEAMS: RosterTeam[] = [
  {
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
  },
];

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

function slugifyTeamName(name: string): string {
  return `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;
}

function newPlayerId(): string {
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
// ────────────────────────────────────────────────────────────────────────────

const apiBase = import.meta.env.VITE_API ?? "http://localhost:4000";
const videoBase = import.meta.env.VITE_VIDEO_API ?? "http://localhost:4100";
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

  const [gameId, setGameId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("gameId") ?? "game-1";
  });
  const [state, setState] = useState<GameState | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [connected, setConnected] = useState(false);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [anchors, setAnchors] = useState<SyncAnchor[]>([]);
  const [videoSrcUrl, setVideoSrcUrl] = useState("");  // URL for the in-page video player
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoId, setVideoId] = useState("vid-1");
  const [filename, setFilename] = useState("full-game.mp4");
  const [anchorVideoId, setAnchorVideoId] = useState("vid-1");
  const [videoSecond, setVideoSecond] = useState("12");
  const [dashboardStatus, setDashboardStatus] = useState("Waiting for live game data");
  const [eventClipMap, setEventClipMap] = useState<Record<string, VideoResolution>>({});

  // ── Roster Builder state ─────────────────────────────────────────────────
  const [rosterTeams, setRosterTeamsState] = useState<RosterTeam[]>(loadRosterTeams);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editPlayerDraft, setEditPlayerDraft] = useState<RosterPlayer | null>(null);
  const [showNewTeamForm, setShowNewTeamForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamAbbr, setNewTeamAbbr] = useState("");
  const [addingPlayerForTeam, setAddingPlayerForTeam] = useState<string | null>(null);
  const [newPlayerNum, setNewPlayerNum] = useState("");
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerPos, setNewPlayerPos] = useState("PG");
  const [newPlayerHeight, setNewPlayerHeight] = useState("");
  const [newPlayerGrade, setNewPlayerGrade] = useState("");

  function setRosterTeams(next: RosterTeam[]) {
    setRosterTeamsState(next);
    saveRosterTeams(next);
  }

  function addTeam() {
    if (!newTeamName.trim()) return;
    let id = slugifyTeamName(newTeamName);
    let suffix = 2;
    while (rosterTeams.some((t) => t.id === id)) { id = `${slugifyTeamName(newTeamName)}-${suffix++}`; }
    const abbr = newTeamAbbr.trim().toUpperCase().slice(0, 4) || newTeamName.trim().slice(0, 3).toUpperCase();
    const team: RosterTeam = { id, name: newTeamName.trim(), abbreviation: abbr, players: [] };
    setRosterTeams([...rosterTeams, team]);
    setNewTeamName("");
    setNewTeamAbbr("");
    setShowNewTeamForm(false);
    setExpandedTeamId(id);
  }

  function removeTeam(id: string) {
    if (!window.confirm(`Remove team "${rosterTeams.find((t) => t.id === id)?.name ?? id}"?`)) return;
    setRosterTeams(rosterTeams.filter((t) => t.id !== id));
    if (expandedTeamId === id) setExpandedTeamId(null);
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
    };
    setRosterTeams(rosterTeams.map((t) => t.id === teamId ? { ...t, players: [...t.players, player] } : t));
    setAddingPlayerForTeam(null);
    setNewPlayerNum("");
    setNewPlayerName("");
    setNewPlayerPos("PG");
    setNewPlayerHeight("");
    setNewPlayerGrade("");
  }

  function removePlayer(teamId: string, playerId: string) {
    setRosterTeams(rosterTeams.map((t) => t.id === teamId ? { ...t, players: t.players.filter((p) => p.id !== playerId) } : t));
    if (editingPlayerId === playerId) { setEditingPlayerId(null); setEditPlayerDraft(null); }
  }

  function saveEditedPlayer(teamId: string) {
    if (!editPlayerDraft) return;
    setRosterTeams(rosterTeams.map((t) =>
      t.id === teamId ? { ...t, players: t.players.map((p) => p.id === editPlayerDraft.id ? editPlayerDraft : p) } : t
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
    a.download = "bta-roster.json";
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

  function loadSampleTeams() {
    if (rosterTeams.length > 0 && !window.confirm("This will replace your current roster with sample teams. Continue?")) return;
    setRosterTeams(SAMPLE_TEAMS);
    setExpandedTeamId(SAMPLE_TEAMS[0]?.id ?? null);
    setEditingPlayerId(null);
    setEditPlayerDraft(null);
    setAddingPlayerForTeam(null);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gameId") !== gameId) {
      params.set("gameId", gameId);
      window.history.replaceState({}, "", `?${params.toString()}`);
    }
  }, [gameId]);

  useEffect(() => {
    const socket = io(apiBase, {
      auth: API_KEY ? { apiKey: API_KEY } : {}
    });

    // Poll for game state every 5 s until a game:state arrives.
    // This covers the case where the iPad's startGame() hasn't completed yet
    // when the coach first opens the dashboard.
    let pollInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
      if (socket.connected) socket.emit("join:game", gameId);
    }, 5000);

    function stopPoll() {
      if (pollInterval !== null) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join:game", gameId);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.emit("join:game", gameId);

    socket.on("game:state", (nextState: GameState) => {
      stopPoll();
      setState(nextState);
      setDashboardStatus("Live state synced");
    });

    socket.on("game:insights", (nextInsights: Insight[]) => {
      setInsights(nextInsights);
    });

    return () => {
      stopPoll();
      socket.disconnect();
    };
  }, [gameId]);

  useEffect(() => {
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

  function canonicalTeamId(teamId: string): string {
    const normalized = teamId.toLowerCase();
    const isHomeAlias = normalized === "home" || normalized === "team-home";
    const isAwayAlias = normalized === "away" || normalized === "team-away";

    if (isHomeAlias) {
      if (setupNames.vcSide === "home" && setupNames.myTeamId) {
        return setupNames.myTeamId;
      }
      if (state?.homeTeamId && state.homeTeamId !== teamId) {
        return state.homeTeamId;
      }
      if (state?.opponentTeamId) {
        return state.opponentTeamId;
      }
    }

    if (isAwayAlias) {
      if (setupNames.vcSide === "away" && setupNames.myTeamId) {
        return setupNames.myTeamId;
      }
      if (state?.awayTeamId && state.awayTeamId !== teamId) {
        return state.awayTeamId;
      }
      if (state?.opponentTeamId) {
        return state.opponentTeamId;
      }
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
    const preferred = [state?.homeTeamId, state?.awayTeamId]
      .filter((teamId): teamId is string => Boolean(teamId))
      .map((teamId) => canonicalTeamId(teamId));

    return [...new Set([...preferred, ...Object.keys(aggregatedTeams)])];
  }, [aggregatedTeams, state?.awayTeamId, state?.homeTeamId]);

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
    const normalized = teamId.toLowerCase();
    const isHomeAlias = normalized === "home" || normalized === "team-home";
    const isAwayAlias = normalized === "away" || normalized === "team-away";

    if (setupNames.myTeamId && teamId === setupNames.myTeamId && setupNames.myTeamName) {
      return setupNames.myTeamName;
    }

    if (setupNames.myTeamName) {
      if (setupNames.vcSide === "home" && isHomeAlias) return setupNames.myTeamName;
      if (setupNames.vcSide === "away" && isAwayAlias) return setupNames.myTeamName;
    }

    // Check both setupNames and game state for opponent name
    const opponentName = setupNames.opponentName || state?.opponentName || "";
    if (opponentName) {
      // If the teamId matches the opponent team ID from game state
      if (state?.opponentTeamId && teamId === state.opponentTeamId) {
        return opponentName;
      }
      // Fallback to side-based matching for URL param setup
      if (setupNames.vcSide === "home" && isAwayAlias) return opponentName;
      if (setupNames.vcSide === "away" && isHomeAlias) return opponentName;
      if (setupNames.myTeamId && teamId !== setupNames.myTeamId && teams.length === 2) {
        return opponentName;
      }
    }

    return toTitleCase(teamId);
  }

  const leadersByTeam = useMemo(() => {
    return Object.fromEntries(
      teams.map((teamId) => {
        const players = Object.values(aggregatedTeams[teamId]?.playerStats ?? {});
        const scoringLeader = players
          .slice()
          .sort((left, right) => right.points - left.points || left.playerId.localeCompare(right.playerId))[0];
        const foulLeader = players
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

  const selectedVideoForResolution = useMemo(() => {
    const synced = videos.find((video) => video.status === "synced");
    return synced?.id ?? videos[0]?.id;
  }, [videos]);

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
    <div className="page">
      <header className="header card hero-card">
        <div>
          <p className="eyebrow">Bench Intelligence</p>
          <h1>BTA Coach Dashboard</h1>
          <p>{dashboardStatus}</p>
        </div>
        <div className="header-controls">
          <label>
            Game ID
            <input value={gameId} onChange={(event) => setGameId(event.target.value)} />
          </label>
          <div className="connection-pill">
            {state ? `Current period ${state.currentPeriod}` : "Waiting for period state"}
          </div>
          <div className={`connection-pill ${connected ? "online" : "offline"}`}>
            {connected ? "Live connected" : "Offline"}
          </div>
        </div>
      </header>

      {/* ── Roster Builder ─────────────────────────────────────────────── */}
      <section className="card">
        <div className="roster-header-row">
          <div>
            <h2>Roster Builder</h2>
            <p className="text-muted" style={{ marginTop: "0.25rem", fontSize: "0.85rem" }}>
              Teams created here are shared with the iPad Operator and all other BTA apps automatically.
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
            <button className="secondary" onClick={loadSampleTeams}>Load Samples</button>
            <button onClick={() => { setShowNewTeamForm(true); setExpandedTeamId(null); }}>+ New Team</button>
          </div>
        </div>

        {rosterTeams.length === 0 && !showNewTeamForm && (
          <p className="text-muted" style={{ marginTop: "0.75rem" }}>
            No teams yet — click <strong>+ New Team</strong> or <strong>Load Samples</strong> to get started.
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
            <button onClick={addTeam}>Create Team</button>
            <button className="secondary" onClick={() => { setShowNewTeamForm(false); setNewTeamName(""); setNewTeamAbbr(""); }}>
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
                  <span className="roster-abbr">{team.abbreviation}</span>
                  <span className="text-dim">{team.players.length} player{team.players.length !== 1 ? "s" : ""}</span>
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
                  {team.players.length === 0 && (
                    <p className="text-dim" style={{ marginBottom: "0.5rem" }}>No players yet.</p>
                  )}
                  <table className="roster-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Pos</th>
                        <th>Height</th>
                        <th>Grade</th>
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
                            <td><input className="roster-inline-input" value={editPlayerDraft.height ?? ""} onChange={(e) => setEditPlayerDraft({ ...editPlayerDraft, height: e.target.value || undefined })} style={{ width: "4.5rem" }} placeholder={"6'2\""} /></td>
                            <td><input className="roster-inline-input" value={editPlayerDraft.grade ?? ""} onChange={(e) => setEditPlayerDraft({ ...editPlayerDraft, grade: e.target.value || undefined })} style={{ width: "3rem" }} placeholder="11" /></td>
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
                            <td className="text-dim">{player.height ?? "—"}</td>
                            <td className="text-dim">{player.grade ? `Gr ${player.grade}` : "—"}</td>
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
                      <label>Height<input value={newPlayerHeight} onChange={(e) => setNewPlayerHeight(e.target.value)} placeholder={"6'2\""} /></label>
                      <label>Grade<input value={newPlayerGrade} onChange={(e) => setNewPlayerGrade(e.target.value)} placeholder="11" /></label>
                      <button onClick={() => addPlayer(team.id)}>Add Player</button>
                      <button className="secondary" onClick={() => setAddingPlayerForTeam(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="secondary" style={{ marginTop: "0.75rem", width: "100%" }} onClick={() => { setAddingPlayerForTeam(team.id); setNewPlayerNum(""); setNewPlayerName(""); setNewPlayerPos("PG"); setNewPlayerHeight(""); setNewPlayerGrade(""); }}>+ Add Player</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Scoreboard</h2>
        {teams.length === 0 ? <p>No live game state yet.</p> : null}
        <div className="scoreboard">
          {teams.map((teamId, index) => (
            <article
              key={teamId}
              className={`score-item ${index === 0 ? "score-item-home" : "score-item-away"}`}
            >
              <header className="score-item-header">
                <h3>{displayTeamName(teamId)}</h3>
                <p className="score">{aggregatedTeams[teamId]?.score ?? 0}</p>
              </header>

              <div className="score-meta-grid">
                <p className="metric-row"><span>FGM / FGA</span><strong>{aggregatedTeams[teamId]?.teamStats.shooting.fgMade ?? 0}/{aggregatedTeams[teamId]?.teamStats.shooting.fgAttempts ?? 0}</strong></p>
                <p className="metric-row"><span>FTM / FTA</span><strong>{aggregatedTeams[teamId]?.teamStats.shooting.ftMade ?? 0}/{aggregatedTeams[teamId]?.teamStats.shooting.ftAttempts ?? 0}</strong></p>
                <p className="metric-row"><span>Possessions</span><strong>{aggregatedTeams[teamId]?.possessions ?? 0}</strong></p>
                <p className="metric-row"><span>Turnovers</span><strong>{aggregatedTeams[teamId]?.teamStats.turnovers ?? 0}</strong></p>
                <p className="metric-row"><span>Team fouls</span><strong>{aggregatedTeams[teamId]?.teamStats.fouls ?? 0}</strong></p>
                <p className="metric-row"><span>Bonus</span><strong>{formatBonusIndicator(aggregatedTeams[teamId]?.bonus ?? false)}</strong></p>
                <p className="metric-row"><span>Subs</span><strong>{aggregatedTeams[teamId]?.teamStats.substitutions ?? 0}</strong></p>
                <p className="metric-row metric-wrap">
                  <span>Active lineup</span>
                  <strong>
                    {(aggregatedTeams[teamId]?.activeLineup ?? []).length > 0
                      ? aggregatedTeams[teamId]?.activeLineup.join(", ")
                      : "not set"}
                  </strong>
                </p>
                <p className="metric-row metric-wrap">
                  <span>Top scorer</span>
                  <strong>
                    {leadersByTeam[teamId]?.scoringLeader
                      ? `${leadersByTeam[teamId].scoringLeader?.playerId} (${leadersByTeam[teamId].scoringLeader?.points})`
                      : "none"}
                  </strong>
                </p>
                <p className="metric-row metric-wrap">
                  <span>Foul trouble</span>
                  <strong>
                    {leadersByTeam[teamId]?.foulLeader
                      ? formatFoulTroubleLabel(
                        leadersByTeam[teamId].foulLeader.playerId,
                        leadersByTeam[teamId].foulLeader.fouls
                      )
                      : "none"}
                  </strong>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Live Insights</h2>
        {insights.length === 0 ? <p>No insights yet.</p> : null}
        <div className="insight-list">
          {insights.map((insight) => (
            <article key={insight.id} className="insight-item">
              <h3>{insight.type.replaceAll("_", " ")}</h3>
              <p>{insight.message}</p>
              <small>{insight.explanation}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Recent Events</h2>
        <div className="stack-list">
          {(state?.events ?? []).slice(-8).reverse().map((event) => (
            <article key={event.id} className="film-card event-card">
              <div>
                <strong>
                  #{event.sequence} {event.type.replaceAll("_", " ")}
                </strong>
                <p>{formatDashboardEventMeta(event)}</p>
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
      </section>

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
      </section>

    </div>
  );
}
