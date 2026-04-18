import { getSeasonPlayers, getSeasonTeamStats } from "../store.js";
import {
  normalizeNameKey,
  roundStat,
  average,
  standardDeviation,
  buildAiSafetyMetadata,
  buildGamesPayload,
  getSchoolAnalyticsContext,
  type AiSafetyMetadata,
} from "./analytics-core.js";
import { buildPlayerAdvancedPayload } from "./analytics-player.js";

// ---------------------------------------------------------------------------
// Caches (module-level singletons)
// ---------------------------------------------------------------------------

export const seasonAnalysisBySchool = new Map<string, {
  generated_at: string;
  season_summary: string;
  per_game_analysis: unknown[];
  ai_safety: AiSafetyMetadata;
}>();

// ---------------------------------------------------------------------------
// Season / team analytics builders
// ---------------------------------------------------------------------------

export function buildLeaderboardsPayload(schoolId: string) {
  const players = getSeasonPlayers({ schoolId }).map((player) => ({
    ...player,
    first_name: player.first_name || player.name.split(" ")[0] || "Unknown",
  }));
  return {
    pts: [...players].sort((l, r) => r.pts - l.pts).slice(0, 10),
    reb: [...players].sort((l, r) => r.reb - l.reb).slice(0, 10),
    asst: [...players].sort((l, r) => r.asst - l.asst).slice(0, 10),
    fg_pct: players.filter((p) => p.fga > 0).sort((l, r) => r.fg_pct - l.fg_pct).slice(0, 10),
    fg3_pct: players.filter((p) => p.fg3a > 0).sort((l, r) => r.fg3_pct - l.fg3_pct).slice(0, 10),
    ft_pct: players.filter((p) => p.fta > 0).sort((l, r) => r.ft_pct - l.ft_pct).slice(0, 10),
    stl: [...players].sort((l, r) => r.stl - l.stl).slice(0, 10),
    blk: [...players].sort((l, r) => r.blk - l.blk).slice(0, 10),
  };
}

export function buildTeamTrendsPayload(schoolId: string) {
  const { seasonGames } = getSchoolAnalyticsContext(schoolId);
  return {
    games: seasonGames.map((g) => g.gameId),
    opponents: seasonGames.map((g) => g.opponent),
    dates: seasonGames.map((g) => g.date),
    vc_score: seasonGames.map((g) => g.vc_score),
    opp_score: seasonGames.map((g) => g.opp_score),
    fg_pct: seasonGames.map((g) => roundStat(g.team_stats.fga > 0 ? (g.team_stats.fg / g.team_stats.fga) * 100 : 0, 1)),
    fg3_pct: seasonGames.map((g) => roundStat(g.team_stats.fg3a > 0 ? (g.team_stats.fg3 / g.team_stats.fg3a) * 100 : 0, 1)),
    asst: seasonGames.map((g) => g.team_stats.asst),
    to: seasonGames.map((g) => g.team_stats.to),
    reb: seasonGames.map((g) => g.team_stats.reb),
    oreb: seasonGames.map((g) => g.team_stats.oreb),
    dreb: seasonGames.map((g) => g.team_stats.dreb),
    stl: seasonGames.map((g) => g.team_stats.stl),
    blk: seasonGames.map((g) => g.team_stats.blk),
    ft: seasonGames.map((g) => g.team_stats.ft),
    fta: seasonGames.map((g) => g.team_stats.fta),
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
  if (!game) return null;
  const teamStats = (game.team_stats as Record<string, unknown> | undefined) ?? {};
  const fgPct = roundStat(Number(teamStats.fga ?? 0) > 0 ? (Number(teamStats.fg ?? 0) / Number(teamStats.fga ?? 1)) * 100 : 0, 1);
  const fg3Pct = roundStat(Number(teamStats.fg3a ?? 0) > 0 ? (Number(teamStats.fg3 ?? 0) / Number(teamStats.fg3a ?? 1)) * 100 : 0, 1);
  const astTo = roundStat(Number(teamStats.to ?? 0) > 0 ? Number(teamStats.asst ?? 0) / Number(teamStats.to ?? 1) : Number(teamStats.asst ?? 0), 2);
  return [
    `${String(game.opponent ?? "Opponent")} result: ${String(game.result ?? "")} ${Number(game.vc_score ?? 0)}-${Number(game.opp_score ?? 0)}.`,
    `Shooting: ${Number(teamStats.fg ?? 0)}-${Number(teamStats.fga ?? 0)} FG (${fgPct}%), ${Number(teamStats.fg3 ?? 0)}-${Number(teamStats.fg3a ?? 0)} from 3 (${fg3Pct}%).`,
    `Possession metrics: ${Number(teamStats.asst ?? 0)} assists, ${Number(teamStats.to ?? 0)} turnovers, AST/TO ${astTo}.`,
    `Rebounding: ${Number(teamStats.oreb ?? 0)} offensive, ${Number(teamStats.dreb ?? 0)} defensive.`,
  ].join(" ");
}

export function buildComprehensiveInsightsPayload(schoolId: string) {
  const seasonStats = getSeasonTeamStats({ schoolId });
  const trends = buildTeamTrendsPayload(schoolId);
  const recentScores = trends.vc_score.slice(-5);
  const earlyScores = trends.vc_score.slice(0, Math.min(5, trends.vc_score.length));
  const recentAllowed = trends.opp_score.slice(-5);
  const earlyAllowed = trends.opp_score.slice(0, Math.min(5, trends.opp_score.length));
  const recentWins = trends.vc_score.slice(-5).filter((score, index) => score > (trends.opp_score.slice(-5)[index] ?? 0)).length;
  const recentLosses = Math.max(Math.min(5, trends.games.length) - recentWins, 0);
  const recentAvgScore = average(recentScores);
  const recentAvgAllowed = average(recentAllowed);
  const earlyAvgScore = average(earlyScores);
  const earlyAvgAllowed = average(earlyAllowed);
  const players = getSeasonPlayers({ schoolId }).slice(0, 12);

  const payload = {
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
      win_pct: roundStat(seasonStats.win + seasonStats.loss > 0 ? (seasonStats.win / (seasonStats.win + seasonStats.loss)) * 100 : 0, 1),
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

  return { ...payload, ai_safety: buildAiSafetyMetadata(payload) };
}

export function buildSeasonAnalysisPayload(
  schoolId: string,
  force = false
): { generated_at: string; season_summary: string; per_game_analysis: unknown[]; ai_safety: AiSafetyMetadata } {
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
      const fgMade = p.fg_made ?? 0; const fgAtt = p.fg_att ?? 0;
      const fg3Made = p.fg3_made ?? 0; const fg3Att = p.fg3_att ?? 0;
      const ftMade = p.ft_made ?? 0; const ftAtt = p.ft_att ?? 0;
      return {
        rank: idx + 1, name: p.name, pts: p.pts ?? 0,
        fg: `${fgMade}/${fgAtt}`, fg_pct: fgAtt > 0 ? (fgMade / fgAtt) * 100 : 0,
        fg3: `${fg3Made}/${fg3Att}`, fg3_pct: fg3Att > 0 ? (fg3Made / fg3Att) * 100 : 0,
        ft: `${ftMade}/${ftAtt}`, ft_pct: ftAtt > 0 ? (ftMade / ftAtt) * 100 : 0,
        reb: (p.oreb ?? 0) + (p.dreb ?? 0), asst: p.asst ?? 0,
        season_ppg: seasonPpg, diff, indicator: diff > 1 ? "↑" : diff < -1 ? "↓" : "→",
      };
    });
    const twoFgMade = ts.fg - ts.fg3; const twoFgAtt = ts.fga - ts.fg3a;
    const analysis =
      `FG: ${fgPct.toFixed(1)}%, 3PT: ${fg3Pct.toFixed(1)}%, FT: ${ftPct.toFixed(1)}%. ` +
      `AST: ${ts.asst}, TO: ${ts.to}, STL: ${ts.stl ?? 0}, REB: ${ts.reb}. ` +
      (playerPerfs.length > 0
        ? `Leaders: ${playerPerfs.slice(0, 3).map((p) => `${p.name} ${p.pts}pts`).join(", ")}.`
        : "No player data recorded.");
    return {
      game: game.gameId, opponent: game.opponent, date: game.date,
      score: `${game.vc_score}-${game.opp_score}`, result: game.result,
      shooting: { "2pt": `${twoFgMade}/${twoFgAtt}`, "3pt": `${ts.fg3}/${ts.fg3a}`, ft: `${ts.ft}/${ts.fta}` },
      player_performances: playerPerfs, analysis,
    };
  });

  const gamesPlayed = Math.max(seasonStats.win + seasonStats.loss, 1);
  const winPct = Math.round((seasonStats.win / gamesPlayed) * 100);
  const summary =
    `Season Record: ${seasonStats.win}-${seasonStats.loss} (${winPct}% win rate). ` +
    `Scoring: ${seasonStats.ppg.toFixed(1)} PPG. ` +
    `FG: ${seasonStats.fg_pct.toFixed(1)}%, 3PT: ${seasonStats.fg3_pct.toFixed(1)}%, FT: ${seasonStats.ft_pct.toFixed(1)}%. ` +
    `${games.length} games played. ${seasonStats.win >= seasonStats.loss ? "Positive" : "Below .500"} season trajectory.`;

  const result = {
    generated_at: new Date().toISOString(),
    season_summary: summary,
    per_game_analysis: perGameAnalysis,
    ai_safety: buildAiSafetyMetadata({ season_summary: summary, per_game_analysis: perGameAnalysis }),
  };
  seasonAnalysisBySchool.set(schoolId, result);
  return result;
}
