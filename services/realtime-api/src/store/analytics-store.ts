import type { GameEvent } from "@bta/shared-schema";
import type {
  GameEditOverride,
  LiveContextPayload,
  RosterTeam,
  SeasonGameSummary,
  SeasonPlayerSummary,
  SeasonTeamStats,
  TenantScope,
} from "./core-store.js";

interface AnalyticsSessionLike {
  schoolId: string;
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  submitted: boolean;
  eventsById: Map<string, GameEvent>;
  state: {
    gameId: string;
    scoreByTeam: Record<string, number>;
    teamStats: Record<string, {
      shooting?: {
        fgMade?: number;
        fgAttempts?: number;
        ftMade?: number;
        ftAttempts?: number;
      };
      reboundsOff?: number;
      reboundsDef?: number;
      turnovers?: number;
      fouls?: number;
    }>;
    playerStatsByTeam: Record<string, Record<string, {
      playerId: string;
      points: number;
      fgMade: number;
      fgAttempts: number;
      ftMade: number;
      ftAttempts: number;
      reboundsOff: number;
      reboundsDef: number;
      assists: number;
      turnovers: number;
      steals: number;
      blocks: number;
      fouls: number;
    }>>;
  };
}

interface AnalyticsStoreDependencies {
  resolveSchoolId: (scope?: TenantScope) => string;
  getRosterTeamsForSchool: (schoolId: string) => RosterTeam[];
  getSessionsForSchool: (schoolId: string) => AnalyticsSessionLike[];
  gameOverridesBySchool: Map<string, Map<string, GameEditOverride>>;
  resolveTeamLabelFromRoster: (teamId: string, schoolId: string) => string;
  listOrderedEvents: (session: AnalyticsSessionLike) => GameEvent[];
}

function roundStat(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

export function createAnalyticsStore(deps: AnalyticsStoreDependencies) {
  const buildSchoolAnalytics = (scope?: TenantScope): {
    seasonTeamStats: SeasonTeamStats;
    games: SeasonGameSummary[];
    players: SeasonPlayerSummary[];
    liveContext: LiveContextPayload;
  } => {
    const schoolId = deps.resolveSchoolId(scope);
    const rosterTeams = deps.getRosterTeamsForSchool(schoolId);
    const rosterTeamIds = new Set(rosterTeams.map((team) => team.id));
    const playerMap = new Map<string, SeasonPlayerSummary>();

    for (const team of rosterTeams) {
      for (const player of team.players) {
        playerMap.set(player.id, {
          playerId: player.id,
          name: player.name,
          full_name: player.name,
          first_name: player.name.split(" ")[0] ?? player.name,
          number: player.number,
          position: player.position,
          height: player.height,
          grade: player.grade,
          role: player.role,
          notes: player.notes,
          games: 0,
          pts: 0,
          fg: 0,
          fga: 0,
          fg3: 0,
          fg3a: 0,
          ft: 0,
          fta: 0,
          oreb: 0,
          dreb: 0,
          reb: 0,
          asst: 0,
          to: 0,
          stl: 0,
          blk: 0,
          fouls: 0,
          plus_minus: 0,
          ppg: 0,
          rpg: 0,
          apg: 0,
          spg: 0,
          bpg: 0,
          tpg: 0,
          fpg: 0,
          fg_pct: 0,
          fg3_pct: 0,
          ft_pct: 0,
          coach_style: team.coachStyle ?? "",
          roster_info: {
            name: player.name,
            number: player.number,
            position: player.position,
            height: player.height,
            grade: player.grade,
            role: player.role,
            notes: player.notes,
          },
        });
      }
    }

    const aggregatedTeam = {
      fg: 0,
      fga: 0,
      fg3: 0,
      fg3a: 0,
      ft: 0,
      fta: 0,
      oreb: 0,
      dreb: 0,
      reb: 0,
      asst: 0,
      to: 0,
      stl: 0,
      blk: 0,
      fouls: 0,
      win: 0,
      loss: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    };

    const games: SeasonGameSummary[] = [];
    const overrideMap = deps.gameOverridesBySchool.get(schoolId) ?? new Map<string, GameEditOverride>();
    const sessionsForSchool = deps.getSessionsForSchool(schoolId)
      .filter((session) => (rosterTeamIds.has(session.homeTeamId) || rosterTeamIds.has(session.awayTeamId)) && session.submitted === true);

    for (const session of sessionsForSchool) {
      const ourTeamId = rosterTeamIds.has(session.homeTeamId) ? session.homeTeamId : session.awayTeamId;
      const opponentTeamId = ourTeamId === session.homeTeamId ? session.awayTeamId : session.homeTeamId;
      const teamStats = session.state.teamStats[ourTeamId];
      const playerStats = session.state.playerStatsByTeam[ourTeamId] ?? {};
      const orderedEvents = deps.listOrderedEvents(session);
      const latestTimestampIso = orderedEvents[orderedEvents.length - 1]?.timestampIso ?? "";
      const fg3ByPlayer = new Map<string, { made: number; attempts: number }>();
      let fg3 = 0;
      let fg3a = 0;

      for (const event of orderedEvents) {
        if (event.teamId !== ourTeamId || event.type !== "shot_attempt" || event.points !== 3) {
          continue;
        }

        fg3a += 1;
        const playerId = event.playerId ?? "";
        const current = fg3ByPlayer.get(playerId) ?? { made: 0, attempts: 0 };
        current.attempts += 1;
        if (event.made) {
          current.made += 1;
          fg3 += 1;
        }
        fg3ByPlayer.set(playerId, current);
      }

      const assists = Object.values(playerStats).reduce((sum, player) => sum + player.assists, 0);
      const steals = Object.values(playerStats).reduce((sum, player) => sum + player.steals, 0);
      const blocks = Object.values(playerStats).reduce((sum, player) => sum + player.blocks, 0);

      let gameDate = latestTimestampIso ? latestTimestampIso.slice(0, 10) : "";
      let gameOpponent = session.opponentName?.trim() || deps.resolveTeamLabelFromRoster(opponentTeamId, schoolId);
      let gameLocation: "home" | "away" = ourTeamId === session.homeTeamId ? "home" : "away";
      let gameVcScore = session.state.scoreByTeam[ourTeamId] ?? 0;
      let gameOppScore = session.state.scoreByTeam[opponentTeamId] ?? 0;
      let gameTeamStats = {
        fg: teamStats?.shooting?.fgMade ?? 0,
        fga: teamStats?.shooting?.fgAttempts ?? 0,
        fg3,
        fg3a,
        ft: teamStats?.shooting?.ftMade ?? 0,
        fta: teamStats?.shooting?.ftAttempts ?? 0,
        oreb: teamStats?.reboundsOff ?? 0,
        dreb: teamStats?.reboundsDef ?? 0,
        reb: (teamStats?.reboundsOff ?? 0) + (teamStats?.reboundsDef ?? 0),
        asst: assists,
        to: teamStats?.turnovers ?? 0,
        stl: steals,
        blk: blocks,
        fouls: teamStats?.fouls ?? 0,
      };

      const override = overrideMap.get(session.state.gameId);
      if (override) {
        gameDate = override.date || gameDate;
        gameOpponent = override.opponent || gameOpponent;
        gameLocation = override.location === "neutral" ? "away" : (override.location || gameLocation);
        gameVcScore = override.vc_score;
        gameOppScore = override.opp_score;
        const ots = override.team_stats;
        if (ots && (ots.fg > 0 || ots.fga > 0 || ots.ft > 0 || ots.reb > 0)) {
          gameTeamStats = { ...ots };
        }
      }

      const gameResult = gameVcScore > gameOppScore ? "W" as const : gameVcScore < gameOppScore ? "L" as const : "T" as const;

      aggregatedTeam.fg += gameTeamStats.fg;
      aggregatedTeam.fga += gameTeamStats.fga;
      aggregatedTeam.fg3 += gameTeamStats.fg3;
      aggregatedTeam.fg3a += gameTeamStats.fg3a;
      aggregatedTeam.ft += gameTeamStats.ft;
      aggregatedTeam.fta += gameTeamStats.fta;
      aggregatedTeam.oreb += gameTeamStats.oreb;
      aggregatedTeam.dreb += gameTeamStats.dreb;
      aggregatedTeam.reb += gameTeamStats.reb;
      aggregatedTeam.asst += gameTeamStats.asst;
      aggregatedTeam.to += gameTeamStats.to;
      aggregatedTeam.stl += gameTeamStats.stl;
      aggregatedTeam.blk += gameTeamStats.blk;
      aggregatedTeam.fouls += gameTeamStats.fouls;
      aggregatedTeam.pointsFor += gameVcScore;
      aggregatedTeam.pointsAgainst += gameOppScore;
      if (gameResult === "W") {
        aggregatedTeam.win += 1;
      } else if (gameResult === "L") {
        aggregatedTeam.loss += 1;
      }

      games.push({
        gameId: session.state.gameId,
        date: gameDate,
        opponent: gameOpponent,
        location: gameLocation,
        vc_score: gameVcScore,
        opp_score: gameOppScore,
        result: gameResult,
        team_stats: gameTeamStats,
      });

      const overridePlayerStats = override?.player_stats;
      if (Array.isArray(overridePlayerStats) && overridePlayerStats.length > 0) {
        for (const ps of overridePlayerStats) {
          const playerId = String(ps.playerId ?? "");
          if (!playerId) {
            continue;
          }
          const existing = playerMap.get(playerId);
          if (!existing) {
            continue;
          }
          existing.games += 1;
          existing.pts += Number(ps.pts ?? 0);
          existing.fg += Number(ps.fg ?? 0);
          existing.fga += Number(ps.fga ?? 0);
          existing.fg3 += Number(ps.fg3 ?? 0);
          existing.fg3a += Number(ps.fg3a ?? 0);
          existing.ft += Number(ps.ft ?? 0);
          existing.fta += Number(ps.fta ?? 0);
          existing.oreb += Number(ps.oreb ?? 0);
          existing.dreb += Number(ps.dreb ?? 0);
          existing.reb += Number(ps.oreb ?? 0) + Number(ps.dreb ?? 0);
          existing.asst += Number(ps.asst ?? 0);
          existing.to += Number(ps.to ?? 0);
          existing.stl += Number(ps.stl ?? 0);
          existing.blk += Number(ps.blk ?? 0);
          existing.fouls += Number(ps.fouls ?? 0);
          playerMap.set(playerId, existing);
        }
      } else {
        for (const statLine of Object.values(playerStats)) {
          const existing = playerMap.get(statLine.playerId) ?? {
            name: statLine.playerId,
            full_name: statLine.playerId,
            first_name: statLine.playerId,
            games: 0,
            pts: 0,
            fg: 0,
            fga: 0,
            fg3: 0,
            fg3a: 0,
            ft: 0,
            fta: 0,
            oreb: 0,
            dreb: 0,
            reb: 0,
            asst: 0,
            to: 0,
            stl: 0,
            blk: 0,
            fouls: 0,
            plus_minus: 0,
            ppg: 0,
            rpg: 0,
            apg: 0,
            spg: 0,
            bpg: 0,
            tpg: 0,
            fpg: 0,
            fg_pct: 0,
            fg3_pct: 0,
            ft_pct: 0,
            coach_style: "",
            roster_info: null,
          } as SeasonPlayerSummary;
          const fg3Line = fg3ByPlayer.get(statLine.playerId) ?? { made: 0, attempts: 0 };
          existing.games += 1;
          existing.pts += statLine.points;
          existing.fg += statLine.fgMade;
          existing.fga += statLine.fgAttempts;
          existing.fg3 += fg3Line.made;
          existing.fg3a += fg3Line.attempts;
          existing.ft += statLine.ftMade;
          existing.fta += statLine.ftAttempts;
          existing.oreb += statLine.reboundsOff;
          existing.dreb += statLine.reboundsDef;
          existing.reb += statLine.reboundsOff + statLine.reboundsDef;
          existing.asst += statLine.assists;
          existing.to += statLine.turnovers;
          existing.stl += statLine.steals;
          existing.blk += statLine.blocks;
          existing.fouls += statLine.fouls;
          playerMap.set(statLine.playerId, existing);
        }
      }
    }

    const totalGames = games.length;
    const seasonTeamStats: SeasonTeamStats = {
      fg: aggregatedTeam.fg,
      fga: aggregatedTeam.fga,
      fg3: aggregatedTeam.fg3,
      fg3a: aggregatedTeam.fg3a,
      ft: aggregatedTeam.ft,
      fta: aggregatedTeam.fta,
      oreb: aggregatedTeam.oreb,
      dreb: aggregatedTeam.dreb,
      reb: aggregatedTeam.reb,
      asst: aggregatedTeam.asst,
      to: aggregatedTeam.to,
      stl: aggregatedTeam.stl,
      blk: aggregatedTeam.blk,
      fouls: aggregatedTeam.fouls,
      win: aggregatedTeam.win,
      loss: aggregatedTeam.loss,
      ppg: totalGames > 0 ? roundStat(aggregatedTeam.pointsFor / totalGames) : 0,
      opp_ppg: totalGames > 0 ? roundStat(aggregatedTeam.pointsAgainst / totalGames) : 0,
      rpg: totalGames > 0 ? roundStat(aggregatedTeam.reb / totalGames) : 0,
      apg: totalGames > 0 ? roundStat(aggregatedTeam.asst / totalGames) : 0,
      to_avg: totalGames > 0 ? roundStat(aggregatedTeam.to / totalGames) : 0,
      stl_pg: totalGames > 0 ? roundStat(aggregatedTeam.stl / totalGames) : 0,
      blk_pg: totalGames > 0 ? roundStat(aggregatedTeam.blk / totalGames) : 0,
      oreb_pg: totalGames > 0 ? roundStat(aggregatedTeam.oreb / totalGames) : 0,
      dreb_pg: totalGames > 0 ? roundStat(aggregatedTeam.dreb / totalGames) : 0,
      fouls_pg: totalGames > 0 ? roundStat(aggregatedTeam.fouls / totalGames) : 0,
      fg_pct: aggregatedTeam.fga > 0 ? aggregatedTeam.fg / aggregatedTeam.fga : 0,
      fg3_pct: aggregatedTeam.fg3a > 0 ? aggregatedTeam.fg3 / aggregatedTeam.fg3a : 0,
      ft_pct: aggregatedTeam.fta > 0 ? aggregatedTeam.ft / aggregatedTeam.fta : 0,
    };

    const players = [...playerMap.values()]
      .map((player) => ({
        ...player,
        ppg: player.games > 0 ? roundStat(player.pts / player.games) : 0,
        rpg: player.games > 0 ? roundStat(player.reb / player.games) : 0,
        apg: player.games > 0 ? roundStat(player.asst / player.games) : 0,
        spg: player.games > 0 ? roundStat(player.stl / player.games) : 0,
        bpg: player.games > 0 ? roundStat(player.blk / player.games) : 0,
        tpg: player.games > 0 ? roundStat(player.to / player.games) : 0,
        fpg: player.games > 0 ? roundStat(player.fouls / player.games) : 0,
        fg_pct: player.fga > 0 ? roundStat(player.fg / player.fga, 3) : 0,
        fg3_pct: player.fg3a > 0 ? roundStat(player.fg3 / player.fg3a, 3) : 0,
        ft_pct: player.fta > 0 ? roundStat(player.ft / player.fta, 3) : 0,
      }))
      .sort((left, right) => right.ppg - left.ppg);

    const sortedGames = [...games].sort((left, right) => right.gameId.localeCompare(left.gameId));
    const primaryTeam = rosterTeams[0];
    return {
      seasonTeamStats,
      games: sortedGames,
      players,
      liveContext: {
        seasonStats: seasonTeamStats,
        recentGames: sortedGames.slice(0, 5),
        players: players.map((player) => ({
          name: player.full_name,
          number: player.number ?? "",
          ppg: player.ppg,
          rpg: player.rpg,
          apg: player.apg,
          fg_pct: player.fg_pct,
          fg3_pct: player.fg3_pct,
          ft_pct: player.ft_pct,
          fpg: player.fpg,
          games: player.games,
          role: player.role ?? "",
          notes: player.notes ?? "",
        })),
        teamInfo: {
          name: primaryTeam?.name ?? "",
          coachStyle: primaryTeam?.coachStyle ?? "",
          playingStyle: "",
          teamContext: "",
        },
      },
    };
  };

  return {
    buildSchoolAnalytics,
  };
}
