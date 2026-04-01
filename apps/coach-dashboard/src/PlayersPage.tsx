import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface PlayerSummary {
  playerId?: string;
  name?: string;
  full_name?: string;
  number?: string | number;
  ppg?: number;
  rpg?: number;
  apg?: number;
  fg_pct?: number;
  ft_pct?: number;
  games_played?: number;
}

function safeNum(value: number | undefined, digits = 1): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : (0).toFixed(digits);
}

export function PlayersPage() {
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading players...");

  useEffect(() => {
    let cancelled = false;
    async function loadPlayers() {
      setStatus("Loading players...");
      try {
        const response = await fetch(`${apiBase}/api/players`, { headers: apiKeyHeader() });
        if (!response.ok) {
          throw new Error("Players API request failed.");
        }
        const payload = await response.json() as PlayerSummary[];
        if (!cancelled) {
          setPlayers(Array.isArray(payload) ? payload : []);
          setStatus("Players synced.");
        }
      } catch {
        if (!cancelled) {
          setStatus("Could not load player summaries from the realtime API.");
        }
      }
    }

    void loadPlayers();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return players;
    }
    return players.filter((player) => {
      const name = String(player.full_name ?? player.name ?? "").toLowerCase();
      const number = String(player.number ?? "").toLowerCase();
      return name.includes(normalized) || number.includes(normalized);
    });
  }, [players, query]);

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <h1>Players</h1>
          <p className="stats-page-subtitle">Player summaries are now available directly in the coach workspace.</p>
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
            const name = player.full_name ?? player.name ?? `Player ${index + 1}`;
            return (
              <article key={`${name}-${index}`} className="stats-game-card">
                <div className="stats-game-card-head">
                  <div>
                    <p className="stats-page-eyebrow">#{player.number ?? "-"}</p>
                    <h3>{name}</h3>
                  </div>
                  <span className="stats-result-badge result-t">{Number(player.games_played ?? 0)} GP</span>
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
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
