import {
  getGameState,
  getGameEvents,
  getRosterTeamsByScope,
  getSeasonGames,
  getSeasonPlayers,
  getSeasonTeamStats,
  getGameOverrideMap,
} from "../store.js";

// ---------------------------------------------------------------------------
// Local string utilities (pure, no external deps)
// ---------------------------------------------------------------------------

function normalizePersonName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeNameKey(value: unknown): string {
  return normalizePersonName(value).toLowerCase();
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

export const seasonAnalysisBySchool = new Map<string, { generated_at: string; season_summary: string; per_game_analysis: unknown[] }>();
export const playerAnalysisCacheBySchool = new Map<string, Map<string, unknown>>();

// ---------------------------------------------------------------------------
// Math utilities
// ---------------------------------------------------------------------------

export function roundStat(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

export function resolveGameResult(vcScore: number, oppScore: number): "W" | "L" | "T" {
  if (vcScore > oppScore) {
    return "W";
  }
  if (vcScore < oppScore) {
    return "L";
  }
  return "T";
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Roster / state helpers
// ---------------------------------------------------------------------------

export function getRosterPlayerByIdForSchool(schoolId: string): Map<string, { name: string; number?: string }> {
  const map = new Map<string, { name: string; number?: string }>();
  for (const team of getRosterTeamsByScope({ schoolId })) {
    for (const player of team.players) {
      map.set(player.id, { name: player.name, number: player.number });
    }
  }
  return map;
}

export function getOurTeamId(state: NonNullable<ReturnType<typeof getGameState>>, teamIds: Set<string>): string {
  if (teamIds.has(state.homeTeamId)) {
    return state.homeTeamId;
  }
  if (teamIds.has(state.awayTeamId)) {
    return state.awayTeamId;
  }
  return state.homeTeamId;
}

function getSchoolAnalyticsContext(schoolId: string) {
  const teams = getRosterTeamsByScope({ schoolId });
  const teamIds = new Set(teams.map((team) => team.id));
  const seasonGames = getSeasonGames({ schoolId })
    .slice()
    .sort((left, right) => {
      const leftNumeric = Number(left.gameId);
      const rightNumeric = Number(right.gameId);
      const leftIsNumeric = Number.isFinite(leftNumeric);
      const rightIsNumeric = Number.isFinite(rightNumeric);
      if (leftIsNumeric && rightIsNumeric) {
        return leftNumeric - rightNumeric;
      }
      return left.gameId.localeCompare(right.gameId);
    });
  const playerIdsByName = new Map<string, string[]>();
  for (const team of teams) {
    for (const player of team.players) {
      const key = normalizeNameKey(player.name);
      const ids = playerIdsByName.get(key) ?? [];
      ids.push(player.id);
      playerIdsByName.set(key, ids);
    }
  }
  return { teams, teamIds, seasonGames, playerIdsByName };
}

// ---------------------------------------------------------------------------
// Game/player stat builders
// ---------------------------------------------------------------------------

export function buildDefaultGamePlayerStats(schoolId: string, gameId: string): Array<Record<string, unknown>> {
  const state = getGameState(gameId, { schoolId });
  if (!state) {
    return [];
  }
  const rosterTeamIds = new Set(getRosterTeamsByScope({ schoolId }).map((team) => team.id));
  const ourTeamId = getOurTeamId(state, rosterTeamIds);
  const playerStatsByTeam = state.playerStatsByTeam[ourTeamId] ?? {};
  const rosterPlayerById = getRosterPlayerByIdForSchool(schoolId);
  const threePointByPlayer = new Map<string, { made: number; attempts: number }>();

  for (const event of getGameEvents(gameId, { schoolId })) {
    if (event.type !== "shot_attempt" || event.teamId !== ourTeamId || event.points !== 3) {
      continue;
    }
    const current = threePointByPlayer.get(event.playerId) ?? { made: 0, attempts: 0 };
    current.attempts += 1;
    if (event.made) {
      current.made += 1;
    }
    threePointByPlayer.set(event.playerId, current);
  }

  return Object.values(playerStatsByTeam).map((stats) => {
    const rosterInfo = rosterPlayerById.get(stats.playerId);
    const threePoint = threePointByPlayer.get(stats.playerId) ?? { made: 0, attempts: 0 };
    const firstName = (rosterInfo?.name ?? stats.playerId).split(" ")[0] ?? (rosterInfo?.name ?? stats.playerId);
    return {
      name: rosterInfo?.name ?? stats.playerId,
      first_name: firstName,
      number: rosterInfo?.number ?? "",
      fg_made: stats.fgMade,
      fg_att: stats.fgAttempts,
      fg3_made: threePoint.made,
      fg3_att: threePoint.attempts,
      ft_made: stats.ftMade,
      ft_att: stats.ftAttempts,
      oreb: stats.reboundsOff,
      dreb: stats.reboundsDef,
      asst: stats.assists,
      stl: stats.steals,
      blk: stats.blocks,
      to: stats.turnovers,
      fouls: stats.fouls,
      plus_minus: 0,
      pts: stats.points,
    };
  });
}

export function buildGamesPayload(schoolId: string): Array<Record<string, unknown>> {
  const overrides = getGameOverrideMap(schoolId);
  const rosterPlayerById = getRosterPlayerByIdForSchool(schoolId);
  return getSeasonGames({ schoolId }).map((game) => {
    const base = {
      gameId: game.gameId,
      date: game.date,
      opponent: game.opponent,
      location: game.location,
      vc_score: game.vc_score,
      opp_score: game.opp_score,
      result: game.result,
      team_stats: game.team_stats,
      player_stats: buildDefaultGamePlayerStats(schoolId, game.gameId),
    };

    const override = overrides.get(game.gameId);
    if (!override) {
      return base;
    }

    const rawStats = override.player_stats as Array<Record<string, unknown>> | undefined;
    const normalizedPlayerStats = rawStats?.map((p) => {
      const rosterInfo = p.playerId ? rosterPlayerById.get(String(p.playerId)) : undefined;
      const fgMade = Number(p.fg_made ?? p.fg ?? 0);
      const fgAtt = Number(p.fg_att ?? p.fga ?? 0);
      const fg3Made = Number(p.fg3_made ?? p.fg3 ?? 0);
      const fg3Att = Number(p.fg3_att ?? p.fg3a ?? 0);
      const ftMade = Number(p.ft_made ?? p.ft ?? 0);
      const ftAtt = Number(p.ft_att ?? p.fta ?? 0);
      const oreb = Number(p.oreb ?? 0);
      const dreb = Number(p.dreb ?? 0);
      const nameStr = String(p.name ?? rosterInfo?.name ?? p.playerId ?? "Unknown");
      const firstName = nameStr.split(" ")[0] ?? nameStr;
      return {
        playerId: p.playerId ?? undefined,
        name: nameStr,
        first_name: firstName,
        number: p.number ?? rosterInfo?.number ?? "",
        fg_made: fgMade,
        fg_att: fgAtt,
        fg3_made: fg3Made,
        fg3_att: fg3Att,
        ft_made: ftMade,
        ft_att: ftAtt,
        oreb,
        dreb,
        asst: Number(p.asst ?? p.ast ?? 0),
        stl: Number(p.stl ?? 0),
        blk: Number(p.blk ?? 0),
        to: Number(p.to ?? 0),
        fouls: Number(p.fouls ?? p.pf ?? 0),
        plus_minus: Number(p.plus_minus ?? 0),
        pts: Number(p.pts ?? (fgMade - fg3Made) * 2 + fg3Made * 3 + ftMade),
      };
    });

    return {
      ...base,
      ...override,
      ...(normalizedPlayerStats ? { player_stats: normalizedPlayerStats } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Leaderboards / trends / advanced analytics
// ---------------------------------------------------------------------------

export function buildLeaderboardsPayload(schoolId: string) {
  const players = getSeasonPlayers({ schoolId }).map((player) => ({
    ...player,
    first_name: player.first_name || player.name.split(" ")[0] || "Unknown",
  }));

  return {
    pts: [...players].sort((left, right) => right.pts - left.pts).slice(0, 10),
    reb: [...players].sort((left, right) => right.reb - left.reb).slice(0, 10),
    asst: [...players].sort((left, right) => right.asst - left.asst).slice(0, 10),
    fg_pct: players.filter((player) => player.fga > 0).sort((left, right) => right.fg_pct - left.fg_pct).slice(0, 10),
    fg3_pct: players.filter((player) => player.fg3a > 0).sort((left, right) => right.fg3_pct - left.fg3_pct).slice(0, 10),
    ft_pct: players.filter((player) => player.fta > 0).sort((left, right) => right.ft_pct - left.ft_pct).slice(0, 10),
    stl: [...players].sort((left, right) => right.stl - left.stl).slice(0, 10),
    blk: [...players].sort((left, right) => right.blk - left.blk).slice(0, 10),
  };
}

export function buildTeamTrendsPayload(schoolId: string) {
  const { seasonGames } = getSchoolAnalyticsContext(schoolId);
  return {
    games: seasonGames.map((game) => game.gameId),
    opponents: seasonGames.map((game) => game.opponent),
    dates: seasonGames.map((game) => game.date),
    vc_score: seasonGames.map((game) => game.vc_score),
    opp_score: seasonGames.map((game) => game.opp_score),
    fg_pct: seasonGames.map((game) => roundStat(game.team_stats.fga > 0 ? (game.team_stats.fg / game.team_stats.fga) * 100 : 0, 1)),
    fg3_pct: seasonGames.map((game) => roundStat(game.team_stats.fg3a > 0 ? (game.team_stats.fg3 / game.team_stats.fg3a) * 100 : 0, 1)),
    asst: seasonGames.map((game) => game.team_stats.asst),
    to: seasonGames.map((game) => game.team_stats.to),
    reb: seasonGames.map((game) => game.team_stats.reb),
    oreb: seasonGames.map((game) => game.team_stats.oreb),
    dreb: seasonGames.map((game) => game.team_stats.dreb),
    stl: seasonGames.map((game) => game.team_stats.stl),
    blk: seasonGames.map((game) => game.team_stats.blk),
    ft: seasonGames.map((game) => game.team_stats.ft),
    fta: seasonGames.map((game) => game.team_stats.fta),
  };
}

export function buildTeamAdvancedPayload(schoolId: string) {
  const seasonStats = getSeasonTeamStats({ schoolId });
  const gamesPlayed = Math.max(seasonStats.win + seasonStats.loss, 1);
  const totalPoints = seasonStats.ppg * gamesPlayed;
  const possessions = Math.max(seasonStats.fga - seasonStats.oreb + seasonStats.to + 0.44 * seasonStats.fta, 1);
  const efgPct = seasonStats.fga > 0 ? ((seasonStats.fg + 0.5 * seasonStats.fg3) / seasonStats.fga) * 100 : 0;
  const tsPct =
    seasonStats.fga > 0 || seasonStats.fta > 0
      ? (totalPoints / (2 * Math.max(seasonStats.fga + 0.44 * seasonStats.fta, 1))) * 100
      : 0;

  return {
    scoring_efficiency: {
      efg_pct: roundStat(efgPct, 1),
      ts_pct: roundStat(tsPct, 1),
      ppp: roundStat(totalPoints / possessions, 2),
    },
    ball_movement: {
      assisted_scoring_rate: roundStat(seasonStats.fg > 0 ? (seasonStats.asst / seasonStats.fg) * 100 : 0, 1),
    },
  };
}

export function buildPlayerAdvancedPayload(schoolId: string, playerName: string) {
  const targetKey = normalizeNameKey(playerName);
  const player = getSeasonPlayers({ schoolId }).find(
    (entry) => normalizeNameKey(entry.name) === targetKey || normalizeNameKey(entry.full_name) === targetKey
  );
  if (!player) {
    return null;
  }

  const efgPct = player.fga > 0 ? ((player.fg + 0.5 * player.fg3) / player.fga) * 100 : 0;
  const tsPct =
    player.fga > 0 || player.fta > 0
      ? (player.pts / (2 * Math.max(player.fga + 0.44 * player.fta, 1))) * 100
      : 0;
  const pointsPerShot = player.fga > 0 ? player.pts / player.fga : 0;
  const totalUsage = Math.max(player.fga + player.fta + player.to, 1);
  const seasonTotals = getSeasonTeamStats({ schoolId });
  const gamesPlayed = Math.max(seasonTotals.win + seasonTotals.loss, 1);
  const totalTeamPoints = seasonTotals.ppg * gamesPlayed;
  const totalTeamShots = Math.max(seasonTotals.fga + seasonTotals.fta + seasonTotals.to, 1);
  const per = roundStat(player.ppg * 1.5 + player.rpg * 1.2 + player.apg * 1.5 + player.spg * 2 + player.bpg * 2 - player.tpg, 1);
  const usageProxy = roundStat((totalUsage / totalTeamShots) * 100, 1);
  const scoringShare = roundStat(totalTeamPoints > 0 ? (player.pts / totalTeamPoints) * 100 : 0, 1);
  const shotVolumeShare = roundStat(seasonTotals.fga > 0 ? (player.fga / seasonTotals.fga) * 100 : 0, 1);
  const toRate = roundStat(totalUsage > 0 ? (player.to / totalUsage) * 100 : 0, 1);
  const astToRatio = roundStat(player.to > 0 ? player.asst / player.to : player.asst, 1);
  const reboundShare = roundStat(seasonTotals.reb > 0 ? (player.reb / seasonTotals.reb) * 100 : 0, 1);
  const defensiveRating = roundStat(100 - player.spg * 6 - player.bpg * 5 + player.fpg * 2, 1);
  const efficiencyGrade = per >= 20 ? "A" : per >= 15 ? "B" : per >= 10 ? "C" : "D";

  return {
    scoring_efficiency: {
      per,
      efg_pct: roundStat(efgPct, 1),
      ts_pct: roundStat(tsPct, 1),
      pts_per_shot: roundStat(pointsPerShot, 2),
      fg2_pct: roundStat(
        player.fga - player.fg3a > 0 ? ((player.fg - player.fg3) / Math.max(player.fga - player.fg3a, 1)) * 100 : 0,
        1
      ),
      fg3_pct: roundStat(player.fg3_pct, 1),
    },
    usage_role: {
      role: usageProxy >= 22 ? "Primary option" : usageProxy >= 14 ? "Secondary option" : "Role player",
      usage_proxy: usageProxy,
      scoring_share: scoringShare,
      shot_volume_share: shotVolumeShare,
      to_rate: toRate,
    },
    ball_handling: {
      apg: roundStat(player.apg, 1),
      tpg: roundStat(player.tpg, 1),
      ast_to_ratio: astToRatio,
      total_assists: player.asst,
      total_turnovers: player.to,
    },
    rebounding: {
      rpg: roundStat(player.rpg, 1),
      oreb: player.oreb,
      dreb: player.dreb,
      reb_share: reboundShare,
    },
    defense_activity: {
      spg: roundStat(player.spg, 1),
      bpg: roundStat(player.bpg, 1),
      defensive_rating: defensiveRating,
      deflections_per_game: roundStat(player.spg + player.bpg, 1),
    },
    discipline: {
      fouls_per_game: roundStat(player.fpg, 1),
      foul_rate: roundStat(player.games > 0 ? player.fouls / player.games : 0, 1),
    },
    consistency: {
      games_played: player.games,
      scoring_baseline: roundStat(player.ppg, 1),
    },
    clutch_performance: {
      clutch_score: roundStat(player.ppg + player.apg - player.tpg, 1),
    },
    impact: {
      total_points: player.pts,
      total_rebounds: player.reb,
      total_assists: player.asst,
      efficiency_grade: efficiencyGrade,
    },
  };
}

export function buildPlayerTrendsPayload(schoolId: string, playerName: string) {
  const { teamIds, seasonGames, playerIdsByName } = getSchoolAnalyticsContext(schoolId);
  const playerIds = playerIdsByName.get(normalizeNameKey(playerName)) ?? [];
  const trendRows = seasonGames
    .map((game) => {
      const state = getGameState(game.gameId, { schoolId });
      if (!state) {
        return null;
      }
      const ourTeamId = getOurTeamId(state, teamIds);
      const teamStats = state.playerStatsByTeam[ourTeamId] ?? {};
      const combined = playerIds.reduce(
        (acc, playerId) => {
          const stats = teamStats[playerId];
          if (!stats) {
            return acc;
          }
          acc.points += stats.points;
          acc.fgMade += stats.fgMade;
          acc.fgAttempts += stats.fgAttempts;
          acc.fg3Made += Math.max(0, Math.min(stats.fgMade, stats.points >= 3 ? stats.points / 3 : 0));
          acc.assists += stats.assists;
          acc.rebounds += stats.reboundsOff + stats.reboundsDef;
          acc.steals += stats.steals;
          acc.turnovers += stats.turnovers;
          acc.fouls += stats.fouls;
          return acc;
        },
        { points: 0, fgMade: 0, fgAttempts: 0, fg3Made: 0, assists: 0, rebounds: 0, steals: 0, turnovers: 0, fouls: 0 }
      );
      return { gameId: game.gameId, opponent: game.opponent, date: game.date, stats: combined };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    games: trendRows.map((row) => row.gameId),
    opponents: trendRows.map((row) => row.opponent),
    dates: trendRows.map((row) => row.date),
    pts: trendRows.map((row) => row.stats.points),
    fg: trendRows.map((row) => row.stats.fgMade),
    fg_att: trendRows.map((row) => row.stats.fgAttempts),
    fg3: trendRows.map((row) => row.stats.fg3Made),
    asst: trendRows.map((row) => row.stats.assists),
    reb: trendRows.map((row) => row.stats.rebounds),
    stl: trendRows.map((row) => row.stats.steals),
    plus_minus: trendRows.map(() => 0),
    to: trendRows.map((row) => row.stats.turnovers),
    fouls: trendRows.map((row) => row.stats.fouls),
  };
}

export function buildPlayerComparisonPayload(schoolId: string, playerNames: string[]) {
  const players = playerNames
    .map((playerName) => {
      const player = getSeasonPlayers({ schoolId }).find(
        (entry) =>
          normalizeNameKey(entry.name) === normalizeNameKey(playerName) ||
          normalizeNameKey(entry.full_name) === normalizeNameKey(playerName)
      );
      const advanced = buildPlayerAdvancedPayload(schoolId, playerName);
      if (!player || !advanced) {
        return null;
      }
      return {
        name: player.full_name,
        basic_stats: {
          ppg: player.ppg,
          rpg: player.rpg,
          apg: player.apg,
          tpg: player.tpg,
          fg_pct: player.fg_pct,
          fg3_pct: player.fg3_pct,
          ft_pct: player.ft_pct,
          spg: player.spg,
          bpg: player.bpg,
        },
        role: advanced.usage_role.role,
        efficiency_grade: advanced.impact.efficiency_grade,
      };
    })
    .filter((player): player is NonNullable<typeof player> => Boolean(player));

  return { players };
}

export function buildVolatilityPayload(schoolId: string) {
  const trends = buildTeamTrendsPayload(schoolId);
  return {
    team_volatility: {
      ppg_range: roundStat(Math.max(...trends.vc_score, 0) - Math.min(...trends.vc_score, 0), 1),
      fg_pct_std_dev: roundStat(standardDeviation(trends.fg_pct), 1),
      to_std_dev: roundStat(standardDeviation(trends.to), 1),
    },
  };
}

export function buildComprehensiveInsightsPayload(schoolId: string) {
  const seasonStats = getSeasonTeamStats({ schoolId });
  const trends = buildTeamTrendsPayload(schoolId);
  const recentScores = trends.vc_score.slice(-5);
  const earlyScores = trends.vc_score.slice(0, Math.min(5, trends.vc_score.length));
  const recentAllowed = trends.opp_score.slice(-5);
  const earlyAllowed = trends.opp_score.slice(0, Math.min(5, trends.opp_score.length));
  const recentWins = trends.vc_score
    .slice(-5)
    .filter((score, index) => score > (trends.opp_score.slice(-5)[index] ?? 0)).length;
  const recentLosses = Math.max(Math.min(5, trends.games.length) - recentWins, 0);
  const recentAvgScore = average(recentScores);
  const recentAvgAllowed = average(recentAllowed);
  const earlyAvgScore = average(earlyScores);
  const earlyAvgAllowed = average(earlyAllowed);
  const players = getSeasonPlayers({ schoolId }).slice(0, 12);

  return {
    team_trends: {
      recent_performance: {
        record: `${recentWins}-${recentLosses}`,
        avg_score: roundStat(recentAvgScore, 1),
        point_differential: roundStat(recentAvgScore - recentAvgAllowed, 1),
        trend: recentAvgScore >= earlyAvgScore ? "up" : "down",
      },
      scoring_trends: {
        recent_avg: roundStat(recentAvgScore, 1),
        early_avg: roundStat(earlyAvgScore, 1),
        improvement: roundStat(recentAvgScore - earlyAvgScore, 1),
        trend: recentAvgScore >= earlyAvgScore ? "improving" : "declining",
      },
      defensive_trends: {
        recent_avg_allowed: roundStat(recentAvgAllowed, 1),
        early_avg_allowed: roundStat(earlyAvgAllowed, 1),
        improvement: roundStat(earlyAvgAllowed - recentAvgAllowed, 1),
        trend: recentAvgAllowed <= earlyAvgAllowed ? "improving" : "declining",
      },
    },
    key_metrics: {
      win_pct: roundStat(
        seasonStats.win + seasonStats.loss > 0 ? (seasonStats.win / (seasonStats.win + seasonStats.loss)) * 100 : 0,
        1
      ),
      fg_pct: roundStat(seasonStats.fg_pct, 1),
      fg3_pct: roundStat(seasonStats.fg3_pct, 1),
      apg: roundStat(seasonStats.apg, 1),
      tpg: roundStat(seasonStats.to_avg, 1),
    },
    recommendations: [
      {
        category: "Ball Security",
        priority: seasonStats.to_avg >= 12 ? "High" : "Medium",
        recommendation:
          seasonStats.to_avg >= 12
            ? "Reduce live-ball turnovers to stabilize offensive efficiency."
            : "Keep turnover discipline steady to preserve scoring margin.",
        reason: `Season turnover average is ${roundStat(seasonStats.to_avg, 1)} per game.`,
      },
      {
        category: "Shot Quality",
        priority: seasonStats.fg3_pct >= 34 ? "Medium" : "High",
        recommendation:
          seasonStats.fg3_pct >= 34
            ? "Maintain current 3-point volume while protecting paint touches."
            : "Prioritize rim and paint creation until perimeter efficiency improves.",
        reason: `Season 3-point percentage is ${roundStat(seasonStats.fg3_pct, 1)}%.`,
      },
    ],
    player_insights: players.map((player) => {
      const advanced = buildPlayerAdvancedPayload(schoolId, player.full_name);
      return {
        name: player.full_name,
        role: advanced?.usage_role.role ?? "Role player",
        strengths: [
          player.ppg >= 10 ? "Reliable scoring" : "Low-mistake offense",
          player.apg >= 3 ? "Playmaking" : "Lineup stability",
          player.fg_pct >= 45 ? "Efficient finishing" : "Shot selection discipline",
        ],
        areas_for_improvement: [
          player.tpg >= 2 ? "Turnover control" : "Create more rim pressure",
          player.ft_pct < 70 ? "Free-throw consistency" : "Increase assertiveness",
        ],
        efficiency_grade: advanced?.impact.efficiency_grade ?? "C",
      };
    }),
  };
}

export function buildTeamSummaryText(schoolId: string): string {
  const season = getSeasonTeamStats({ schoolId });
  const games = buildGamesPayload(schoolId);
  const lastGame = games[games.length - 1] as Record<string, unknown> | undefined;
  const recentRecord = games.slice(-5).reduce<{ wins: number; losses: number }>(
    (acc, game) => {
      const result = String((game as Record<string, unknown>).result ?? "");
      if (result === "W") acc.wins += 1;
      if (result === "L") acc.losses += 1;
      return acc;
    },
    { wins: 0, losses: 0 }
  );

  return [
    `Season record: ${season.win}-${season.loss}.`,
    `Scoring profile: ${roundStat(season.ppg, 1)} PPG for, ${roundStat(season.opp_ppg, 1)} allowed.`,
    `Efficiency: FG ${roundStat(season.fg_pct, 1)}%, 3PT ${roundStat(season.fg3_pct, 1)}%, FT ${roundStat(season.ft_pct, 1)}%.`,
    `Ball security: ${roundStat(season.to_avg, 1)} turnovers per game.`,
    `Recent form (last 5): ${recentRecord.wins}-${recentRecord.losses}.`,
    lastGame
      ? `Most recent game: ${String(lastGame.opponent ?? "Opponent")} ${String(lastGame.result ?? "")} ${Number(lastGame.vc_score ?? 0)}-${Number(lastGame.opp_score ?? 0)}.`
      : "No games logged yet.",
  ].join(" ");
}

export function buildGameAnalysisText(schoolId: string, gameId: string): string | null {
  const game = buildGamesPayload(schoolId).find((entry) => String(entry.gameId) === String(gameId)) as Record<string, unknown> | undefined;
  if (!game) {
    return null;
  }
  const teamStats = (game.team_stats as Record<string, unknown> | undefined) ?? {};
  const fgPct = roundStat(
    Number(teamStats.fga ?? 0) > 0 ? (Number(teamStats.fg ?? 0) / Number(teamStats.fga ?? 1)) * 100 : 0,
    1
  );
  const fg3Pct = roundStat(
    Number(teamStats.fg3a ?? 0) > 0 ? (Number(teamStats.fg3 ?? 0) / Number(teamStats.fg3a ?? 1)) * 100 : 0,
    1
  );
  const astTo = roundStat(
    Number(teamStats.to ?? 0) > 0 ? Number(teamStats.asst ?? 0) / Number(teamStats.to ?? 1) : Number(teamStats.asst ?? 0),
    2
  );

  return [
    `${String(game.opponent ?? "Opponent")} result: ${String(game.result ?? "")} ${Number(game.vc_score ?? 0)}-${Number(game.opp_score ?? 0)}.`,
    `Shooting: ${Number(teamStats.fg ?? 0)}-${Number(teamStats.fga ?? 0)} FG (${fgPct}%), ${Number(teamStats.fg3 ?? 0)}-${Number(teamStats.fg3a ?? 0)} from 3 (${fg3Pct}%).`,
    `Possession metrics: ${Number(teamStats.asst ?? 0)} assists, ${Number(teamStats.to ?? 0)} turnovers, AST/TO ${astTo}.`,
    `Rebounding: ${Number(teamStats.oreb ?? 0)} offensive, ${Number(teamStats.dreb ?? 0)} defensive.`,
  ].join(" ");
}

export function buildPlayerInsightsText(schoolId: string, playerName: string): string | null {
  const player = getSeasonPlayers({ schoolId }).find(
    (entry) =>
      normalizeNameKey(entry.full_name) === normalizeNameKey(playerName) ||
      normalizeNameKey(entry.name) === normalizeNameKey(playerName)
  );
  if (!player) {
    return null;
  }

  const strengths: string[] = [];
  if (player.ppg >= 12) strengths.push("reliable scoring load");
  if (player.apg >= 3) strengths.push("secondary playmaking");
  if (player.fg_pct >= 45) strengths.push("efficient finishing");
  if (player.fg3_pct >= 33) strengths.push("credible perimeter threat");
  if (strengths.length === 0) strengths.push("steady two-way minutes");

  const focus: string[] = [];
  if (player.tpg >= 2) focus.push("reduce live-ball turnovers");
  if (player.fpg >= 2.5) focus.push("manage foul exposure");
  if (player.ft_pct < 70) focus.push("improve free-throw conversion");
  if (focus.length === 0) focus.push("expand usage in organized sets");

  return [
    `${player.full_name}: ${roundStat(player.ppg, 1)} PPG, ${roundStat(player.rpg, 1)} RPG, ${roundStat(player.apg, 1)} APG.`,
    `Efficiency: FG ${roundStat(player.fg_pct, 1)}%, 3PT ${roundStat(player.fg3_pct, 1)}%, FT ${roundStat(player.ft_pct, 1)}%.`,
    `Current strengths: ${strengths.join(", ")}.`,
    `Coaching focus: ${focus.join(", ")}.`,
  ].join(" ");
}

export function buildSeasonAnalysisPayload(
  schoolId: string,
  force = false
): { generated_at: string; season_summary: string; per_game_analysis: unknown[] } {
  if (!force) {
    const cached = seasonAnalysisBySchool.get(schoolId);
    if (cached) return cached;
  }

  const games = buildGamesPayload(schoolId);
  const seasonStats = getSeasonTeamStats({ schoolId });
  const seasonPlayers = getSeasonPlayers({ schoolId });

  const perGameAnalysis = games.map((game) => {
    const ts = game.team_stats as {
      fg: number; fga: number; fg3: number; fg3a: number;
      ft: number; fta: number; asst: number; to: number; stl: number; reb: number;
    };
    const playerStats = (game.player_stats ?? []) as Array<{
      name: string; fg_made: number; fg_att: number; fg3_made: number; fg3_att: number;
      ft_made: number; ft_att: number; oreb: number; dreb: number; asst: number; pts: number;
    }>;
    const fgPct = ts.fga > 0 ? (ts.fg / ts.fga) * 100 : 0;
    const fg3Pct = ts.fg3a > 0 ? (ts.fg3 / ts.fg3a) * 100 : 0;
    const ftPct = ts.fta > 0 ? (ts.ft / ts.fta) * 100 : 0;

    const sorted = [...playerStats].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));
    const playerPerfs = sorted.map((p, idx) => {
      const seasonPpg = seasonPlayers.find((sp) => normalizeNameKey(sp.name) === normalizeNameKey(p.name))?.ppg ?? 0;
      const diff = (p.pts ?? 0) - seasonPpg;
      const fgMade = p.fg_made ?? 0;
      const fgAtt = p.fg_att ?? 0;
      const fg3Made = p.fg3_made ?? 0;
      const fg3Att = p.fg3_att ?? 0;
      const ftMade = p.ft_made ?? 0;
      const ftAtt = p.ft_att ?? 0;
      return {
        rank: idx + 1,
        name: p.name,
        pts: p.pts ?? 0,
        fg: `${fgMade}/${fgAtt}`,
        fg_pct: fgAtt > 0 ? (fgMade / fgAtt) * 100 : 0,
        fg3: `${fg3Made}/${fg3Att}`,
        fg3_pct: fg3Att > 0 ? (fg3Made / fg3Att) * 100 : 0,
        ft: `${ftMade}/${ftAtt}`,
        ft_pct: ftAtt > 0 ? (ftMade / ftAtt) * 100 : 0,
        reb: (p.oreb ?? 0) + (p.dreb ?? 0),
        asst: p.asst ?? 0,
        season_ppg: seasonPpg,
        diff,
        indicator: diff > 1 ? "↑" : diff < -1 ? "↓" : "→",
      };
    });

    const twoFgMade = ts.fg - ts.fg3;
    const twoFgAtt = ts.fga - ts.fg3a;
    const analysis =
      `FG: ${fgPct.toFixed(1)}%, 3PT: ${fg3Pct.toFixed(1)}%, FT: ${ftPct.toFixed(1)}%. ` +
      `AST: ${ts.asst}, TO: ${ts.to}, STL: ${ts.stl ?? 0}, REB: ${ts.reb}. ` +
      (playerPerfs.length > 0
        ? `Leaders: ${playerPerfs
            .slice(0, 3)
            .map((p) => `${p.name} ${p.pts}pts`)
            .join(", ")}.`
        : "No player data recorded.");

    return {
      game: game.gameId,
      opponent: game.opponent,
      date: game.date,
      score: `${game.vc_score}-${game.opp_score}`,
      result: game.result,
      shooting: {
        "2pt": `${twoFgMade}/${twoFgAtt}`,
        "3pt": `${ts.fg3}/${ts.fg3a}`,
        ft: `${ts.ft}/${ts.fta}`,
      },
      player_performances: playerPerfs,
      analysis,
    };
  });

  const gamesPlayed = Math.max(seasonStats.win + seasonStats.loss, 1);
  const winPct = Math.round((seasonStats.win / gamesPlayed) * 100);
  const summary =
    `Season Record: ${seasonStats.win}-${seasonStats.loss} (${winPct}% win rate). ` +
    `Scoring: ${seasonStats.ppg.toFixed(1)} PPG. ` +
    `FG: ${seasonStats.fg_pct.toFixed(1)}%, 3PT: ${seasonStats.fg3_pct.toFixed(1)}%, FT: ${seasonStats.ft_pct.toFixed(1)}%. ` +
    `${games.length} games played. ${seasonStats.win >= seasonStats.loss ? "Positive" : "Below .500"} season trajectory.`;

  const result = { generated_at: new Date().toISOString(), season_summary: summary, per_game_analysis: perGameAnalysis };
  seasonAnalysisBySchool.set(schoolId, result);
  return result;
}

export function buildPlayerAnalysisPayload(schoolId: string, playerName: string): unknown | null {
  const player = getSeasonPlayers({ schoolId }).find(
    (p) =>
      normalizeNameKey(p.name) === normalizeNameKey(playerName) ||
      normalizeNameKey(p.full_name) === normalizeNameKey(playerName)
  );
  if (!player) return null;

  const games = buildGamesPayload(schoolId);
  const gameLogs = games
    .map((g) => {
      const ps = (
        g.player_stats as Array<{ name: string; pts: number; oreb: number; dreb: number; asst: number }> | undefined ?? []
      ).find((p) => normalizeNameKey(p.name) === normalizeNameKey(playerName));
      return ps ? { pts: ps.pts ?? 0, reb: (ps.oreb ?? 0) + (ps.dreb ?? 0), asst: ps.asst ?? 0 } : null;
    })
    .filter((x): x is { pts: number; reb: number; asst: number } => x !== null);

  const ptsList = gameLogs.map((g) => g.pts);
  const recentPpg =
    ptsList.length >= 3
      ? ptsList.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, ptsList.length)
      : player.ppg;

  const strengths: string[] = [];
  if (player.ppg >= 12) strengths.push("primary scoring option");
  if (player.apg >= 3) strengths.push("playmaking contributor");
  if (player.fg_pct >= 45) strengths.push("high-percentage finisher");
  if (player.fg3_pct >= 33) strengths.push("3-point threat");
  if (strengths.length === 0) strengths.push("steady contributor");

  const analysis = [
    `${player.full_name || player.name}: ${player.ppg.toFixed(1)} PPG, ${player.rpg.toFixed(1)} RPG, ${player.apg.toFixed(1)} APG over ${player.games} games.`,
    `Shooting: ${player.fg_pct.toFixed(1)}% FG, ${player.fg3_pct.toFixed(1)}% 3PT, ${player.ft_pct.toFixed(1)}% FT.`,
    `Role: ${strengths.join(", ")}.`,
    ptsList.length > 0
      ? `Recent form (last 3): ${recentPpg.toFixed(1)} PPG. Range: ${Math.min(...ptsList)}-${Math.max(...ptsList)} pts.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    player: playerName,
    analysis,
    generated_at: new Date().toISOString(),
    stats_summary: {
      games: player.games,
      ppg: roundStat(player.ppg),
      rpg: roundStat(player.rpg),
      apg: roundStat(player.apg),
      fg_pct: roundStat(player.fg_pct),
      fg3_pct: roundStat(player.fg3_pct),
      ft_pct: roundStat(player.ft_pct),
    },
    cached: false,
  };
}
