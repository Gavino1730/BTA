import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

interface TeamStats {
  shooting: {
    attempts: number;
    made: number;
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
  shotAttempts: number;
  shotsMade: number;
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
  scoreByTeam: Record<string, number>;
  possessionsByTeam: Record<string, number>;
  activeLineupsByTeam: Record<string, string[]>;
  teamStats: Record<string, TeamStats>;
  playerStatsByTeam: Record<string, Record<string, PlayerStats>>;
  events: Array<{
    id: string;
    type: string;
    sequence: number;
    teamId: string;
    period: number;
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
  period: number;
  gameClockSeconds: number;
  videoSecond: number;
}

interface VideoResolution {
  videoId: string;
  period: number;
  gameClockSeconds: number;
  resolvedVideoSecond: number;
  anchorId: string;
}

const apiBase = "http://localhost:4000";
const videoBase = "http://localhost:4100";

export function App() {
  const [gameId, setGameId] = useState("game-1");
  const [state, setState] = useState<GameState | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [connected, setConnected] = useState(false);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [anchors, setAnchors] = useState<SyncAnchor[]>([]);
  const [videoId, setVideoId] = useState("vid-1");
  const [filename, setFilename] = useState("full-game.mp4");
  const [anchorVideoId, setAnchorVideoId] = useState("vid-1");
  const [videoSecond, setVideoSecond] = useState("12");
  const [dashboardStatus, setDashboardStatus] = useState("Waiting for live game data");
  const [eventClipMap, setEventClipMap] = useState<Record<string, VideoResolution>>({});

  useEffect(() => {
    const socket = io(apiBase);

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
      const stateRes = await fetch(`${apiBase}/games/${gameId}/state`);
      if (stateRes.ok) {
        const payload = (await stateRes.json()) as GameState;
        setState(payload);
        setDashboardStatus("Loaded server game state");
      }

      const insightRes = await fetch(`${apiBase}/games/${gameId}/insights`);
      if (insightRes.ok) {
        const payload = (await insightRes.json()) as Insight[];
        setInsights(payload);
      }

      const videoRes = await fetch(`${videoBase}/games/${gameId}/videos`);
      if (videoRes.ok) {
        const payload = (await videoRes.json()) as VideoAsset[];
        setVideos(payload);
      }

      const anchorRes = await fetch(`${videoBase}/games/${gameId}/sync-anchors`);
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

  function formatClock(seconds: number) {
    const minute = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const second = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");
    return `${minute}:${second}`;
  }

  async function resolveEventClip(eventId: string, period: number, gameClockSeconds: number) {
    if (!selectedVideoForResolution) {
      setDashboardStatus("No registered video available for clip resolution");
      return;
    }

    const query = new URLSearchParams({
      period: String(period),
      gameClockSeconds: String(gameClockSeconds)
    });

    const response = await fetch(
      `${videoBase}/games/${gameId}/videos/${selectedVideoForResolution}/resolve?${query.toString()}`
    );

    if (!response.ok) {
      setDashboardStatus("Could not resolve clip time for this event");
      return;
    }

    const payload = (await response.json()) as VideoResolution;
    setEventClipMap((current) => ({ ...current, [eventId]: payload }));
    setDashboardStatus(`Resolved clip time for event ${eventId}`);
  }

  async function addVideoAsset() {
    const response = await fetch(`${videoBase}/games/${gameId}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `anchor-${Date.now()}`,
        videoId: anchorVideoId,
        eventType: "tipoff",
        period: 1,
        gameClockSeconds: 480,
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
          <h1>Pivot Coach Dashboard</h1>
          <p>{dashboardStatus}</p>
        </div>
        <div className="header-controls">
          <label>
            Game ID
            <input value={gameId} onChange={(event) => setGameId(event.target.value)} />
          </label>
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
              <p>FGM/FGA: {state?.teamStats[teamId]?.shooting.made ?? 0}/{state?.teamStats[teamId]?.shooting.attempts ?? 0}</p>
              <p>Possessions: {state?.possessionsByTeam[teamId] ?? 0}</p>
              <p>Turnovers: {state?.teamStats[teamId]?.turnovers ?? 0}</p>
              <p>Fouls: {state?.teamStats[teamId]?.fouls ?? 0}</p>
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
                  ? `${leadersByTeam[teamId].foulLeader?.playerId} (${leadersByTeam[teamId].foulLeader?.fouls})`
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
                  #{event.sequence} {event.type}
                </strong>
                <p>
                  {event.teamId} · P{event.period} · clock {formatClock(event.clockSecondsRemaining)}
                </p>
                {eventClipMap[event.id] ? (
                  <small>
                    Clip at {formatClock(eventClipMap[event.id].resolvedVideoSecond)} (video {eventClipMap[event.id].videoId})
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
          <p>Register uploaded game film and place manual sync anchors for later analysis.</p>

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
              Save Tipoff Anchor
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
                  <small>
                    Period {anchor.period} · game {anchor.gameClockSeconds}s · video {anchor.videoSecond}s
                  </small>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
