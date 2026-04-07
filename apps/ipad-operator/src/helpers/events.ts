import type { GameEvent } from "@bta/shared-schema";
import type { Player, RunningTotals, TeamSide } from "../types.js";
import { playerDisplayName } from "./players.js";

export function computePlayerTotals(events: GameEvent[]): Record<string, RunningTotals> {
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

export function computeScores(events: GameEvent[], homeTeamId: string, awayTeamId: string) {
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

export function computePlusMinus(events: GameEvent[], vcTeamId: string): Record<string, number> {
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

export function computeCurrentLineup(events: GameEvent[], teamId: string, startingLineup: string[], allTeamPlayers: Player[]): { onCourt: Player[]; bench: Player[] } {
  const onCourt = new Set<string>(startingLineup);
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  for (const e of sorted) {
    if (e.type === "substitution" && e.teamId === teamId) {
      onCourt.delete(e.playerOutId);
      onCourt.add(e.playerInId);
    }
  }

  const onCourtPlayers = allTeamPlayers.filter(p => onCourt.has(p.id));
  const benchPlayers = allTeamPlayers.filter(p => !onCourt.has(p.id));

  return { onCourt: onCourtPlayers, bench: benchPlayers };
}

export function describeEvent(
  event: GameEvent,
  homeTeamName: string,
  awayTeamName: string,
  allPlayers: Player[],
  pTotals: Record<string, RunningTotals>,
  homeTeamId = "home",
  awayTeamId = "away"
) {
  const tn = (id: string) => id === homeTeamId ? homeTeamName : id === awayTeamId ? awayTeamName : id;
  const pn = (id: string) => {
    if (id === "home-team" || id === "team-home" || id === `${homeTeamId}-team`) return homeTeamName;
    if (id === "away-team" || id === "team-away" || id === `${awayTeamId}-team`) return awayTeamName;
    return playerDisplayName(id, allPlayers);
  };
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
      return {
        main: `${pn(event.playerOutId)} -> ${pn(event.playerInId)}`,
        detail: tn(event.teamId),
        accent: "white",
      };
    case "possession_start":
      return { main: "possession", detail: tn(event.possessedByTeamId), accent: "white" };
    case "timeout":
      return {
        main: event.timeoutType === "full" ? "timeout 60" : "timeout 30",
        detail: tn(event.teamId),
        accent: "white",
      };
    case "period_transition":
      return { main: `${event.newPeriod} start`, detail: "", accent: "teal" };
    default:
      return { main: (event as GameEvent).type, detail: "", accent: "white" };
  }
}

export function getEventSectionLabel(event: GameEvent): string {
  switch (event.type) {
    case "shot_attempt": return "Shot";
    case "free_throw_attempt": return "FT";
    case "foul": return "Foul";
    case "turnover": return "TO";
    case "rebound": return "Reb";
    case "assist": return "Ast";
    case "steal": return "Stl";
    case "block": return "Blk";
    case "substitution": return "Sub";
    case "possession_start": return "Poss";
    case "timeout": return "Timeout";
    case "period_transition": return "Period";
    default: return "Event";
  }
}

export function getEventTeamBucket(
  event: GameEvent,
  homeTeamId: string,
  awayTeamId: string,
): "home" | "away" | "neutral" {
  if (event.type === "period_transition") return "neutral";
  const eventTeamId = event.type === "possession_start" ? event.possessedByTeamId : event.teamId;
  if (eventTeamId === homeTeamId) return "home";
  if (eventTeamId === awayTeamId) return "away";
  return "neutral";
}

export function getEventTeamSide(eventTeamId: string, homeTeamId: string, awayTeamId: string): TeamSide | null {
  if (eventTeamId === homeTeamId) return "home";
  if (eventTeamId === awayTeamId) return "away";
  return null;
}

export function upsertSortedEvent(events: GameEvent[], nextEvent: GameEvent): GameEvent[] {
  return [...events.filter((event) => event.id !== nextEvent.id), nextEvent]
    .sort((left, right) => left.sequence - right.sequence);
}

export function removeEventById(events: GameEvent[], eventId: string): GameEvent[] {
  return events.filter((event) => event.id !== eventId);
}
