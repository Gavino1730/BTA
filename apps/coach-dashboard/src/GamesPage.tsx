import type { CSSProperties } from "react";
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
  reb?: number;
  asst?: number;
  to?: number;
  stl?: number;
  blk?: number;
  fouls?: number;
}

interface PlayerStat {
  name?: string;
  number?: string | number;
  fg_made?: number;
  fg_att?: number;
  fg3_made?: number;
  fg3_att?: number;
  ft_made?: number;
  ft_att?: number;
  oreb?: number;
  dreb?: number;
  asst?: number;
  stl?: number;
  blk?: number;
  to?: number;
  fouls?: number;
  plus_minus?: number;
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
  player_stats?: PlayerStat[];
}

const STAT_COLS = [
  { key: "fg_made", label: "FGM" },
  { key: "fg_att",  label: "FGA" },
  { key: "fg3_made", label: "3PM" },
  { key: "fg3_att",  label: "3PA" },
  { key: "ft_made",  label: "FTM" },
  { key: "ft_att",   label: "FTA" },
  { key: "oreb",     label: "OR" },
  { key: "dreb",     label: "DR" },
  { key: "asst",     label: "AST" },
  { key: "stl",      label: "STL" },
  { key: "blk",      label: "BLK" },
  { key: "to",       label: "TO" },
  { key: "fouls",    label: "PF" },
  { key: "plus_minus", label: "+/-" },
] as const;

type StatKey = (typeof STAT_COLS)[number]["key"];

interface EditPlayerRow {
  name: string;
  number: string;
  fg_made: number; fg_att: number;
  fg3_made: number; fg3_att: number;
  ft_made: number; ft_att: number;
  oreb: number; dreb: number;
  asst: number; stl: number; blk: number; to: number; fouls: number;
  plus_minus: number;
}

function emptyRow(): EditPlayerRow {
  return { name: "", number: "", fg_made: 0, fg_att: 0, fg3_made: 0, fg3_att: 0, ft_made: 0, ft_att: 0, oreb: 0, dreb: 0, asst: 0, stl: 0, blk: 0, to: 0, fouls: 0, plus_minus: 0 };
}

function rowPts(r: EditPlayerRow): number {
  return ((r.fg_made - r.fg3_made) * 2) + (r.fg3_made * 3) + r.ft_made;
}
function rowReb(r: EditPlayerRow): number {
  return r.oreb + r.dreb;
}

function toEditRow(p: PlayerStat): EditPlayerRow {
  return {
    name: String(p.name ?? ""), number: String(p.number ?? ""),
    fg_made: Number(p.fg_made ?? 0), fg_att: Number(p.fg_att ?? 0),
    fg3_made: Number(p.fg3_made ?? 0), fg3_att: Number(p.fg3_att ?? 0),
    ft_made: Number(p.ft_made ?? 0), ft_att: Number(p.ft_att ?? 0),
    oreb: Number(p.oreb ?? 0), dreb: Number(p.dreb ?? 0),
    asst: Number(p.asst ?? 0), stl: Number(p.stl ?? 0), blk: Number(p.blk ?? 0),
    to: Number(p.to ?? 0), fouls: Number(p.fouls ?? 0), plus_minus: Number(p.plus_minus ?? 0),
  };
}

function sumTeamStats(rows: EditPlayerRow[]): Required<GameTeamStats> {
  const t = { fg: 0, fga: 0, fg3: 0, fg3a: 0, ft: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, asst: 0, to: 0, stl: 0, blk: 0, fouls: 0 };
  for (const r of rows) {
    t.fg += r.fg_made; t.fga += r.fg_att;
    t.fg3 += r.fg3_made; t.fg3a += r.fg3_att;
    t.ft += r.ft_made; t.fta += r.ft_att;
    t.oreb += r.oreb; t.dreb += r.dreb;
    t.asst += r.asst; t.to += r.to;
    t.stl += r.stl; t.blk += r.blk; t.fouls += r.fouls;
  }
  t.reb = t.oreb + t.dreb;
  return t;
}

const inputSt: CSSProperties = {
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.16)",
  color: "var(--text)", borderRadius: 8, padding: "0.55rem 0.7rem", width: "100%", boxSizing: "border-box",
};
const cellSt: CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  color: "var(--text)", borderRadius: 5, padding: "0.28rem 0.35rem", textAlign: "center", width: "100%", boxSizing: "border-box",
};
const thSt: CSSProperties = {
  padding: "0.35rem 0.35rem", textAlign: "center", fontSize: "0.7rem",
  textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap",
};

function EditModal({ game, onClose, onSaved }: { game: GameSummary; onClose: () => void; onSaved: (g: GameSummary) => void }) {
  const [date, setDate] = useState(game.date ?? "");
  const [opponent, setOpponent] = useState(game.opponent ?? "");
  const [location, setLocation] = useState(game.location ?? "home");
  const [vcScore, setVcScore] = useState(String(game.vc_score ?? 0));
  const [oppScore, setOppScore] = useState(String(game.opp_score ?? 0));
  const [rows, setRows] = useState<EditPlayerRow[]>(() =>
    Array.isArray(game.player_stats) && game.player_stats.length > 0
      ? game.player_stats.map(toEditRow)
      : [emptyRow()]
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const ts = useMemo(() => sumTeamStats(rows), [rows]);
  const playerPts = useMemo(() => rows.reduce((s, r) => s + rowPts(r), 0), [rows]);
  const namedRows = useMemo(() => rows.filter(r => r.name.trim()), [rows]);
  const mismatch = namedRows.length > 0 && (Number(vcScore) || 0) !== playerPts;

  function setField(i: number, key: keyof EditPlayerRow, val: string) {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      if (key === "name" || key === "number") return { ...r, [key]: val };
      return { ...r, [key]: Math.max(key === "plus_minus" ? -99 : 0, parseInt(val, 10) || 0) };
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        date, opponent, location,
        vc_score: Number(vcScore) || 0,
        opp_score: Number(oppScore) || 0,
        team_stats: ts,
        player_stats: namedRows.map(r => ({ ...r, reb: rowReb(r), pts: rowPts(r) })),
      };
      const res = await fetch(`${apiBase}/api/games/${encodeURIComponent(String(game.gameId))}`, {
        method: "PUT",
        headers: { ...apiKeyHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Save failed");
      }
      const result = await res.json() as { game: GameSummary };
      onSaved(result.game);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, overflowY: "auto", display: "flex", justifyContent: "center", padding: "1.5rem 1rem" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 16, width: "100%", maxWidth: 1200, alignSelf: "flex-start" }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.1rem 1.4rem", borderBottom: "1px solid var(--border)" }}>
          <div>
            <p style={{ margin: 0, fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.06em" }}>Edit Game #{game.gameId}</p>
            <h2 style={{ margin: "0.2rem 0 0" }}>{game.location === "away" ? "@" : "vs"} {game.opponent}</h2>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border-hi)", color: "var(--text)", borderRadius: 8, padding: "0.45rem 0.9rem", cursor: "pointer" }}>Cancel</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} style={{ background: "var(--teal)", border: "none", color: "#fff", borderRadius: 8, padding: "0.45rem 1.1rem", cursor: saving ? "default" : "pointer", fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        <div style={{ padding: "1.1rem 1.4rem" }}>
          {saveError && <p style={{ color: "var(--red)", marginBottom: "0.75rem" }}>{saveError}</p>}

          {/* meta fields */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.65rem", marginBottom: "1rem" }}>
            {([
              ["Date", <input key="d" value={date} onChange={e => setDate(e.target.value)} style={inputSt} />],
              ["Opponent", <input key="o" value={opponent} onChange={e => setOpponent(e.target.value)} style={inputSt} />],
              ["Location", (
                <select key="l" value={location} onChange={e => setLocation(e.target.value)} style={inputSt}>
                  <option value="home">Home</option>
                  <option value="away">Away</option>
                  <option value="neutral">Neutral</option>
                </select>
              )],
              ["Team Score", <input key="vs" type="number" min={0} value={vcScore} onChange={e => setVcScore(e.target.value)} style={inputSt} />],
              ["Opp Score",  <input key="os" type="number" min={0} value={oppScore} onChange={e => setOppScore(e.target.value)} style={inputSt} />],
            ] as [string, React.ReactNode][]).map(([lbl, el]) => (
              <label key={lbl} style={{ display: "flex", flexDirection: "column", gap: "0.28rem" }}>
                <span style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-muted)" }}>{lbl}</span>
                {el}
              </label>
            ))}
          </div>

          {/* derived summary */}
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "0.8rem 1rem", marginBottom: "0.85rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "0.5rem" }}>
            {([["FG", `${ts.fg}-${ts.fga}`], ["3P", `${ts.fg3}-${ts.fg3a}`], ["FT", `${ts.ft}-${ts.fta}`], ["REB", String(ts.reb)], ["AST/TO", `${ts.asst}/${ts.to}`], ["Plyr PTS", String(playerPts)]] as [string, string][]).map(([lbl, val]) => (
              <div key={lbl}>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{lbl}</div>
                <div style={{ fontWeight: 700, color: lbl === "Plyr PTS" && mismatch ? "var(--red)" : "var(--text)" }}>{val}</div>
              </div>
            ))}
          </div>
          {mismatch && <p style={{ color: "var(--red)", fontSize: "0.83rem", marginBottom: "0.75rem" }}>Player totals ({playerPts}) don't match team score ({vcScore}).</p>}

          {/* box score table */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ margin: 0 }}>Box Score</h3>
            <button type="button" onClick={() => setRows(p => [...p, emptyRow()])} style={{ background: "var(--teal)", border: "none", color: "#fff", borderRadius: 7, padding: "0.38rem 0.8rem", cursor: "pointer", fontSize: "0.83rem" }}>+ Add Row</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1300, fontSize: "0.81rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ ...thSt, textAlign: "left", minWidth: 140 }}>Player</th>
                  <th style={{ ...thSt, minWidth: 44 }}>#</th>
                  {STAT_COLS.map(c => <th key={c.key} style={thSt}>{c.label}</th>)}
                  <th style={thSt}>REB</th>
                  <th style={{ ...thSt, color: "var(--teal)" }}>PTS</th>
                  <th style={thSt}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "0.3rem 0.3rem" }}>
                      <input value={row.name} onChange={e => setField(i, "name", e.target.value)} placeholder="Name" style={{ ...cellSt, width: 130, textAlign: "left" }} />
                    </td>
                    <td style={{ padding: "0.3rem 0.2rem" }}>
                      <input value={row.number} onChange={e => setField(i, "number", e.target.value)} placeholder="#" style={{ ...cellSt, width: 40 }} />
                    </td>
                    {STAT_COLS.map(c => (
                      <td key={c.key} style={{ padding: "0.3rem 0.2rem" }}>
                        <input type="number" value={String(row[c.key as StatKey])} onChange={e => setField(i, c.key as keyof EditPlayerRow, e.target.value)} style={{ ...cellSt, width: 46 }} />
                      </td>
                    ))}
                    <td style={{ padding: "0.3rem 0.2rem", fontWeight: 700, textAlign: "center" }}>{rowReb(row)}</td>
                    <td style={{ padding: "0.3rem 0.2rem", fontWeight: 700, color: "var(--teal)", textAlign: "center" }}>{rowPts(row)}</td>
                    <td style={{ padding: "0.3rem 0.2rem" }}>
                      <button type="button" onClick={() => setRows(p => p.filter((_, j) => j !== i))} style={{ background: "rgba(248,113,113,0.14)", border: "none", color: "var(--red)", borderRadius: 6, padding: "0.28rem 0.55rem", cursor: "pointer" }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
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
  const [editGame, setEditGame] = useState<GameSummary | null>(null);

  function loadGames() {
    setStatus("Loading games...");
    let cancelled = false;
    fetch(`${apiBase}/api/games`, { headers: apiKeyHeader() })
      .then(r => r.ok ? r.json() as Promise<GameSummary[]> : Promise.reject(new Error("Games API failed")))
      .then(payload => { if (!cancelled) { setGames(Array.isArray(payload) ? payload : []); setStatus(""); } })
      .catch(() => { if (!cancelled) setStatus("Could not load games."); });
    return () => { cancelled = true; };
  }

  useEffect(loadGames, []);

  const filteredGames = useMemo(() => {
    return [...games]
      .filter((game) => game.opponent.toLowerCase().includes(query.toLowerCase()))
      .filter((game) => !resultFilter || game.result === resultFilter)
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [games, query, resultFilter]);

  function handleSaved(updated: GameSummary) {
    setGames(prev => prev.map(g => String(g.gameId) === String(updated.gameId) ? updated : g));
    setEditGame(updated);
  }

  return (
    <div className="stats-page">
      {editGame && (
        <EditModal
          game={editGame}
          onClose={() => setEditGame(null)}
          onSaved={handleSaved}
        />
      )}

      <section className="stats-page-hero compact">
        <div>
          <h1>Games</h1>
          <p className="stats-page-subtitle">Full season history. Click any game to view or edit the box score.</p>
        </div>
        {status && <p className="stats-page-status">{status}</p>}
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
              <article
                key={String(game.gameId)}
                className="stats-game-card"
                style={{ cursor: "pointer" }}
                onClick={() => setEditGame(game)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setEditGame(game); }}
              >
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
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--teal)", opacity: 0.8 }}>Click to edit box score →</p>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
