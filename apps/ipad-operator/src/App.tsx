import { useEffect, useMemo, useRef, useState } from "react";
import { getPeriodDefaultClock, isOvertimePeriod, type GameEvent } from "@bta/shared-schema";
import { QRCodeSVG } from "qrcode.react";
import { io } from "socket.io-client";

const defaultHost = window.location.hostname || "localhost";
const DEFAULT_API = import.meta.env.VITE_API ?? `http://${defaultHost}:4000`;
const DEFAULT_COACH_DASHBOARD = import.meta.env.VITE_COACH_DASHBOARD ?? `http://${defaultHost}:5173`;
const DEFAULT_STATS_DASHBOARD = import.meta.env.VITE_STATS_DASHBOARD ?? `http://${defaultHost}:5000`;
const STORE = "operator-console";
const APP_DATA_KEY = "shared-app-data-v3";
const DEVICE_ID_KEY = "operator-device-id";

/** Returns `{ "x-api-key": key }` when a key is configured, otherwise `{}`. */
function apiKeyHeader(setup: { apiKey?: string }): Record<string, string> {
  return setup.apiKey ? { "x-api-key": setup.apiKey } : {};
}
/** Returns RequestInit for a plain GET request, adding the API key header when configured. */
function apiHeaders(setup: { apiKey?: string }): RequestInit {
  const h = apiKeyHeader(setup);
  return Object.keys(h).length ? { headers: h } : {};
}

function buildCoachViewUrl(
  gameId: string,
  deviceId: string,
  setup: {
    myTeamId?: string;
    myTeamName?: string;
    opponentName?: string;
    vcSide?: "home" | "away";
  }
): string {
  const base = DEFAULT_COACH_DASHBOARD.replace(/\/$/, "");
  const params = new URLSearchParams({ deviceId });
  if (gameId) params.set("gameId", gameId);
  if (setup.myTeamId) params.set("myTeamId", setup.myTeamId);
  if (setup.myTeamName) params.set("myTeamName", setup.myTeamName);
  if (setup.opponentName) params.set("opponentName", setup.opponentName);
  if (setup.vcSide) params.set("vcSide", setup.vcSide);
  return `${base}/?${params.toString()}`;
}

function getDefaultDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing?.trim()) {
      return existing;
    }

    const next = `device-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return "device-1";
  }
}

type TeamSide = "home" | "away";
type SettingsView = "menu" | "teams" | "team-edit" | "game-setup";

export interface Player {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;   // e.g. "6'2\""
  grade?: string;    // e.g. "11"
}

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  players: Player[];
}

export interface GameSetup {
  gameId: string;
  deviceId: string;
  myTeamId: string;      // the team you are tracking
  apiUrl: string;        // Realtime API (http://<laptop-ip>:4000)
  apiKey?: string;       // shared secret sent as x-api-key header
  opponent: string;
  vcSide: "home" | "away";
  dashboardUrl: string;
  statsGameId?: number;  // returned by dashboard on first successful submit
  /** @deprecated use myTeamId + vcSide instead */
  homeTeamId?: string;
  /** @deprecated use myTeamId + vcSide instead */
  awayTeamId?: string;
}

export interface AppData {
  teams: Team[];
  gameSetup: GameSetup;
}

const DEFAULT_DATA: AppData = {
  teams: [],
  gameSetup: { gameId: "game-1", deviceId: getDefaultDeviceId(), myTeamId: "", apiUrl: DEFAULT_API, opponent: "", vcSide: "home", dashboardUrl: DEFAULT_STATS_DASHBOARD },
};

const STANDARD_TEST_TEAM: Team = {
  id: "team-usa",
  name: "USA",
  abbreviation: "USA",
  players: [
    { id: "usa-4", number: "4", name: "Stephen Curry", position: "PG", height: "6'2\"", grade: "Pro" },
    { id: "usa-6", number: "6", name: "LeBron James", position: "SF", height: "6'9\"", grade: "Pro" },
    { id: "usa-7", number: "7", name: "Kevin Durant", position: "SF", height: "6'10\"", grade: "Pro" },
    { id: "usa-8", number: "8", name: "Kobe Bryant", position: "SG", height: "6'6\"", grade: "Pro" },
    { id: "usa-9", number: "9", name: "Michael Jordan", position: "SG", height: "6'6\"", grade: "Pro" },
    { id: "usa-10", number: "10", name: "Magic Johnson", position: "PG", height: "6'9\"", grade: "Pro" },
    { id: "usa-11", number: "11", name: "Kyrie Irving", position: "PG", height: "6'2\"", grade: "Pro" },
    { id: "usa-13", number: "13", name: "Anthony Davis", position: "PF", height: "6'10\"", grade: "Pro" },
    { id: "usa-15", number: "15", name: "Carmelo Anthony", position: "PF", height: "6'7\"", grade: "Pro" },
    { id: "usa-34", number: "34", name: "Shaquille O'Neal", position: "C", height: "7'1\"", grade: "Pro" },
  ],
};

function withStandardizedTeams(data: AppData): AppData {
  const hasTestTeam = data.teams.some((t) => t.id === STANDARD_TEST_TEAM.id);
  const teams = hasTestTeam ? data.teams : [...data.teams, STANDARD_TEST_TEAM];
  const hasSelectedTeam = teams.some((t) => t.id === data.gameSetup.myTeamId);
  const gameSetup = hasSelectedTeam
    ? data.gameSetup
    : { ...data.gameSetup, myTeamId: STANDARD_TEST_TEAM.id };
  return { ...data, teams, gameSetup };
}

// ---- Storage helpers ----
function loadAppData(): AppData {
  // Check URL params first — a QR-code scan may carry config overrides.
  const qp = new URLSearchParams(window.location.search);
  const urlSetup: Partial<GameSetup> = {};
  if (qp.get("apiUrl"))      urlSetup.apiUrl      = qp.get("apiUrl")!;
  if (qp.get("apiKey"))      urlSetup.apiKey      = qp.get("apiKey")!;
  if (qp.get("dashboardUrl")) urlSetup.dashboardUrl = qp.get("dashboardUrl")!;
  if (qp.get("gameId"))      urlSetup.gameId      = qp.get("gameId")!;
  if (qp.get("deviceId"))    urlSetup.deviceId    = qp.get("deviceId")!;
  if (qp.get("opponent"))    urlSetup.opponent    = qp.get("opponent")!;
  if (qp.get("vcSide") === "home" || qp.get("vcSide") === "away") urlSetup.vcSide = qp.get("vcSide") as "home" | "away";

  try {
    const s = localStorage.getItem(APP_DATA_KEY);
    if (s) {
      const parsed = JSON.parse(s) as AppData;
      const gs = { ...DEFAULT_DATA.gameSetup, ...parsed.gameSetup };
      // Migrate old saves that used homeTeamId/awayTeamId instead of myTeamId
      if (!gs.myTeamId) {
        const side = gs.vcSide ?? "home";
        const legacyId = side === "home" ? (gs as GameSetup).homeTeamId : (gs as GameSetup).awayTeamId;
        if (legacyId) gs.myTeamId = legacyId;
      }
      return withStandardizedTeams({
        ...DEFAULT_DATA,
        ...parsed,
        // Deep-merge gameSetup so new fields get their defaults for old saves
        gameSetup: { ...gs, ...urlSetup },
      });
    }
  } catch { /* empty */ }
  return withStandardizedTeams({ ...DEFAULT_DATA, gameSetup: { ...DEFAULT_DATA.gameSetup, ...urlSetup } });
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
  ftm: number; fta: number;
  oreb: number; dreb: number; ast: number; stl: number; blk: number; to: number; fouls: number;
}
function computePlayerTotals(events: GameEvent[]): Record<string, RunningTotals> {
  const map: Record<string, RunningTotals> = {};
  function get(id: string) {
    if (!map[id]) map[id] = { points: 0, fgm: 0, fga: 0, threePm: 0, threePa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, fouls: 0 };
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
    } else if (e.type === "free_throw_attempt") {
      const t = get(e.playerId);
      t.fta++;
      if (e.made) {
        t.ftm++;
        t.points += 1;
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
function computeScores(events: GameEvent[], homeTeamId: string, awayTeamId: string) {
  const s = { home: 0, away: 0 };
  for (const e of events) {
    if (e.type === "shot_attempt" && e.made) {
      if (e.teamId === homeTeamId) s.home += e.points;
      if (e.teamId === awayTeamId) s.away += e.points;
    }
    if (e.type === "free_throw_attempt" && e.made) {
      if (e.teamId === homeTeamId) s.home += 1;
      if (e.teamId === awayTeamId) s.away += 1;
    }
  }
  return s;
}

function generateGameId(opponent: string, date: string): string {
  const slug = (opponent || "game").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "game";
  const d = date || new Date().toISOString().slice(0, 10);
  return `${d}-${slug}`;
}

function computePlusMinus(events: GameEvent[], vcTeamId: string): Record<string, number> {
  const pm: Record<string, number> = {};
  const vcLineup = new Set<string>();
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  for (const e of sorted) {
    if (e.type === "substitution") {
      if (e.teamId === vcTeamId) { vcLineup.delete(e.playerOutId); vcLineup.add(e.playerInId); }
    } else if (e.type === "shot_attempt" || e.type === "free_throw_attempt" || e.type === "rebound" ||
               e.type === "foul" || e.type === "assist" || e.type === "steal" || e.type === "block") {
      if (e.teamId === vcTeamId) vcLineup.add(e.playerId);
    } else if (e.type === "turnover" && e.playerId) {
      if (e.teamId === vcTeamId) vcLineup.add(e.playerId);
    }
    if ((e.type === "shot_attempt" && e.made) || (e.type === "free_throw_attempt" && e.made)) {
      const points = e.type === "shot_attempt" ? e.points : 1;
      const delta = e.teamId === vcTeamId ? points : -points;
      for (const pid of vcLineup) pm[pid] = (pm[pid] ?? 0) + delta;
    }
  }
  return pm;
}

function describeEvent(
  event: GameEvent,
  homeTeamName: string,
  awayTeamName: string,
  allPlayers: Player[],
  pTotals: Record<string, RunningTotals>,
  homeTeamId = "home",
  awayTeamId = "away"
) {
  const tn = (id: string) => id === homeTeamId ? homeTeamName : id === awayTeamId ? awayTeamName : id;
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
    case "free_throw_attempt": {
      const t = pTotals[event.playerId];
      const ftStr = t ? `${t.ftm}-${t.fta} ft` : "ft";
      const ptsStr = t ? `${t.points}pts` : "";
      return {
        main: event.made ? "ft" : "ft miss",
        detail: `${pn(event.playerId)}  ${ptsStr} ${ftStr}`.trim(),
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
    case "period_transition":
      return { main: `${event.newPeriod} start`, detail: "", accent: "teal" };
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
  await import("jspdf-autotable");

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

  const scores  = computeScores(allEvents, homeTeam?.id ?? "home", awayTeam?.id ?? "away");
  const pTotals = computePlayerTotals(allEvents);

  // Header banner
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 32, "F");

  doc.setFontSize(18);
  doc.setTextColor(...TEAL);
  doc.setFont("helvetica", "bold");
  doc.text("Game Report", 14, 13);

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
    doc.text(name.toUpperCase() + " — BOX SCORE", 14, y + 4);
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

    (doc as any).autoTable({
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
      didParseCell(data: any) {
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
    y = (doc as any).lastAutoTable.finalY + 6;
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
    const d = describeEvent(e, homeName, awayName, allPlayers, pTotals, homeTeam?.id ?? "home", awayTeam?.id ?? "away");
    const mins = Math.floor(e.clockSecondsRemaining / 60);
    const secs = String(e.clockSecondsRemaining % 60).padStart(2, "0");
    const clock = `Q${e.period}  ${mins}:${secs}`;
    const team  = e.teamId === "home" || e.teamId === homeTeam?.id ? homeAbbr : e.teamId === "away" || e.teamId === awayTeam?.id ? awayAbbr : "";
    return [clock, team, d.main, d.detail ?? ""];
  });

  (doc as any).autoTable({
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
      `Basketball Platform  •  Generated ${new Date().toLocaleString()}`,
      14, doc.internal.pageSize.getHeight() - 6,
    );
    doc.text(`Page ${i} / ${pages}`, W - 14, doc.internal.pageSize.getHeight() - 6, { align: "right" });
  }

  const safeId   = gameId.replace(/[^a-zA-Z0-9\-_]/g, "_");
  const safeDate = gameDate.replace(/[^a-zA-Z0-9\-]/g, "-");
  doc.save(`game_report_${safeDate}_${safeId}.pdf`);
}

// ---- Dashboard stats helpers (Stats dashboard integration) ----

function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0][0]} ${parts.slice(1).join(" ")}`;
}

interface DashboardPlayerStat {
  number: number; name: string;
  height?: string; grade?: string;
  fg_made: number; fg_att: number; fg_pct: string;
  fg3_made: number; fg3_att: number; fg3_pct: string;
  ft_made: number; ft_att: number; ft_pct: string;
  oreb: number; dreb: number; fouls: number;
  stl: number; to: number; blk: number; asst: number;
  pts: number; plus_minus: number;
}

function computeDashboardPlayerStats(events: GameEvent[], players: Player[], vcTeamId: string): DashboardPlayerStat[] {
  const map: Record<string, {
    fg_made: number; fg_att: number; fg3_made: number; fg3_att: number;
    ft_made: number; ft_att: number; pts: number;
    oreb: number; dreb: number; ast: number; stl: number; blk: number; to: number; fouls: number;
  }> = {};

  function get(id: string) {
    if (!map[id]) map[id] = { fg_made: 0, fg_att: 0, fg3_made: 0, fg3_att: 0,
      ft_made: 0, ft_att: 0, pts: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, fouls: 0 };
    return map[id];
  }

  for (const e of events) {
    if (e.type === "shot_attempt") {
      const t = get(e.playerId);
      t.fg_att++;
      if (e.points === 3) t.fg3_att++;
      if (e.made) { t.fg_made++; t.pts += e.points; if (e.points === 3) t.fg3_made++; }
    } else if (e.type === "free_throw_attempt") {
      const t = get(e.playerId);
      t.ft_att++;
      if (e.made) { t.ft_made++; t.pts += 1; }
    } else if (e.type === "rebound") {
      const t = get(e.playerId); if (e.offensive) t.oreb++; else t.dreb++;
    } else if (e.type === "assist")  { get(e.playerId).ast++;   }
    else if (e.type === "steal")     { get(e.playerId).stl++;   }
    else if (e.type === "block")     { get(e.playerId).blk++;   }
    else if (e.type === "turnover" && e.playerId) { get(e.playerId).to++; }
    else if (e.type === "foul")      { get(e.playerId).fouls++; }
  }

  const pct = (made: number, att: number) => att > 0 ? `${Math.round(made / att * 100)}%` : "-";
  const plusMinus = computePlusMinus(events, vcTeamId);

  return players
    .map(p => {
      const t = map[p.id] ?? { fg_made: 0, fg_att: 0, fg3_made: 0, fg3_att: 0,
        ft_made: 0, ft_att: 0, pts: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, fouls: 0 };
      return {
        number: parseInt(p.number, 10) || 0,
        name: abbreviateName(p.name),
        height: p.height,
        grade: p.grade,
        fg_made: t.fg_made, fg_att: t.fg_att, fg_pct: pct(t.fg_made, t.fg_att),
        fg3_made: t.fg3_made, fg3_att: t.fg3_att, fg3_pct: pct(t.fg3_made, t.fg3_att),
        ft_made: t.ft_made, ft_att: t.ft_att, ft_pct: pct(t.ft_made, t.ft_att),
        oreb: t.oreb, dreb: t.dreb, fouls: t.fouls,
        stl: t.stl, to: t.to, blk: t.blk, asst: t.ast,
        pts: t.pts, plus_minus: plusMinus[p.id] ?? 0,
      };
    })
    .filter(p =>
      p.fg_att > 0 || p.ft_att > 0 || p.oreb > 0 || p.dreb > 0 ||
      p.stl > 0 || p.blk > 0 || p.to > 0 || p.fouls > 0 || p.asst > 0
    );
}

function computeTeamStats(events: GameEvent[], teamId: string) {
  let fg = 0, fga = 0, fg3 = 0, fg3a = 0, ft = 0, fta = 0;
  let oreb = 0, dreb = 0, asst = 0, to = 0, stl = 0, blk = 0, fouls = 0;
  for (const e of events) {
    if (e.teamId !== teamId) continue;
    if (e.type === "shot_attempt") {
      fga++; if (e.points === 3) fg3a++; if (e.made) { fg++; if (e.points === 3) fg3++; }
    } else if (e.type === "free_throw_attempt") {
      fta++; if (e.made) ft++;
    } else if (e.type === "rebound")  { if (e.offensive) oreb++; else dreb++; }
    else if (e.type === "assist")     { asst++;  }
    else if (e.type === "steal")      { stl++;   }
    else if (e.type === "block")      { blk++;   }
    else if (e.type === "turnover")   { to++;    }
    else if (e.type === "foul")       { fouls++; }
  }
  return { fg, fga, fg3, fg3a, ft, fta, oreb, dreb, reb: oreb + dreb, asst, to, stl, blk, fouls };
}

// ---- Modal types ----
type Modal =
  | { kind: "shot"; teamId: TeamSide; points: 2 | 3; made: boolean }
  | { kind: "freeThrow"; teamId: TeamSide; made: boolean }
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
  const [period, setPeriod] = useState("Q1" as string);
  const [clockInput, setClockInput] = useState("8:00");
  const [modal, setModal] = useState<Modal | null>(null);
  const [overtimeCount, setOvertimeCount] = useState(0);
  const [gameDate, setGameDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitStatus, setSubmitStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState<string>("Ready to save final stats to the dashboard.");
  const [postGameNameInput, setPostGameNameInput] = useState("");
  const [postGameOpponentInput, setPostGameOpponentInput] = useState("");
  const [postGameDateInput, setPostGameDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [postGameHomeScoreInput, setPostGameHomeScoreInput] = useState("0");
  const [postGameAwayScoreInput, setPostGameAwayScoreInput] = useState("0");

  // ---- Game flow phase ----
  const [gamePhase, setGamePhase] = useState<"pre-game" | "live" | "post-game">(() => {
    const saved = localStorage.getItem("operator-console:phase");
    if (saved === "live" || saved === "post-game" || saved === "pre-game") return saved as "pre-game" | "live" | "post-game";
    // Legacy: if there are already events for this game, land in live view
    return loadPending(loadAppData().gameSetup.gameId).length > 0 ? "live" : "pre-game";
  });

  // Ref for auto-save interval — always holds the latest values without re-registering the interval
  const autoSaveCtx = useRef<{ run: () => void }>({ run: () => {} });

  // Helper to generate team ID from name
  function generateTeamId(name: string): string {
    return `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opponent"}`;
  }

  function persistPhase(phase: "pre-game" | "live" | "post-game") {
    setGamePhase(phase);
    localStorage.setItem("operator-console:phase", phase);
  }

  // ---- Derived: home/away teams ----
  // myTeamId is the team we are tracking; side determines which slot they fill.
  const myTeam = appData.teams.find(t => t.id === appData.gameSetup.myTeamId);
  const vcSideSetup = appData.gameSetup.vcSide ?? "home";
  const homeTeam = vcSideSetup === "home" ? myTeam : undefined;
  const awayTeam  = vcSideSetup === "away" ? myTeam : undefined;
  const opponentName = appData.gameSetup.opponent?.trim() || "";
  const opponentTeamId = opponentName ? generateTeamId(opponentName) : "opponent";
  const homeTeamId = vcSideSetup === "home" ? (appData.gameSetup.myTeamId || "team-home") : opponentTeamId;
  const awayTeamId = vcSideSetup === "away" ? (appData.gameSetup.myTeamId || "team-away") : opponentTeamId;
  const vcTeamId = vcSideSetup === "home" ? homeTeamId : awayTeamId;
  const homeTeamName = myTeam && vcSideSetup === "home" ? myTeam.name : opponentName || "Home";
  const awayTeamName  = myTeam && vcSideSetup === "away" ? myTeam.name : opponentName || "Away";
  const liveHomeSideLabel = `${homeTeamName} (home)`;
  const liveAwaySideLabel = `${awayTeamName} (away)`;
  const homePlayers = homeTeam?.players ?? [];
  const awayPlayers = awayTeam?.players ?? [];
  const allPlayers = [...homePlayers, ...awayPlayers];

  function resolveTeamId(side: TeamSide): string {
    return side === "home" ? homeTeamId : awayTeamId;
  }

  function normalizeEventTeamId(event: GameEvent): GameEvent {
    if (event.teamId === homeTeamId || event.teamId === awayTeamId) return event;
    if (event.teamId === "home") return { ...event, teamId: homeTeamId };
    if (event.teamId === "away") return { ...event, teamId: awayTeamId };
    if (event.teamId === "team-home") return { ...event, teamId: homeTeamId };
    if (event.teamId === "team-away") return { ...event, teamId: awayTeamId };
    return event;
  }

  // ---- Network ----
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (gamePhase !== "live") {
      return;
    }

    const deviceId = appData.gameSetup.deviceId?.trim() || "device-1";
    const payload = { deviceId, gameId };
    const socket = io(appData.gameSetup.apiUrl, {
      auth: appData.gameSetup.apiKey ? { apiKey: appData.gameSetup.apiKey } : {}
    });

    const register = () => {
      socket.emit("operator:register", payload);
    };

    socket.on("connect", register);
    register();

    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit("operator:heartbeat", payload);
      }
    }, 10000);

    return () => {
      clearInterval(heartbeat);
      socket.off("connect", register);
      socket.disconnect();
    };
  }, [appData.gameSetup.apiKey, appData.gameSetup.apiUrl, appData.gameSetup.deviceId, gameId, gamePhase]);

  useEffect(() => {
    const localPending = loadPending(gameId).map(normalizeEventTeamId);
    const localSeq = loadSeq(gameId);
    setPendingEvents(localPending);
    setSequence(localSeq);
    async function hydrate() {
      try {
        const res = await fetch(`${appData.gameSetup.apiUrl}/games/${gameId}/events`, apiHeaders(appData.gameSetup));
        if (!res.ok) { setSubmittedEvents([]); return; }
        const events = ((await res.json()) as GameEvent[]).map(normalizeEventTeamId);
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
    const normalizedEvent = normalizeEventTeamId(event);
    try {
      const res = await fetch(`${appData.gameSetup.apiUrl}/games/${gameId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(appData.gameSetup) },
        body: JSON.stringify(normalizedEvent),
      });
      if (!res.ok) return false;
      setSubmittedEvents(cur => [...cur, normalizedEvent].sort((a, b) => a.sequence - b.sequence));
      setPendingEvents(cur => cur.filter(p => p.id !== normalizedEvent.id));
      return true;
    } catch {
      setPendingEvents(cur => {
        if (cur.some(p => p.id === normalizedEvent.id)) return cur;
        return [...cur, normalizedEvent].sort((a, b) => a.sequence - b.sequence);
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
      const res = await fetch(`${appData.gameSetup.apiUrl}/games/${gameId}/events`, apiHeaders(appData.gameSetup));
      if (res.ok) setSubmittedEvents(((await res.json()) as GameEvent[]).map(normalizeEventTeamId));
    } catch { /* empty */ }
  }

  useEffect(() => { if (online) void flushQueue(); }, [online]);

  async function postEvent(event: GameEvent) {
    const next = event.sequence + 1;
    setSequence(next);
    saveSeq(gameId, next);
    // Optimistic update: add to pending immediately so score updates instantly
    setPendingEvents(cur => [...cur, event].sort((a, b) => a.sequence - b.sequence));
    // Then submit in background
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
      const res = await fetch(`${appData.gameSetup.apiUrl}/games/${gameId}/events/${last.id}`, { method: "DELETE", headers: apiKeyHeader(appData.gameSetup) });
      if (res.ok) setSubmittedEvents(cur => cur.filter(e => e.id !== last.id));
    }
  }

  async function startGame(newGameId?: string) {
    // Read fresh settings from localStorage — saveGameSetup writes there synchronously
    // before this async function resolves, so we always get the latest values.
    const latest = loadAppData();
    const gid = newGameId ?? latest.gameSetup.gameId;

    // Derive team IDs from the latest saved setup
    const latestVcSide = latest.gameSetup.vcSide ?? "home";
    const latestOpponent = latest.gameSetup.opponent?.trim() || "";
    const latestOpponentTeamId = latestOpponent
      ? `team-${latestOpponent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opponent"}`
      : "opponent";
    const latestHomeTeamId =
      latestVcSide === "home"
        ? latest.gameSetup.myTeamId || "team-home"
        : latestOpponentTeamId;
    const latestAwayTeamId =
      latestVcSide === "away"
        ? latest.gameSetup.myTeamId || "team-away"
        : latestOpponentTeamId;

    try {
      const res = await fetch(`${latest.gameSetup.apiUrl}/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(latest.gameSetup) },
        body: JSON.stringify({
          gameId: gid,
          homeTeamId: latestHomeTeamId,
          awayTeamId: latestAwayTeamId,
          opponentName: latestOpponent,
          opponentTeamId: latestOpponentTeamId,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        alert(`Could not register game on the live server (${res.status}): ${body || "unknown error"}.\n\nCheck Settings → API URL and try again.`);
        return;
      }
    } catch {
      alert(`Could not reach the live server at ${latest.gameSetup.apiUrl}.\n\nMake sure the realtime API is running, then go to Settings → Game Setup and tap Start Game again.`);
      return;
    }

    // Merge new gameId into the latest persisted data to avoid overwriting settings
    // that were saved by saveGameSetup() just before this call.
    const nextData: AppData = {
      ...latest,
      gameSetup: { ...latest.gameSetup, gameId: gid, statsGameId: undefined },
    };
    setAppData(nextData);
    saveAppData(nextData);
    setPendingEvents([]);
    setSubmittedEvents([]);
    setSequence(1);
    savePending(gid, []);
    saveSeq(gid, 1);
    persistPhase("live");
  }

  /** End the current game: auto-saves to stats dashboard if there's data, then resets. */
  async function endAndResetGame() {
    if (allEventObjs.length > 0 && appData.gameSetup.opponent?.trim()) {
      const saved = await submitToDashboard();
      if (!saved) {
        return false;
      }
    }
    // Use fresh localStorage data so we get the opponent name just saved by saveGameSetup()
    const latest = loadAppData();
    const newId = generateGameId(latest.gameSetup.opponent ?? "", gameDate);
    await startGame(newId);
    return true;
  }

  /** End game from the live view — submits stats then shows the post-game screen. */
  async function endGame() {
    if (allEventObjs.length > 0 && appData.gameSetup.opponent?.trim()) {
      await submitToDashboard();
    }
    persistPhase("post-game");
  }

  /** Prepare a fresh game after viewing post-game screen — returns to pre-game setup. */
  function handleNewGame() {
    const latest = loadAppData();
    const newId = generateGameId(latest.gameSetup.opponent ?? "", new Date().toISOString().slice(0, 10));
    const nextData: AppData = {
      ...latest,
      gameSetup: { ...latest.gameSetup, gameId: newId, statsGameId: undefined },
    };
    persistData(nextData);
    setPendingEvents([]);
    setSubmittedEvents([]);
    setSequence(1);
    savePending(newId, []);
    saveSeq(newId, 1);
    setGameDate(new Date().toISOString().slice(0, 10));
    setSubmitStatus("idle");
    setSubmitMessage("Ready to save final stats to the dashboard.");
    persistPhase("pre-game");
  }

  async function submitToDashboard(overrides?: { opponent?: string; date?: string; homeScore?: number; awayScore?: number }) {
    const vcSide = appData.gameSetup.vcSide ?? "home";
    const oppSide: TeamSide = vcSide === "home" ? "away" : "home";
    const opponent = overrides?.opponent?.trim() || appData.gameSetup.opponent?.trim() || "";
    const dashboardUrl = appData.gameSetup.dashboardUrl?.trim() || "http://localhost:5000";

    if (!opponent) {
      const message = "Enter the opponent name in Game Setup before submitting.";
      setSubmitMessage(message);
      alert("Enter the opponent name in Game Setup (⚙ Settings → Game Setup) before submitting.");
      return false;
    }

    const vcTeam = vcSide === "home" ? homeTeam : awayTeam;
    if (!vcTeam) {
      const message = "Tracked team is not configured. Check Game Setup in Settings.";
      setSubmitMessage(message);
      alert("Tracked team is not configured. Check Game Setup in Settings.");
      return false;
    }

    setSubmitStatus("pending");
    setSubmitMessage(`Saving final stats to ${dashboardUrl}...`);

    // Format date to match Stats dashboard convention: "Dec 3, 2025"
    const effectiveDate = overrides?.date || gameDate;
    const dateParts = new Date(effectiveDate + "T12:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });

    const computedVcScore = scores[vcSide];
    const computedOppScore = scores[oppSide];
    const vcScore = vcSide === "home"
      ? (overrides?.homeScore ?? computedVcScore)
      : (overrides?.awayScore ?? computedVcScore);
    const oppScore = vcSide === "home"
      ? (overrides?.awayScore ?? computedOppScore)
      : (overrides?.homeScore ?? computedOppScore);
    const playerStats = computeDashboardPlayerStats(allEventObjs, vcTeam.players, vcTeamId);
    const teamStats = computeTeamStats(allEventObjs, vcTeamId);

    // Full roster for the dashboard to upsert — keyed by jersey number so it
    // correctly updates existing players instead of creating abbreviated duplicates.
    const rosterPayload = vcTeam.players.map(p => ({
      number: parseInt(p.number, 10) || 0,
      name: p.name,
      position: p.position || undefined,
      height: p.height || undefined,
      grade: p.grade || undefined,
    }));

    const payload: Record<string, unknown> = {
      date: dateParts,
      opponent,
      location: vcSide,
      vc_score: vcScore,
      opp_score: oppScore,
      team_stats: teamStats,
      player_stats: playerStats,
      roster: rosterPayload,
    };
    // Include stored statsGameId so the dashboard upserts instead of duplicating
    if (appData.gameSetup.statsGameId != null) {
      payload.gameId = appData.gameSetup.statsGameId;
    }

    try {
      const res = await fetch(`${dashboardUrl}/api/ingest-game`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(appData.gameSetup) },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({})) as { message?: string; gameId?: number; error?: string };
      if (res.ok) {
        // Store the assigned gameId so future re-submits overwrite instead of duplicate
        if (result.gameId != null && result.gameId !== appData.gameSetup.statsGameId) {
          persistData({
            ...appData,
            gameSetup: { ...appData.gameSetup, statsGameId: result.gameId },
          });
        }
        setSubmitStatus("success");
        setSubmitMessage(`Saved final stats to ${dashboardUrl}.`);
        setTimeout(() => {
          setSubmitStatus("idle");
          setSubmitMessage("Ready to save final stats to the dashboard.");
        }, 4000);
        return true;
      } else {
        const errorMessage = result.error || result.message || `Request failed with status ${res.status}.`;
        console.error("Dashboard ingest error:", errorMessage);
        setSubmitMessage(`Dashboard save failed: ${errorMessage}`);
        alert(
          `Could not save final stats to the Stats dashboard.\n\n${errorMessage}\n\nCheck Settings -> Game Setup -> Stats Dashboard URL and make sure the dashboard is running.`
        );
        setSubmitStatus("error");
        return false;
      }
    } catch (err) {
      console.error("Could not reach Stats dashboard:", err);
      setSubmitMessage(`Could not reach dashboard at ${dashboardUrl}. Start the dashboard or update the URL in Game Setup.`);
      alert(
        `Could not reach the Stats dashboard at ${dashboardUrl}.\n\nStart the Stats Dashboard service or update Settings -> Game Setup -> Stats Dashboard URL, then retry.`
      );
      setSubmitStatus("error");
      return false;
    }
  }

  // ---- Computed values ----
  const allEvents = useMemo(() => [
    ...submittedEvents.map(e => ({ event: e, pending: false })),
    ...pendingEvents.filter(e => !submittedEvents.some(s => s.id === e.id)).map(e => ({ event: e, pending: true })),
  ].sort((a, b) => b.event.sequence - a.event.sequence), [submittedEvents, pendingEvents]);
  // scores and totals include pending events so the UI is always up-to-date offline
  const allEventObjs = useMemo(() => allEvents.map(x => x.event), [allEvents]);
  const scores = useMemo(() => computeScores(allEventObjs, homeTeamId, awayTeamId), [allEventObjs, homeTeamId, awayTeamId]);
  const pTotals = useMemo(() => computePlayerTotals(allEventObjs), [allEventObjs]);
  const foulAlerts = useMemo(() => {
    const vcPl = appData.gameSetup.vcSide === "home" ? homePlayers : awayPlayers;
    return vcPl.filter(p => (pTotals[p.id]?.fouls ?? 0) >= 4);
  }, [appData.gameSetup.vcSide, homePlayers, awayPlayers, pTotals]);
  const maxOtInEvents = useMemo(() => {
    return allEventObjs.reduce((maxOt, event) => {
      if (!isOvertimePeriod(event.period)) return maxOt;
      const otNumber = Number.parseInt(event.period.slice(2), 10);
      return Number.isFinite(otNumber) ? Math.max(maxOt, otNumber) : maxOt;
    }, 0);
  }, [allEventObjs]);

  useEffect(() => {
    const currentOt = isOvertimePeriod(period) ? Number.parseInt(period.slice(2), 10) : 0;
    setOvertimeCount((current) => Math.max(current, maxOtInEvents, Number.isFinite(currentOt) ? currentOt : 0));
  }, [maxOtInEvents, period]);

  async function deleteOvertimePeriod(periodLabel: string) {
    if (!isOvertimePeriod(periodLabel)) return;

    const pendingToRemove = pendingEvents.filter((event) => event.period === periodLabel);
    const submittedToRemove = submittedEvents.filter((event) => event.period === periodLabel);

    if (submittedToRemove.length > 0 && !navigator.onLine) {
      alert("Cannot delete overtime while offline because submitted events must be removed from the API first.");
      return;
    }

    setPendingEvents((current) => current.filter((event) => event.period !== periodLabel));

    const failedDeletes: string[] = [];
    for (const event of submittedToRemove) {
      try {
        const res = await fetch(`${appData.gameSetup.apiUrl}/games/${gameId}/events/${event.id}`, {
          method: "DELETE",
          headers: apiKeyHeader(appData.gameSetup),
        });
        if (!res.ok) {
          failedDeletes.push(event.id);
        }
      } catch {
        failedDeletes.push(event.id);
      }
    }

    if (failedDeletes.length > 0) {
      const failed = new Set(failedDeletes);
      setSubmittedEvents((current) => current.filter((event) => event.period !== periodLabel || failed.has(event.id)));
      alert(`Could not delete ${failedDeletes.length} submitted OT events from the server. Remaining OT events were kept.`);
      return;
    }

    setSubmittedEvents((current) => current.filter((event) => event.period !== periodLabel));
    const nextCount = Number.parseInt(periodLabel.slice(2), 10) - 1;
    setOvertimeCount(Math.max(0, nextCount));

    if (period === periodLabel) {
      setPeriod("Q4");
      setClockInput(getPeriodDefaultClock("Q4"));
    }

    if (pendingToRemove.length + submittedToRemove.length > 0) {
      setSubmitMessage(`Deleted ${periodLabel} and removed ${pendingToRemove.length + submittedToRemove.length} events.`);
    } else {
      setSubmitMessage(`Deleted ${periodLabel}.`);
    }
  }

  function addOvertimePeriod() {
    const next = overtimeCount + 1;
    const label = `OT${next}`;
    setOvertimeCount(next);
    if (period !== label) {
      const endSeq = sequence;
      void postEvent({
        ...base(endSeq),
        teamId: homeTeamId,
        type: "period_transition",
        newPeriod: label,
      });
      setPeriod(label);
      setClockInput(getPeriodDefaultClock(label));
    }
  }

  // Keep the ref current so the interval always has the latest values
  useEffect(() => {
    autoSaveCtx.current.run = () => {
      if (allEventObjs.length > 0 && appData.gameSetup.opponent?.trim() && navigator.onLine) {
        void submitToDashboard();
      }
    };
  });

  useEffect(() => {
    if (gamePhase !== "post-game") return;
    setPostGameNameInput(appData.gameSetup.gameId || "");
    setPostGameOpponentInput(appData.gameSetup.opponent || "");
    setPostGameDateInput(gameDate);
    setPostGameHomeScoreInput(String(scores.home));
    setPostGameAwayScoreInput(String(scores.away));
  }, [gamePhase, appData.gameSetup.gameId, appData.gameSetup.opponent, gameDate, scores.home, scores.away]);

  function parseScoreInput(value: string, fallback: number) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
  }

  function applyPostGameEdits() {
    const name = postGameNameInput.trim() || appData.gameSetup.gameId;
    const opponent = postGameOpponentInput.trim();
    const date = postGameDateInput || gameDate;
    setGameDate(date);
    persistData({
      ...appData,
      gameSetup: {
        ...appData.gameSetup,
        gameId: name,
        opponent,
      },
    });
    return {
      gameId: name,
      opponent,
      date,
      homeScore: parseScoreInput(postGameHomeScoreInput, scores.home),
      awayScore: parseScoreInput(postGameAwayScoreInput, scores.away),
    };
  }

  function resetGameStateFor(gameIdToReset: string) {
    setPendingEvents([]);
    setSubmittedEvents([]);
    setSequence(1);
    savePending(gameIdToReset, []);
    saveSeq(gameIdToReset, 1);
    setSubmitStatus("idle");
    setSubmitMessage("Ready to save final stats to the dashboard.");
  }

  function resetFromPostGame() {
    const edits = applyPostGameEdits();
    const baseId = edits.gameId || generateGameId(edits.opponent, edits.date);
    const freshId = `${baseId}-reset-${Date.now().toString().slice(-4)}`;
    persistData({
      ...appData,
      gameSetup: {
        ...appData.gameSetup,
        gameId: freshId,
        opponent: edits.opponent,
        statsGameId: undefined,
      },
    });
    resetGameStateFor(freshId);
    persistPhase("pre-game");
  }

  function discardFromPostGame() {
    const ok = window.confirm("Discard this finished game? This clears tracked events and returns to pre-game setup.");
    if (!ok) return;
    const edits = applyPostGameEdits();
    const freshId = generateGameId(edits.opponent, new Date().toISOString().slice(0, 10));
    persistData({
      ...appData,
      gameSetup: {
        ...appData.gameSetup,
        gameId: freshId,
        opponent: "",
        statsGameId: undefined,
      },
    });
    setGameDate(new Date().toISOString().slice(0, 10));
    resetGameStateFor(freshId);
    persistPhase("pre-game");
  }

  // Auto-save every 3 minutes — interval reads from ref so no deps needed
  useEffect(() => {
    const id = setInterval(() => autoSaveCtx.current.run(), 3 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ---- Event builder ----
  function base(seq: number) {
    return {
      id: uid(),
      gameId,
      sequence: seq,
      timestampIso: new Date().toISOString(),
      period: period as string,
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
      teamId: resolveTeamId(modal.teamId),
      type: "shot_attempt",
      playerId,
      made: modal.made,
      points: modal.points,
      zone: modal.points === 3 ? "above_break_three" : "paint",
    } as GameEvent);
    closeModal();
  }

  function confirmFreeThrow(playerId: string) {
    if (!modal || modal.kind !== "freeThrow") return;
    void postEvent({
      ...base(sequence),
      teamId: resolveTeamId(modal.teamId),
      type: "free_throw_attempt",
      playerId,
      made: modal.made,
      attemptNumber: 1,
      totalAttempts: 1,
    } as GameEvent);
    closeModal();
  }

  function confirmStat(playerId: string) {
    if (!modal || modal.kind !== "stat") return;
    const b = base(sequence);
    const { stat } = modal;
    const teamId = resolveTeamId(modal.teamId);
    let event: GameEvent | null = null;
    if (stat === "def_reb")  event = { ...b, teamId, type: "rebound",  playerId, offensive: false };
    if (stat === "off_reb")  event = { ...b, teamId, type: "rebound",  playerId, offensive: true  };
    if (stat === "foul")     event = { ...b, teamId, type: "foul",     playerId, foulType: "personal" };
    if (stat === "turnover") event = { ...b, teamId, type: "turnover", playerId, turnoverType: "bad_pass" };
    if (stat === "steal")    event = { ...b, teamId, type: "steal",    playerId };
    if (stat === "block")    event = { ...b, teamId, type: "block",    playerId };
    if (stat === "assist")   { setModal({ kind: "assist2", teamId: modal.teamId, assistPlayerId: playerId }); return; }
    if (event) void postEvent(event as GameEvent);
    closeModal();
  }

  function confirmAssistScorer(scorerPlayerId: string) {
    if (!modal || modal.kind !== "assist2") return;
    void postEvent({
      ...base(sequence),
      teamId: resolveTeamId(modal.teamId),
      type: "assist",
      playerId: modal.assistPlayerId,
      scorerPlayerId,
    });
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
      teamId: resolveTeamId(modal.teamId),
      type: "substitution",
      playerOutId: modal.playerOutId,
      playerInId,
    });
    closeModal();
  }

  // ---- Modal render ----
  function renderModal() {
    if (!modal) return null;
    const teamPlayers = (side: TeamSide) => side === "home" ? homePlayers : awayPlayers;
    const tLabel = (side: TeamSide) => side === "home" ? homeTeamName : awayTeamName;

    if (modal.kind === "shot" || modal.kind === "freeThrow") {
      const players = teamPlayers(modal.teamId);
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal.kind === "shot" ? `${modal.points}pt` : "FT"} — {tLabel(modal.teamId)}</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="made-miss-row">
              <button className={`toggle-btn ${modal.made ? "t-teal" : ""}`} onClick={() => setModal({ ...modal, made: true })}>Made</button>
              <button className={`toggle-btn ${!modal.made ? "t-red" : ""}`} onClick={() => setModal({ ...modal, made: false })}>Miss</button>
            </div>
            <div className="player-list">
              {players.length === 0 && <p className="no-players">No players — set up roster in Settings ☰</p>}
              {players.map(p => (
                <button key={p.id} className="player-row" onClick={() => (modal.kind === "shot" ? confirmShot(p.id) : confirmFreeThrow(p.id))}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                  {p.position && <span className="ppos">{p.position}</span>}
                  {pTotals[p.id]?.fouls ? (
                    <span className={`pfoul${pTotals[p.id].fouls >= 5 ? " pfoul-out" : pTotals[p.id].fouls >= 4 ? " pfoul-warn" : ""}`}>
                      {pTotals[p.id].fouls}f{pTotals[p.id].fouls >= 5 ? " OUT" : ""}
                    </span>
                  ) : null}
                  {pTotals[p.id] ? <span className="ppts">{pTotals[p.id].points} pts</span> : null}
                </button>
              ))}
              <button className="player-row team-row" onClick={() => (modal.kind === "shot" ? confirmShot(`${modal.teamId}-team`) : confirmFreeThrow(`${modal.teamId}-team`))}>Team (no player)</button>
            </div>
          </div>
        </div>
      );
    }

    if (modal.kind === "stat") {
      const statLabels: Record<string, string> = {
        def_reb: "Def Rebound", off_reb: "Off Rebound", turnover: "Turnover",
        steal: "Steal", assist: "Assist — pick passer", block: "Block", foul: "Foul",
      };
      const trackedSide = vcSideSetup;
      const opponentSide: TeamSide = vcSideSetup === "home" ? "away" : "home";
      const trackedPlayers = teamPlayers(trackedSide);
      const isTrackedSelection = modal.teamId === trackedSide;
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-title">{statLabels[modal.stat]}</span>
                <div className="modal-team-toggle">
                  <button className={isTrackedSelection ? "t-teal" : ""} onClick={() => setModal({ ...modal, teamId: trackedSide })}>{vcSideSetup === "home" ? homeTeamName : awayTeamName}</button>
                  <button className={!isTrackedSelection ? "t-red" : ""} onClick={() => setModal({ ...modal, teamId: opponentSide })}>{vcSideSetup === "home" ? awayTeamName : homeTeamName} team</button>
                </div>
              </div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="player-list">
              {isTrackedSelection ? (
                <>
                  {trackedPlayers.length === 0 && <p className="no-players">No players — set up roster in Settings ☰</p>}
                  {trackedPlayers.map(p => (
                    <button key={p.id} className="player-row" onClick={() => confirmStat(p.id)}>
                      <span className="pnum">#{p.number}</span>
                      <span className="pname">{p.name}</span>
                      {p.position && <span className="ppos">{p.position}</span>}
                      {pTotals[p.id]?.fouls ? (
                        <span className={`pfoul${pTotals[p.id].fouls >= 5 ? " pfoul-out" : pTotals[p.id].fouls >= 4 ? " pfoul-warn" : ""}`}>
                          {pTotals[p.id].fouls}f{pTotals[p.id].fouls >= 5 ? " OUT" : ""}
                        </span>
                      ) : null}
                      {pTotals[p.id]?.points ? <span className="ppts">{pTotals[p.id].points} pts</span> : null}
                    </button>
                  ))}
                </>
              ) : (
                <p className="no-players">Opponent tracked as team only.</p>
              )}
              <button className="player-row team-row" onClick={() => confirmStat(`${modal.teamId}-team`)}>
                {isTrackedSelection ? "Team (no player)" : "Opponent team"}
              </button>
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
              <span className="modal-title">Assist — pick scorer</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
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
              <span className="modal-title">Sub Out — {tLabel(modal.teamId)}</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
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
              <span className="modal-title">Sub In — {tLabel(modal.teamId)}</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
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
      onStartGame={async () => {
        const reset = await endAndResetGame();
        if (reset) {
          setView("game");
        }
      }}
    />;
  }

  // ================================================================
  //  GAME VIEW (3-column)
  // ================================================================

  // ---- PRE-GAME SCREEN ----
  if (gamePhase === "pre-game") {
    const canStart = !!appData.gameSetup.myTeamId && !!appData.gameSetup.opponent?.trim();
    const myTeamDisplay = myTeam?.name ?? null;
    return (
      <div className="pregame-screen">
        <div className="pregame-card">
          <div className="pregame-header">
            <span className="pregame-eyebrow">Operator Console</span>
            <h1 className="pregame-title">Ready to Track</h1>
          </div>

          <div className="pregame-matchup">
            <div className="pregame-team my-team">
              {myTeamDisplay ?? <span className="pregame-no-team">No team</span>}
            </div>
            <div className="pregame-vs">vs</div>
            <div className="pregame-team opp-team">
              <input
                className="pregame-opp-input"
                placeholder="Opponent name"
                value={appData.gameSetup.opponent ?? ""}
                onChange={e => persistData({ ...appData, gameSetup: { ...appData.gameSetup, opponent: e.target.value } })}
              />
            </div>
          </div>

          <div className="pregame-meta">
            <div className="pregame-meta-row">
              <span className="pregame-meta-label">Date</span>
              <input
                type="date"
                className="pregame-date-inp"
                value={gameDate}
                onChange={e => setGameDate(e.target.value)}
              />
            </div>
            <div className="pregame-meta-row">
              <span className="pregame-meta-label">Side</span>
              <div className="pregame-side-toggle">
                <button
                  className={`tt-btn${(appData.gameSetup.vcSide ?? "home") === "home" ? " tt-teal" : ""}`}
                  onClick={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, vcSide: "home" } })}>
                  Home
                </button>
                <button
                  className={`tt-btn${(appData.gameSetup.vcSide ?? "home") === "away" ? " tt-red" : ""}`}
                  onClick={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, vcSide: "away" } })}>
                  Away
                </button>
              </div>
            </div>
          </div>

          {!appData.gameSetup.myTeamId && (
            <p className="pregame-error">⚠ No team selected — go to Settings to choose your team.</p>
          )}
          {!appData.gameSetup.opponent?.trim() && appData.gameSetup.myTeamId && (
            <p className="pregame-error">⚠ Enter the opponent name above to continue.</p>
          )}

          <button
            className="pregame-start-btn"
            disabled={!canStart}
            onClick={async () => {
              const newId = generateGameId(appData.gameSetup.opponent ?? "", gameDate);
              await startGame(newId);
            }}>
            ▶ Start Game
          </button>

          <button
            className="pregame-settings-link"
            onClick={() => { setSettingsView("menu"); setView("settings"); }}>
            ⚙ Settings &amp; Roster
          </button>
        </div>
      </div>
    );
  }

  // ---- POST-GAME SCREEN ----
  if (gamePhase === "post-game") {
    const editedHomeScore = parseScoreInput(postGameHomeScoreInput, scores.home);
    const editedAwayScore = parseScoreInput(postGameAwayScoreInput, scores.away);
    const coachUrl = buildCoachViewUrl(gameId, appData.gameSetup.deviceId, {
      myTeamId: appData.gameSetup.myTeamId,
      myTeamName: myTeam?.name,
      opponentName: appData.gameSetup.opponent,
      vcSide: appData.gameSetup.vcSide,
    });
    return (
      <div className="postgame-screen">
        <div className="postgame-card">
          <div className="postgame-header">
            <span className="postgame-eyebrow">Game Over</span>
            <h1 className="postgame-title">Finalize game details</h1>
          </div>

          <div className="postgame-edit-grid">
            <label className="postgame-field">
              <span className="postgame-field-label">Game Name</span>
              <input
                className="postgame-input"
                value={postGameNameInput}
                onChange={e => setPostGameNameInput(e.target.value)}
                placeholder="Game name"
              />
            </label>
            <label className="postgame-field">
              <span className="postgame-field-label">Date</span>
              <input
                type="date"
                className="postgame-input"
                value={postGameDateInput}
                onChange={e => setPostGameDateInput(e.target.value)}
              />
            </label>
            <label className="postgame-field postgame-field-wide">
              <span className="postgame-field-label">Opponent</span>
              <input
                className="postgame-input"
                value={postGameOpponentInput}
                onChange={e => setPostGameOpponentInput(e.target.value)}
                placeholder="Opponent name"
              />
            </label>
          </div>

          <div className="postgame-score">
            <div className="postgame-score-team">
              <span className="postgame-score-name">{homeTeamName}</span>
              <input
                className="postgame-score-input"
                inputMode="numeric"
                value={postGameHomeScoreInput}
                onChange={e => setPostGameHomeScoreInput(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="postgame-score-sep">–</div>
            <div className="postgame-score-team">
              <span className="postgame-score-name">{awayTeamName}</span>
              <input
                className="postgame-score-input"
                inputMode="numeric"
                value={postGameAwayScoreInput}
                onChange={e => setPostGameAwayScoreInput(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
          </div>

          <button
            className="postgame-apply-btn"
            onClick={() => {
              applyPostGameEdits();
              setSubmitMessage("Updated game details.");
            }}>
            Save Name/Date/Score Changes
          </button>

          <div className={`submit-banner submit-banner-${submitStatus}`} role="status">
            {submitMessage}
          </div>

          <a
            className="coach-connect-btn"
            href={coachUrl}
            target="_blank"
            rel="noreferrer">
            📺 Open Coach Dashboard
          </a>

          <button
            className="postgame-retry-btn"
            onClick={() => {
              const edits = applyPostGameEdits();
              void submitToDashboard({
                opponent: edits.opponent,
                date: edits.date,
                homeScore: editedHomeScore,
                awayScore: editedAwayScore,
              });
            }}
            disabled={submitStatus === "pending"}>
            {submitStatus === "pending" ? "Saving…" : "↑ Re-save Stats"}
          </button>

          <button
            className="postgame-reset-btn"
            onClick={() => {
              const ok = window.confirm("Reset this game and start over with a fresh game id?");
              if (!ok) return;
              resetFromPostGame();
            }}>
            Reset This Game
          </button>

          <button className="postgame-discard-btn" onClick={discardFromPostGame}>
            Discard This Game
          </button>

          <button className="postgame-new-btn" onClick={handleNewGame}>
            ▶ Start New Game
          </button>
        </div>
      </div>
    );
  }

  const periodLabels = [
    "Q1",
    "Q2",
    "Q3",
    "Q4",
    ...Array.from({ length: overtimeCount }, (_, index) => `OT${index + 1}`),
  ];
  const liveCoachUrl = buildCoachViewUrl(gameId, appData.gameSetup.deviceId, {
    myTeamId: appData.gameSetup.myTeamId,
    myTeamName: myTeam?.name,
    opponentName: appData.gameSetup.opponent,
    vcSide: appData.gameSetup.vcSide,
  });

  return (
    <div className="game-layout">
      {renderModal()}
      {!online && (
        <div className="offline-badge">
          OFFLINE{pendingEvents.length > 0 ? ` · ${pendingEvents.length} unsaved` : ""}
        </div>
      )}
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
          <button className="circle teal" onClick={() => setModal({ kind: "freeThrow", teamId: "home", made: true })}>ft</button>
          <button className="circle red"  onClick={() => setModal({ kind: "freeThrow", teamId: "away", made: true })}>ft</button>
        </div>
      </div>

      {/* CENTER: Feed */}
      <div className="panel center-panel">
        <div className="scoreboard">
          {appData.gameSetup.deviceId && (
            <div className="score-device-id" title="Operator device identifier">
              Device ID: {appData.gameSetup.deviceId}
            </div>
          )}
          <div className="score-row">
            <span className="team-lbl teal-txt">{homeTeamName}</span>
            <span className="score teal-txt">{scores.home}</span>
          </div>
          <div className="score-row">
            <span className="team-lbl">{awayTeamName}</span>
            <span className="score">{scores.away}</span>
          </div>
        </div>

        {foulAlerts.length > 0 && (
          <div className="foul-alerts">
            {foulAlerts.map(p => (
              <div key={p.id} className={`foul-alert ${(pTotals[p.id]?.fouls ?? 0) >= 5 ? "foul-out-alert" : "foul-warn-alert"}`}>
                {(pTotals[p.id]?.fouls ?? 0) >= 5 ? "🚫" : "⚠️"} #{p.number} {p.name} — {(pTotals[p.id]?.fouls ?? 0) >= 5 ? "FOULED OUT" : "4 fouls"}
              </div>
            ))}
          </div>
        )}

        <div className="event-feed">
          {allEvents.length === 0 && <p className="empty-feed">No events yet</p>}
          {allEvents.map(({ event, pending }) => {
            const d = describeEvent(event, homeTeamName, awayTeamName, allPlayers, pTotals, homeTeamId, awayTeamId);
            return (
              <div key={event.id} className={`feed-item${pending ? " feed-pending" : ""}`}>
                <span className={`feed-main ac-${d.accent}`}>{d.main}</span>
                {d.detail && <span className="feed-detail">{d.detail}</span>}
              </div>
            );
          })}
        </div>

        <div className="period-row" style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", padding: "0.55rem 1rem" }}>
          {periodLabels.map((lbl) => {
            const isOt = isOvertimePeriod(lbl);
            return (
              <div key={lbl} className="period-chip" style={{ display: "flex", gap: "0.2rem", flex: 1, minWidth: "72px" }}>
                <button
                  className={`period-btn${period === lbl ? " period-on" : ""}`}
                  style={{
                    flex: 1,
                    minHeight: "44px",
                    borderRadius: "8px",
                    border: period === lbl ? "1px solid #2dd4bf" : "1px solid rgba(255,255,255,0.15)",
                    background: period === lbl ? "rgba(45,212,191,0.16)" : "rgba(255,255,255,0.06)",
                    color: period === lbl ? "#2dd4bf" : "rgba(232,234,240,0.78)",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    if (lbl === period) return;
                    // Fire period_transition for the new period
                    const endSeq = sequence;
                    void postEvent({
                      ...base(endSeq),
                      teamId: homeTeamId,
                      type: "period_transition",
                      newPeriod: lbl,
                    });
                    setPeriod(lbl);
                    setClockInput(getPeriodDefaultClock(lbl));
                  }}
                >{lbl}</button>
                {isOt && (
                  <button
                    className="period-delete-btn"
                    style={{
                      minWidth: "30px",
                      minHeight: "44px",
                      borderRadius: "8px",
                      border: "1px solid rgba(248,113,113,0.5)",
                      background: "rgba(248,113,113,0.14)",
                      color: "#f87171",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    title={`Delete ${lbl}`}
                    onClick={() => {
                      const ok = window.confirm(`Delete ${lbl}? This removes all events in that overtime period.`);
                      if (!ok) return;
                      void deleteOvertimePeriod(lbl);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button
            className="period-add-btn"
            style={{
              minWidth: "74px",
              minHeight: "44px",
              borderRadius: "8px",
              border: "1px solid rgba(45,212,191,0.55)",
              background: "rgba(45,212,191,0.14)",
              color: "#2dd4bf",
              fontSize: "0.82rem",
              fontWeight: 800,
              letterSpacing: "0.04em",
              padding: "0.35rem 0.6rem",
              cursor: "pointer",
            }}
            onClick={addOvertimePeriod}
          >
            + OT
          </button>
        </div>
        <div className="clock-row">
          <input className="clock-inp" value={clockInput} onChange={e => setClockInput(e.target.value)} placeholder="8:00" />
        </div>
        <div className="date-row">
          <input className="date-inp" type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} title="Game date" />
        </div>
      </div>

      {/* RIGHT: Stats */}
      <div className="panel right-panel">
        <div className="stat-grid">
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "def_reb", teamId: vcSideSetup })}>def<br/><span className="sub-lbl">reb</span></button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "off_reb", teamId: vcSideSetup })}>off<br/><span className="sub-lbl">reb</span></button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "turnover", teamId: vcSideSetup })}>to</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "steal",   teamId: vcSideSetup })}>stl</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "assist",  teamId: vcSideSetup })}>asst</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "block",   teamId: vcSideSetup })}>blk</button>
          <button className="circle red-out" onClick={() => setModal({ kind: "sub1", teamId: vcSideSetup })}>sub</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "foul",   teamId: vcSideSetup })}>foul</button>
        </div>
      </div>

      <div className="live-bottom-nav" role="navigation" aria-label="Live game actions">
        <button className="live-nav-btn" onClick={() => { setSettingsView("menu"); setView("settings"); }} title="Settings">☰ Settings</button>
        <button className="live-nav-btn" onClick={() => void undoLast()} title="Undo last event">↩ Undo</button>
        <button
          className="live-nav-btn"
          title="Export PDF"
          onClick={() => void exportGamePDF(gameId, gameDate, homeTeam, awayTeam, allEventObjs)}>
          ⬇ PDF
        </button>
        <a className="live-nav-btn live-nav-link" href={liveCoachUrl} target="_blank" rel="noreferrer" title={`Open Coach Dashboard · ${gameId}`}>
          Coach
        </a>
        <button className="live-nav-btn live-nav-btn-end" onClick={() => void endGame()}>
          🛑 End Game
        </button>
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
  onStartGame: () => void | Promise<void>;
}

const POSITIONS = ["PG", "SG", "SF", "PF", "C", ""];

function SettingsScreen({ appData, settingsView, editingTeamId, onPersist, onNav, onEditTeam, onBack, onStartGame }: SettingsScreenProps) {
  // ---- Game setup local state ----
  const [gsGameId, setGsGameId] = useState(appData.gameSetup.gameId);
  const [gsDeviceId, setGsDeviceId] = useState(appData.gameSetup.deviceId || getDefaultDeviceId());
  const [gsMyTeamId, setGsMyTeamId] = useState(appData.gameSetup.myTeamId);
  const [gsApiUrl, setGsApiUrl] = useState(appData.gameSetup.apiUrl ?? DEFAULT_API);
  const [gsApiKey, setGsApiKey] = useState(appData.gameSetup.apiKey ?? "");
  const [gsOpponent, setGsOpponent] = useState(appData.gameSetup.opponent ?? "");
  const [gsVcSide, setGsVcSide] = useState<"home" | "away">(appData.gameSetup.vcSide ?? "home");
  const [gsDashboardUrl, setGsDashboardUrl] = useState(appData.gameSetup.dashboardUrl ?? "http://localhost:5000");
  const gsMyTeam = appData.teams.find(t => t.id === gsMyTeamId);
  const gsMyTeamName = gsMyTeam?.name ?? "Your Team";
  const gsOpponentName = gsOpponent.trim() || "Opponent";
  const gsHomeSideLabel = gsVcSide === "home"
    ? `${gsMyTeamName} (home)`
    : `${gsOpponentName} (home)`;
  const gsAwaySideLabel = gsVcSide === "away"
    ? `${gsMyTeamName} (away)`
    : `${gsOpponentName} (away)`;

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
  const [pHt, setPHt] = useState("");
  const [pGrade, setPGrade] = useState("");
  // editing existing player
  const [editPlayerId, setEditPlayerId] = useState<string | null>(null);
  const [epNum, setEpNum] = useState("");
  const [epName, setEpName] = useState("");
  const [epPos, setEpPos] = useState("");
  const [epHt, setEpHt] = useState("");
  const [epGrade, setEpGrade] = useState("");

  // sync local state when editingTeam changes
  useEffect(() => {
    setEtName(editingTeam?.name ?? "");
    setEtAbbr(editingTeam?.abbreviation ?? "");
    setEditPlayerId(null);
  }, [editingTeamId]);

  function syncRosterDeletionToBackend(teams: Team[]) {
    // Sync roster changes (including deletions) to the stats dashboard
    const dashboardUrl = appData.gameSetup.dashboardUrl?.trim() || "http://localhost:5000";
    const myTeamId = appData.gameSetup.myTeamId;
    const myTeam = teams.find(t => t.id === myTeamId);
    
    if (!myTeam) return; // Only sync if we have a tracked team
    
    const rosterPayload = myTeam.players.map(p => ({
      number: parseInt(p.number, 10) || 0,
      name: p.name,
      position: p.position || undefined,
      height: p.height || undefined,
      grade: p.grade || undefined,
    }));
    
    fetch(`${dashboardUrl}/api/roster-sync`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...apiKeyHeader(appData.gameSetup) },
      body: JSON.stringify({ 
        teams: [{ 
          id: myTeam.id, 
          name: myTeam.name, 
          abbreviation: myTeam.abbreviation, 
          players: rosterPayload 
        }], 
        preferredTeamId: myTeamId 
      }),
    }).catch(() => {
      // Silently fail if dashboard is unavailable
    });
  }

  async function syncRosterFromBackend() {
    // Pull roster deletions from stats dashboard to detect when other apps deleted players
    const dashboardUrl = appData.gameSetup.dashboardUrl?.trim() || "http://localhost:5000";
    const myTeamId = appData.gameSetup.myTeamId;
    if (!myTeamId) return;
    
    try {
      const response = await fetch(`${dashboardUrl}/api/players`, {
        headers: apiKeyHeader(appData.gameSetup),
      });
      if (!response.ok) return;
      
      const players = (await response.json()) as Array<{ name: string; number?: number; position?: string; height?: string; grade?: string }>;
      
      // Get the tracked team and sync its players with backend roster  
      const updatedTeams = appData.teams.map(team => {
        if (team.id !== myTeamId) return team;
        
        // Keep only players that exist in backend roster
        const backendPlayerNames = new Set(players.map(p => p.name));
        const filteredPlayers = team.players.filter(p => backendPlayerNames.has(p.name));
        
        return { ...team, players: filteredPlayers };
      });
      
      if (JSON.stringify(updatedTeams) !== JSON.stringify(appData.teams)) {
        onPersist({ ...appData, teams: updatedTeams });
      }
    } catch {
      // Silently fail if dashboard is unavailable
    }
  }

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
    const player: Player = { id: uid(), number: pNum.trim(), name: pName.trim(), position: pPos, height: pHt.trim() || undefined, grade: pGrade.trim() || undefined };
    onPersist({ ...appData, teams: appData.teams.map(t => t.id === editingTeam.id ? { ...t, players: [...t.players, player] } : t) });
    setPNum(""); setPName(""); setPPos(""); setPHt(""); setPGrade("");
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
    setEpHt(p.height ?? "");
    setEpGrade(p.grade ?? "");
  }

  function saveEditPlayer() {
    if (!editingTeam || !editPlayerId || !epNum.trim() || !epName.trim()) return;
    onPersist({ ...appData, teams: appData.teams.map(t => t.id === editingTeam.id ? { ...t, players: t.players.map(p => p.id === editPlayerId ? { ...p, number: epNum.trim(), name: epName.trim(), position: epPos, height: epHt.trim() || undefined, grade: epGrade.trim() || undefined } : p) } : t) });
    setEditPlayerId(null);
  }

  // ---- Game setup ----
  function saveGameSetup() {
    onPersist({
      ...appData,
      gameSetup: {
        gameId: gsGameId.trim() || "game-1",
        deviceId: gsDeviceId.trim() || appData.gameSetup.deviceId || "device-1",
        myTeamId: gsMyTeamId,
        apiUrl: gsApiUrl.trim() || DEFAULT_API,
        apiKey: gsApiKey.trim() || undefined,
        opponent: gsOpponent.trim(),
        vcSide: gsVcSide,
        dashboardUrl: gsDashboardUrl.trim() || "http://localhost:5000",
        statsGameId: appData.gameSetup.statsGameId,
      },
    });
  }

  // ================================================================
  //  RENDER: Teams list
  // ================================================================
  
  // Sync roster from backend when viewing teams to detect deletions from other apps
  useEffect(() => {
    if (settingsView === "teams" || settingsView === "team-edit") {
      void syncRosterFromBackend();
    }
  }, [settingsView]);
  
  if (settingsView === "teams") {
    return (
      <div className="settings-page">
        <header className="settings-header">
          <button className="back-btn" onClick={() => onNav("menu")}>← Back</button>
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
                <button className="rm-btn" onClick={() => deleteTeam(team.id)}>✕</button>
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
          <button className="back-btn" onClick={() => onNav("teams")}>← Teams</button>
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
            <input className="ht-inp" placeholder='Ht' value={pHt} onChange={e => setPHt(e.target.value)} style={{ width: 52 }} />
            <input className="grade-inp" placeholder='Gr' value={pGrade} onChange={e => setPGrade(e.target.value)} style={{ width: 36 }} />
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
                  <input className="ht-inp" placeholder='Ht' value={epHt} onChange={e => setEpHt(e.target.value)} style={{ width: 52 }} />
                  <input className="grade-inp" placeholder='Gr' value={epGrade} onChange={e => setEpGrade(e.target.value)} style={{ width: 36 }} />
                  <button className="add-btn" onClick={saveEditPlayer}>Save</button>
                  <button className="rm-btn" onClick={() => setEditPlayerId(null)}>✕</button>
                </div>
              )
              : (
                <div key={p.id} className="roster-row">
                  <div className="roster-info">
                    <span className="r-num">#{p.number}</span>
                    <span className="r-name">{p.name}</span>
                    {p.position && <span className="r-pos">{p.position}</span>}
                    {p.height && <span className="r-ht">{p.height}</span>}
                    {p.grade && <span className="r-grade">Gr.{p.grade}</span>}
                  </div>
                  <div className="roster-actions">
                    <button className="edit-btn" onClick={() => startEditPlayer(p)}>Edit</button>
                    <button className="rm-btn" onClick={() => removePlayer(p.id)}>✕</button>
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
    const setupErrors: string[] = [];
    if (!gsMyTeamId) setupErrors.push("Select your team");
    if (!gsOpponent.trim()) setupErrors.push("Enter the opponent name");
    return (
      <div className="settings-page">
        <header className="settings-header">
          <button className="back-btn" onClick={() => onNav("menu")}>← Back</button>
          <h2>Game Setup</h2>
          <button className="save-btn" onClick={() => { saveGameSetup(); onNav("menu"); }}>Save</button>
        </header>

        <section className="settings-section">
          <h3>Game ID</h3>
          <input value={gsGameId} onChange={e => setGsGameId(e.target.value)} placeholder="game-1" />
        </section>

        <section className="settings-section">
          <h3>Device ID</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>Coach dashboard follows this device and only shows live when it is online.</p>
          <input value={gsDeviceId} onChange={e => setGsDeviceId(e.target.value)} placeholder="device-1" />
        </section>

        <section className="settings-section">
          <h3>Your Team</h3>
          {appData.teams.length === 0 && <p className="dim-text">No teams yet — create one in Teams first.</p>}
          <div className="team-picker">
            {appData.teams.map(t => (
              <button key={t.id}
                className={`team-pick-btn${gsMyTeamId === t.id ? " pick-active-teal" : ""}`}
                onClick={() => setGsMyTeamId(t.id)}>
                <span className="tp-abbr">{t.abbreviation}</span>
                <span className="tp-name">{t.name}</span>
                <span className="tp-count">{t.players.length}p</span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>Opponent Name</h3>
          <input
            placeholder="e.g. Knappa"
            value={gsOpponent}
            onChange={e => setGsOpponent(e.target.value)}
          />
        </section>

        <section className="settings-section">
          <h3>Your Side</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>Are you playing home or away?</p>
          <div className="team-toggle">
            <button className={`tt-btn${gsVcSide === "home" ? " tt-teal" : ""}`} onClick={() => setGsVcSide("home")}>{gsHomeSideLabel}</button>
            <button className={`tt-btn${gsVcSide === "away" ? " tt-red" : ""}`}  onClick={() => setGsVcSide("away")}>{gsAwaySideLabel}</button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Realtime API URL</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>URL of the Node API server — use laptop's local IP on game day (e.g. http://192.168.1.5:4000)</p>
          <input
            placeholder={DEFAULT_API}
            value={gsApiUrl}
            onChange={e => setGsApiUrl(e.target.value)}
          />
        </section>

        <section className="settings-section">
          <h3>API Key</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>Optional shared secret (set the API key env var on the server). Leave blank in development.</p>
          <input
            type="password"
            placeholder="Leave blank to disable auth"
            value={gsApiKey}
            onChange={e => setGsApiKey(e.target.value)}
          />
        </section>

        <section className="settings-section">
          <h3>Stats Dashboard URL</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>URL of the Stats Flask app (for sending game data)</p>
          <input
            placeholder="http://localhost:5000"
            value={gsDashboardUrl}
            onChange={e => setGsDashboardUrl(e.target.value)}
          />
        </section>

        <section className="settings-section">
          {setupErrors.length > 0 && (
            <ul className="setup-errors">
              {setupErrors.map(err => <li key={err}>{err}</li>)}
            </ul>
          )}
          <button
            className="start-btn"
            disabled={setupErrors.length > 0}
            onClick={() => { if (setupErrors.length === 0) { saveGameSetup(); void onStartGame(); } }}>
            Start / Reset Game
          </button>
        </section>

        {/* QR code — scan on another device to auto-fill the same config */}
        <section className="settings-section">
          <h3>Share Config</h3>
          <p className="dim-text" style={{ marginBottom: 12 }}>
            Scan on another device to copy these settings.
          </p>
          {(() => {
            const configUrl = new URL(window.location.href);
            const params = configUrl.searchParams;
            params.set("apiUrl", gsApiUrl.trim() || DEFAULT_API);
            if (gsApiKey.trim()) params.set("apiKey", gsApiKey.trim());
            params.set("dashboardUrl", gsDashboardUrl.trim() || "http://localhost:5000");
            params.set("gameId", gsGameId.trim() || "game-1");
            params.set("deviceId", gsDeviceId.trim() || "device-1");
            params.set("opponent", gsOpponent.trim());
            params.set("vcSide", gsVcSide);
            return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <QRCodeSVG value={configUrl.toString()} size={200} level="M" />
                <small className="dim-text" style={{ wordBreak: "break-all", textAlign: "center" }}>
                  {configUrl.toString()}
                </small>
              </div>
            );
          })()}
        </section>
      </div>
    );
  }

  // ================================================================
  //  RENDER: Settings menu (default)
  // ================================================================
  const myTeamForMenu = appData.teams.find(t => t.id === appData.gameSetup.myTeamId);
  const vcSideForMenu = appData.gameSetup.vcSide ?? "home";
  const menuSideLabel = vcSideForMenu === "home" ? "home" : "away";

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button className="back-btn" onClick={onBack}>← Game</button>
        <h2>Settings</h2>
        <div style={{ width: 64 }} />
      </header>

      <section className="settings-section">
        <h3>Game</h3>
        <div className="menu-card" onClick={() => onNav("game-setup")}>
          <div className="menu-card-info">
            <span className="menu-card-title">Game Setup</span>
            <span className="menu-card-sub">
              {myTeamForMenu
                ? `${myTeamForMenu.name} (${menuSideLabel}) vs ${appData.gameSetup.opponent || "TBD"} • ${appData.gameSetup.gameId}`
                : "No team selected"}
            </span>
          </div>
          <span className="menu-chev">›</span>
        </div>
      </section>

      <section className="settings-section">
        <h3>Roster Management</h3>
        <div className="menu-card" onClick={() => onNav("teams")}>
          <div className="menu-card-info">
            <span className="menu-card-title">Teams &amp; Rosters</span>
            <span className="menu-card-sub">{appData.teams.length} team{appData.teams.length !== 1 ? "s" : ""} • {appData.teams.reduce((n, t) => n + t.players.length, 0)} players total</span>
          </div>
          <span className="menu-chev">›</span>
        </div>
      </section>

      {appData.teams.length > 0 && (
        <section className="settings-section">
          <h3>Quick Roster Access</h3>
          {appData.teams.map(team => (
            <div key={team.id} className="menu-card" onClick={() => { onEditTeam(team.id); onNav("team-edit"); }}>
              <div className="menu-card-info">
                <span className="menu-card-title">{team.abbreviation} — {team.name}</span>
                <span className="menu-card-sub">{team.players.length} player{team.players.length !== 1 ? "s" : ""}</span>
              </div>
              <span className="menu-chev">›</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
