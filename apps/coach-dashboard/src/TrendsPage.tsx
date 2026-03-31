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

function ScoreChart({ rows }: { rows: TrendRow[] }) {
  const CHART_H = 180;
  const CHART_W = 600;
  const PAD = { top: 16, right: 16, bottom: 28, left: 32 };
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;

  const chronological = useMemo(() =>
    [...rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [rows]
  );

  if (chronological.length === 0) return null;

  const allScores = chronological.flatMap(r => [r.teamScore, r.oppScore]);
  const maxScore = Math.max(...allScores, 10);
  const n = chronological.length;
  const barW = Math.min(18, (plotW / (n * 2 + n + 1)));
  const groupW = barW * 2 + barW * 0.4;
  const spacing = n > 1 ? (plotW - groupW) / (n - 1) : 0;

  const scaleY = (v: number) => PAD.top + plotH - (v / maxScore) * plotH;

  // Y-axis ticks
  const ticks = [0, Math.round(maxScore / 2), maxScore];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: "100%", maxWidth: CHART_W, display: "block" }}
        aria-label="Score chart"
      >
        {/* grid lines */}
        {ticks.map(t => (
          <g key={t}>
            <line
              x1={PAD.left} y1={scaleY(t)}
              x2={PAD.left + plotW} y2={scaleY(t)}
              stroke="rgba(255,255,255,0.07)" strokeWidth={1}
            />
            <text x={PAD.left - 4} y={scaleY(t) + 4} fontSize={9} fill="rgba(255,255,255,0.35)" textAnchor="end">{t}</text>
          </g>
        ))}

        {chronological.map((row, i) => {
          const cx = PAD.left + i * (n > 1 ? spacing : 0) + groupW / 2;
          const teamX = cx - barW - barW * 0.2;
          const oppX = cx + barW * 0.2;
          const teamH = (row.teamScore / maxScore) * plotH;
          const oppH = (row.oppScore / maxScore) * plotH;
          const label = row.opponent.length > 8 ? row.opponent.slice(0, 7) + "…" : row.opponent;

          return (
            <g key={row.id}>
              {/* team bar */}
              <rect
                x={teamX} y={scaleY(row.teamScore)}
                width={barW} height={teamH}
                fill="#4f8cff" rx={3}
                opacity={0.9}
              />
              {/* opp bar */}
              <rect
                x={oppX} y={scaleY(row.oppScore)}
                width={barW} height={oppH}
                fill="rgba(248,113,113,0.7)" rx={3}
              />
              {/* score labels above bars */}
              <text x={teamX + barW / 2} y={scaleY(row.teamScore) - 3} fontSize={8} fill="#4f8cff" textAnchor="middle">{row.teamScore}</text>
              <text x={oppX + barW / 2} y={scaleY(row.oppScore) - 3} fontSize={8} fill="#f87171" textAnchor="middle">{row.oppScore}</text>
              {/* x-axis label */}
              <text x={cx} y={CHART_H - 4} fontSize={8} fill="rgba(255,255,255,0.4)" textAnchor="middle">{label}</text>
            </g>
          );
        })}

        {/* legend */}
        <rect x={PAD.left} y={4} width={8} height={8} fill="#4f8cff" rx={2} />
        <text x={PAD.left + 11} y={11} fontSize={9} fill="rgba(255,255,255,0.6)">Team</text>
        <rect x={PAD.left + 44} y={4} width={8} height={8} fill="rgba(248,113,113,0.7)" rx={2} />
        <text x={PAD.left + 55} y={11} fontSize={9} fill="rgba(255,255,255,0.6)">Opponent</text>
      </svg>
    </div>
  );
}

function FgChart({ rows }: { rows: TrendRow[] }) {
  const CHART_H = 140;
  const CHART_W = 600;
  const PAD = { top: 16, right: 16, bottom: 28, left: 32 };
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;

  const chronological = useMemo(() =>
    [...rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [rows]
  );

  if (chronological.length < 2) return null;

  const n = chronological.length;
  const scaleX = (i: number) => PAD.left + (i / (n - 1)) * plotW;
  const scaleY = (v: number) => PAD.top + plotH - (v / 100) * plotH;

  const fgPath = chronological.map((r, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(r.fgPct)}`).join(" ");
  const fg3Path = chronological.map((r, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(r.fg3Pct)}`).join(" ");

  return (
    <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: "100%", maxWidth: CHART_W, display: "block" }} aria-label="FG% trend chart">
        {[0, 25, 50].map(t => (
          <g key={t}>
            <line x1={PAD.left} y1={scaleY(t)} x2={PAD.left + plotW} y2={scaleY(t)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
            <text x={PAD.left - 4} y={scaleY(t) + 4} fontSize={9} fill="rgba(255,255,255,0.35)" textAnchor="end">{t}%</text>
          </g>
        ))}
        <path d={fgPath} fill="none" stroke="#4f8cff" strokeWidth={2} strokeLinejoin="round" />
        <path d={fg3Path} fill="none" stroke="#f2c24b" strokeWidth={2} strokeLinejoin="round" strokeDasharray="4 2" />
        {chronological.map((r, i) => (
          <g key={r.id}>
            <circle cx={scaleX(i)} cy={scaleY(r.fgPct)} r={3} fill="#4f8cff" />
            <circle cx={scaleX(i)} cy={scaleY(r.fg3Pct)} r={3} fill="#f2c24b" />
          </g>
        ))}
        <rect x={PAD.left} y={4} width={8} height={3} fill="#4f8cff" />
        <text x={PAD.left + 11} y={10} fontSize={9} fill="rgba(255,255,255,0.6)">FG%</text>
        <rect x={PAD.left + 38} y={3} width={12} height={3} fill="#f2c24b" />
        <text x={PAD.left + 53} y={10} fontSize={9} fill="rgba(255,255,255,0.6)">3PT%</text>
      </svg>
    </div>
  );
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
          <p className="stats-page-eyebrow">Coach Platform</p>
          <h1>Trends</h1>
          <p className="stats-page-subtitle">Season-long scoring and efficiency trends.</p>
        </div>
        {status && <p className="stats-page-status">{status}</p>}
      </section>

      <section className="stats-metric-grid">
        <div className="stats-metric-card accent-blue">
          <span className="stats-metric-label">Last 5 Record</span>
          <strong className="stats-metric-value">{summary.recentRecord}</strong>
          <span className="stats-metric-detail">Recent games only</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Avg Margin</span>
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
          <p className="stats-empty-copy">No trend data available yet.</p>
        </section>
      ) : (
        <>
          <section className="stats-page-card">
            <div className="stats-page-card-head">
              <h3>Scoring by Game</h3>
            </div>
            <ScoreChart rows={rows} />
          </section>

          <section className="stats-page-card">
            <div className="stats-page-card-head">
              <h3>Shooting Efficiency</h3>
            </div>
            <FgChart rows={rows} />
          </section>

          <section className="stats-page-card">
            <div className="stats-page-card-head">
              <h3>Game Log</h3>
            </div>
            <div className="stats-game-list">
              {rows.map((row) => {
                const diff = row.teamScore - row.oppScore;
                return (
                  <div key={row.id} className="stats-game-row">
                    <div>
                      <strong>{row.date || "No date"} — {row.opponent}</strong>
                      <span>Score {row.teamScore}–{row.oppScore}</span>
                    </div>
                    <div className="stats-game-score-block">
                      <strong style={{ color: diff > 0 ? "var(--teal)" : diff < 0 ? "var(--red)" : undefined }}>
                        {diff > 0 ? `+${diff}` : String(diff)}
                      </strong>
                      <span>FG {row.fgPct.toFixed(1)}% | 3PT {row.fg3Pct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
