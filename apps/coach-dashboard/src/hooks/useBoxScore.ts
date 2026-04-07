import { useMemo } from "react";
import type { GameEvent } from "@bta/shared-schema";
import {
  type BoxScoreFilter,
  type BoxScoreTeamTotals,
  type BoxScorePlayerLine,
  emptyBoxScoreTotals,
} from "../helpers/index.js";

export function useBoxScore(
  events: GameEvent[],
  boxScoreFilter: BoxScoreFilter,
  canonicalTeamId: (id: string) => string,
  teams: string[],
) {
  const boxScorePeriods = useMemo(() => {
    const periods = [...new Set(events.map((event) => event.period))];
    const periodRank = (period: string): number => {
      if (period === "Q1") return 1;
      if (period === "Q2") return 2;
      if (period === "Q3") return 3;
      if (period === "Q4") return 4;
      const otMatch = /^OT(\d+)$/.exec(period);
      if (otMatch) return 4 + Number(otMatch[1]);
      return 99;
    };
    return periods.sort((left, right) => periodRank(left) - periodRank(right));
  }, [events]);

  const filteredBoxScoreEvents = useMemo(() => {
    if (boxScoreFilter.length === 0) return events;
    const filterSet = new Set(boxScoreFilter);
    return events.filter((event) => filterSet.has(event.period));
  }, [boxScoreFilter, events]);

  const boxScoreByTeam = useMemo(() => {
    const byTeam: Record<string, { totals: BoxScoreTeamTotals; players: Record<string, BoxScorePlayerLine> }> = {};

    function ensureTeam(teamId: string) {
      byTeam[teamId] ??= { totals: emptyBoxScoreTotals(), players: {} };
      return byTeam[teamId];
    }

    function ensurePlayer(teamId: string, playerId: string) {
      const team = ensureTeam(teamId);
      team.players[playerId] ??= {
        ...emptyBoxScoreTotals(),
        playerId,
        teamId,
      };
      return team.players[playerId];
    }

    for (const event of filteredBoxScoreEvents) {
      const teamId = canonicalTeamId(event.teamId);
      const team = ensureTeam(teamId);

      switch (event.type) {
        case "shot_attempt": {
          team.totals.fgAttempts += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.fgAttempts += 1;
          if (event.made) {
            team.totals.fgMade += 1;
            team.totals.points += event.points;
            player.fgMade += 1;
            player.points += event.points;
          }
          break;
        }
        case "free_throw_attempt": {
          team.totals.ftAttempts += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.ftAttempts += 1;
          if (event.made) {
            team.totals.ftMade += 1;
            team.totals.points += 1;
            player.ftMade += 1;
            player.points += 1;
          }
          break;
        }
        case "rebound": {
          if (event.offensive) {
            team.totals.reboundsOff += 1;
          } else {
            team.totals.reboundsDef += 1;
          }
          const player = ensurePlayer(teamId, event.playerId);
          if (event.offensive) {
            player.reboundsOff += 1;
          } else {
            player.reboundsDef += 1;
          }
          break;
        }
        case "assist": {
          team.totals.assists += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.assists += 1;
          break;
        }
        case "steal": {
          team.totals.steals += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.steals += 1;
          break;
        }
        case "block": {
          team.totals.blocks += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.blocks += 1;
          break;
        }
        case "turnover": {
          team.totals.turnovers += 1;
          if (event.playerId) {
            const player = ensurePlayer(teamId, event.playerId);
            player.turnovers += 1;
          }
          break;
        }
        case "foul": {
          team.totals.fouls += 1;
          const player = ensurePlayer(teamId, event.playerId);
          player.fouls += 1;
          break;
        }
      }
    }

    for (const teamId of teams) {
      ensureTeam(teamId);
    }

    return byTeam;
  }, [canonicalTeamId, filteredBoxScoreEvents, teams]);

  return { boxScorePeriods, filteredBoxScoreEvents, boxScoreByTeam };
}
