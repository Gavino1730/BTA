import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";
import { computeAverageMargin, computeCurrentStreak, formatRecord } from "./stats-page-utils.js";

interface SeasonStats {
  win: number;
  loss: number;
  ppg: number;
  opp_ppg?: number;
  fg_pct: number;
  fg3_pct?: number;
  ft_pct?: number;
  rpg: number;
  apg: number;
  to_avg?: number;
  stl_pg?: number;
  blk_pg?: number;
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

interface PatternPayload {
  home_avg_score?: number;
  away_avg_score?: number;
  total_games?: number;
  home_record?: {
    wins?: number;
    losses?: number;
  };
  away_record?: {
    wins?: number;
    losses?: number;
  };
}

interface VolatilityPayload {
  team_volatility?: {
    ppg_range?: number;
    fg_pct_std_dev?: number;
    to_std_dev?: number;
  };
}

interface LeaderboardPlayer {
  name: string;
  first_name?: string;
  pts?: number;
  reb?: number;
  asst?: number;
  fg_pct?: number;
  stl?: number;
  blk?: number;
}

interface LeaderboardsPayload {
  pts: LeaderboardPlayer[];
  reb: LeaderboardPlayer[];
  asst: LeaderboardPlayer[];
  fg_pct?: LeaderboardPlayer[];
  stl?: LeaderboardPlayer[];
  blk?: LeaderboardPlayer[];
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

type LeaderStatKey = "pts" | "reb" | "asst" | "fg_pct" | "stl" | "blk";

function formatNumber(value: number | undefined, digits = 1): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : digits === 0 ? "0" : (0).toFixed(digits);
}

function formatLeaderValue(statKey: LeaderStatKey, player: LeaderboardPlayer): string {
  const value = Number(player[statKey] ?? 0);
  if (statKey === "fg_pct") {
    return `${formatNumber(value)}%`;
  }
  return formatNumber(value, 0);
}

function PlayerLeaders({ title, statKey, players }: { title: string; statKey: LeaderStatKey; players: LeaderboardPlayer[] }) {
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
              <strong>{formatLeaderValue(statKey, player)}</strong>
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
  const [patterns, setPatterns] = useState<PatternPayload | null>(null);
  const [volatility, setVolatility] = useState<VolatilityPayload | null>(null);
  const [leaderboards, setLeaderboards] = useState<LeaderboardsPayload | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [status, setStatus] = useState("Loading stats overview...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("Loading stats overview...");
      try {
        const [seasonRes, advancedRes, leadersRes, gamesRes, patternsRes, volatilityRes] = await Promise.all([
          fetch(`${apiBase}/api/season-stats`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/advanced/team`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/leaderboards`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/games`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/advanced/patterns`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/advanced/volatility`, { headers: apiKeyHeader() }),
        ]);

        if (!seasonRes.ok || !advancedRes.ok || !leadersRes.ok || !gamesRes.ok || !patternsRes.ok || !volatilityRes.ok) {
          throw new Error("Stats API request failed.");
        }

        const [seasonPayload, advancedPayload, leadersPayload, gamesPayload, patternsPayload, volatilityPayload] = await Promise.all([
          seasonRes.json() as Promise<SeasonStats>,
          advancedRes.json() as Promise<AdvancedTeamStats>,
          leadersRes.json() as Promise<LeaderboardsPayload>,
          gamesRes.json() as Promise<GameSummary[]>,
          patternsRes.json() as Promise<PatternPayload>,
          volatilityRes.json() as Promise<VolatilityPayload>,
        ]);

        if (cancelled) {
          return;
        }

        setSeasonStats(seasonPayload);
        setAdvancedStats(advancedPayload);
        setLeaderboards(leadersPayload);
        setGames(Array.isArray(gamesPayload) ? gamesPayload : []);
        setPatterns(patternsPayload);
        setVolatility(volatilityPayload);
        setStatus("Overview, leaderboards, and trend features are synced.");
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
  const currentStreak = computeCurrentStreak(recentGames);
  const recentAverageMargin = computeAverageMargin(recentGames);
  const assistTurnoverRatio = Number(seasonStats?.to_avg ?? 0) > 0
    ? Number(seasonStats?.apg ?? 0) / Math.max(Number(seasonStats?.to_avg ?? 0), 1)
    : Number(seasonStats?.apg ?? 0);

  return (
    <div className="stats-page">
      <section className="stats-page-hero">
        <div>
          <h1>Season Overview</h1>
          <p className="stats-page-subtitle">The full season snapshot is back here now: record, efficiency, splits, recent form, and deeper leaderboards.</p>
        </div>
        <p className="stats-page-status">{status}</p>
      </section>

      <section className="stats-metric-grid">
        <div className="stats-metric-card accent-blue">
          <span className="stats-metric-label">Record</span>
          <strong className="stats-metric-value">{formatRecord(seasonStats?.win, seasonStats?.loss)}</strong>
          <span className="stats-metric-detail">Win % {formatNumber(winPct, 0)}%</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Current Streak</span>
          <strong className="stats-metric-value">{currentStreak}</strong>
          <span className="stats-metric-detail">Recent avg margin {formatNumber(recentAverageMargin)}</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">PPG</span>
          <strong className="stats-metric-value">{formatNumber(seasonStats?.ppg)}</strong>
          <span className="stats-metric-detail">Opponent PPG {formatNumber(seasonStats?.opp_ppg)}</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">FG%</span>
          <strong className="stats-metric-value">{formatNumber(seasonStats?.fg_pct)}%</strong>
          <span className="stats-metric-detail">3PT {formatNumber(seasonStats?.fg3_pct)}% · FT {formatNumber(seasonStats?.ft_pct)}%</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">eFG%</span>
          <strong className="stats-metric-value">{formatNumber(advancedStats?.scoring_efficiency?.efg_pct)}%</strong>
          <span className="stats-metric-detail">True shooting {formatNumber(advancedStats?.scoring_efficiency?.ts_pct)}%</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">PPP</span>
          <strong className="stats-metric-value">{formatNumber(advancedStats?.scoring_efficiency?.ppp, 2)}</strong>
          <span className="stats-metric-detail">AST/TO {formatNumber(assistTurnoverRatio, 2)}</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Rebounding</span>
          <strong className="stats-metric-value">{formatNumber(seasonStats?.rpg)}</strong>
          <span className="stats-metric-detail">Boards per game</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Defensive Events</span>
          <strong className="stats-metric-value">{formatNumber((seasonStats?.stl_pg ?? 0) + (seasonStats?.blk_pg ?? 0))}</strong>
          <span className="stats-metric-detail">STL {formatNumber(seasonStats?.stl_pg)} · BLK {formatNumber(seasonStats?.blk_pg)}</span>
        </div>
      </section>

      <section className="stats-page-grid two-column">
        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Recent Games</h3>
            <span className="stats-page-status">Last {recentGames.length || 0}</span>
          </div>
          {recentGames.length === 0 ? (
            <p className="stats-empty-copy">No games recorded yet.</p>
          ) : (
            <div className="stats-game-list">
              {recentGames.map((game) => {
                const margin = Number(game.vc_score ?? 0) - Number(game.opp_score ?? 0);
                return (
                  <div key={String(game.gameId)} className="stats-game-row">
                    <div>
                      <strong>{game.location === "away" ? "@" : "vs"} {game.opponent}</strong>
                      <span>{game.date || "No date set"}</span>
                    </div>
                    <div className="stats-game-score-block">
                      <strong>{game.vc_score}-{game.opp_score}</strong>
                      <span>{game.result || "-"} · {margin > 0 ? `+${margin}` : String(margin)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Team Identity</h3>
            <span className="stats-page-status">Patterns restored</span>
          </div>
          <div className="stats-game-card-metrics">
            <div>
              <span>Assisted Score</span>
              <strong>{formatNumber(advancedStats?.ball_movement?.assisted_scoring_rate)}%</strong>
            </div>
            <div>
              <span>Home Record</span>
              <strong>{formatRecord(patterns?.home_record?.wins, patterns?.home_record?.losses)}</strong>
            </div>
            <div>
              <span>Away Record</span>
              <strong>{formatRecord(patterns?.away_record?.wins, patterns?.away_record?.losses)}</strong>
            </div>
            <div>
              <span>PPG Range</span>
              <strong>{formatNumber(volatility?.team_volatility?.ppg_range)}</strong>
            </div>
            <div>
              <span>FG Std Dev</span>
              <strong>{formatNumber(volatility?.team_volatility?.fg_pct_std_dev)}</strong>
            </div>
            <div>
              <span>TO Std Dev</span>
              <strong>{formatNumber(volatility?.team_volatility?.to_std_dev)}</strong>
            </div>
          </div>
          <div className="stats-focus-panel" style={{ marginTop: "1rem" }}>
            <strong>{formatNumber(patterns?.home_avg_score)}</strong>
            <span>Average home score</span>
            <p className="stats-page-subcopy">
              Away scoring average is {formatNumber(patterns?.away_avg_score)}. This page now carries the season-level features that were lost in the merge.
            </p>
          </div>
        </section>
      </section>

      <section className="stats-page-grid three-column" style={{ marginBottom: "1rem" }}>
        <PlayerLeaders title="Top Scorers" statKey="pts" players={leaderboards?.pts ?? []} />
        <PlayerLeaders title="Top Rebounders" statKey="reb" players={leaderboards?.reb ?? []} />
        <PlayerLeaders title="Top Assist Leaders" statKey="asst" players={leaderboards?.asst ?? []} />
      </section>

      <section className="stats-page-grid three-column">
        <PlayerLeaders title="Top Shooters" statKey="fg_pct" players={leaderboards?.fg_pct ?? []} />
        <PlayerLeaders title="Steal Leaders" statKey="stl" players={leaderboards?.stl ?? []} />
        <PlayerLeaders title="Block Leaders" statKey="blk" players={leaderboards?.blk ?? []} />
      </section>
    </div>
  );
}
