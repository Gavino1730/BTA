import { getSeasonPlayers, getSeasonTeamStats, getGameState } from "../store.js";
import {
  normalizeNameKey,
  roundStat,
  buildAiSafetyMetadata,
  getSchoolAnalyticsContext,
  getOurTeamId,
  buildGamesPayload,
} from "./analytics-core.js";

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

export const playerAnalysisCacheBySchool = new Map<string, Map<string, unknown>>();

// ---------------------------------------------------------------------------
// Player analytics builders
// ---------------------------------------------------------------------------

export function buildPlayerAdvancedPayload(schoolId: string, playerName: string) {
  const targetKey = normalizeNameKey(playerName);
  const player = getSeasonPlayers({ schoolId }).find(
    (entry) => normalizeNameKey(entry.name) === targetKey || normalizeNameKey(entry.full_name) === targetKey
  );
  if (!player) return null;

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
      if (!state) return null;
      const ourTeamId = getOurTeamId(state, teamIds);
      const teamStats = state.playerStatsByTeam[ourTeamId] ?? {};
      const combined = playerIds.reduce(
        (acc, playerId) => {
          const stats = teamStats[playerId];
          if (!stats) return acc;
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
      if (!player || !advanced) return null;
      return {
        name: player.full_name,
        basic_stats: {
          ppg: player.ppg, rpg: player.rpg, apg: player.apg, tpg: player.tpg,
          fg_pct: player.fg_pct, fg3_pct: player.fg3_pct, ft_pct: player.ft_pct,
          spg: player.spg, bpg: player.bpg,
        },
        role: advanced.usage_role.role,
        efficiency_grade: advanced.impact.efficiency_grade,
      };
    })
    .filter((player): player is NonNullable<typeof player> => Boolean(player));
  return { players };
}

export function buildPlayerInsightsText(schoolId: string, playerName: string): string | null {
  const player = getSeasonPlayers({ schoolId }).find(
    (entry) =>
      normalizeNameKey(entry.full_name) === normalizeNameKey(playerName) ||
      normalizeNameKey(entry.name) === normalizeNameKey(playerName)
  );
  if (!player) return null;

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
    ai_safety: buildAiSafetyMetadata(analysis),
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


