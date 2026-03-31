import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface TrendsPayload {
  games?: Array<string | number>;
  dates?: string[];
  opponents?: string[];
  vc_score?: number[];
  opp_score?: number[];
  fg_pct?: number[];
  fg3_pct?: number[];
}

interface TrendRow {
  id: string;
  date: string;
  opponent: string;
  teamScore: number;
  oppScore: number;
  fgPct: number;
  fg3Pct: number;
}

export function TrendsPage() {
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [status, setStatus] = useState("Loading trends...");

  useEffect(() => {
    let cancelled = false;
    async function loadTrends() {
      setStatus("Loading trends...");
      try {
        const response = await fetch(`${apiBase}/api/team-trends`, { headers: apiKeyHeader() });
        if (!response.ok) {
          throw new Error("Team trends API request failed.");
        }

        const payload = await response.json() as TrendsPayload;
        const size = Math.max(
          payload.games?.length ?? 0,
          payload.dates?.length ?? 0,
          payload.opponents?.length ?? 0,
          payload.vc_score?.length ?? 0,
          payload.opp_score?.length ?? 0,
          payload.fg_pct?.length ?? 0,
          payload.fg3_pct?.length ?? 0,
        );

        const nextRows: TrendRow[] = Array.from({ length: size }, (_, index) => ({
          id: String(payload.games?.[index] ?? index),
          date: String(payload.dates?.[index] ?? ""),
          opponent: String(payload.opponents?.[index] ?? "Opponent"),
          teamScore: Number(payload.vc_score?.[index] ?? 0),
          oppScore: Number(payload.opp_score?.[index] ?? 0),
          fgPct: Number(payload.fg_pct?.[index] ?? 0),
          fg3Pct: Number(payload.fg3_pct?.[index] ?? 0),
        }))
          .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

        if (!cancelled) {
          setRows(nextRows);
          setStatus("Trends synced.");
        }
      } catch {
        if (!cancelled) {
          setStatus("Could not load trends from the realtime API.");
        }
      }
    }

    void loadTrends();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    if (rows.length === 0) {
      return { recentRecord: "0-0", avgDiff: "0.0", avgFg: "0.0", avgFg3: "0.0" };
    }

    const recent = rows.slice(0, Math.min(5, rows.length));
    const wins = recent.filter((row) => row.teamScore > row.oppScore).length;
    const losses = recent.length - wins;
    const avgDiff = recent.reduce((sum, row) => sum + (row.teamScore - row.oppScore), 0) / recent.length;
    const avgFg = recent.reduce((sum, row) => sum + row.fgPct, 0) / recent.length;
    const avgFg3 = recent.reduce((sum, row) => sum + row.fg3Pct, 0) / recent.length;

    return {
      recentRecord: `${wins}-${losses}`,
      avgDiff: avgDiff.toFixed(1),
      avgFg: avgFg.toFixed(1),
      avgFg3: avgFg3.toFixed(1),
    };
  }, [rows]);

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <p className="stats-page-eyebrow">Unified Coach Platform</p>
          <h1>Trends</h1>
          <p className="stats-page-subtitle">Recent form and efficiency trends are now integrated directly in coach routes.</p>
        </div>
        <p className="stats-page-status">{status}</p>
      </section>

      <section className="stats-metric-grid">
        <div className="stats-metric-card accent-blue">
          <span className="stats-metric-label">Last 5 Record</span>
          <strong className="stats-metric-value">{summary.recentRecord}</strong>
          <span className="stats-metric-detail">Recent games only</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Avg Diff</span>
          <strong className="stats-metric-value">{summary.avgDiff}</strong>
          <span className="stats-metric-detail">Points margin over last 5</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Avg FG%</span>
          <strong className="stats-metric-value">{summary.avgFg}%</strong>
          <span className="stats-metric-detail">Recent field goal rate</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Avg 3PT%</span>
          <strong className="stats-metric-value">{summary.avgFg3}%</strong>
          <span className="stats-metric-detail">Recent perimeter rate</span>
        </div>
      </section>

      {rows.length === 0 ? (
        <section className="stats-page-card">
          <p className="stats-empty-copy">No trend rows are available yet.</p>
        </section>
      ) : (
        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Game-by-Game Trends</h3>
          </div>
          <div className="stats-game-list">
            {rows.map((row) => {
              const diff = row.teamScore - row.oppScore;
              return (
                <div key={row.id} className="stats-game-row">
                  <div>
                    <strong>{row.date || "No date"} - {row.opponent}</strong>
                    <span>Score {row.teamScore}-{row.oppScore}</span>
                  </div>
                  <div className="stats-game-score-block">
                    <strong>{diff > 0 ? `+${diff}` : String(diff)}</strong>
                    <span>FG {row.fgPct.toFixed(1)}% | 3PT {row.fg3Pct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
