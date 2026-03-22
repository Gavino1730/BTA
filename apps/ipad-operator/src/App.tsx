import { useEffect, useMemo, useState } from "react";
import type { GameEvent } from "@pivot/shared-schema";

const API = "http://localhost:4000";
const STORE = "pivot-op";
const APP_DATA_KEY = "pivot-app-data-v3";

type TeamSide = "home" | "away";
type SettingsView = "menu" | "teams" | "team-edit" | "game-setup";

export interface Player {
  id: string;
  number: string;
  name: string;
  position: string;
}

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  players: Player[];
}

export interface GameSetup {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
}

export interface AppData {
  teams: Team[];
  gameSetup: GameSetup;
}

const DEFAULT_DATA: AppData = {
  teams: [],
  gameSetup: { gameId: "game-1", homeTeamId: "", awayTeamId: "" },
};

// ---- Storage helpers ----
function loadAppData(): AppData {
  try {
    const s = localStorage.getItem(APP_DATA_KEY);
    if (s) return { ...DEFAULT_DATA, ...(JSON.parse(s) as AppData) };
  } catch { /* empty */ }
  return DEFAULT_DATA;
}
function saveAppData(d: AppData) { localStorage.setItem(APP_DATA_KEY, JSON.stringify(d)); }
function pendingKey(gid: string) { return `${STORE}:${gid}:pending`; }
function seqKey(gid: string) { return `${STORE}:${gid}:seq`; }
function loadPending(gid: string): GameEvent[] {
  try { const s = localStorage.getItem(pendingKey(gid)); return s ? JSON.parse(s) as GameEvent[] : []; } catch { return []; }
}
function savePending(gid: string, evts: GameEvent[]) { localStorage.setItem(pendingKey(gid), JSON.stringify(evts)); }
function loadSeq(gid: string) { const s = localStorage.getItem(seqKey(gid)); return s ? +s : 1; }
function saveSeq(gid: string, seq: number) { localStorage.setItem(seqKey(gid), String(seq)); }
function uid() { return `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// ---- Utilities ----
function clockToSec(clock: string): number {
  const [m, s] = clock.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}
function playerDisplayName(id: string, allPlayers: Player[]): string {
  const p = allPlayers.find(x => x.id === id);
  return p ? `#${p.number} ${p.name}` : id;
}

interface RunningTotals {
  points: number; fgm: number; fga: number; threePm: number; threePa: number;
  oreb: number; dreb: number; ast: number; stl: number; blk: number; to: number; fouls: number;
}
function computePlayerTotals(events: GameEvent[]): Record<string, RunningTotals> {
  const map: Record<string, RunningTotals> = {};
  function get(id: string) {
    if (!map[id]) map[id] = { points: 0, fgm: 0, fga: 0, threePm: 0, threePa: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, fouls: 0 };
    return map[id];
  }
  for (const e of events) {
    if (e.type === "shot_attempt") {
      const t = get(e.playerId);
      t.fga++;
      if (e.points === 3) t.threePa++;
      if (e.made) {
        t.fgm++;
        t.points += e.points;
        if (e.points === 3) t.threePm++;
      }
    } else if (e.type === "rebound") {
      const t = get(e.playerId);
      if (e.offensive) t.oreb++; else t.dreb++;
    } else if (e.type === "assist") {
      get(e.playerId).ast++;
    } else if (e.type === "steal") {
      get(e.playerId).stl++;
    } else if (e.type === "block") {
      get(e.playerId).blk++;
    } else if (e.type === "turnover") {
      if (e.playerId) get(e.playerId).to++;
    } else if (e.type === "foul") {
      get(e.playerId).fouls++;
    }
  }
  return map;
}
function computeScores(events: GameEvent[]) {
  const s = { home: 0, away: 0 };
  for (const e of events) {
    if (e.type === "shot_attempt" && e.made) {
      const side = e.teamId as TeamSide;
      if (side === "home" || side === "away") s[side] += e.points;
    }
  }
  return s;
}

function describeEvent(
  event: GameEvent,
  homeTeamName: string,
  awayTeamName: string,
  allPlayers: Player[],
  pTotals: Record<string, RunningTotals>
) {
  const tn = (id: string) => id === "home" ? homeTeamName : awayTeamName;
  const pn = (id: string) => playerDisplayName(id, allPlayers);
  switch (event.type) {
    case "shot_attempt": {
      const t = pTotals[event.playerId];
      const fgStr = event.points === 3
        ? (t ? `${t.threePm}-${t.threePa} 3pt` : "3pt")
        : (t ? `${t.fgm}-${t.fga} fg` : `${event.points}pt`);
      const ptsStr = t ? `${t.points}pts` : "";
      return {
        main: event.made ? `${event.points}pt` : `${event.points}pt miss`,
        detail: `${pn(event.playerId)}  ${ptsStr} ${fgStr}`.trim(),
        accent: event.made ? "teal" : "red",
      };
    }
    case "foul":
      return { main: "foul", detail: `${tn(event.teamId)}  ${pn(event.playerId)}`, accent: "red" };
    case "turnover":
      return { main: "turnover", detail: `${tn(event.teamId)}${event.playerId ? `  ${pn(event.playerId)}` : ""}`, accent: "red" };
    case "rebound":
      return { main: event.offensive ? "off reb" : "def reb", detail: `${tn(event.teamId)}  ${pn(event.playerId)}`, accent: "white" };
    case "assist":
      return { main: "assist", detail: `${tn(event.teamId)}  ${pn(event.playerId)}`, accent: "teal" };
    case "steal":
      return { main: "steal", detail: `${tn(event.teamId)}  ${pn(event.playerId)}`, accent: "teal" };
    case "block":
      return { main: "block", detail: `${tn(event.teamId)}  ${pn(event.playerId)}`, accent: "teal" };
    case "substitution":
      return { main: "sub", detail: `${tn(event.teamId)}  ${pn(event.playerOutId)} â†’ ${pn(event.playerInId)}`, accent: "white" };
    case "possession_start":
      return { main: "possession", detail: tn(event.possessedByTeamId), accent: "white" };
    default:
      return { main: (event as GameEvent).type, detail: "", accent: "white" };
  }
}

// ================================================================
//  PDF EXPORT
// ================================================================
async function exportGamePDF(
  gameId: string,
  gameDate: string,
  homeTeam: Team | undefined,
  awayTeam: Team | undefined,
  allEvents: GameEvent[],
) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  const TEAL  = [45, 212, 191] as [number, number, number];
  const RED   = [248, 113, 113] as [number, number, number];
  const DARK  = [20, 22, 43]   as [number, number, number];
  const MID   = [42, 46, 80]   as [number, number, number];
  const LIGHT = [232, 234, 240] as [number, number, number];

  const homeName = homeTeam?.name ?? "Home";
  const awayName = awayTeam?.name ?? "Away";
  const homeAbbr = homeTeam?.abbreviation ?? "HME";
  const awayAbbr = awayTeam?.abbreviation ?? "AWY";
  const homePlayers = homeTeam?.players ?? [];
  const awayPlayers = awayTeam?.players ?? [];
  const allPlayers  = [...homePlayers, ...awayPlayers];

  const scores  = computeScores(allEvents);
  const pTotals = computePlayerTotals(allEvents);

  // Header banner
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 32, "F");

  doc.setFontSize(18);
  doc.setTextColor(...TEAL);
  doc.setFont("helvetica", "bold");
  doc.text("PIVOT", 14, 13);

  doc.setFontSize(10);
  doc.setTextColor(...LIGHT);
  doc.setFont("helvetica", "normal");
  doc.text("Basketball Game Report", 14, 20);

  doc.setFontSize(9);
  doc.setTextColor(160, 164, 190);
  doc.text(`Game ID: ${gameId}`, 14, 27);
  doc.text(`Date: ${gameDate}`, W - 14, 27, { align: "right" });

  // Score box
  let y = 38;
  doc.setFillColor(...MID);
  doc.roundedRect(14, y, W - 28, 22, 3, 3, "F");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEAL);
  doc.text(homeName, 22, y + 8);
  doc.setFontSize(20);
  doc.text(String(scores.home), 22, y + 18);

  doc.setFontSize(11);
  doc.setTextColor(160, 164, 190);
  doc.text("vs", W / 2, y + 13, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(...RED);
  doc.text(awayName, W - 22, y + 8, { align: "right" });
  doc.setFontSize(20);
  doc.text(String(scores.away), W - 22, y + 18, { align: "right" });

  const winLabel = scores.home > scores.away
    ? `${homeAbbr} wins`
    : scores.away > scores.home ? `${awayAbbr} wins` : "Tie";
  doc.setFontSize(8);
  doc.setTextColor(160, 164, 190);
  doc.text(winLabel, W / 2, y + 19, { align: "center" });

  y += 28;

  // Box score table helper
  function boxScoreTable(team: Team | undefined, side: "home" | "away") {
    const players = side === "home" ? homePlayers : awayPlayers;
    const accent  = side === "home" ? TEAL : RED;
    const name    = side === "home" ? homeName : awayName;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...accent);
    doc.text(name.toUpperCase() + " \u2014 BOX SCORE", 14, y + 4);
    y += 7;

    if (players.length === 0) {
      doc.setFontSize(8);
      doc.setTextColor(140, 144, 170);
      doc.setFont("helvetica", "normal");
      doc.text("No players on roster.", 14, y + 4);
      y += 10;
      return;
    }

    const headers = [["#", "Player", "Pos", "PTS", "FGM-A", "3PM-A", "REB", "AST", "STL", "BLK", "TO", "PF"]];
    const rows = players.map(p => {
      const t = pTotals[p.id];
      const reb = t ? t.oreb + t.dreb : 0;
      return [
        p.number, p.name, p.position || "-",
        t ? String(t.points) : "0",
        t ? `${t.fgm}-${t.fga}` : "0-0",
        t ? `${t.threePm}-${t.threePa}` : "0-0",
        String(reb),
        t ? String(t.ast) : "0",
        t ? String(t.stl) : "0",
        t ? String(t.blk) : "0",
        t ? String(t.to) : "0",
        t ? String(t.fouls) : "0",
      ];
    });

    // Totals row
    const sum = (fn: (t: RunningTotals) => number) =>
      players.reduce((n, p) => n + (pTotals[p.id] ? fn(pTotals[p.id]) : 0), 0);
    rows.push([
      "", "TEAM", "",
      String(sum(t => t.points)),
      `${sum(t => t.fgm)}-${sum(t => t.fga)}`,
      `${sum(t => t.threePm)}-${sum(t => t.threePa)}`,
      String(sum(t => t.oreb + t.dreb)),
      String(sum(t => t.ast)),
      String(sum(t => t.stl)),
      String(sum(t => t.blk)),
      String(sum(t => t.to)),
      String(sum(t => t.fouls)),
    ]);

    autoTable(doc, {
      startY: y,
      head: headers,
      body: rows,
      margin: { left: 14, right: 14 },
      styles: {
        fontSize: 7.5, cellPadding: 2,
        textColor: LIGHT, fillColor: [28, 31, 56] as [number, number, number],
        lineColor: [50, 54, 90] as [number, number, number], lineWidth: 0.2,
      },
      headStyles: { fillColor: MID, textColor: accent, fontStyle: "bold", fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 8,  halign: "center" },
        1: { cellWidth: 36 },
        2: { cellWidth: 10, halign: "center" },
        3: { cellWidth: 10, halign: "center", fontStyle: "bold" },
        4: { cellWidth: 16, halign: "center" },
        5: { cellWidth: 16, halign: "center" },
        6: { cellWidth: 10, halign: "center" },
        7: { cellWidth: 10, halign: "center" },
        8: { cellWidth: 10, halign: "center" },
        9: { cellWidth: 10, halign: "center" },
        10: { cellWidth: 10, halign: "center" },
        11: { cellWidth: 10, halign: "center" },
      },
      didParseCell(data) {
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fillColor = MID;
          data.cell.styles.fontStyle = "bold";
        }
        if (data.column.index === 3 && data.section === "body" && data.row.index < rows.length - 1) {
          const pts = Number(data.cell.raw);
          if (pts >= 20)      data.cell.styles.textColor = [255, 220, 80];
          else if (pts >= 10) data.cell.styles.textColor = accent;
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  boxScoreTable(homeTeam, "home");
  if (y > 220) { doc.addPage(); y = 14; }
  boxScoreTable(awayTeam, "away");

  // Play-by-play log
  if (y > 230) { doc.addPage(); y = 14; }

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(160, 164, 190);
  doc.text("PLAY-BY-PLAY LOG", 14, y + 4);
  y += 7;

  const sortedEvents = [...allEvents].sort((a, b) => a.sequence - b.sequence);
  const pbpRows = sortedEvents.map(e => {
    const d = describeEvent(e, homeName, awayName, allPlayers, pTotals);
    const mins = Math.floor(e.clockSecondsRemaining / 60);
    const secs = String(e.clockSecondsRemaining % 60).padStart(2, "0");
    const clock = `Q${e.period}  ${mins}:${secs}`;
    const team  = e.teamId === "home" ? homeAbbr : e.teamId === "away" ? awayAbbr : "";
    return [clock, team, d.main, d.detail ?? ""];
  });

  autoTable(doc, {
    startY: y,
    head: [["Clock", "Team", "Event", "Detail"]],
    body: pbpRows,
    margin: { left: 14, right: 14 },
    styles: {
      fontSize: 7, cellPadding: 1.8,
      textColor: LIGHT, fillColor: [28, 31, 56] as [number, number, number],
      lineColor: [50, 54, 90] as [number, number, number], lineWidth: 0.2,
    },
    headStyles: { fillColor: MID, textColor: LIGHT, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: 14, halign: "center" },
      2: { cellWidth: 28 },
    },
    alternateRowStyles: { fillColor: [24, 27, 50] as [number, number, number] },
  });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(100, 104, 130);
    doc.text(
      `Pivot Basketball  \u2022  Generated ${new Date().toLocaleString()}`,
      14, doc.internal.pageSize.getHeight() - 6,
    );
    doc.text(`Page ${i} / ${pages}`, W - 14, doc.internal.pageSize.getHeight() - 6, { align: "right" });
  }

  const safeId   = gameId.replace(/[^a-zA-Z0-9\-_]/g, "_");
  const safeDate = gameDate.replace(/[^a-zA-Z0-9\-]/g, "-");
  doc.save(`pivot_${safeDate}_${safeId}.pdf`);
}

// ---- Modal types ----
type Modal =
  | { kind: "shot"; teamId: TeamSide; points: 1 | 2 | 3; made: boolean }
  | { kind: "stat"; stat: "def_reb" | "off_reb" | "turnover" | "steal" | "assist" | "block" | "foul"; teamId: TeamSide }
  | { kind: "assist2"; teamId: TeamSide; assistPlayerId: string }
  | { kind: "sub1"; teamId: TeamSide }
  | { kind: "sub2"; teamId: TeamSide; playerOutId: string };

export function App() {
  // ---- App data (teams, game setup) ----
  const [appData, setAppData] = useState<AppData>(loadAppData);

  function persistData(next: AppData) {
    setAppData(next);
    saveAppData(next);
  }

  // ---- Navigation state ----
  const [view, setView] = useState<"game" | "settings">("game");
  const [settingsView, setSettingsView] = useState<SettingsView>("menu");
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);

  // ---- Game session state ----
  const gameId = appData.gameSetup.gameId;
  const [sequence, setSequence] = useState(() => loadSeq(loadAppData().gameSetup.gameId));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingEvents, setPendingEvents] = useState<GameEvent[]>(() => loadPending(loadAppData().gameSetup.gameId));
  const [submittedEvents, setSubmittedEvents] = useState<GameEvent[]>([]);

  // ---- In-game UI state ----
  const [period, setPeriod] = useState(1);
  const [clockInput, setClockInput] = useState("12:00");
  const [activeTeam, setActiveTeam] = useState<TeamSide>("home");
  const [modal, setModal] = useState<Modal | null>(null);
  const [gameDate, setGameDate] = useState(() => new Date().toISOString().slice(0, 10));

  // ---- Derived: home/away teams ----
  const homeTeam = appData.teams.find(t => t.id === appData.gameSetup.homeTeamId);
  const awayTeam = appData.teams.find(t => t.id === appData.gameSetup.awayTeamId);
  const homeTeamName = homeTeam?.name ?? "Home";
  const awayTeamName = awayTeam?.name ?? "Away";
  const homePlayers = homeTeam?.players ?? [];
  const awayPlayers = awayTeam?.players ?? [];
  const allPlayers = [...homePlayers, ...awayPlayers];

  // ---- Network ----
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    const localPending = loadPending(gameId);
    const localSeq = loadSeq(gameId);
    setPendingEvents(localPending);
    setSequence(localSeq);
    async function hydrate() {
      try {
        const res = await fetch(`${API}/games/${gameId}/events`);
        if (!res.ok) { setSubmittedEvents([]); return; }
        const events = (await res.json()) as GameEvent[];
        setSubmittedEvents(events);
        const highest = events.reduce((m, e) => Math.max(m, e.sequence), 0);
        const next = Math.max(localSeq, highest + 1);
        setSequence(next);
        saveSeq(gameId, next);
      } catch { /* offline */ }
    }
    void hydrate();
  }, [gameId]);

  useEffect(() => { savePending(gameId, pendingEvents); }, [gameId, pendingEvents]);
  useEffect(() => { saveSeq(gameId, sequence); }, [gameId, sequence]);

  async function submitEvent(event: GameEvent): Promise<boolean> {
    try {
      const res = await fetch(`${API}/games/${gameId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (!res.ok) return false;
      setSubmittedEvents(cur => [...cur, event].sort((a, b) => a.sequence - b.sequence));
      setPendingEvents(cur => cur.filter(p => p.id !== event.id));
      return true;
    } catch {
      setPendingEvents(cur => {
        if (cur.some(p => p.id === event.id)) return cur;
        return [...cur, event].sort((a, b) => a.sequence - b.sequence);
      });
      return false;
    }
  }

  async function flushQueue() {
    if (!navigator.onLine || pendingEvents.length === 0) return;
    for (const evt of pendingEvents) {
      const ok = await submitEvent(evt);
      if (!ok) break;
    }
    try {
      const res = await fetch(`${API}/games/${gameId}/events`);
      if (res.ok) setSubmittedEvents((await res.json()) as GameEvent[]);
    } catch { /* empty */ }
  }

  useEffect(() => { if (online) void flushQueue(); }, [online]);

  async function postEvent(event: GameEvent) {
    const next = event.sequence + 1;
    setSequence(next);
    saveSeq(gameId, next);
    await submitEvent(event);
  }

  async function undoLast() {
    // Try to undo the most recent event (submitted or pending)
    const lastSubmitted = [...submittedEvents].sort((a, b) => b.sequence - a.sequence)[0];
    const lastPending = [...pendingEvents].sort((a, b) => b.sequence - a.sequence)[0];
    // Pick whichever has the higher sequence
    const last = !lastSubmitted ? lastPending
      : !lastPending ? lastSubmitted
      : lastPending.sequence > lastSubmitted.sequence ? lastPending : lastSubmitted;
    if (!last) return;
    // Remove from pending queue first
    setPendingEvents(cur => cur.filter(e => e.id !== last.id));
    // If it is already submitted to the API, delete it there
    if (submittedEvents.some(e => e.id === last.id)) {
      const res = await fetch(`${API}/games/${gameId}/events/${last.id}`, { method: "DELETE" });
      if (res.ok) setSubmittedEvents(cur => cur.filter(e => e.id !== last.id));
    }
  }

  async function startGame() {
    const res = await fetch(`${API}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        homeTeamId: appData.gameSetup.homeTeamId || "home",
        awayTeamId: appData.gameSetup.awayTeamId || "away",
      }),
    });
    if (res.ok) {
      setPendingEvents([]);
      setSubmittedEvents([]);
      setSequence(1);
      savePending(gameId, []);
      saveSeq(gameId, 1);
    }
  }

  // ---- Computed values ----
  const allEvents = useMemo(() => [
    ...submittedEvents.map(e => ({ event: e, pending: false })),
    ...pendingEvents.filter(e => !submittedEvents.some(s => s.id === e.id)).map(e => ({ event: e, pending: true })),
  ].sort((a, b) => b.event.sequence - a.event.sequence), [submittedEvents, pendingEvents]);
  // scores and totals include pending events so the UI is always up-to-date offline
  const allEventObjs = useMemo(() => allEvents.map(x => x.event), [allEvents]);
  const scores = useMemo(() => computeScores(allEventObjs), [allEventObjs]);
  const pTotals = useMemo(() => computePlayerTotals(allEventObjs), [allEventObjs]);

  // ---- Event builder ----
  function base(seq: number) {
    return {
      id: uid(),
      gameId,
      sequence: seq,
      timestampIso: new Date().toISOString(),
      period,
      clockSecondsRemaining: clockToSec(clockInput),
      operatorId: "op-1",
    };
  }

  // ---- Modal helpers ----
  function closeModal() { setModal(null); }

  function confirmShot(playerId: string) {
    if (!modal || modal.kind !== "shot") return;
    void postEvent({
      ...base(sequence),
      teamId: modal.teamId,
      type: "shot_attempt",
      playerId,
      made: modal.made,
      points: modal.points,
      zone: modal.points === 3 ? "above_break_three" : modal.points === 1 ? "free_throw" : "paint",
    } as GameEvent);
    closeModal();
  }

  function confirmStat(playerId: string) {
    if (!modal || modal.kind !== "stat") return;
    const b = base(sequence);
    const { stat, teamId } = modal;
    let event: GameEvent | null = null;
    if (stat === "def_reb")  event = { ...b, teamId, type: "rebound",  playerId, offensive: false } as GameEvent;
    if (stat === "off_reb")  event = { ...b, teamId, type: "rebound",  playerId, offensive: true  } as GameEvent;
    if (stat === "foul")     event = { ...b, teamId, type: "foul",     playerId, foulType: "reaching" } as GameEvent;
    if (stat === "turnover") event = { ...b, teamId, type: "turnover", playerId, turnoverType: "bad_pass" } as GameEvent;
    if (stat === "steal")    event = { ...b, teamId, type: "steal",    playerId } as GameEvent;
    if (stat === "block")    event = { ...b, teamId, type: "block",    playerId } as GameEvent;
    if (stat === "assist")   { setModal({ kind: "assist2", teamId, assistPlayerId: playerId }); return; }
    if (event) void postEvent(event);
    closeModal();
  }

  function confirmAssistScorer(scorerPlayerId: string) {
    if (!modal || modal.kind !== "assist2") return;
    void postEvent({
      ...base(sequence),
      teamId: modal.teamId,
      type: "assist",
      playerId: modal.assistPlayerId,
      scorerPlayerId,
    } as GameEvent);
    closeModal();
  }

  function confirmSubOut(playerOutId: string) {
    if (!modal || modal.kind !== "sub1") return;
    setModal({ kind: "sub2", teamId: modal.teamId, playerOutId });
  }

  function confirmSubIn(playerInId: string) {
    if (!modal || modal.kind !== "sub2") return;
    void postEvent({
      ...base(sequence),
      teamId: modal.teamId,
      type: "substitution",
      playerOutId: modal.playerOutId,
      playerInId,
    } as GameEvent);
    closeModal();
  }

  // ---- Modal render ----
  function renderModal() {
    if (!modal) return null;
    const teamPlayers = (side: TeamSide) => side === "home" ? homePlayers : awayPlayers;
    const tLabel = (side: TeamSide) => side === "home" ? homeTeamName : awayTeamName;

    if (modal.kind === "shot") {
      const players = teamPlayers(modal.teamId);
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal.points}pt \u2014 {tLabel(modal.teamId)}</span>
              <button className="modal-close" onClick={closeModal}>\u2715</button>
            </div>
            <div className="made-miss-row">
              <button className={`toggle-btn ${modal.made ? "t-teal" : ""}`} onClick={() => setModal({ ...modal, made: true })}>Made</button>
              <button className={`toggle-btn ${!modal.made ? "t-red" : ""}`} onClick={() => setModal({ ...modal, made: false })}>Miss</button>
            </div>
            <div className="player-list">
              {players.length === 0 && <p className="no-players">No players \u2014 set up roster in Settings \u2630</p>}
              {players.map(p => (
                <button key={p.id} className="player-row" onClick={() => confirmShot(p.id)}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                  {p.position && <span className="ppos">{p.position}</span>}
                  {pTotals[p.id]?.fouls ? <span className="pfoul">{pTotals[p.id].fouls}f</span> : null}
                  {pTotals[p.id] ? <span className="ppts">{pTotals[p.id].points} pts</span> : null}
                </button>
              ))}
              <button className="player-row team-row" onClick={() => confirmShot(`${modal.teamId}-team`)}>Team (no player)</button>
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "stat") {
      const statLabels: Record<string, string> = {
        def_reb: "Def Rebound", off_reb: "Off Rebound", turnover: "Turnover",
        steal: "Steal", assist: "Assist \u2014 pick passer", block: "Block", foul: "Foul",
      };
      const players = teamPlayers(modal.teamId);
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-title">{statLabels[modal.stat]}</span>
                <div className="modal-team-toggle">
                  <button className={modal.teamId === "home" ? "t-teal" : ""} onClick={() => setModal({ ...modal, teamId: "home" })}>{homeTeamName}</button>
                  <button className={modal.teamId === "away" ? "t-red" : ""} onClick={() => setModal({ ...modal, teamId: "away" })}>{awayTeamName}</button>
                </div>
              </div>
              <button className="modal-close" onClick={closeModal}>\u2715</button>
            </div>
            <div className="player-list">
              {players.length === 0 && <p className="no-players">No players \u2014 set up roster in Settings \u2630</p>}
              {players.map(p => (
                <button key={p.id} className="player-row" onClick={() => confirmStat(p.id)}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                  {p.position && <span className="ppos">{p.position}</span>}
                  {pTotals[p.id]?.fouls ? <span className="pfoul">{pTotals[p.id].fouls}f</span> : null}
                  {pTotals[p.id]?.points ? <span className="ppts">{pTotals[p.id].points} pts</span> : null}
                </button>
              ))}
              <button className="player-row team-row" onClick={() => confirmStat(`${modal.teamId}-team`)}>Team (no player)</button>
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "assist2") {
      const players = teamPlayers(modal.teamId);
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Assist \u2014 pick scorer</span>
              <button className="modal-close" onClick={closeModal}>\u2715</button>
            </div>
            <div className="player-list">
              {players.map(p => (
                <button key={p.id} className="player-row" onClick={() => confirmAssistScorer(p.id)}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                  {pTotals[p.id] ? <span className="ppts">{pTotals[p.id].points} pts</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "sub1") {
      const players = teamPlayers(modal.teamId);
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Sub Out \u2014 {tLabel(modal.teamId)}</span>
              <button className="modal-close" onClick={closeModal}>\u2715</button>
            </div>
            <div className="player-list">
              {players.map(p => (
                <button key={p.id} className="player-row" onClick={() => confirmSubOut(p.id)}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "sub2") {
      const players = teamPlayers(modal.teamId).filter(p => p.id !== modal.playerOutId);
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Sub In \u2014 {tLabel(modal.teamId)}</span>
              <button className="modal-close" onClick={closeModal}>\u2715</button>
            </div>
            <div className="player-list">
              {players.map(p => (
                <button key={p.id} className="player-row" onClick={() => confirmSubIn(p.id)}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  // ================================================================
  //  SETTINGS
  // ================================================================
  if (view === "settings") {
    return <SettingsScreen
      appData={appData}
      settingsView={settingsView}
      editingTeamId={editingTeamId}
      onPersist={persistData}
      onNav={setSettingsView}
      onEditTeam={setEditingTeamId}
      onBack={() => setView("game")}
      onStartGame={() => { void startGame(); setView("game"); }}
    />;
  }

  // ================================================================
  //  GAME VIEW (3-column)
  // ================================================================
  const periodLabels = ["Q1", "Q2", "Q3", "Q4", "OT"];

  return (
    <div className="game-layout">
      {renderModal()}
      {!online && <div className="offline-badge">OFFLINE</div>}
      {pendingEvents.length > 0 && online && (
        <button className="offline-badge pending-badge" onClick={() => void flushQueue()}>
          {pendingEvents.length} pending ↑
        </button>
      )}

      {/* LEFT: Scoring */}
      <div className="panel left-panel">
        <div className="shot-grid">
          <button className="circle teal" onClick={() => setModal({ kind: "shot", teamId: "home", points: 2, made: true })}>2pt</button>
          <button className="circle red"  onClick={() => setModal({ kind: "shot", teamId: "away", points: 2, made: true })}>2pt</button>
          <button className="circle teal" onClick={() => setModal({ kind: "shot", teamId: "home", points: 3, made: true })}>3pt</button>
          <button className="circle red"  onClick={() => setModal({ kind: "shot", teamId: "away", points: 3, made: true })}>3pt</button>
          <button className="circle teal" onClick={() => setModal({ kind: "shot", teamId: "home", points: 1, made: true })}>1pt</button>
          <button className="circle red"  onClick={() => setModal({ kind: "shot", teamId: "away", points: 1, made: true })}>1pt</button>
        </div>
        <div className="panel-foot">
          <button className="icon-btn" onClick={() => { setSettingsView("menu"); setView("settings"); }} title="Settings">\u2630</button>
          <button className="icon-btn" onClick={() => void undoLast()} title="Undo last">\u21a9</button>
          <button className="icon-btn pdf-btn"
            title="Export PDF"
            onClick={() => void exportGamePDF(gameId, gameDate, homeTeam, awayTeam, allEventObjs)}>
            \u21e9 PDF
          </button>
        </div>
      </div>

      {/* CENTER: Feed */}
      <div className="panel center-panel">
        <div className="scoreboard">
          <div className="score-row">
            <span className="team-lbl teal-txt">{homeTeamName}</span>
            <span className="score teal-txt">{scores.home}</span>
          </div>
          <div className="score-row">
            <span className="team-lbl">{awayTeamName}</span>
            <span className="score">{scores.away}</span>
          </div>
        </div>

        <div className="event-feed">
          {allEvents.length === 0 && <p className="empty-feed">No events yet</p>}
          {allEvents.map(({ event, pending }) => {
            const d = describeEvent(event, homeTeamName, awayTeamName, allPlayers, pTotals);
            return (
              <div key={event.id} className={`feed-item${pending ? " feed-pending" : ""}`}>
                <span className={`feed-main ac-${d.accent}`}>{d.main}</span>
                {d.detail && <span className="feed-detail">{d.detail}</span>}
              </div>
            );
          })}
        </div>

        <div className="period-row">
          {periodLabels.map((lbl, i) => (
            <button key={lbl} className={`period-btn${period === i + 1 ? " period-on" : ""}`} onClick={() => setPeriod(i + 1)}>{lbl}</button>
          ))}
        </div>
        <div className="clock-row">
          <input className="clock-inp" value={clockInput} onChange={e => setClockInput(e.target.value)} placeholder="12:00" />
        </div>
        <div className="date-row">
          <input className="date-inp" type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} title="Game date" />
        </div>
      </div>

      {/* RIGHT: Stats */}
      <div className="panel right-panel">
        <div className="stat-grid">
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "def_reb", teamId: activeTeam })}>def<br/><span className="sub-lbl">reb</span></button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "off_reb", teamId: activeTeam })}>off<br/><span className="sub-lbl">reb</span></button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "turnover", teamId: activeTeam })}>to</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "steal",   teamId: activeTeam })}>stl</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "assist",  teamId: activeTeam })}>asst</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "block",   teamId: activeTeam })}>blk</button>
          <button className="circle red-out" onClick={() => setModal({ kind: "sub1", teamId: activeTeam })}>sub</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "foul",   teamId: activeTeam })}>foul</button>
        </div>
        <div className="team-toggle">
          <button className={`tt-btn${activeTeam === "home" ? " tt-teal" : ""}`} onClick={() => setActiveTeam("home")}>{homeTeamName}</button>
          <button className={`tt-btn${activeTeam === "away" ? " tt-red"  : ""}`} onClick={() => setActiveTeam("away")}>{awayTeamName}</button>
        </div>
      </div>
    </div>
  );
}

// ================================================================
//  SETTINGS SCREEN  (extracted component to keep App readable)
// ================================================================
interface SettingsScreenProps {
  appData: AppData;
  settingsView: SettingsView;
  editingTeamId: string | null;
  onPersist: (d: AppData) => void;
  onNav: (v: SettingsView) => void;
  onEditTeam: (id: string | null) => void;
  onBack: () => void;
  onStartGame: () => void;
}

const POSITIONS = ["PG", "SG", "SF", "PF", "C", ""];

function SettingsScreen({ appData, settingsView, editingTeamId, onPersist, onNav, onEditTeam, onBack, onStartGame }: SettingsScreenProps) {
  // ---- Game setup local state ----
  const [gsGameId, setGsGameId] = useState(appData.gameSetup.gameId);
  const [gsHomeId, setGsHomeId] = useState(appData.gameSetup.homeTeamId);
  const [gsAwayId, setGsAwayId] = useState(appData.gameSetup.awayTeamId);

  // ---- New team form ----
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamAbbr, setNewTeamAbbr] = useState("");

  // ---- Editing team local state ----
  const editingTeam = appData.teams.find(t => t.id === editingTeamId) ?? null;
  const [etName, setEtName] = useState(editingTeam?.name ?? "");
  const [etAbbr, setEtAbbr] = useState(editingTeam?.abbreviation ?? "");
  const [pNum, setPNum] = useState("");
  const [pName, setPName] = useState("");
  const [pPos, setPPos] = useState("");
  // editing existing player
  const [editPlayerId, setEditPlayerId] = useState<string | null>(null);
  const [epNum, setEpNum] = useState("");
  const [epName, setEpName] = useState("");
  const [epPos, setEpPos] = useState("");

  // sync local state when editingTeam changes
  useEffect(() => {
    setEtName(editingTeam?.name ?? "");
    setEtAbbr(editingTeam?.abbreviation ?? "");
    setEditPlayerId(null);
  }, [editingTeamId]);

  // ---- Team CRUD ----
  function createTeam() {
    if (!newTeamName.trim()) return;
    const team: Team = { id: uid(), name: newTeamName.trim(), abbreviation: newTeamAbbr.trim() || newTeamName.slice(0, 3).toUpperCase(), players: [] };
    onPersist({ ...appData, teams: [...appData.teams, team] });
    setNewTeamName("");
    setNewTeamAbbr("");
  }

  function deleteTeam(id: string) {
    onPersist({ ...appData, teams: appData.teams.filter(t => t.id !== id) });
  }

  function saveTeamInfo() {
    if (!editingTeam || !etName.trim()) return;
    onPersist({
      ...appData,
      teams: appData.teams.map(t => t.id === editingTeam.id ? { ...t, name: etName.trim(), abbreviation: etAbbr.trim() || etName.slice(0, 3).toUpperCase() } : t),
    });
  }

  // ---- Player CRUD ----
  function addPlayer() {
    if (!editingTeam || !pNum.trim() || !pName.trim()) return;
    const player: Player = { id: uid(), number: pNum.trim(), name: pName.trim(), position: pPos };
    onPersist({ ...appData, teams: appData.teams.map(t => t.id === editingTeam.id ? { ...t, players: [...t.players, player] } : t) });
    setPNum(""); setPName(""); setPPos("");
  }

  function removePlayer(playerId: string) {
    if (!editingTeam) return;
    onPersist({ ...appData, teams: appData.teams.map(t => t.id === editingTeam.id ? { ...t, players: t.players.filter(p => p.id !== playerId) } : t) });
  }

  function startEditPlayer(p: Player) {
    setEditPlayerId(p.id);
    setEpNum(p.number);
    setEpName(p.name);
    setEpPos(p.position);
  }

  function saveEditPlayer() {
    if (!editingTeam || !editPlayerId || !epNum.trim() || !epName.trim()) return;
    onPersist({ ...appData, teams: appData.teams.map(t => t.id === editingTeam.id ? { ...t, players: t.players.map(p => p.id === editPlayerId ? { ...p, number: epNum.trim(), name: epName.trim(), position: epPos } : p) } : t) });
    setEditPlayerId(null);
  }

  // ---- Game setup ----
  function saveGameSetup() {
    onPersist({ ...appData, gameSetup: { gameId: gsGameId.trim() || "game-1", homeTeamId: gsHomeId, awayTeamId: gsAwayId } });
  }

  // ================================================================
  //  RENDER: Teams list
  // ================================================================
  if (settingsView === "teams") {
    return (
      <div className="settings-page">
        <header className="settings-header">
          <button className="back-btn" onClick={() => onNav("menu")}>\u2190 Back</button>
          <h2>Teams</h2>
          <div style={{ width: 64 }} />
        </header>

        {/* Create new team */}
        <section className="settings-section">
          <h3>New Team</h3>
          <div className="add-player-row">
            <input className="abbr-inp" placeholder="ABV" value={newTeamAbbr} onChange={e => setNewTeamAbbr(e.target.value)} maxLength={4} />
            <input placeholder="Team name" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} onKeyDown={e => e.key === "Enter" && createTeam()} />
            <button className="add-btn" onClick={createTeam}>Add</button>
          </div>
        </section>

        {/* Teams list */}
        <section className="settings-section">
          <h3>All Teams ({appData.teams.length})</h3>
          {appData.teams.length === 0 && <p className="dim-text">No teams yet. Add one above.</p>}
          {appData.teams.map(team => (
            <div key={team.id} className="team-list-row">
              <div className="team-list-info">
                <span className="team-abbr-badge">{team.abbreviation}</span>
                <span className="team-list-name">{team.name}</span>
                <span className="team-list-count">{team.players.length} players</span>
              </div>
              <div className="team-list-actions">
                <button className="edit-btn" onClick={() => { onEditTeam(team.id); onNav("team-edit"); }}>Roster</button>
                <button className="rm-btn" onClick={() => deleteTeam(team.id)}>\u2715</button>
              </div>
            </div>
          ))}
        </section>
      </div>
    );
  }

  // ================================================================
  //  RENDER: Team roster editor
  // ================================================================
  if (settingsView === "team-edit" && editingTeam) {
    return (
      <div className="settings-page">
        <header className="settings-header">
          <button className="back-btn" onClick={() => onNav("teams")}>\u2190 Teams</button>
          <h2>{editingTeam.name}</h2>
          <div style={{ width: 64 }} />
        </header>

        {/* Team info */}
        <section className="settings-section">
          <h3>Team Info</h3>
          <div className="add-player-row">
            <input className="abbr-inp" placeholder="ABV" value={etAbbr} onChange={e => setEtAbbr(e.target.value)} maxLength={4} />
            <input placeholder="Team name" value={etName} onChange={e => setEtName(e.target.value)} />
            <button className="add-btn" onClick={saveTeamInfo}>Save</button>
          </div>
        </section>

        {/* Add player */}
        <section className="settings-section">
          <h3>Add Player</h3>
          <div className="add-player-row">
            <input className="num-inp" placeholder="#" value={pNum} onChange={e => setPNum(e.target.value)} />
            <input placeholder="Name" value={pName} onChange={e => setPName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPlayer()} style={{ flex: 2 }} />
            <select className="pos-select" value={pPos} onChange={e => setPPos(e.target.value)}>
              <option value="">Pos</option>
              {POSITIONS.filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="add-btn" onClick={addPlayer}>Add</button>
          </div>
        </section>

        {/* Roster */}
        <section className="settings-section">
          <h3>Roster ({editingTeam.players.length})</h3>
          {editingTeam.players.length === 0 && <p className="dim-text">No players yet.</p>}
          {editingTeam.players.map(p => (
            editPlayerId === p.id
              ? (
                <div key={p.id} className="player-edit-row">
                  <input className="num-inp" value={epNum} onChange={e => setEpNum(e.target.value)} />
                  <input value={epName} onChange={e => setEpName(e.target.value)} style={{ flex: 2 }} />
                  <select className="pos-select" value={epPos} onChange={e => setEpPos(e.target.value)}>
                    <option value="">Pos</option>
                    {POSITIONS.filter(Boolean).map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                  <button className="add-btn" onClick={saveEditPlayer}>Save</button>
                  <button className="rm-btn" onClick={() => setEditPlayerId(null)}>\u2715</button>
                </div>
              )
              : (
                <div key={p.id} className="roster-row">
                  <div className="roster-info">
                    <span className="r-num">#{p.number}</span>
                    <span className="r-name">{p.name}</span>
                    {p.position && <span className="r-pos">{p.position}</span>}
                  </div>
                  <div className="roster-actions">
                    <button className="edit-btn" onClick={() => startEditPlayer(p)}>Edit</button>
                    <button className="rm-btn" onClick={() => removePlayer(p.id)}>\u2715</button>
                  </div>
                </div>
              )
          ))}
        </section>
      </div>
    );
  }

  // ================================================================
  //  RENDER: Game setup
  // ================================================================
  if (settingsView === "game-setup") {
    return (
      <div className="settings-page">
        <header className="settings-header">
          <button className="back-btn" onClick={() => onNav("menu")}>\u2190 Back</button>
          <h2>Game Setup</h2>
          <button className="save-btn" onClick={() => { saveGameSetup(); onNav("menu"); }}>Save</button>
        </header>

        <section className="settings-section">
          <h3>Game ID</h3>
          <input value={gsGameId} onChange={e => setGsGameId(e.target.value)} placeholder="game-1" />
        </section>

        <section className="settings-section">
          <h3>Home Team (teal)</h3>
          {appData.teams.length === 0 && <p className="dim-text">No teams yet \u2014 create one in Teams first.</p>}
          <div className="team-picker">
            {appData.teams.map(t => (
              <button key={t.id}
                className={`team-pick-btn${gsHomeId === t.id ? " pick-active-teal" : ""}`}
                onClick={() => { setGsHomeId(t.id); if (gsAwayId === t.id) setGsAwayId(""); }}>
                <span className="tp-abbr">{t.abbreviation}</span>
                <span className="tp-name">{t.name}</span>
                <span className="tp-count">{t.players.length}p</span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>Away Team (red)</h3>
          {appData.teams.length === 0 && <p className="dim-text">No teams yet \u2014 create one in Teams first.</p>}
          <div className="team-picker">
            {appData.teams.map(t => (
              <button key={t.id}
                className={`team-pick-btn${gsAwayId === t.id ? " pick-active-red" : ""}${gsHomeId === t.id ? " pick-locked" : ""}`}
                disabled={gsHomeId === t.id}
                onClick={() => setGsAwayId(t.id)}>
                <span className="tp-abbr">{t.abbreviation}</span>
                <span className="tp-name">{t.name}</span>
                <span className="tp-count">{t.players.length}p</span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <button className="start-btn" onClick={() => { saveGameSetup(); onStartGame(); }}>Start / Reset Game</button>
        </section>
      </div>
    );
  }

  // ================================================================
  //  RENDER: Settings menu (default)
  // ================================================================
  const homeTeam = appData.teams.find(t => t.id === appData.gameSetup.homeTeamId);
  const awayTeam = appData.teams.find(t => t.id === appData.gameSetup.awayTeamId);

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button className="back-btn" onClick={onBack}>\u2190 Game</button>
        <h2>Settings</h2>
        <div style={{ width: 64 }} />
      </header>

      <section className="settings-section">
        <h3>Game</h3>
        <div className="menu-card" onClick={() => onNav("game-setup")}>
          <div className="menu-card-info">
            <span className="menu-card-title">Game Setup</span>
            <span className="menu-card-sub">
              {homeTeam && awayTeam ? `${homeTeam.name} vs ${awayTeam.name} \u2022 ${appData.gameSetup.gameId}` : "No teams selected"}
            </span>
          </div>
          <span className="menu-chev">\u203a</span>
        </div>
      </section>

      <section className="settings-section">
        <h3>Roster Management</h3>
        <div className="menu-card" onClick={() => onNav("teams")}>
          <div className="menu-card-info">
            <span className="menu-card-title">Teams &amp; Rosters</span>
            <span className="menu-card-sub">{appData.teams.length} team{appData.teams.length !== 1 ? "s" : ""} \u2022 {appData.teams.reduce((n, t) => n + t.players.length, 0)} players total</span>
          </div>
          <span className="menu-chev">\u203a</span>
        </div>
      </section>

      {appData.teams.length > 0 && (
        <section className="settings-section">
          <h3>Quick Roster Access</h3>
          {appData.teams.map(team => (
            <div key={team.id} className="menu-card" onClick={() => { onEditTeam(team.id); onNav("team-edit"); }}>
              <div className="menu-card-info">
                <span className="menu-card-title">{team.abbreviation} \u2014 {team.name}</span>
                <span className="menu-card-sub">{team.players.length} player{team.players.length !== 1 ? "s" : ""}</span>
              </div>
              <span className="menu-chev">\u203a</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
