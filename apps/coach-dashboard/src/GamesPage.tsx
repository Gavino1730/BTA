import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader, formatSchoolNameFromId, resolveActiveSchoolId } from "./platform.js";

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
  pts?: number;
  fg?: number;
  fga?: number;
  fg3?: number;
  fg3a?: number;
  ft?: number;
  fta?: number;
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
  coach_notes?: string;
}

interface LiveInsightItem {
  id?: string;
  type?: string;
  priority?: "urgent" | "important" | "info";
  message?: string;
  explanation?: string;
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
  pts?: number;
  fg_made: number; fg_att: number;
  fg3_made: number; fg3_att: number;
  ft_made: number; ft_att: number;
  oreb: number; dreb: number;
  asst: number; stl: number; blk: number; to: number; fouls: number;
  plus_minus: number;
}

function emptyRow(): EditPlayerRow {
  return { name: "", number: "", pts: undefined, fg_made: 0, fg_att: 0, fg3_made: 0, fg3_att: 0, ft_made: 0, ft_att: 0, oreb: 0, dreb: 0, asst: 0, stl: 0, blk: 0, to: 0, fouls: 0, plus_minus: 0 };
}

function rowPts(r: EditPlayerRow): number {
  if (Number.isFinite(r.pts)) {
    return Math.max(0, Number(r.pts));
  }
  return ((r.fg_made - r.fg3_made) * 2) + (r.fg3_made * 3) + r.ft_made;
}
function rowReb(r: EditPlayerRow): number {
  return r.oreb + r.dreb;
}

function toEditRow(p: PlayerStat): EditPlayerRow {
  return {
    name: String(p.name ?? ""), number: String(p.number ?? ""),
    pts: Number.isFinite(Number(p.pts)) ? Number(p.pts) : undefined,
    fg_made: Number(p.fg_made ?? p.fg ?? 0), fg_att: Number(p.fg_att ?? p.fga ?? 0),
    fg3_made: Number(p.fg3_made ?? p.fg3 ?? 0), fg3_att: Number(p.fg3_att ?? p.fg3a ?? 0),
    ft_made: Number(p.ft_made ?? p.ft ?? 0), ft_att: Number(p.ft_att ?? p.fta ?? 0),
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
const readOnlyFieldSt: CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "0.55rem 0.7rem",
  width: "100%",
  boxSizing: "border-box",
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  cursor: "default",
  userSelect: "text",
};
const cellSt: CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  color: "var(--text)", borderRadius: 5, padding: "0.32rem 0.4rem", textAlign: "center", width: "100%", boxSizing: "border-box",
  fontVariantNumeric: "tabular-nums",
};
const thSt: CSSProperties = {
  padding: "0.5rem 0.45rem", textAlign: "center", fontSize: "0.72rem",
  textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap",
  fontWeight: 700, letterSpacing: "0.04em",
  borderBottom: "2px solid var(--border-hi)",
  background: "var(--surface-2)",
};

function pctValue(made: number, attempted: number): number | null {
  if (attempted <= 0) {
    return null;
  }
  return (made / attempted) * 100;
}

function formatPct(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `${value.toFixed(1)}%`;
}

function formatDateDisplay(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value || "Date TBD";
  }
  return parsed.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function teamInitials(value: string): string {
  const clean = value.trim();
  if (!clean) return "--";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
}

function computeRecordAfterGame(games: GameSummary[], gameId: string | number): string | null {
  const sorted = [...games].sort((a, b) => {
    const aDate = new Date(a.date).getTime();
    const bDate = new Date(b.date).getTime();
    const safeA = Number.isNaN(aDate) ? 0 : aDate;
    const safeB = Number.isNaN(bDate) ? 0 : bDate;
    if (safeA !== safeB) return safeA - safeB;
    return String(a.gameId).localeCompare(String(b.gameId));
  });

  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const item of sorted) {
    if (item.result === "W") wins += 1;
    if (item.result === "L") losses += 1;
    if (item.result === "T") ties += 1;
    if (String(item.gameId) === String(gameId)) {
      return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
    }
  }
  return null;
}

function formatBoxScoreForClipboard(input: {
  gameId: string | number;
  date: string;
  location: string;
  opponent: string;
  teamName: string;
  vcScore: number;
  oppScore: number;
  resultCode: string;
  teamStats: Required<GameTeamStats>;
  playerRows: EditPlayerRow[];
  coachNotes: string;
}): string {
  const locationLabel = input.location === "away" ? "Away" : input.location === "neutral" ? "Neutral" : "Home";
  const lines: string[] = [
    `${input.teamName} ${input.vcScore} - ${input.oppScore} ${input.opponent}`,
    `Result: ${input.resultCode} | ${locationLabel} | ${formatDateDisplay(input.date)} | Game #${input.gameId}`,
    "",
    "Team Stats",
    `FG ${input.teamStats.fg}/${input.teamStats.fga} (${formatPct(pctValue(input.teamStats.fg, input.teamStats.fga))})`,
    `3PT ${input.teamStats.fg3}/${input.teamStats.fg3a} (${formatPct(pctValue(input.teamStats.fg3, input.teamStats.fg3a))})`,
    `FT ${input.teamStats.ft}/${input.teamStats.fta} (${formatPct(pctValue(input.teamStats.ft, input.teamStats.fta))})`,
    `REB ${input.teamStats.reb} (OR ${input.teamStats.oreb}, DR ${input.teamStats.dreb})`,
    `AST ${input.teamStats.asst} | TO ${input.teamStats.to} | STL ${input.teamStats.stl} | BLK ${input.teamStats.blk} | PF ${input.teamStats.fouls}`,
    "",
    "Player Stats",
  ];

  const players = input.playerRows.filter((row) => row.name.trim().length > 0);
  if (players.length === 0) {
    lines.push("No player stats recorded.");
  } else {
    for (const row of players) {
      lines.push(
        `${row.number ? `#${row.number} ` : ""}${row.name}: ${rowPts(row)} pts, ${rowReb(row)} reb, ${row.asst} ast, FG ${row.fg_made}/${row.fg_att}, 3PT ${row.fg3_made}/${row.fg3_att}, FT ${row.ft_made}/${row.ft_att}`
      );
    }
  }

  if (input.coachNotes.trim()) {
    lines.push("", "Coach Notes", input.coachNotes.trim());
  }

  return lines.join("\n");
}

function GameModal({ game, games, teamName, onClose, onSaved, onDeleted, initialMode = "view" }: { game: GameSummary; games: GameSummary[]; teamName: string; onClose: () => void; onSaved: (g: GameSummary) => void; onDeleted: (gameId: string | number) => void; initialMode?: "view" | "edit" }) {
  const [mode, setMode] = useState<"view" | "edit">(initialMode);
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
  const [coachNotes, setCoachNotes] = useState(game.coach_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [boxMode, setBoxMode] = useState<"basic" | "advanced">("basic");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insights, setInsights] = useState<LiveInsightItem[]>([]);

  const isEditing = mode === "edit";

  const ts = useMemo(() => sumTeamStats(rows), [rows]);
  const playerPts = useMemo(() => rows.reduce((s, r) => s + rowPts(r), 0), [rows]);
  const namedRows = useMemo(() => rows.filter(r => r.name.trim()), [rows]);
  const mismatch = namedRows.length > 0 && (Number(vcScore) || 0) !== playerPts;
  const recordAfterGame = useMemo(() => computeRecordAfterGame(games, game.gameId), [games, game.gameId]);
  const fgPct = useMemo(() => pctValue(ts.fg, ts.fga), [ts.fg, ts.fga]);
  const fg3Pct = useMemo(() => pctValue(ts.fg3, ts.fg3a), [ts.fg3, ts.fg3a]);
  const ftPct = useMemo(() => pctValue(ts.ft, ts.fta), [ts.ft, ts.fta]);
  const astToRatio = useMemo(() => (ts.to > 0 ? ts.asst / ts.to : ts.asst), [ts.asst, ts.to]);
  const scoreDiff = Number(vcScore || 0) - Number(oppScore || 0);
  const inferredResult = scoreDiff > 0 ? "W" : scoreDiff < 0 ? "L" : "T";
  const resultCode = (game.result || inferredResult).toUpperCase();
  const ourTeamName = teamName.trim() || "Our Team";
  const ourTeamShort = teamInitials(ourTeamName);
  const resultLabel = resultCode === "W" ? "WIN" : resultCode === "L" ? "LOSS" : "TIE";
  const isWin = resultCode === "W";
  const isLoss = resultCode === "L";

  const topPerformers = useMemo(() => {
    return [...namedRows]
      .sort((a, b) => {
        const ptsDiff = rowPts(b) - rowPts(a);
        if (ptsDiff !== 0) return ptsDiff;
        const rebDiff = rowReb(b) - rowReb(a);
        if (rebDiff !== 0) return rebDiff;
        return b.asst - a.asst;
      })
      .slice(0, 3);
  }, [namedRows]);

  const maxPts = useMemo(() => Math.max(0, ...namedRows.map((row) => rowPts(row))), [namedRows]);
  const maxReb = useMemo(() => Math.max(0, ...namedRows.map((row) => rowReb(row))), [namedRows]);
  const maxAst = useMemo(() => Math.max(0, ...namedRows.map((row) => row.asst)), [namedRows]);

  const visibleCols = useMemo(() => {
    if (boxMode === "advanced") return STAT_COLS;
    const allowed = new Set<StatKey>(["fg_made", "fg_att", "fg3_made", "fg3_att", "ft_made", "ft_att", "asst", "to", "oreb", "dreb"]);
    return STAT_COLS.filter((col) => allowed.has(col.key));
  }, [boxMode]);

  const groupedCols = useMemo(() => {
    const shooting = visibleCols.filter((col) => ["fg_made", "fg_att", "fg3_made", "fg3_att", "ft_made", "ft_att"].includes(col.key));
    const playmaking = visibleCols.filter((col) => ["asst", "to", "plus_minus"].includes(col.key));
    const defense = visibleCols.filter((col) => ["oreb", "dreb", "stl", "blk", "fouls"].includes(col.key));
    return { shooting, playmaking, defense };
  }, [visibleCols]);

  const keyStoryPoints = useMemo(() => {
    const notes: string[] = [];
    if (isLoss && fgPct !== null && fgPct >= 45) {
      notes.push(`Lost despite shooting ${formatPct(fgPct)} from the field.`);
    }
    if (ts.to >= 15) {
      notes.push(`Turnovers were high at ${ts.to}, creating extra opponent possessions.`);
    }
    if (ftPct !== null && ftPct < 68) {
      notes.push(`Free throws were a swing factor: ${ts.ft}/${ts.fta} (${formatPct(ftPct)}).`);
    }
    if (astToRatio >= 1.5) {
      notes.push(`Ball movement held up with an AST/TO of ${astToRatio.toFixed(2)}.`);
    }
    if (notes.length === 0) {
      notes.push(`Final margin was ${scoreDiff > 0 ? "+" : ""}${scoreDiff}.`);
    }
    return notes.slice(0, 3);
  }, [isLoss, fgPct, ts.to, ftPct, ts.ft, ts.fta, astToRatio, scoreDiff]);

  useEffect(() => {
    let cancelled = false;
    setInsightsLoading(true);
    fetch(`${apiBase}/api/games/${encodeURIComponent(String(game.gameId))}/insights`, { headers: apiKeyHeader() })
      .then((res) => (res.ok ? res.json() as Promise<LiveInsightItem[]> : Promise.reject(new Error("Could not load game insights"))))
      .then((payload) => {
        if (!cancelled) setInsights(Array.isArray(payload) ? payload : []);
      })
      .catch(() => {
        if (!cancelled) setInsights([]);
      })
      .finally(() => {
        if (!cancelled) setInsightsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game.gameId]);

  function setField(i: number, key: keyof EditPlayerRow, val: string) {
    const scoringKeys: Array<keyof EditPlayerRow> = ["fg_made", "fg3_made", "ft_made"];
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      if (key === "name" || key === "number") return { ...r, [key]: val };
      const next = { ...r, [key]: Math.max(key === "plus_minus" ? -99 : 0, parseInt(val, 10) || 0) };
      if (scoringKeys.includes(key)) {
        next.pts = undefined;
      }
      return next;
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
        coach_notes: coachNotes.trim() || undefined,
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
      setMode("view");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmDelete = window.confirm(`Delete game #${game.gameId} (${game.opponent})? This cannot be undone.`);
    if (!confirmDelete) {
      return;
    }

    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`${apiBase}/api/games/${encodeURIComponent(String(game.gameId))}`, {
        method: "DELETE",
        headers: apiKeyHeader(),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Delete failed");
      }
      onDeleted(game.gameId);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleCopyBoxScore() {
    const text = formatBoxScoreForClipboard({
      gameId: game.gameId,
      date,
      location,
      opponent,
      teamName: ourTeamName,
      vcScore: Number(vcScore) || 0,
      oppScore: Number(oppScore) || 0,
      resultCode,
      teamStats: ts,
      playerRows: rows,
      coachNotes,
    });

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyStatus("Box score copied.");
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch {
      setCopyStatus("Could not copy. Please try again.");
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
      <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 16, width: "100%", maxWidth: 1220, alignSelf: "flex-start" }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.1rem 1.4rem", borderBottom: "1px solid var(--border)" }}>
          <div>
            <p style={{ margin: 0, fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.06em" }}>{isEditing ? "Edit" : "View"} Game #{game.gameId}</p>
            <h2 style={{ margin: "0.2rem 0 0" }}>{location === "away" ? "@" : "vs"} {opponent}</h2>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" onClick={onClose} className="bta-btn bta-btn-ghost bta-btn-sm">Close</button>
            {!isEditing && (
              <button type="button" onClick={() => void handleCopyBoxScore()} className="bta-btn bta-btn-secondary bta-btn-sm">
                Copy Box Score
              </button>
            )}
            {!isEditing && (
              <button type="button" onClick={() => setMode("edit")} className="bta-btn bta-btn-primary bta-btn-sm">
                Edit
              </button>
            )}
            {!isEditing && (
              <button type="button" onClick={() => void handleDelete()} disabled={deleting} className="bta-btn bta-btn-danger bta-btn-sm">
                {deleting ? "Deleting..." : "Delete Game"}
              </button>
            )}
            {isEditing && (
              <button type="button" onClick={() => setMode("view")} className="bta-btn bta-btn-secondary bta-btn-sm">
                Back to View
              </button>
            )}
            {isEditing && (
              <button type="button" onClick={() => void handleSave()} disabled={saving} className="bta-btn bta-btn-primary bta-btn-sm">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: "1.1rem 1.4rem" }}>
          {copyStatus && <p className={copyStatus.startsWith("Could not") ? "bta-status bta-status-error" : "bta-status bta-status-success"} style={{ marginBottom: "0.75rem" }}>{copyStatus}</p>}
          {saveError && <p className="bta-status bta-status-error" style={{ marginBottom: "0.75rem" }}>{saveError}</p>}
          {deleteError && <p className="bta-status bta-status-error" style={{ marginBottom: "0.75rem" }}>{deleteError}</p>}

          {isEditing ? (
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
                ["Opp Score", <input key="os" type="number" min={0} value={oppScore} onChange={e => setOppScore(e.target.value)} style={inputSt} />],
              ] as [string, JSX.Element][]).map(([lbl, editEl]) => (
                <div key={lbl} style={{ display: "flex", flexDirection: "column", gap: "0.28rem" }}>
                  <span style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-muted)" }}>{lbl}</span>
                  {editEl}
                </div>
              ))}
            </div>
          ) : (
            <>
              <section className={`game-detail-hero ${isWin ? "is-win" : isLoss ? "is-loss" : "is-tie"}`}>
                <div className="game-detail-team game-detail-team-home">
                  <div className="game-detail-logo">{ourTeamShort}</div>
                  <div>
                    <p className="game-detail-team-label">{ourTeamName}</p>
                    <h3 className="game-detail-team-name">{ourTeamShort}</h3>
                  </div>
                </div>
                <div className="game-detail-score-wrap">
                  <p className="game-detail-matchup">{teamInitials(opponent)} @ {ourTeamShort}</p>
                  <div className="game-detail-scoreline">
                    <span>{vcScore}</span>
                    <em>—</em>
                    <span>{oppScore}</span>
                  </div>
                  <p className="game-detail-result">{resultLabel}</p>
                  <p className="game-detail-meta">{formatDateDisplay(date)} • {location === "away" ? "Away" : location === "neutral" ? "Neutral" : "Home"}{recordAfterGame ? ` • Record ${recordAfterGame}` : ""}</p>
                </div>
                <div className="game-detail-team game-detail-team-away">
                  <div className="game-detail-logo">{teamInitials(opponent)}</div>
                  <div>
                    <p className="game-detail-team-label">Opponent</p>
                    <h3 className="game-detail-team-name">{opponent || "TBD"}</h3>
                  </div>
                </div>
              </section>

              <section className="game-summary-strip">
                <article className="game-summary-card neutral">
                  <span>FG</span>
                  <strong>{ts.fg}/{ts.fga}</strong>
                  <small>{formatPct(fgPct)}</small>
                </article>
                <article className={`game-summary-card ${(fg3Pct ?? 0) >= 35 ? "good" : "bad"}`}>
                  <span>3PT</span>
                  <strong>{ts.fg3}/{ts.fg3a}</strong>
                  <small>{formatPct(fg3Pct)}</small>
                </article>
                <article className={`game-summary-card ${(ftPct ?? 0) >= 70 ? "good" : "bad"}`}>
                  <span>FT</span>
                  <strong>{ts.ft}/{ts.fta}</strong>
                  <small>{formatPct(ftPct)}</small>
                </article>
                <article className="game-summary-card neutral">
                  <span>REB</span>
                  <strong>{ts.reb}</strong>
                  <small>OR {ts.oreb} / DR {ts.dreb}</small>
                </article>
                <article className={`game-summary-card ${astToRatio >= 1.5 ? "good" : astToRatio < 1.1 ? "bad" : "neutral"}`}>
                  <span>AST / TO</span>
                  <strong>{ts.asst} / {ts.to}</strong>
                  <small>{astToRatio.toFixed(2)} ratio</small>
                </article>
              </section>

              <section className="game-detail-grid">
                <article className="game-detail-panel">
                  <div className="game-detail-panel-head">
                    <h3>Key Insights</h3>
                    <span>{insightsLoading ? "Loading AI" : "Game Story"}</span>
                  </div>
                  <ul className="game-insight-list">
                    {keyStoryPoints.map((point, idx) => <li key={`story-${idx}`}>{point}</li>)}
                    {insights.slice(0, 3).map((insight, idx) => (
                      <li key={insight.id ?? `ai-${idx}`}>{insight.message || insight.explanation || "AI insight unavailable."}</li>
                    ))}
                    {insights.length === 0 && !insightsLoading && (
                      <li>AI insights are currently unavailable for this game. Save notes in AI Context to enrich this section.</li>
                    )}
                  </ul>
                </article>

                <article className="game-detail-panel">
                  <div className="game-detail-panel-head">
                    <h3>Top Performers</h3>
                    <span>Quick Read</span>
                  </div>
                  {topPerformers.length === 0 ? (
                    <p className="stats-empty-copy">No player stats recorded yet.</p>
                  ) : (
                    <div className="top-performer-list">
                      {topPerformers.map((row, idx) => (
                        <div key={`${row.name}-${idx}`} className="top-performer-card">
                          <strong>{row.name}</strong>
                          <p>{rowPts(row)} pts • {row.fg_made}/{row.fg_att} FG • {rowReb(row)} reb • {row.asst} ast</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="game-detail-panel">
                  <div className="game-detail-panel-head">
                    <h3>Game Flow</h3>
                    <span>Snapshot</span>
                  </div>
                  <div className="game-flow-metrics">
                    <div>
                      <span>Final Margin</span>
                      <strong className={scoreDiff > 0 ? "positive" : scoreDiff < 0 ? "negative" : "neutral"}>{scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff}</strong>
                    </div>
                    <div>
                      <span>Possession Load</span>
                      <strong>{Math.round(ts.fga + (0.44 * ts.fta) + ts.to)}</strong>
                    </div>
                    <div>
                      <span>Quarter Splits</span>
                      <strong style={{ fontSize: "0.95rem" }}>Not recorded</strong>
                    </div>
                  </div>
                </article>
              </section>

              {/* Coach Notes (visible to players) */}
              {coachNotes.trim() && (
                <section style={{ margin: "1.1rem 0 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.55rem" }}>
                    <h3 style={{ margin: 0, fontSize: "1rem" }}>Coach Notes</h3>
                    <span style={{ fontSize: "0.71rem", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Visible to players</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.9rem 1rem", whiteSpace: "pre-wrap", lineHeight: 1.65, color: "var(--text)", fontSize: "0.9rem" }}>
                    {coachNotes}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Coach Notes edit field */}
          {isEditing && (
            <div style={{ margin: "0 0 1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <span style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-muted)" }}>Coach Notes <em style={{ fontStyle: "normal", opacity: 0.7 }}>(visible to players)</em></span>
                <span style={{ fontSize: "0.7rem", color: coachNotes.length > 1900 ? "var(--red)" : "var(--text-muted)" }}>{coachNotes.length}/2000</span>
              </div>
              <textarea
                value={coachNotes}
                onChange={e => setCoachNotes(e.target.value.slice(0, 2000))}
                placeholder="Add game notes, strategy reminders, or feedback for your players..."
                rows={5}
                style={{ ...inputSt, resize: "vertical", minHeight: 100, fontFamily: "inherit", lineHeight: 1.6 }}
              />
            </div>
          )}

          {mismatch && <p style={{ color: "var(--red)", fontSize: "0.83rem", marginBottom: "0.75rem" }}>Player totals ({playerPts}) don't match team score ({vcScore}).</p>}

          {/* box score table */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ margin: 0 }}>Box Score</h3>
            <div style={{ display: "flex", gap: "0.45rem" }}>
              {!isEditing && (
                <>
                  <button type="button" onClick={() => setBoxMode("basic")} className={`bta-btn bta-btn-sm ${boxMode === "basic" ? "bta-btn-primary" : "bta-btn-ghost"}`}>Basic Stats</button>
                  <button type="button" onClick={() => setBoxMode("advanced")} className={`bta-btn bta-btn-sm ${boxMode === "advanced" ? "bta-btn-primary" : "bta-btn-ghost"}`}>Advanced Stats</button>
                </>
              )}
              {isEditing && (
                <button type="button" onClick={() => setRows(p => [...p, emptyRow()])} className="bta-btn bta-btn-primary bta-btn-sm">+ Add Row</button>
              )}
            </div>
          </div>
          <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--border)" }} className="game-box-wrap">
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820, fontSize: "0.83rem", fontVariantNumeric: "tabular-nums" }} className="game-box-score-table">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ ...thSt, textAlign: "left", minWidth: 140 }} className="sticky-col" rowSpan={2}>Player</th>
                  <th style={{ ...thSt, minWidth: 44 }} rowSpan={2}>#</th>
                  {groupedCols.shooting.length > 0 && <th style={thSt} colSpan={groupedCols.shooting.length}>Shooting</th>}
                  {groupedCols.playmaking.length > 0 && <th style={thSt} colSpan={groupedCols.playmaking.length}>Playmaking</th>}
                  {groupedCols.defense.length > 0 && <th style={thSt} colSpan={groupedCols.defense.length}>Defense / Glass</th>}
                  <th style={thSt} rowSpan={2}>REB</th>
                  <th style={{ ...thSt, color: "var(--teal)" }} rowSpan={2}>PTS</th>
                  {isEditing && <th style={thSt} rowSpan={2}></th>}
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {[...groupedCols.shooting, ...groupedCols.playmaking, ...groupedCols.defense].map(c => <th key={c.key} style={thSt}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.025)" }} className={`game-box-row ${!isEditing && rowPts(row) === maxPts && maxPts > 0 ? "leader-points" : ""} ${!isEditing && rowReb(row) === maxReb && maxReb > 0 ? "leader-reb" : ""} ${!isEditing && row.asst === maxAst && maxAst > 0 ? "leader-ast" : ""}`}>
                    <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600 }} className="sticky-col">
                      {isEditing
                        ? <input value={row.name} onChange={e => setField(i, "name", e.target.value)} placeholder="Name" style={{ ...cellSt, width: 130, textAlign: "left" }} />
                        : <span style={{ padding: "0 0.3rem" }}>{row.name || "—"}</span>}
                    </td>
                    <td style={{ padding: "0.45rem 0.4rem", textAlign: "center" }}>
                      {isEditing
                        ? <input value={row.number} onChange={e => setField(i, "number", e.target.value)} placeholder="#" style={{ ...cellSt, width: 40 }} />
                        : <span>{row.number || "—"}</span>}
                    </td>
                    {[...groupedCols.shooting, ...groupedCols.playmaking, ...groupedCols.defense].map(c => (
                      <td key={c.key} style={{ padding: "0.45rem 0.4rem", textAlign: "center" }}>
                        {isEditing
                          ? <input type="number" value={String(row[c.key as StatKey])} onChange={e => setField(i, c.key as keyof EditPlayerRow, e.target.value)} style={{ ...cellSt, width: 46 }} />
                          : <span>{String(row[c.key as StatKey])}</span>}
                      </td>
                    ))}
                    <td style={{ padding: "0.45rem 0.4rem", fontWeight: 700, textAlign: "center" }}>{rowReb(row)}</td>
                    <td style={{ padding: "0.45rem 0.4rem", fontWeight: 700, color: "var(--teal)", textAlign: "center", fontSize: "0.92em" }}>{rowPts(row)}</td>
                    {isEditing && (
                      <td style={{ padding: "0.45rem 0.4rem" }}>
                        <button type="button" onClick={() => setRows(p => p.filter((_, j) => j !== i))} style={{ background: "rgba(248,113,113,0.14)", border: "none", color: "var(--red)", borderRadius: 6, padding: "0.28rem 0.55rem", cursor: "pointer" }}>✕</button>
                      </td>
                    )}
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
    return "-";
  }
  return `${((Number(made ?? 0) / attempts) * 100).toFixed(1)}%`;
}

function toGameTimestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function compareGamesMostRecent(left: GameSummary, right: GameSummary): number {
  const byDate = toGameTimestamp(right.date) - toGameTimestamp(left.date);
  if (byDate !== 0) {
    return byDate;
  }

  const rightId = Number(right.gameId);
  const leftId = Number(left.gameId);
  if (Number.isFinite(rightId) && Number.isFinite(leftId) && rightId !== leftId) {
    return rightId - leftId;
  }

  return String(right.gameId).localeCompare(String(left.gameId));
}

function openSettingsPage(): void {
  window.history.pushState({}, "", "/stats/settings");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function GamesPage() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("Loading games...");
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);
  const teamName = useMemo(() => formatSchoolNameFromId(resolveActiveSchoolId()), []);

  function loadGames() {
    setIsLoading(true);
    setLoadError("");
    setStatus("Loading games...");
    let cancelled = false;
    fetch(`${apiBase}/api/games`, { headers: apiKeyHeader() })
      .then(r => r.ok ? r.json() as Promise<GameSummary[]> : Promise.reject(new Error("Games API failed")))
      .then(payload => {
        if (!cancelled) {
          setGames(Array.isArray(payload) ? payload : []);
          setStatus("");
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("Could not load games.");
          setLoadError("Could not load games from the realtime API.");
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }

  useEffect(loadGames, [retryKey]);

  const filteredGames = useMemo(() => {
    return [...games]
      .filter((game) => game.opponent.toLowerCase().includes(query.toLowerCase()))
      .filter((game) => !resultFilter || game.result === resultFilter)
      .sort(compareGamesMostRecent);
  }, [games, query, resultFilter]);

  function handleSaved(updated: GameSummary) {
    setGames(prev => prev.map(g => String(g.gameId) === String(updated.gameId) ? updated : g));
    setSelectedGame(updated);
  }

  function handleDeleted(gameId: string | number) {
    setGames(prev => prev.filter(g => String(g.gameId) !== String(gameId)));
    setSelectedGame(null);
  }

  return (
    <div className="stats-page">
      {selectedGame && (
        <GameModal
          game={selectedGame}
          games={games}
          teamName={teamName}
          onClose={() => setSelectedGame(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      <section className="stats-page-hero compact">
        <div>
          <h1>Games</h1>
          <p className="stats-page-subtitle">Full season history. Click any game to view details, then choose Edit to make changes.</p>
        </div>
        {status && <p className="stats-page-status">{status}</p>}
      </section>

      {isLoading && (
        <section className="stats-page-card">
          <div className="loading-indicator">
            <div className="loading-spinner" />
            <p className="loading-text">Loading game history...</p>
          </div>
        </section>
      )}

      {!isLoading && loadError && (
        <section className="stats-page-card">
          <p className="stats-empty-copy">{loadError}</p>
          <button
            type="button"
            className="shell-nav-link"
            style={{ marginTop: "0.65rem" }}
            onClick={() => setRetryKey((value) => value + 1)}
          >
            Retry
          </button>
        </section>
      )}

      {!isLoading && !loadError && (
      <>
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
          {games.length === 0 && (
            <button
              type="button"
              className="shell-nav-link"
              style={{ marginTop: "0.6rem" }}
              onClick={openSettingsPage}
            >
              Add players in Settings
            </button>
          )}
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
                onClick={() => setSelectedGame(game)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setSelectedGame(game); }}
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
                <div className="stats-game-card-metrics stats-game-card-metrics-game">
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
                  <div>
                    <span>STL</span>
                    <strong>{Number(game.team_stats?.stl ?? 0)}</strong>
                  </div>
                  <div>
                    <span>BLK</span>
                    <strong>{Number(game.team_stats?.blk ?? 0)}</strong>
                  </div>
                </div>
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--teal)", opacity: 0.8 }}>Click to view box score →</p>
              </article>
            );
          })}
        </section>
      )}
      </>
      )}
    </div>
  );
}
