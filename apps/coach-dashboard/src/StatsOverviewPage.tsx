import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface SeasonStats {
  win: number;
  loss: number;
  ppg: number;
  fg_pct: number;
  rpg: number;
  apg: number;
}

interface AdvancedTeamStats {
  scoring_efficiency?: {
    efg_pct?: number;
    ts_pct?: number;
    ppp?: number;
  };
  ball_movement?: {
    assisted_scoring_rate?: number;
  };
}

interface LeaderboardPlayer {
  name: string;
  first_name?: string;
  pts?: number;
  reb?: number;
  asst?: number;
}

interface LeaderboardsPayload {
  pts: LeaderboardPlayer[];
  reb: LeaderboardPlayer[];
  asst: LeaderboardPlayer[];
}

interface GameSummary {
  gameId: string | number;
  date: string;
  opponent: string;
  location?: string;
  result?: string;
  vc_score: number;
  opp_score: number;
}

function formatNumber(value: number | undefined, digits = 1): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : digits === 0 ? "0" : (0).toFixed(digits);
}

function PlayerLeaders({ title, statKey, players }: { title: string; statKey: "pts" | "reb" | "asst"; players: LeaderboardPlayer[] }) {
  return (
    <section className="stats-page-card">
      <div className="stats-page-card-head">
        <h3>{title}</h3>
      </div>
      {players.length === 0 ? (
        <p className="stats-empty-copy">No player data yet.</p>
      ) : (
        <div className="stats-leader-list">
          {players.slice(0, 5).map((player) => (
            <div key={`${statKey}-${player.name}`} className="stats-leader-row">
              <span>{player.first_name || player.name.split(" ")[0] || player.name}</span>
              <strong>{Number(player[statKey] ?? 0)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function StatsOverviewPage() {
  const [seasonStats, setSeasonStats] = useState<SeasonStats | null>(null);
  const [advancedStats, setAdvancedStats] = useState<AdvancedTeamStats | null>(null);
  const [leaderboards, setLeaderboards] = useState<LeaderboardsPayload | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [status, setStatus] = useState("Loading stats overview...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("Loading stats overview...");
      try {
        const [seasonRes, advancedRes, leadersRes, gamesRes] = await Promise.all([
          fetch(`${apiBase}/api/season-stats`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/advanced/team`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/leaderboards`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/games`, { headers: apiKeyHeader() }),
        ]);

        if (!seasonRes.ok || !advancedRes.ok || !leadersRes.ok || !gamesRes.ok) {
          throw new Error("Stats API request failed.");
        }

        const [seasonPayload, advancedPayload, leadersPayload, gamesPayload] = await Promise.all([
          seasonRes.json() as Promise<SeasonStats>,
          advancedRes.json() as Promise<AdvancedTeamStats>,
          leadersRes.json() as Promise<LeaderboardsPayload>,
          gamesRes.json() as Promise<GameSummary[]>,
        ]);

        if (cancelled) {
          return;
        }

        setSeasonStats(seasonPayload);
        setAdvancedStats(advancedPayload);
        setLeaderboards(leadersPayload);
        setGames(Array.isArray(gamesPayload) ? gamesPayload : []);
        setStatus("Stats overview synced.");
      } catch {
        if (!cancelled) {
          setStatus("Could not load the stats overview from the realtime API.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const recentGames = useMemo(() => {
    return [...games]
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 5);
  }, [games]);

  const totalGames = (seasonStats?.win ?? 0) + (seasonStats?.loss ?? 0);
  const winPct = totalGames > 0 ? ((seasonStats?.win ?? 0) / totalGames) * 100 : 0;

  return (
    <div className="stats-page">
      <section className="stats-page-hero">
        <div>
          <p className="stats-page-eyebrow">Unified Coach Platform</p>
          <h1>Season Overview</h1>
          <p className="stats-page-subtitle">This is the first integrated stats surface inside the coach dashboard. Live stays at the root while analytics migrates here.</p>
        </div>
        <p className="stats-page-status">{status}</p>
      </section>

      <section className="stats-metric-grid">
        <div className="stats-metric-card accent-blue">
          <span className="stats-metric-label">Record</span>
          <strong className="stats-metric-value">{seasonStats ? `${seasonStats.win}-${seasonStats.loss}` : "0-0"}</strong>
          <span className="stats-metric-detail">Win % {formatNumber(winPct, 0)}%</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">PPG</span>
          <strong className="stats-metric-value">{formatNumber(seasonStats?.ppg)}</strong>
          <span className="stats-metric-detail">Points per game</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">FG%</span>
          <strong className="stats-metric-value">{formatNumber(seasonStats?.fg_pct)}%</strong>
          <span className="stats-metric-detail">Team field goal rate</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">eFG%</span>
          <strong className="stats-metric-value">{formatNumber(advancedStats?.scoring_efficiency?.efg_pct)}%</strong>
          <span className="stats-metric-detail">Effective field goal rate</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">TS%</span>
          <strong className="stats-metric-value">{formatNumber(advancedStats?.scoring_efficiency?.ts_pct)}%</strong>
          <span className="stats-metric-detail">True shooting</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">PPP</span>
          <strong className="stats-metric-value">{formatNumber(advancedStats?.scoring_efficiency?.ppp, 2)}</strong>
          <span className="stats-metric-detail">Points per possession</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">RPG</span>
          <strong className="stats-metric-value">{formatNumber(seasonStats?.rpg)}</strong>
          <span className="stats-metric-detail">Rebounds per game</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">APG</span>
          <strong className="stats-metric-value">{formatNumber(seasonStats?.apg)}</strong>
          <span className="stats-metric-detail">Assists per game</span>
        </div>
      </section>

      <section className="stats-page-grid two-column">
        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Recent Games</h3>
          </div>
          {recentGames.length === 0 ? (
            <p className="stats-empty-copy">No games recorded yet.</p>
          ) : (
            <div className="stats-game-list">
              {recentGames.map((game) => (
                <div key={String(game.gameId)} className="stats-game-row">
                  <div>
                    <strong>{game.location === "away" ? "@" : "vs"} {game.opponent}</strong>
                    <span>{game.date || "No date set"}</span>
                  </div>
                  <div className="stats-game-score-block">
                    <strong>{game.vc_score}-{game.opp_score}</strong>
                    <span>{game.result || "-"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Ball Movement</h3>
          </div>
          <div className="stats-focus-panel">
            <strong>{formatNumber(advancedStats?.ball_movement?.assisted_scoring_rate)}%</strong>
            <span>Assisted scoring rate</span>
            <p className="stats-page-subcopy">This overview intentionally stays lightweight for the first integration pass. Trends, charts, and deeper AI panels can layer in next.</p>
          </div>
        </section>
      </section>

      <section className="stats-page-grid three-column">
        <PlayerLeaders title="Top Scorers" statKey="pts" players={leaderboards?.pts ?? []} />
        <PlayerLeaders title="Top Rebounders" statKey="reb" players={leaderboards?.reb ?? []} />
        <PlayerLeaders title="Top Assist Leaders" statKey="asst" players={leaderboards?.asst ?? []} />
      </section>
    </div>
  );
}
