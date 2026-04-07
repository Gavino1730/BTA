import type { GameEvent } from "@bta/shared-schema";
import type { DashboardPlayerStat, Player, RunningTotals } from "../types.js";
import { computePlusMinus } from "./events.js";

export function playerDisplayName(id: string, allPlayers: Player[]): string {
  const p = allPlayers.find(x => x.id === id);
  return p ? `#${p.number} ${p.name}` : id;
}

export function playerNameFromId(playerId: string | undefined, players: Player[]): string {
  if (!playerId) return "Team";
  const match = players.find((p) => p.id === playerId);
  return match?.name ?? playerId;
}

export function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0][0]} ${parts.slice(1).join(" ")}`;
}

export function formatPct(made: number, attempts: number): string {
  if (attempts <= 0) return "0%";
  return `${Math.round((made / attempts) * 100)}%`;
}

export function computeDashboardPlayerStats(events: GameEvent[], players: Player[], vcTeamId: string): DashboardPlayerStat[] {
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

export function computeTeamStats(events: GameEvent[], teamId: string) {
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
