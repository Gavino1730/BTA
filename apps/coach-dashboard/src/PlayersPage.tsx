import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";
import {
  buildPlayerGameHistory,
  type GamePlayerStat,
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

interface PlayerGameBoxScore {
  game: GameSummary;
  stat: GamePlayerStat;
}

function findPlayerBoxScoreForGame(player: PlayerSummary, game: GameSummary): GamePlayerStat | null {
  const targetKeys = new Set(
    [player.playerId, player.full_name, player.name]
      .map((value) => normalizePlayerLookupKey(value))
      .filter(Boolean)
  );
  const targetNumber = normalizePlayerLookupKey(String(player.number ?? ""));

  for (const stat of game.player_stats ?? []) {
    const nameKey = normalizePlayerLookupKey(stat.name);
    const idKey = normalizePlayerLookupKey(stat.playerId);
    const numberKey = normalizePlayerLookupKey(String(stat.number ?? ""));

    if ((nameKey && targetKeys.has(nameKey)) || (idKey && targetKeys.has(idKey))) {
      return stat;
    }
    if (targetNumber && numberKey && targetNumber === numberKey) {
      return stat;
    }
  }

  return null;
}

function PlayerDetailModal({ player, history, games, onClose }: { player: PlayerSummary; history: PlayerGameHistoryRow[]; games: GameSummary[]; onClose: () => void }) {
  const [advanced, setAdvanced] = useState<PlayerAdvancedPayload | null>(null);
  const [status, setStatus] = useState("Loading player details...");
  const [selectedGameId, setSelectedGameId] = useState("");
  const playerName = getPlayerDisplayName(player);

  const playerGameBoxScores = useMemo<PlayerGameBoxScore[]>(() => {
    return games
      .map((game) => {
        const stat = findPlayerBoxScoreForGame(player, game);
        return stat ? { game, stat } : null;
      })
      .filter((entry): entry is PlayerGameBoxScore => Boolean(entry))
      .sort((left, right) => new Date(right.game.date).getTime() - new Date(left.game.date).getTime());
  }, [games, player]);

  useEffect(() => {
    if (playerGameBoxScores.length === 0) {
      setSelectedGameId("");
      return;
    }

    if (!selectedGameId || !playerGameBoxScores.some((entry) => String(entry.game.gameId) === selectedGameId)) {
      setSelectedGameId(String(playerGameBoxScores[0].game.gameId));
    }
  }, [playerGameBoxScores, selectedGameId]);

  const selectedGameBoxScore = useMemo(() => {
    return playerGameBoxScores.find((entry) => String(entry.game.gameId) === selectedGameId) ?? null;
  }, [playerGameBoxScores, selectedGameId]);

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
            <h3>Game Box Scores</h3>
            <span className="stats-page-status">Select a game to view this player's full box score line.</span>
          </div>

          {playerGameBoxScores.length === 0 ? (
            <p className="stats-empty-copy">As soon as box scores are logged, they will appear here.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.9rem" }}>
              <label className="stats-filter-field short" style={{ maxWidth: 320 }}>
                <span>Game</span>
                <select value={selectedGameId} onChange={(event) => setSelectedGameId(event.target.value)}>
                  {playerGameBoxScores.map((entry) => {
                    const gameId = String(entry.game.gameId);
                    const dateLabel = entry.game.date || "No date";
                    const opponentLabel = entry.game.location === "away" ? `@ ${entry.game.opponent}` : `vs ${entry.game.opponent}`;
                    const scoreLabel = `${entry.game.vc_score}-${entry.game.opp_score}`;
                    return (
                      <option key={gameId} value={gameId}>
                        {dateLabel} - {opponentLabel} ({entry.game.result || "-"} {scoreLabel})
                      </option>
                    );
                  })}
                </select>
              </label>

              {selectedGameBoxScore ? (
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
                        <th>BLK</th>
                        <th>TO</th>
                        <th>PF</th>
                        <th>+/-</th>
                        <th>FG</th>
                        <th>3PT</th>
                        <th>FT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const { game, stat } = selectedGameBoxScore;
                        const rebounds = Number(stat.reb ?? (Number(stat.oreb ?? 0) + Number(stat.dreb ?? 0)));
                        const fgDisplay = `${Number(stat.fg_made ?? 0)}-${Number(stat.fg_att ?? 0)}`;
                        const fg3Display = `${Number(stat.fg3_made ?? 0)}-${Number(stat.fg3_att ?? 0)}`;
                        const ftDisplay = `${Number(stat.ft_made ?? 0)}-${Number(stat.ft_att ?? 0)}`;
                        return (
                          <tr>
                            <td>{game.date || "-"}</td>
                            <td>{game.location === "away" ? "@ " : "vs "}{game.opponent || "Opponent"}</td>
                            <td>{game.result || "-"} {Number(game.vc_score ?? 0)}-{Number(game.opp_score ?? 0)}</td>
                            <td>{Number(stat.pts ?? ((Number(stat.fg_made ?? 0) - Number(stat.fg3_made ?? 0)) * 2 + (Number(stat.fg3_made ?? 0) * 3) + Number(stat.ft_made ?? 0)))}</td>
                            <td>{rebounds}</td>
                            <td>{Number(stat.asst ?? 0)}</td>
                            <td>{Number(stat.stl ?? 0)}</td>
                            <td>{Number(stat.blk ?? 0)}</td>
                            <td>{Number(stat.to ?? 0)}</td>
                            <td>{Number(stat.fouls ?? 0)}</td>
                            <td>{Number(stat.plus_minus ?? 0)}</td>
                            <td>{fgDisplay}</td>
                            <td>{fg3Display}</td>
                            <td>{ftDisplay}</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : null}
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
  const [sortBy, setSortBy] = useState<"ppg" | "apg" | "rpg" | "fg_pct" | "defense">("ppg");
  const [minimumGames, setMinimumGames] = useState("0");
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
    const minGamesValue = Number.parseInt(minimumGames, 10) || 0;
    const nextPlayers = [...players].filter((player) => {
      if (!normalized) {
        return getPlayerGamesPlayed(player) >= minGamesValue;
      }

      const name = normalizePlayerLookupKey(getPlayerDisplayName(player));
      const number = normalizePlayerLookupKey(String(player.number ?? ""));
      return (name.includes(normalized) || number.includes(normalized)) && getPlayerGamesPlayed(player) >= minGamesValue;
    });

    return nextPlayers.sort((left, right) => {
      if (sortBy === "apg") return Number(right.apg ?? 0) - Number(left.apg ?? 0);
      if (sortBy === "rpg") return Number(right.rpg ?? 0) - Number(left.rpg ?? 0);
      if (sortBy === "fg_pct") return Number(right.fg_pct ?? 0) - Number(left.fg_pct ?? 0);
      if (sortBy === "defense") {
        const rightDefense = Number(right.spg ?? 0) + Number(right.bpg ?? 0);
        const leftDefense = Number(left.spg ?? 0) + Number(left.bpg ?? 0);
        if (rightDefense !== leftDefense) return rightDefense - leftDefense;
      }
      return Number(right.ppg ?? 0) - Number(left.ppg ?? 0);
    });
  }, [minimumGames, players, query, sortBy]);

  const selectedHistory = useMemo(() => {
    return selectedPlayer ? buildPlayerGameHistory(selectedPlayer, games) : [];
  }, [games, selectedPlayer]);

  return (
    <div className="stats-page">
      {selectedPlayer ? (
        <PlayerDetailModal
          player={selectedPlayer}
          history={selectedHistory}
          games={games}
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
        <label className="stats-filter-field short">
          <span>Sort by</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "ppg" | "apg" | "rpg" | "fg_pct" | "defense")}>
            <option value="ppg">PPG</option>
            <option value="apg">APG</option>
            <option value="rpg">RPG</option>
            <option value="fg_pct">FG%</option>
            <option value="defense">Defense (SPG+BPG)</option>
          </select>
        </label>
        <label className="stats-filter-field short">
          <span>Min games</span>
          <select value={minimumGames} onChange={(event) => setMinimumGames(event.target.value)}>
            <option value="0">All</option>
            <option value="3">3+</option>
            <option value="5">5+</option>
            <option value="10">10+</option>
          </select>
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
                  <div>
                    <span>SPG</span>
                    <strong>{safeNum(player.spg)}</strong>
                  </div>
                  <div>
                    <span>BPG</span>
                    <strong>{safeNum(player.bpg)}</strong>
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
