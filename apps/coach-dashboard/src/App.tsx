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

const apiBase = import.meta.env.VITE_API ?? "http://localhost:4000";
const videoBase = import.meta.env.VITE_VIDEO_API ?? "http://localhost:4100";
const API_KEY: string = import.meta.env.VITE_API_KEY ?? "";

/** Returns `{ "x-api-key": key }` when a key is configured, otherwise `{}`. */
function apiKeyHeader(): Record<string, string> {
  return API_KEY ? { "x-api-key": API_KEY } : {};
}

export function App() {
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

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join:game", gameId);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.emit("join:game", gameId);

    socket.on("game:state", (nextState: GameState) => {
      setState(nextState);
      setDashboardStatus("Live state synced");
    });

    socket.on("game:insights", (nextInsights: Insight[]) => {
      setInsights(nextInsights);
    });

    return () => {
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

  const teams = useMemo(() => {
    return Object.keys(state?.scoreByTeam ?? {});
  }, [state]);

  const leadersByTeam = useMemo(() => {
    return Object.fromEntries(
      teams.map((teamId) => {
        const players = Object.values(state?.playerStatsByTeam?.[teamId] ?? {});
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
  }, [state, teams]);

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
          <p>NFHS live view: 8:00 quarters, 4:00 overtime, bonus at 5 team fouls.</p>
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

      <section className="card">
        <h2>Scoreboard</h2>
        {teams.length === 0 ? <p>No live game state yet.</p> : null}
        <div className="scoreboard">
          {teams.map((teamId) => (
            <article key={teamId} className="score-item">
              <h3>{teamId}</h3>
              <p className="score">{state?.scoreByTeam[teamId] ?? 0}</p>
              <p>FGM/FGA: {state?.teamStats[teamId]?.shooting.fgMade ?? 0}/{state?.teamStats[teamId]?.shooting.fgAttempts ?? 0}</p>
              <p>FTM/FTA: {state?.teamStats[teamId]?.shooting.ftMade ?? 0}/{state?.teamStats[teamId]?.shooting.ftAttempts ?? 0}</p>
              <p>Possessions: {state?.possessionsByTeam[teamId] ?? 0}</p>
              <p>Turnovers: {state?.teamStats[teamId]?.turnovers ?? 0}</p>
              <p>Team fouls: {state?.teamStats[teamId]?.fouls ?? 0}</p>
              <p>Bonus: {formatBonusIndicator(state?.bonusByTeam?.[teamId] ?? false)}</p>
              <p>Subs: {state?.teamStats[teamId]?.substitutions ?? 0}</p>
              <p>
                Active: {(state?.activeLineupsByTeam[teamId] ?? []).length > 0
                  ? state?.activeLineupsByTeam[teamId].join(", ")
                  : "not set"}
              </p>
              <p>
                Top scorer: {leadersByTeam[teamId]?.scoringLeader
                  ? `${leadersByTeam[teamId].scoringLeader?.playerId} (${leadersByTeam[teamId].scoringLeader?.points})`
                  : "none"}
              </p>
              <p>
                Foul trouble: {leadersByTeam[teamId]?.foulLeader
                  ? formatFoulTroubleLabel(
                    leadersByTeam[teamId].foulLeader.playerId,
                    leadersByTeam[teamId].foulLeader.fouls
                  )
                  : "none"}
              </p>
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
                Resolve Clip
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
