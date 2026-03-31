import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface GameTeamStats {
  fg?: number;
  fga?: number;
  fg3?: number;
  fg3a?: number;
  ft?: number;
  fta?: number;
  oreb?: number;
  dreb?: number;
  asst?: number;
  to?: number;
  stl?: number;
  blk?: number;
  fouls?: number;
}

interface GameSummary {
  gameId: string | number;
  date: string;
  opponent: string;
  location?: string;
  result?: string;
  vc_score: number;
  opp_score: number;
  team_stats?: GameTeamStats;
}

function safePct(made: number | undefined, attempted: number | undefined): string {
  const attempts = Number(attempted ?? 0);
  if (attempts <= 0) {
    return "0.0%";
  }
  return `${((Number(made ?? 0) / attempts) * 100).toFixed(1)}%`;
}

export function GamesPage() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [status, setStatus] = useState("Loading games...");

  useEffect(() => {
    let cancelled = false;

    async function loadGames() {
      setStatus("Loading games...");
      try {
        const response = await fetch(`${apiBase}/api/games`, { headers: apiKeyHeader() });
        if (!response.ok) {
          throw new Error("Games API request failed.");
        }

        const payload = await response.json() as GameSummary[];
        if (!cancelled) {
          setGames(Array.isArray(payload) ? payload : []);
          setStatus("Games list synced.");
        }
      } catch {
        if (!cancelled) {
          setStatus("Could not load games from the realtime API.");
        }
      }
    }

    void loadGames();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredGames = useMemo(() => {
    return [...games]
      .filter((game) => game.opponent.toLowerCase().includes(query.toLowerCase()))
      .filter((game) => !resultFilter || game.result === resultFilter)
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [games, query, resultFilter]);

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <p className="stats-page-eyebrow">Unified Coach Platform</p>
          <h1>Games</h1>
          <p className="stats-page-subtitle">This is the integrated games history slice. Editing and deep analysis can move here next without relying on the old static pages.</p>
        </div>
        <p className="stats-page-status">{status}</p>
      </section>

      <section className="stats-filter-bar">
        <label className="stats-filter-field">
          <span>Search opponent</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by opponent" />
        </label>
        <label className="stats-filter-field short">
          <span>Result</span>
          <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
            <option value="">All</option>
            <option value="W">Wins</option>
            <option value="L">Losses</option>
            <option value="T">Ties</option>
          </select>
        </label>
      </section>

      {filteredGames.length === 0 ? (
        <section className="stats-page-card">
          <p className="stats-empty-copy">No games match the current filters.</p>
        </section>
      ) : (
        <section className="stats-game-grid">
          {filteredGames.map((game) => {
            const pointDiff = Number(game.vc_score ?? 0) - Number(game.opp_score ?? 0);
            return (
              <article key={String(game.gameId)} className="stats-game-card">
                <div className="stats-game-card-head">
                  <div>
                    <p className="stats-page-eyebrow">{game.date || "No date set"}</p>
                    <h3>{game.location === "away" ? "@" : "vs"} {game.opponent}</h3>
                  </div>
                  <span className={`stats-result-badge result-${(game.result || "-").toLowerCase()}`}>{game.result || "-"}</span>
                </div>
                <div className="stats-game-scoreline">
                  <strong>{game.vc_score}</strong>
                  <span>-</span>
                  <strong>{game.opp_score}</strong>
                </div>
                <p className={`stats-diff ${pointDiff > 0 ? "positive" : pointDiff < 0 ? "negative" : "neutral"}`}>
                  {pointDiff > 0 ? `+${pointDiff}` : `${pointDiff}`}
                </p>
                <div className="stats-game-card-metrics">
                  <div>
                    <span>FG</span>
                    <strong>{safePct(game.team_stats?.fg, game.team_stats?.fga)}</strong>
                  </div>
                  <div>
                    <span>3PT</span>
                    <strong>{safePct(game.team_stats?.fg3, game.team_stats?.fg3a)}</strong>
                  </div>
                  <div>
                    <span>FT</span>
                    <strong>{safePct(game.team_stats?.ft, game.team_stats?.fta)}</strong>
                  </div>
                  <div>
                    <span>AST</span>
                    <strong>{Number(game.team_stats?.asst ?? 0)}</strong>
                  </div>
                  <div>
                    <span>TO</span>
                    <strong>{Number(game.team_stats?.to ?? 0)}</strong>
                  </div>
                  <div>
                    <span>REB</span>
                    <strong>{Number(game.team_stats?.oreb ?? 0) + Number(game.team_stats?.dreb ?? 0)}</strong>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
