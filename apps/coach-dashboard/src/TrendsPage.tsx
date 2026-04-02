import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";
import { computeAverageMargin, computeCurrentStreak } from "./stats-page-utils.js";

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

interface PlayerSummary {
  name?: string;
  full_name?: string;
  number?: string | number;
  ppg?: number;
  rpg?: number;
  apg?: number;
  fg_pct?: number;
}

interface PlayerTrendsPayload {
  games?: Array<string | number>;
  dates?: string[];
  opponents?: string[];
  pts?: number[];
  reb?: number[];
  asst?: number[];
  stl?: number[];
  to?: number[];
  fouls?: number[];
  fg?: number[];
  fg_att?: number[];
  plus_minus?: number[];
}

interface PlayerTrendRow {
  id: string;
  date: string;
  opponent: string;
  pts: number;
  reb: number;
  asst: number;
  stl: number;
  turnovers: number;
  fouls: number;
  fgMade: number;
  fgAtt: number;
  plusMinus: number;
}

interface ComparisonPlayer {
  name: string;
  role?: string;
  efficiency_grade?: string;
  basic_stats?: {
    ppg?: number;
    rpg?: number;
    apg?: number;
    tpg?: number;
    fg_pct?: number;
    fg3_pct?: number;
    ft_pct?: number;
    spg?: number;
    bpg?: number;
  };
}

interface PlayerComparisonPayload {
  players?: ComparisonPlayer[];
}

function safeNum(value: number | undefined, digits = 1): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : (0).toFixed(digits);
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

  const allScores = chronological.flatMap((r) => [r.teamScore, r.oppScore]);
  const maxScore = Math.max(...allScores, 10);
  const n = chronological.length;
  const barW = Math.min(18, plotW / (n * 3 + 1));
  const groupW = barW * 2 + barW * 0.4;
  const spacing = n > 1 ? (plotW - groupW) / (n - 1) : 0;

  const scaleY = (v: number) => PAD.top + plotH - (v / maxScore) * plotH;
  const ticks = [0, Math.round(maxScore / 2), maxScore];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: "100%", maxWidth: CHART_W, display: "block" }}
        aria-label="Score chart"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              y1={scaleY(t)}
              x2={PAD.left + plotW}
              y2={scaleY(t)}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={1}
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
          const label = row.opponent.length > 8 ? `${row.opponent.slice(0, 7)}…` : row.opponent;

          return (
            <g key={row.id}>
              <rect x={teamX} y={scaleY(row.teamScore)} width={barW} height={teamH} fill="#4f8cff" rx={3} opacity={0.9} />
              <rect x={oppX} y={scaleY(row.oppScore)} width={barW} height={oppH} fill="rgba(248,113,113,0.7)" rx={3} />
              <text x={teamX + barW / 2} y={scaleY(row.teamScore) - 3} fontSize={8} fill="#4f8cff" textAnchor="middle">{row.teamScore}</text>
              <text x={oppX + barW / 2} y={scaleY(row.oppScore) - 3} fontSize={8} fill="#f87171" textAnchor="middle">{row.oppScore}</text>
              <text x={cx} y={CHART_H - 4} fontSize={8} fill="rgba(255,255,255,0.4)" textAnchor="middle">{label}</text>
            </g>
          );
        })}

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
        {[0, 25, 50].map((t) => (
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

function PlayerTrendChart({ rows, playerName }: { rows: PlayerTrendRow[]; playerName: string }) {
  const recent = [...rows].slice(0, 6).reverse();
  const maxPts = Math.max(...recent.map((row) => row.pts), 1);

  if (recent.length === 0) {
    return <p className="stats-empty-copy">No player trend data available yet.</p>;
  }

  return (
    <div>
      <p className="stats-page-subcopy" style={{ marginBottom: "0.75rem" }}>{playerName} points by game</p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${recent.length}, minmax(0, 1fr))`, gap: "0.55rem", alignItems: "end" }}>
        {recent.map((row) => {
          const height = Math.max(14, Math.round((row.pts / maxPts) * 92));
          return (
            <div key={row.id} style={{ display: "grid", gap: "0.3rem", justifyItems: "center" }}>
              <strong style={{ fontSize: "0.82rem" }}>{row.pts}</strong>
              <div style={{ width: "100%", maxWidth: 42, height, borderRadius: 10, background: "linear-gradient(180deg, #4f8cff, #295ecf)" }} />
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center" }}>{row.opponent}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerComparisonTable({ comparison }: { comparison: PlayerComparisonPayload | null }) {
  const players = comparison?.players ?? [];
  if (players.length < 2) {
    return <p className="stats-empty-copy">Choose two players to compare their season production.</p>;
  }

  const [left, right] = players;
  const rows = [
    { label: "PPG", left: safeNum(left.basic_stats?.ppg), right: safeNum(right.basic_stats?.ppg) },
    { label: "RPG", left: safeNum(left.basic_stats?.rpg), right: safeNum(right.basic_stats?.rpg) },
    { label: "APG", left: safeNum(left.basic_stats?.apg), right: safeNum(right.basic_stats?.apg) },
    { label: "FG%", left: `${safeNum(left.basic_stats?.fg_pct)}%`, right: `${safeNum(right.basic_stats?.fg_pct)}%` },
    { label: "3PT%", left: `${safeNum(left.basic_stats?.fg3_pct)}%`, right: `${safeNum(right.basic_stats?.fg3_pct)}%` },
    { label: "FT%", left: `${safeNum(left.basic_stats?.ft_pct)}%`, right: `${safeNum(right.basic_stats?.ft_pct)}%` },
    { label: "SPG", left: safeNum(left.basic_stats?.spg), right: safeNum(right.basic_stats?.spg) },
    { label: "BPG", left: safeNum(left.basic_stats?.bpg), right: safeNum(right.basic_stats?.bpg) },
    { label: "TO/G", left: safeNum(left.basic_stats?.tpg), right: safeNum(right.basic_stats?.tpg) },
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="team-comparison-table" style={{ marginTop: 0 }}>
        <thead>
          <tr>
            <th>{left.name}</th>
            <th className="tc-stat-col">Metric</th>
            <th>{right.name}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{left.role ?? "—"} · {left.efficiency_grade ?? "—"}</td>
            <td className="tc-stat-col">Role / Grade</td>
            <td>{right.role ?? "—"} · {right.efficiency_grade ?? "—"}</td>
          </tr>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.left}</td>
              <td className="tc-stat-col">{row.label}</td>
              <td>{row.right}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrendsPage() {
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [comparePlayer, setComparePlayer] = useState("");
  const [playerRows, setPlayerRows] = useState<PlayerTrendRow[]>([]);
  const [comparison, setComparison] = useState<PlayerComparisonPayload | null>(null);
  const [status, setStatus] = useState("Loading trends...");

  useEffect(() => {
    let cancelled = false;

    async function loadTrends() {
      setStatus("Loading trends...");
      const [teamResult, playersResult] = await Promise.allSettled([
        fetch(`${apiBase}/api/team-trends`, { headers: apiKeyHeader() }),
        fetch(`${apiBase}/api/players`, { headers: apiKeyHeader() }),
      ]);

      if (cancelled) {
        return;
      }

      if (teamResult.status !== "fulfilled" || !teamResult.value.ok) {
        setStatus("Could not load trends from the realtime API.");
        return;
      }

      const payload = await teamResult.value.json() as TrendsPayload;
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
      })).sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

      setRows(nextRows);

      if (playersResult.status === "fulfilled" && playersResult.value.ok) {
        const playersPayload = await playersResult.value.json() as PlayerSummary[];
        const nextPlayers = Array.isArray(playersPayload) ? playersPayload : [];
        setPlayers(nextPlayers);
        if (!selectedPlayer && nextPlayers[0]) {
          setSelectedPlayer(nextPlayers[0].full_name ?? nextPlayers[0].name ?? "");
        }
        if (!comparePlayer && nextPlayers[1]) {
          setComparePlayer(nextPlayers[1].full_name ?? nextPlayers[1].name ?? "");
        }
      }

      setStatus("Team and player trend features are synced.");
    }

    void loadTrends();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayerTrends() {
      if (!selectedPlayer) {
        setPlayerRows([]);
        return;
      }

      try {
        const response = await fetch(`${apiBase}/api/player-trends/${encodeURIComponent(selectedPlayer)}`, { headers: apiKeyHeader() });
        if (!response.ok) {
          throw new Error("Player trends request failed.");
        }

        const payload = await response.json() as PlayerTrendsPayload;
        const size = Math.max(
          payload.games?.length ?? 0,
          payload.dates?.length ?? 0,
          payload.opponents?.length ?? 0,
          payload.pts?.length ?? 0,
          payload.reb?.length ?? 0,
          payload.asst?.length ?? 0,
          payload.stl?.length ?? 0,
          payload.to?.length ?? 0,
          payload.fouls?.length ?? 0,
          payload.fg?.length ?? 0,
          payload.fg_att?.length ?? 0,
        );

        const nextRows: PlayerTrendRow[] = Array.from({ length: size }, (_, index) => ({
          id: String(payload.games?.[index] ?? index),
          date: String(payload.dates?.[index] ?? ""),
          opponent: String(payload.opponents?.[index] ?? "Opponent"),
          pts: Number(payload.pts?.[index] ?? 0),
          reb: Number(payload.reb?.[index] ?? 0),
          asst: Number(payload.asst?.[index] ?? 0),
          stl: Number(payload.stl?.[index] ?? 0),
          turnovers: Number(payload.to?.[index] ?? 0),
          fouls: Number(payload.fouls?.[index] ?? 0),
          fgMade: Number(payload.fg?.[index] ?? 0),
          fgAtt: Number(payload.fg_att?.[index] ?? 0),
          plusMinus: Number(payload.plus_minus?.[index] ?? 0),
        })).sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

        if (!cancelled) {
          setPlayerRows(nextRows);
        }
      } catch {
        if (!cancelled) {
          setPlayerRows([]);
        }
      }
    }

    void loadPlayerTrends();
    return () => {
      cancelled = true;
    };
  }, [selectedPlayer]);

  useEffect(() => {
    let cancelled = false;

    async function loadComparison() {
      if (!selectedPlayer || !comparePlayer || selectedPlayer === comparePlayer) {
        setComparison(null);
        return;
      }

      try {
        const params = new URLSearchParams();
        params.append("players", selectedPlayer);
        params.append("players", comparePlayer);
        const response = await fetch(`${apiBase}/api/player-comparison?${params.toString()}`, { headers: apiKeyHeader() });
        if (!response.ok) {
          throw new Error("Player comparison request failed.");
        }

        const payload = await response.json() as PlayerComparisonPayload;
        if (!cancelled) {
          setComparison(payload);
        }
      } catch {
        if (!cancelled) {
          setComparison(null);
        }
      }
    }

    void loadComparison();
    return () => {
      cancelled = true;
    };
  }, [comparePlayer, selectedPlayer]);

  const summary = useMemo(() => {
    if (rows.length === 0) {
      return { recentRecord: "0-0", avgDiff: "0.0", avgFg: "0.0", avgFg3: "0.0", streak: "—" };
    }

    const recent = rows.slice(0, Math.min(5, rows.length));
    const avgFg = recent.reduce((sum, row) => sum + row.fgPct, 0) / recent.length;
    const avgFg3 = recent.reduce((sum, row) => sum + row.fg3Pct, 0) / recent.length;

    return {
      recentRecord: `${recent.filter((row) => row.teamScore > row.oppScore).length}-${recent.filter((row) => row.teamScore < row.oppScore).length}`,
      avgDiff: computeAverageMargin(recent).toFixed(1),
      avgFg: avgFg.toFixed(1),
      avgFg3: avgFg3.toFixed(1),
      streak: computeCurrentStreak(recent),
    };
  }, [rows]);

  const selectedPlayerLabel = selectedPlayer || "Selected player";
  const playerRecent = useMemo(() => playerRows.slice(0, Math.min(5, playerRows.length)), [playerRows]);
  const playerAverages = useMemo(() => {
    if (playerRecent.length === 0) {
      return { pts: "0.0", reb: "0.0", asst: "0.0" };
    }
    const size = playerRecent.length;
    return {
      pts: (playerRecent.reduce((sum, row) => sum + row.pts, 0) / size).toFixed(1),
      reb: (playerRecent.reduce((sum, row) => sum + row.reb, 0) / size).toFixed(1),
      asst: (playerRecent.reduce((sum, row) => sum + row.asst, 0) / size).toFixed(1),
    };
  }, [playerRecent]);

  const playerOptions = players.map((player) => player.full_name ?? player.name ?? "Unknown Player");

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <h1>Trends</h1>
          <p className="stats-page-subtitle">Team charts, player form, and side-by-side comparisons are back in the merged workspace.</p>
        </div>
        {status && <p className="stats-page-status">{status}</p>}
      </section>

      <section className="stats-filter-bar">
        <label className="stats-filter-field">
          <span>Focus player</span>
          <select value={selectedPlayer} onChange={(event) => setSelectedPlayer(event.target.value)}>
            {playerOptions.length === 0 ? <option value="">No players yet</option> : null}
            {playerOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="stats-filter-field">
          <span>Compare with</span>
          <select value={comparePlayer} onChange={(event) => setComparePlayer(event.target.value)}>
            <option value="">No comparison</option>
            {playerOptions.map((name) => (
              <option key={`compare-${name}`} value={name}>{name}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="stats-metric-grid">
        <div className="stats-metric-card accent-blue">
          <span className="stats-metric-label">Last 5 Record</span>
          <strong className="stats-metric-value">{summary.recentRecord}</strong>
          <span className="stats-metric-detail">Current streak {summary.streak}</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Avg Margin</span>
          <strong className="stats-metric-value">{summary.avgDiff}</strong>
          <span className="stats-metric-detail">Points over last 5</span>
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
        <div className="stats-metric-card">
          <span className="stats-metric-label">{selectedPlayerLabel} PPG</span>
          <strong className="stats-metric-value">{playerAverages.pts}</strong>
          <span className="stats-metric-detail">Last {playerRecent.length || 0} games</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">REB / AST</span>
          <strong className="stats-metric-value">{playerAverages.reb} / {playerAverages.asst}</strong>
          <span className="stats-metric-detail">Player form snapshot</span>
        </div>
      </section>

      {rows.length === 0 ? (
        <section className="stats-page-card">
          <p className="stats-empty-copy">No trend data available yet.</p>
        </section>
      ) : (
        <>
          <section className="stats-page-grid two-column" style={{ marginBottom: "1rem" }}>
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
          </section>

          <section className="stats-page-grid two-column" style={{ marginBottom: "1rem" }}>
            <section className="stats-page-card">
              <div className="stats-page-card-head">
                <h3>Player Form</h3>
                <span className="stats-page-status">{selectedPlayerLabel}</span>
              </div>
              <PlayerTrendChart rows={playerRows} playerName={selectedPlayerLabel} />
            </section>

            <section className="stats-page-card">
              <div className="stats-page-card-head">
                <h3>Player Comparison</h3>
                <span className="stats-page-status">Season averages</span>
              </div>
              <PlayerComparisonTable comparison={comparison} />
            </section>
          </section>

          <section className="stats-page-card" style={{ marginBottom: "1rem" }}>
            <div className="stats-page-card-head">
              <h3>{selectedPlayerLabel} Game Log</h3>
            </div>
            {playerRows.length === 0 ? (
              <p className="stats-empty-copy">No player trend data available yet.</p>
            ) : (
              <div className="stats-game-list">
                {playerRows.map((row) => (
                  <div key={row.id} className="stats-game-row">
                    <div>
                      <strong>{row.date || "No date"} — {row.opponent}</strong>
                      <span>{row.pts} pts · {row.reb} reb · {row.asst} ast · FG {row.fgMade}-{row.fgAtt}</span>
                    </div>
                    <div className="stats-game-score-block">
                      <strong>{row.plusMinus > 0 ? `+${row.plusMinus}` : row.plusMinus}</strong>
                      <span>{row.stl} stl · {row.turnovers} to</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="stats-page-card">
            <div className="stats-page-card-head">
              <h3>Team Game Log</h3>
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
