import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";
import {
  buildPlayerGameHistory,
  getPlayerDisplayName,
  getPlayerGamesPlayed,
  normalizePlayerLookupKey,
  type GameSummary,
  type PlayerGameHistoryRow,
  type PlayerSummary,
} from "./player-history.js";

interface PlayerAdvancedPayload {
  scoring_efficiency?: {
    per?: number;
    efg_pct?: number;
    ts_pct?: number;
    pts_per_shot?: number;
  };
  usage_role?: {
    role?: string;
    usage_proxy?: number;
    scoring_share?: number;
  };
  ball_handling?: {
    ast_to_ratio?: number;
  };
  impact?: {
    efficiency_grade?: string;
  };
}

function safeNum(value: number | undefined, digits = 1): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : (0).toFixed(digits);
}

function ScoreTrend({ history }: { history: PlayerGameHistoryRow[] }) {
  const rows = [...history].slice(0, 5).reverse();
  const maxPts = Math.max(...rows.map((row) => row.pts), 1);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`, gap: "0.55rem", alignItems: "end" }}>
      {rows.map((row) => {
        const height = Math.max(16, Math.round((row.pts / maxPts) * 96));
        return (
          <div key={row.gameId} style={{ display: "grid", gap: "0.35rem", justifyItems: "center" }}>
            <strong style={{ fontSize: "0.85rem", color: "var(--text)" }}>{row.pts}</strong>
            <div
              aria-hidden="true"
              style={{
                width: "100%",
                maxWidth: 44,
                height,
                borderRadius: 10,
                background: row.result === "W" ? "linear-gradient(180deg, #4f8cff, #295ecf)" : "linear-gradient(180deg, #f59e0b, #b45309)",
              }}
            />
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center" }}>{row.opponent}</span>
          </div>
        );
      })}
    </div>
  );
}

function PlayerDetailModal({ player, history, onClose }: { player: PlayerSummary; history: PlayerGameHistoryRow[]; onClose: () => void }) {
  const [advanced, setAdvanced] = useState<PlayerAdvancedPayload | null>(null);
  const [status, setStatus] = useState("Loading player details...");
  const playerName = getPlayerDisplayName(player);

  useEffect(() => {
    let cancelled = false;

    async function loadAdvanced() {
      try {
        const response = await fetch(`${apiBase}/api/advanced/player/${encodeURIComponent(playerName)}`, {
          headers: apiKeyHeader(),
        });

        if (!response.ok) {
          throw new Error("Advanced player request failed.");
        }

        const payload = await response.json() as PlayerAdvancedPayload;
        if (!cancelled) {
          setAdvanced(payload);
          setStatus("");
        }
      } catch {
        if (!cancelled) {
          setStatus("Previous game logs are restored. Advanced efficiency details are still syncing.");
        }
      }
    }

    void loadAdvanced();
    return () => {
      cancelled = true;
    };
  }, [playerName]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const recentRows = history.slice(0, 5);
  const recentAvg = recentRows.length > 0
    ? recentRows.reduce((sum, row) => sum + row.pts, 0) / recentRows.length
    : Number(player.ppg ?? 0);
  const highGame = history.reduce((max, row) => Math.max(max, row.pts), 0);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.76)", zIndex: 1000, overflowY: "auto", display: "flex", justifyContent: "center", padding: "1.5rem 1rem" }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="stats-page-card" style={{ width: "100%", maxWidth: 1080, alignSelf: "flex-start", padding: "1.15rem 1.15rem 1.25rem" }}>
        <div className="stats-game-card-head" style={{ marginBottom: "1rem", alignItems: "flex-start" }}>
          <div>
            <p className="stats-page-eyebrow">#{player.number ?? "-"} · {getPlayerGamesPlayed(player)} GP</p>
            <h2 style={{ margin: 0 }}>{playerName}</h2>
            <p className="stats-page-subcopy" style={{ marginTop: "0.3rem" }}>
              {player.role ? `${player.role} · ` : ""}Season averages, recent form, and previous game stats.
            </p>
          </div>
          <div style={{ display: "grid", gap: "0.45rem", justifyItems: "end" }}>
            {status ? <span className="stats-page-status">{status}</span> : null}
            <button
              type="button"
              onClick={onClose}
              style={{ background: "transparent", border: "1px solid var(--border-hi)", color: "var(--text)", borderRadius: 10, padding: "0.45rem 0.85rem", cursor: "pointer" }}
            >
              Close
            </button>
          </div>
        </div>

        <section className="stats-metric-grid" style={{ marginBottom: "1rem" }}>
          <div className="stats-metric-card accent-blue">
            <span className="stats-metric-label">PPG</span>
            <strong className="stats-metric-value">{safeNum(player.ppg)}</strong>
            <span className="stats-metric-detail">Recent 5 avg {safeNum(recentAvg)}</span>
          </div>
          <div className="stats-metric-card">
            <span className="stats-metric-label">Rebounds</span>
            <strong className="stats-metric-value">{safeNum(player.rpg)}</strong>
            <span className="stats-metric-detail">{Number(player.reb ?? 0)} total boards</span>
          </div>
          <div className="stats-metric-card">
            <span className="stats-metric-label">Assists</span>
            <strong className="stats-metric-value">{safeNum(player.apg)}</strong>
            <span className="stats-metric-detail">AST/TO {safeNum(advanced?.ball_handling?.ast_to_ratio)}</span>
          </div>
          <div className="stats-metric-card">
            <span className="stats-metric-label">Shooting</span>
            <strong className="stats-metric-value">{safeNum(player.fg_pct)}%</strong>
            <span className="stats-metric-detail">3PT {safeNum(player.fg3_pct)}% · FT {safeNum(player.ft_pct)}%</span>
          </div>
        </section>

        <section className="stats-page-grid two-column" style={{ marginBottom: "1rem" }}>
          <article className="stats-page-card">
            <div className="stats-page-card-head">
              <h3>Recent Scoring</h3>
              <span className="stats-page-status">High game {highGame}</span>
            </div>
            {history.length === 0 ? (
              <p className="stats-empty-copy">No previous box scores have been logged for this player yet.</p>
            ) : (
              <ScoreTrend history={history} />
            )}
          </article>

          <article className="stats-page-card">
            <div className="stats-page-card-head">
              <h3>Season Snapshot</h3>
              <span className="stats-page-status">{advanced?.impact?.efficiency_grade ? `${advanced.impact.efficiency_grade} impact` : "Live"}</span>
            </div>
            <div className="stats-game-card-metrics">
              <div>
                <span>PER</span>
                <strong>{safeNum(advanced?.scoring_efficiency?.per)}</strong>
              </div>
              <div>
                <span>eFG%</span>
                <strong>{safeNum(advanced?.scoring_efficiency?.efg_pct)}%</strong>
              </div>
              <div>
                <span>TS%</span>
                <strong>{safeNum(advanced?.scoring_efficiency?.ts_pct)}%</strong>
              </div>
              <div>
                <span>Usage</span>
                <strong>{safeNum(advanced?.usage_role?.usage_proxy)}%</strong>
              </div>
              <div>
                <span>Shot Share</span>
                <strong>{safeNum(advanced?.usage_role?.scoring_share)}%</strong>
              </div>
              <div>
                <span>PTS/Shot</span>
                <strong>{safeNum(advanced?.scoring_efficiency?.pts_per_shot, 2)}</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Previous Games</h3>
            <span className="stats-page-status">Click any game in the Games tab to edit the box score.</span>
          </div>

          {history.length === 0 ? (
            <p className="stats-empty-copy">As soon as box scores are logged, they will appear here.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="team-comparison-table" style={{ marginTop: 0 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opponent</th>
                    <th>Result</th>
                    <th>PTS</th>
                    <th>REB</th>
                    <th>AST</th>
                    <th>STL</th>
                    <th>FG</th>
                    <th>3PT</th>
                    <th>FT</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.gameId}>
                      <td>{row.date || "—"}</td>
                      <td>{row.location === "away" ? "@ " : "vs "}{row.opponent}</td>
                      <td>{row.result} {row.teamScore}-{row.oppScore}</td>
                      <td>{row.pts}</td>
                      <td>{row.reb}</td>
                      <td>{row.asst}</td>
                      <td>{row.stl}</td>
                      <td>{row.fgDisplay}</td>
                      <td>{row.fg3Display}</td>
                      <td>{row.ftDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function PlayersPage() {
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading players...");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      setStatus("Loading players...");

      const [playersResult, gamesResult] = await Promise.allSettled([
        fetch(`${apiBase}/api/players`, { headers: apiKeyHeader() }),
        fetch(`${apiBase}/api/games`, { headers: apiKeyHeader() }),
      ]);

      if (cancelled) {
        return;
      }

      if (playersResult.status !== "fulfilled" || !playersResult.value.ok) {
        setStatus("Could not load player summaries from the realtime API.");
        return;
      }

      const playersPayload = await playersResult.value.json() as PlayerSummary[];
      setPlayers(Array.isArray(playersPayload) ? playersPayload : []);

      if (gamesResult.status === "fulfilled" && gamesResult.value.ok) {
        const gamesPayload = await gamesResult.value.json() as GameSummary[];
        setGames(Array.isArray(gamesPayload) ? gamesPayload : []);
        setStatus("Players synced. Click any player to see previous stats.");
      } else {
        setGames([]);
        setStatus("Player cards loaded. Previous game history is still syncing.");
      }
    }

    void loadPlayers();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = normalizePlayerLookupKey(query);
    const nextPlayers = [...players].filter((player) => {
      if (!normalized) {
        return true;
      }

      const name = normalizePlayerLookupKey(getPlayerDisplayName(player));
      const number = normalizePlayerLookupKey(String(player.number ?? ""));
      return name.includes(normalized) || number.includes(normalized);
    });

    return nextPlayers.sort((left, right) => {
      return Number(right.ppg ?? 0) - Number(left.ppg ?? 0);
    });
  }, [players, query]);

  const selectedHistory = useMemo(() => {
    return selectedPlayer ? buildPlayerGameHistory(selectedPlayer, games) : [];
  }, [games, selectedPlayer]);

  return (
    <div className="stats-page">
      {selectedPlayer ? (
        <PlayerDetailModal
          player={selectedPlayer}
          history={selectedHistory}
          onClose={() => setSelectedPlayer(null)}
        />
      ) : null}

      <section className="stats-page-hero compact">
        <div>
          <h1>Players</h1>
          <p className="stats-page-subtitle">Click any player card to open season breakdowns and previous game logs.</p>
        </div>
        <p className="stats-page-status">{status}</p>
      </section>

      <section className="stats-filter-bar">
        <label className="stats-filter-field">
          <span>Search name or number</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players" />
        </label>
      </section>

      {filtered.length === 0 ? (
        <section className="stats-page-card">
          <p className="stats-empty-copy">No players available for the current filters.</p>
        </section>
      ) : (
        <section className="stats-game-grid">
          {filtered.map((player, index) => {
            const name = getPlayerDisplayName(player) || `Player ${index + 1}`;
            return (
              <article
                key={`${name}-${index}`}
                className="stats-game-card"
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedPlayer(player)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setSelectedPlayer(player);
                  }
                }}
              >
                <div className="stats-game-card-head">
                  <div>
                    <p className="stats-page-eyebrow">#{player.number ?? "-"}</p>
                    <h3>{name}</h3>
                  </div>
                  <span className="stats-result-badge result-t">{getPlayerGamesPlayed(player)} GP</span>
                </div>

                <div className="stats-game-card-metrics">
                  <div>
                    <span>PPG</span>
                    <strong>{safeNum(player.ppg)}</strong>
                  </div>
                  <div>
                    <span>RPG</span>
                    <strong>{safeNum(player.rpg)}</strong>
                  </div>
                  <div>
                    <span>APG</span>
                    <strong>{safeNum(player.apg)}</strong>
                  </div>
                  <div>
                    <span>FG%</span>
                    <strong>{safeNum(player.fg_pct)}%</strong>
                  </div>
                  <div>
                    <span>FT%</span>
                    <strong>{safeNum(player.ft_pct)}%</strong>
                  </div>
                </div>

                <p className="stats-page-subcopy" style={{ marginTop: "0.8rem" }}>
                  {Number(player.pts ?? 0)} total points · click for previous game stats
                </p>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
