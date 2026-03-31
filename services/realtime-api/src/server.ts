import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "node:http";
import path from "path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  normalizeTeamColor,
  sanitizePromptText,
} from "@bta/shared-schema";
import {
  answerGameAiChat,
  type CoachAiChatResponse,
  type AiPromptPreview,
  type GameAiContext,
  type CoachAiSettings,
  type RosterPlayer,
  type RosterTeam,
  createGame,
  deleteGame,
  deleteEvent,
  getGameAiContext,
  getGameAiPromptPreview,
  getGameAiSettings,
  getGameEvents,
  getGameInsights,
  getLiveContext,
  getRosterPlayers,
  getRosterTeamsByScope,
  getSeasonGames,
  getSeasonPlayers,
  getSeasonTeamStats,
  getGameState,
  ingestEvent,
  patchGameLineup,
  refreshGameAiInsights,
  saveRosterTeams,
  updateGameAiContext,
  updateGameAiSettings,
  updateEvent,
  resetAllData,
  initializeStore
} from "./store.js";
import {
  extractBearerToken,
  isJwtAuthEnabled,
  verifyBearerToken,
  type AuthContext
} from "./auth.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS whitelist: allow only known app origins + stats dashboard
const ALLOWED_ORIGINS = [
  "http://localhost:5173",      // iPad operator dev
  "http://localhost:5174",      // Coach dashboard dev
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];
const PROD_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);
if (PROD_ORIGINS.length > 0) ALLOWED_ORIGINS.push(...PROD_ORIGINS);

app.use(cors({
  origin: (origin, callback) => {
    // In development, allow localhost variants; in production use whitelist
    if (process.env.NODE_ENV !== "production") {
      callback(null, true);
    } else if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true
}));
app.use(express.json());

// Simple rate limiter: per-IP event submission limit (100 events per minute)
const rateLimitByIp = new Map<string, { count: number; resetAt: number }>();
function createRateLimitMiddleware(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.ip || req.socket.remoteAddress || "unknown").split(":").pop() || "unknown";
    const now = Date.now();
    const limit = rateLimitByIp.get(ip) ?? { count: 0, resetAt: now + windowMs };

    if (now > limit.resetAt) {
      limit.count = 0;
      limit.resetAt = now + windowMs;
    }

    if (limit.count >= maxRequests) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    limit.count++;
    rateLimitByIp.set(ip, limit);
    next();
  };
}
const eventRateLimiter = createRateLimitMiddleware(100, 60000); // 100 events/min per IP
const TEAM_AI_FOCUS_OPTIONS = new Set<CoachAiSettings["focusInsights"][number]>([
  "timeouts",
  "substitutions",
  "foul_management",
  "momentum",
  "shot_selection",
  "ball_security",
  "hot_hand",
  "defense"
]);

function normalizePersonName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeNameKey(value: unknown): string {
  return normalizePersonName(value).toLowerCase();
}

function buildTeamAbbreviation(name: string): string {
  const compact = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return compact.slice(0, 4) || "TEAM";
}

function defaultTeamAiSettings(): CoachAiSettings {
  return {
    playingStyle: "",
    teamContext: "",
    customPrompt: "",
    focusInsights: [
      "timeouts",
      "substitutions",
      "foul_management",
      "momentum",
      "shot_selection",
      "ball_security",
      "hot_hand",
      "defense"
    ]
  };
}

function sanitizeTextField(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function sanitizeFocusInsights(value: unknown): CoachAiSettings["focusInsights"] {
  if (!Array.isArray(value)) {
    return defaultTeamAiSettings().focusInsights;
  }

  const normalized = [...new Set(value
    .map((item) => String(item).trim().toLowerCase())
    .filter((item): item is CoachAiSettings["focusInsights"][number] => TEAM_AI_FOCUS_OPTIONS.has(item as CoachAiSettings["focusInsights"][number])))];

  return normalized.length > 0 ? normalized : defaultTeamAiSettings().focusInsights;
}

function extractTeamAiSettings(team?: RosterTeam | null): CoachAiSettings {
  const defaults = defaultTeamAiSettings();
  return {
    playingStyle: sanitizeTextField(team?.playingStyle, 500) || defaults.playingStyle,
    teamContext: sanitizeTextField(team?.teamContext, 1200) || defaults.teamContext,
    customPrompt: sanitizeTextField(team?.customPrompt, 1200) || defaults.customPrompt,
    focusInsights: sanitizeFocusInsights(team?.focusInsights)
  };
}

function buildPlayerId(teamId: string, playerName: string): string {
  const slug = normalizeNameKey(playerName).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${teamId}-${slug || Date.now().toString()}`;
}

function buildRosterPlayer(input: Record<string, unknown>, teamId: string, existingPlayer?: RosterPlayer): RosterPlayer | null {
  const name = normalizePersonName(input.name ?? existingPlayer?.name);
  if (!name) {
    return null;
  }

  return {
    id: existingPlayer?.id ?? buildPlayerId(teamId, name),
    number: sanitizeTextField(input.number ?? existingPlayer?.number, 8),
    name,
    position: sanitizeTextField(input.position ?? existingPlayer?.position, 24),
    height: sanitizeTextField(input.height ?? existingPlayer?.height, 32) || undefined,
    grade: sanitizeTextField(input.grade ?? existingPlayer?.grade, 16) || undefined,
    role: sanitizeTextField(input.role ?? existingPlayer?.role, 80) || undefined,
    notes: sanitizeTextField(input.notes ?? existingPlayer?.notes, 240) || undefined
  };
}

function persistSchoolTeams(schoolId: string, teams: RosterTeam[]): RosterTeam[] {
  const saved = saveRosterTeams(teams, { schoolId });
  io.to(schoolRoom(schoolId)).emit("roster:teams", saved);
  return saved;
}

function getPrimaryTeam(schoolId: string): { teams: RosterTeam[]; team: RosterTeam | null } {
  const teams = getRosterTeamsByScope({ schoolId });
  return { teams, team: teams[0] ?? null };
}

function upsertPrimaryTeam(schoolId: string, payload: Record<string, unknown>): RosterTeam[] {
  const { teams, team } = getPrimaryTeam(schoolId);
  const name = sanitizeTextField(payload.name ?? team?.name ?? "Team", 120) || "Team";
  const nextTeam: RosterTeam = {
    id: team?.id ?? "primary-team",
    schoolId,
    name,
    abbreviation: sanitizeTextField(payload.abbreviation ?? team?.abbreviation ?? buildTeamAbbreviation(name), 12) || buildTeamAbbreviation(name),
    season: sanitizeTextField(payload.season ?? team?.season, 40) || undefined,
    teamColor: normalizeTeamColor(payload.teamColor ?? team?.teamColor),
    coachStyle: sanitizeTextField(payload.coachStyle ?? team?.coachStyle, 500) || undefined,
    playingStyle: sanitizeTextField(payload.playingStyle ?? team?.playingStyle, 500) || undefined,
    teamContext: sanitizeTextField(payload.teamContext ?? team?.teamContext, 1200) || undefined,
    customPrompt: sanitizeTextField(payload.customPrompt ?? team?.customPrompt, 1200) || undefined,
    focusInsights: payload.focusInsights !== undefined ? sanitizeFocusInsights(payload.focusInsights) : team?.focusInsights,
    players: team?.players ?? []
  };

  return persistSchoolTeams(schoolId, [nextTeam, ...teams.slice(1)]);
}

function findPlayerRecord(teams: RosterTeam[], playerName: string): { team: RosterTeam; player: RosterPlayer; playerIndex: number; teamIndex: number } | null {
  const targetKey = normalizeNameKey(playerName);
  for (const [teamIndex, team] of teams.entries()) {
    const playerIndex = team.players.findIndex((player) => normalizeNameKey(player.name) === targetKey);
    if (playerIndex >= 0) {
      return { team, player: team.players[playerIndex]!, playerIndex, teamIndex };
    }
  }

  return null;
}


interface GameEditOverride {
  gameId: string;
  date: string;
  opponent: string;
  location: "home" | "away" | "neutral";
  vc_score: number;
  opp_score: number;
  result: "W" | "L" | "T";
  team_stats: {
    fg: number;
    fga: number;
    fg3: number;
    fg3a: number;
    ft: number;
    fta: number;
    oreb: number;
    dreb: number;
    reb: number;
    asst: number;
    to: number;
    stl: number;
    blk: number;
    fouls: number;
  };
  player_stats: Array<Record<string, unknown>>;
  updatedAtIso: string;
}

const gameOverridesBySchool = new Map<string, Map<string, GameEditOverride>>();
const seasonAnalysisBySchool = new Map<string, { generated_at: string; season_summary: string; per_game_analysis: unknown[] }>();
const playerAnalysisCacheBySchool = new Map<string, Map<string, unknown>>();

function roundStat(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function resolveGameResult(vcScore: number, oppScore: number): "W" | "L" | "T" {
  if (vcScore > oppScore) {
    return "W";
  }
  if (vcScore < oppScore) {
    return "L";
  }
  return "T";
}

function getGameOverrideMap(schoolId: string): Map<string, GameEditOverride> {
  const existing = gameOverridesBySchool.get(schoolId);
  if (existing) {
    return existing;
  }

  const created = new Map<string, GameEditOverride>();
  gameOverridesBySchool.set(schoolId, created);
  return created;
}

function getRosterPlayerByIdForSchool(schoolId: string): Map<string, { name: string; number?: string }> {
  const map = new Map<string, { name: string; number?: string }>();
  for (const team of getRosterTeamsByScope({ schoolId })) {
    for (const player of team.players) {
      map.set(player.id, { name: player.name, number: player.number });
    }
  }
  return map;
}

function buildDefaultGamePlayerStats(schoolId: string, gameId: string): Array<Record<string, unknown>> {
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
      pts: stats.points
    };
  });
}

function buildGamesPayload(schoolId: string): Array<Record<string, unknown>> {
  const overrides = getGameOverrideMap(schoolId);
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
      player_stats: buildDefaultGamePlayerStats(schoolId, game.gameId)
    };

    const override = overrides.get(game.gameId);
    if (!override) {
      return base;
    }

    return {
      ...base,
      ...override
    };
  });
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

function getSchoolAnalyticsContext(schoolId: string) {
  const teams = getRosterTeamsByScope({ schoolId });
  const teamIds = new Set(teams.map((team) => team.id));
  const seasonGames = getSeasonGames({ schoolId })
    .slice()
    .sort((left, right) => Number(left.gameId) - Number(right.gameId));
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

function getOurTeamId(state: NonNullable<ReturnType<typeof getGameState>>, teamIds: Set<string>): string {
  if (teamIds.has(state.homeTeamId)) {
    return state.homeTeamId;
  }

  if (teamIds.has(state.awayTeamId)) {
    return state.awayTeamId;
  }

  return state.homeTeamId;
}

function buildLeaderboardsPayload(schoolId: string) {
  const players = getSeasonPlayers({ schoolId }).map((player) => ({
    ...player,
    first_name: player.first_name || player.name.split(" ")[0] || "Unknown"
  }));

  return {
    pts: [...players].sort((left, right) => right.pts - left.pts).slice(0, 10),
    reb: [...players].sort((left, right) => right.reb - left.reb).slice(0, 10),
    asst: [...players].sort((left, right) => right.asst - left.asst).slice(0, 10),
    fg_pct: players.filter((player) => player.fga > 0).sort((left, right) => right.fg_pct - left.fg_pct).slice(0, 10),
    fg3_pct: players.filter((player) => player.fg3a > 0).sort((left, right) => right.fg3_pct - left.fg3_pct).slice(0, 10),
    ft_pct: players.filter((player) => player.fta > 0).sort((left, right) => right.ft_pct - left.ft_pct).slice(0, 10),
    stl: [...players].sort((left, right) => right.stl - left.stl).slice(0, 10),
    blk: [...players].sort((left, right) => right.blk - left.blk).slice(0, 10)
  };
}

function buildTeamTrendsPayload(schoolId: string) {
  const { seasonGames } = getSchoolAnalyticsContext(schoolId);
  return {
    games: seasonGames.map((game) => game.gameId),
    opponents: seasonGames.map((game) => game.opponent),
    dates: seasonGames.map((game) => game.date),
    vc_score: seasonGames.map((game) => game.vc_score),
    opp_score: seasonGames.map((game) => game.opp_score),
    fg_pct: seasonGames.map((game) => roundStat((game.team_stats.fga > 0 ? (game.team_stats.fg / game.team_stats.fga) * 100 : 0), 1)),
    fg3_pct: seasonGames.map((game) => roundStat((game.team_stats.fg3a > 0 ? (game.team_stats.fg3 / game.team_stats.fg3a) * 100 : 0), 1)),
    asst: seasonGames.map((game) => game.team_stats.asst),
    to: seasonGames.map((game) => game.team_stats.to),
    reb: seasonGames.map((game) => game.team_stats.reb),
    oreb: seasonGames.map((game) => game.team_stats.oreb),
    dreb: seasonGames.map((game) => game.team_stats.dreb),
    stl: seasonGames.map((game) => game.team_stats.stl),
    blk: seasonGames.map((game) => game.team_stats.blk),
    ft: seasonGames.map((game) => game.team_stats.ft),
    fta: seasonGames.map((game) => game.team_stats.fta)
  };
}

function buildTeamAdvancedPayload(schoolId: string) {
  const seasonStats = getSeasonTeamStats({ schoolId });
  const gamesPlayed = Math.max(seasonStats.win + seasonStats.loss, 1);
  const totalPoints = seasonStats.ppg * gamesPlayed;
  const possessions = Math.max(seasonStats.fga - seasonStats.oreb + seasonStats.to + (0.44 * seasonStats.fta), 1);
  const efgPct = seasonStats.fga > 0 ? ((seasonStats.fg + 0.5 * seasonStats.fg3) / seasonStats.fga) * 100 : 0;
  const tsPct = (seasonStats.fga > 0 || seasonStats.fta > 0)
    ? (totalPoints / (2 * Math.max(seasonStats.fga + (0.44 * seasonStats.fta), 1))) * 100
    : 0;

  return {
    scoring_efficiency: {
      efg_pct: roundStat(efgPct, 1),
      ts_pct: roundStat(tsPct, 1),
      ppp: roundStat(totalPoints / possessions, 2)
    },
    ball_movement: {
      assisted_scoring_rate: roundStat(seasonStats.fg > 0 ? (seasonStats.asst / seasonStats.fg) * 100 : 0, 1)
    }
  };
}

function buildPlayerAdvancedPayload(schoolId: string, playerName: string) {
  const targetKey = normalizeNameKey(playerName);
  const player = getSeasonPlayers({ schoolId }).find((entry) => normalizeNameKey(entry.name) === targetKey || normalizeNameKey(entry.full_name) === targetKey);
  if (!player) {
    return null;
  }

  const efgPct = player.fga > 0 ? ((player.fg + 0.5 * player.fg3) / player.fga) * 100 : 0;
  const tsPct = (player.fga > 0 || player.fta > 0)
    ? (player.pts / (2 * Math.max(player.fga + (0.44 * player.fta), 1))) * 100
    : 0;
  const pointsPerShot = player.fga > 0 ? player.pts / player.fga : 0;
  const totalUsage = Math.max(player.fga + player.fta + player.to, 1);
  const seasonTotals = getSeasonTeamStats({ schoolId });
  const gamesPlayed = Math.max(seasonTotals.win + seasonTotals.loss, 1);
  const totalTeamPoints = seasonTotals.ppg * gamesPlayed;
  const totalTeamShots = Math.max(seasonTotals.fga + seasonTotals.fta + seasonTotals.to, 1);
  const per = roundStat((player.ppg * 1.5) + (player.rpg * 1.2) + (player.apg * 1.5) + (player.spg * 2) + (player.bpg * 2) - player.tpg, 1);
  const usageProxy = roundStat((totalUsage / totalTeamShots) * 100, 1);
  const scoringShare = roundStat(totalTeamPoints > 0 ? (player.pts / totalTeamPoints) * 100 : 0, 1);
  const shotVolumeShare = roundStat(seasonTotals.fga > 0 ? (player.fga / seasonTotals.fga) * 100 : 0, 1);
  const toRate = roundStat(totalUsage > 0 ? (player.to / totalUsage) * 100 : 0, 1);
  const astToRatio = roundStat(player.to > 0 ? player.asst / player.to : player.asst, 1);
  const reboundShare = roundStat(seasonTotals.reb > 0 ? (player.reb / seasonTotals.reb) * 100 : 0, 1);
  const defensiveRating = roundStat(100 - (player.spg * 6) - (player.bpg * 5) + (player.fpg * 2), 1);
  const efficiencyGrade = per >= 20 ? "A" : per >= 15 ? "B" : per >= 10 ? "C" : "D";

  return {
    scoring_efficiency: {
      per,
      efg_pct: roundStat(efgPct, 1),
      ts_pct: roundStat(tsPct, 1),
      pts_per_shot: roundStat(pointsPerShot, 2),
      fg2_pct: roundStat((player.fga - player.fg3a) > 0 ? ((player.fg - player.fg3) / Math.max(player.fga - player.fg3a, 1)) * 100 : 0, 1),
      fg3_pct: roundStat(player.fg3_pct, 1)
    },
    usage_role: {
      role: usageProxy >= 22 ? "Primary option" : usageProxy >= 14 ? "Secondary option" : "Role player",
      usage_proxy: usageProxy,
      scoring_share: scoringShare,
      shot_volume_share: shotVolumeShare,
      to_rate: toRate
    },
    ball_handling: {
      apg: roundStat(player.apg, 1),
      tpg: roundStat(player.tpg, 1),
      ast_to_ratio: astToRatio,
      total_assists: player.asst,
      total_turnovers: player.to
    },
    rebounding: {
      rpg: roundStat(player.rpg, 1),
      oreb: player.oreb,
      dreb: player.dreb,
      reb_share: reboundShare
    },
    defense_activity: {
      spg: roundStat(player.spg, 1),
      bpg: roundStat(player.bpg, 1),
      defensive_rating: defensiveRating,
      deflections_per_game: roundStat(player.spg + player.bpg, 1)
    },
    discipline: {
      fouls_per_game: roundStat(player.fpg, 1),
      foul_rate: roundStat(player.games > 0 ? player.fouls / player.games : 0, 1)
    },
    consistency: {
      games_played: player.games,
      scoring_baseline: roundStat(player.ppg, 1)
    },
    clutch_performance: {
      clutch_score: roundStat(player.ppg + player.apg - player.tpg, 1)
    },
    impact: {
      total_points: player.pts,
      total_rebounds: player.reb,
      total_assists: player.asst,
      efficiency_grade: efficiencyGrade
    }
  };
}

function buildPlayerTrendsPayload(schoolId: string, playerName: string) {
  const { teamIds, seasonGames, playerIdsByName } = getSchoolAnalyticsContext(schoolId);
  const playerIds = playerIdsByName.get(normalizeNameKey(playerName)) ?? [];
  const trendRows = seasonGames.map((game) => {
    const state = getGameState(game.gameId, { schoolId });
    if (!state) {
      return null;
    }

    const ourTeamId = getOurTeamId(state, teamIds);
    const teamStats = state.playerStatsByTeam[ourTeamId] ?? {};
    const combined = playerIds.reduce((acc, playerId) => {
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
    }, {
      points: 0,
      fgMade: 0,
      fgAttempts: 0,
      fg3Made: 0,
      assists: 0,
      rebounds: 0,
      steals: 0,
      turnovers: 0,
      fouls: 0
    });

    return {
      gameId: game.gameId,
      opponent: game.opponent,
      date: game.date,
      stats: combined
    };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));

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
    fouls: trendRows.map((row) => row.stats.fouls)
  };
}

function buildPlayerComparisonPayload(schoolId: string, playerNames: string[]) {
  const players = playerNames
    .map((playerName) => {
      const player = getSeasonPlayers({ schoolId }).find((entry) => normalizeNameKey(entry.name) === normalizeNameKey(playerName) || normalizeNameKey(entry.full_name) === normalizeNameKey(playerName));
      const advanced = buildPlayerAdvancedPayload(schoolId, playerName);
      if (!player || !advanced) {
        return null;
      }

      const efficiencyGrade = advanced.impact.efficiency_grade;
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
          bpg: player.bpg
        },
        role: advanced.usage_role.role,
        efficiency_grade: efficiencyGrade
      };
    })
    .filter((player): player is NonNullable<typeof player> => Boolean(player));

  return { players };
}

function buildVolatilityPayload(schoolId: string) {
  const trends = buildTeamTrendsPayload(schoolId);
  return {
    team_volatility: {
      ppg_range: roundStat((Math.max(...trends.vc_score, 0) - Math.min(...trends.vc_score, 0)), 1),
      fg_pct_std_dev: roundStat(standardDeviation(trends.fg_pct), 1),
      to_std_dev: roundStat(standardDeviation(trends.to), 1)
    }
  };
}

function buildComprehensiveInsightsPayload(schoolId: string) {
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

  return {
    team_trends: {
      recent_performance: {
        record: `${recentWins}-${recentLosses}`,
        avg_score: roundStat(recentAvgScore, 1),
        point_differential: roundStat(recentAvgScore - recentAvgAllowed, 1),
        trend: recentAvgScore >= earlyAvgScore ? "up" : "down"
      },
      scoring_trends: {
        recent_avg: roundStat(recentAvgScore, 1),
        early_avg: roundStat(earlyAvgScore, 1),
        improvement: roundStat(recentAvgScore - earlyAvgScore, 1),
        trend: recentAvgScore >= earlyAvgScore ? "improving" : "declining"
      },
      defensive_trends: {
        recent_avg_allowed: roundStat(recentAvgAllowed, 1),
        early_avg_allowed: roundStat(earlyAvgAllowed, 1),
        improvement: roundStat(earlyAvgAllowed - recentAvgAllowed, 1),
        trend: recentAvgAllowed <= earlyAvgAllowed ? "improving" : "declining"
      }
    },
    key_metrics: {
      win_pct: roundStat((seasonStats.win + seasonStats.loss) > 0 ? (seasonStats.win / (seasonStats.win + seasonStats.loss)) * 100 : 0, 1),
      fg_pct: roundStat(seasonStats.fg_pct, 1),
      fg3_pct: roundStat(seasonStats.fg3_pct, 1),
      apg: roundStat(seasonStats.apg, 1),
      tpg: roundStat(seasonStats.to_avg, 1)
    },
    recommendations: [
      {
        category: "Ball Security",
        priority: seasonStats.to_avg >= 12 ? "High" : "Medium",
        recommendation: seasonStats.to_avg >= 12 ? "Reduce live-ball turnovers to stabilize offensive efficiency." : "Keep turnover discipline steady to preserve scoring margin.",
        reason: `Season turnover average is ${roundStat(seasonStats.to_avg, 1)} per game.`
      },
      {
        category: "Shot Quality",
        priority: seasonStats.fg3_pct >= 34 ? "Medium" : "High",
        recommendation: seasonStats.fg3_pct >= 34 ? "Maintain current 3-point volume while protecting paint touches." : "Prioritize rim and paint creation until perimeter efficiency improves.",
        reason: `Season 3-point percentage is ${roundStat(seasonStats.fg3_pct, 1)}%.`
      }
    ],
    player_insights: players.map((player) => {
      const advanced = buildPlayerAdvancedPayload(schoolId, player.full_name);
      return {
        name: player.full_name,
        role: advanced?.usage_role.role ?? "Role player",
        strengths: [
          player.ppg >= 10 ? "Reliable scoring" : "Low-mistake offense",
          player.apg >= 3 ? "Playmaking" : "Lineup stability",
          player.fg_pct >= 45 ? "Efficient finishing" : "Shot selection discipline"
        ],
        areas_for_improvement: [
          player.tpg >= 2 ? "Turnover control" : "Create more rim pressure",
          player.ft_pct < 70 ? "Free-throw consistency" : "Increase assertiveness"
        ],
        efficiency_grade: advanced?.impact.efficiency_grade ?? "C"
      };
    })
  };
}

function buildTeamSummaryText(schoolId: string): string {
  const season = getSeasonTeamStats({ schoolId });
  const games = buildGamesPayload(schoolId);
  const lastGame = games[games.length - 1] as Record<string, unknown> | undefined;
  const recentRecord = games.slice(-5).reduce<{ wins: number; losses: number }>((acc, game) => {
    const result = String((game as Record<string, unknown>).result ?? "");
    if (result === "W") acc.wins += 1;
    if (result === "L") acc.losses += 1;
    return acc;
  }, { wins: 0, losses: 0 });

  return [
    `Season record: ${season.win}-${season.loss}.`,
    `Scoring profile: ${roundStat(season.ppg, 1)} PPG for, ${roundStat(season.opp_ppg, 1)} allowed.`,
    `Efficiency: FG ${roundStat(season.fg_pct, 1)}%, 3PT ${roundStat(season.fg3_pct, 1)}%, FT ${roundStat(season.ft_pct, 1)}%.`,
    `Ball security: ${roundStat(season.to_avg, 1)} turnovers per game.`,
    `Recent form (last 5): ${recentRecord.wins}-${recentRecord.losses}.`,
    lastGame
      ? `Most recent game: ${String(lastGame.opponent ?? "Opponent")} ${String(lastGame.result ?? "")} ${Number(lastGame.vc_score ?? 0)}-${Number(lastGame.opp_score ?? 0)}.`
      : "No games logged yet."
  ].join(" ");
}

function buildGameAnalysisText(schoolId: string, gameId: string): string | null {
  const game = buildGamesPayload(schoolId).find((entry) => String(entry.gameId) === String(gameId)) as Record<string, unknown> | undefined;
  if (!game) {
    return null;
  }

  const teamStats = (game.team_stats as Record<string, unknown> | undefined) ?? {};
  const fgPct = roundStat(Number(teamStats.fga ?? 0) > 0 ? (Number(teamStats.fg ?? 0) / Number(teamStats.fga ?? 1)) * 100 : 0, 1);
  const fg3Pct = roundStat(Number(teamStats.fg3a ?? 0) > 0 ? (Number(teamStats.fg3 ?? 0) / Number(teamStats.fg3a ?? 1)) * 100 : 0, 1);
  const astTo = roundStat(Number(teamStats.to ?? 0) > 0 ? Number(teamStats.asst ?? 0) / Number(teamStats.to ?? 1) : Number(teamStats.asst ?? 0), 2);

  return [
    `${String(game.opponent ?? "Opponent")} result: ${String(game.result ?? "")} ${Number(game.vc_score ?? 0)}-${Number(game.opp_score ?? 0)}.`,
    `Shooting: ${Number(teamStats.fg ?? 0)}-${Number(teamStats.fga ?? 0)} FG (${fgPct}%), ${Number(teamStats.fg3 ?? 0)}-${Number(teamStats.fg3a ?? 0)} from 3 (${fg3Pct}%).`,
    `Possession metrics: ${Number(teamStats.asst ?? 0)} assists, ${Number(teamStats.to ?? 0)} turnovers, AST/TO ${astTo}.`,
    `Rebounding: ${Number(teamStats.oreb ?? 0)} offensive, ${Number(teamStats.dreb ?? 0)} defensive.`
  ].join(" ");
}

function buildPlayerInsightsText(schoolId: string, playerName: string): string | null {
  const player = getSeasonPlayers({ schoolId }).find((entry) => normalizeNameKey(entry.full_name) === normalizeNameKey(playerName) || normalizeNameKey(entry.name) === normalizeNameKey(playerName));
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
    `Coaching focus: ${focus.join(", ")}.`
  ].join(" ");
}

function buildSeasonAnalysisPayload(schoolId: string, force = false): { generated_at: string; season_summary: string; per_game_analysis: unknown[] } {
  if (!force) {
    const cached = seasonAnalysisBySchool.get(schoolId);
    if (cached) return cached;
  }

  const games = buildGamesPayload(schoolId);
  const seasonStats = getSeasonTeamStats({ schoolId });
  const seasonPlayers = getSeasonPlayers({ schoolId });

  const perGameAnalysis = games.map((game) => {
    const ts = game.team_stats as { fg: number; fga: number; fg3: number; fg3a: number; ft: number; fta: number; asst: number; to: number; stl: number; reb: number };
    const playerStats = (game.player_stats ?? []) as Array<{ name: string; fg_made: number; fg_att: number; fg3_made: number; fg3_att: number; ft_made: number; ft_att: number; oreb: number; dreb: number; asst: number; pts: number }>;
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
    const analysis = `FG: ${fgPct.toFixed(1)}%, 3PT: ${fg3Pct.toFixed(1)}%, FT: ${ftPct.toFixed(1)}%. `
      + `AST: ${ts.asst}, TO: ${ts.to}, STL: ${ts.stl ?? 0}, REB: ${ts.reb}. `
      + (playerPerfs.length > 0 ? `Leaders: ${playerPerfs.slice(0, 3).map((p) => `${p.name} ${p.pts}pts`).join(", ")}.` : "No player data recorded.");

    return {
      game: game.gameId,
      opponent: game.opponent,
      date: game.date,
      score: `${game.vc_score}-${game.opp_score}`,
      result: game.result,
      shooting: {
        "2pt": `${twoFgMade}/${twoFgAtt}`,
        "3pt": `${ts.fg3}/${ts.fg3a}`,
        "ft": `${ts.ft}/${ts.fta}`,
      },
      player_performances: playerPerfs,
      analysis,
    };
  });

  const gamesPlayed = Math.max(seasonStats.win + seasonStats.loss, 1);
  const winPct = Math.round(seasonStats.win / gamesPlayed * 100);
  const summary = `Season Record: ${seasonStats.win}-${seasonStats.loss} (${winPct}% win rate). `
    + `Scoring: ${seasonStats.ppg.toFixed(1)} PPG. `
    + `FG: ${seasonStats.fg_pct.toFixed(1)}%, 3PT: ${seasonStats.fg3_pct.toFixed(1)}%, FT: ${seasonStats.ft_pct.toFixed(1)}%. `
    + `${games.length} games played. ${seasonStats.win >= seasonStats.loss ? "Positive" : "Below .500"} season trajectory.`;

  const result = { generated_at: new Date().toISOString(), season_summary: summary, per_game_analysis: perGameAnalysis };
  seasonAnalysisBySchool.set(schoolId, result);
  return result;
}

function buildPlayerAnalysisPayload(schoolId: string, playerName: string): unknown | null {
  const player = getSeasonPlayers({ schoolId }).find(
    (p) => normalizeNameKey(p.name) === normalizeNameKey(playerName) || normalizeNameKey(p.full_name) === normalizeNameKey(playerName)
  );
  if (!player) return null;

  const games = buildGamesPayload(schoolId);
  const gameLogs = games
    .map((g) => {
      const ps = (g.player_stats as Array<{ name: string; pts: number; oreb: number; dreb: number; asst: number }> ?? [])
        .find((p) => normalizeNameKey(p.name) === normalizeNameKey(playerName));
      return ps ? { pts: ps.pts ?? 0, reb: (ps.oreb ?? 0) + (ps.dreb ?? 0), asst: ps.asst ?? 0 } : null;
    })
    .filter((x): x is { pts: number; reb: number; asst: number } => x !== null);

  const ptsList = gameLogs.map((g) => g.pts);
  const recentPpg = ptsList.length >= 3 ? ptsList.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, ptsList.length) : player.ppg;

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
    ptsList.length > 0 ? `Recent form (last 3): ${recentPpg.toFixed(1)} PPG. Range: ${Math.min(...ptsList)}-${Math.max(...ptsList)} pts.` : "",
  ].filter(Boolean).join(" ");

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

// ---------------------------------------------------------------------------
// Optional API-key auth. Set BTA_API_KEY env var to enable.
// ---------------------------------------------------------------------------
const API_KEY = process.env.BTA_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const DEFAULT_SCHOOL_ID = "default";

type AuthedRequest = Request & { authContext?: AuthContext };

function normalizeSchoolId(input: unknown): string {
  if (typeof input !== "string") {
    return DEFAULT_SCHOOL_ID;
  }

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return DEFAULT_SCHOOL_ID;
  }

  return trimmed.replace(/[^a-z0-9_-]/g, "").slice(0, 64) || DEFAULT_SCHOOL_ID;
}

function getSchoolIdFromRequest(req: Request): string {
  const authedReq = req as AuthedRequest;
  return normalizeSchoolId(authedReq.authContext?.schoolId ?? req.headers["x-school-id"] ?? req.query.schoolId);
}

function getSchoolIdFromSocket(socket: {
  handshake: { auth?: unknown; headers?: Record<string, unknown> };
  data?: { authContext?: AuthContext };
}): string {
  const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
  const schoolHeader = socket.handshake.headers?.["x-school-id"];
  return normalizeSchoolId(socket.data?.authContext?.schoolId ?? auth.schoolId ?? schoolHeader);
}

function schoolRoom(schoolId: string): string {
  return `school:${schoolId}`;
}

function gameRoom(schoolId: string, gameId: string): string {
  return `school:${schoolId}:game:${gameId}`;
}

function deviceRoom(schoolId: string, deviceId: string): string {
  return `school:${schoolId}:device:${deviceId}`;
}

async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authedReq = req as AuthedRequest;
  if (isJwtAuthEnabled()) {
    const token = extractBearerToken(req.headers, undefined);
    if (token) {
      const authContext = await verifyBearerToken(token);
      if (authContext) {
        authedReq.authContext = authContext;
        next();
        return;
      }
    }
  }

  if (!API_KEY && !isJwtAuthEnabled()) {
    next();
    return;
  }

  const provided = req.headers["x-api-key"] ?? req.query.apiKey;
  if (API_KEY && provided === API_KEY) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized — provide a valid bearer token or x-api-key" });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: process.env.NODE_ENV !== "production" 
    ? { origin: true, credentials: true }
    : { origin: ALLOWED_ORIGINS, credentials: true }
});

io.use(async (socket, next) => {
  const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;

  if (isJwtAuthEnabled()) {
    const token = extractBearerToken(socket.handshake.headers, auth);
    if (token) {
      const authContext = await verifyBearerToken(token);
      if (authContext) {
        socket.data.authContext = authContext;
        next();
        return;
      }
    }
  }

  if (!API_KEY && !isJwtAuthEnabled()) {
    next();
    return;
  }

  const provided = typeof auth.apiKey === "string"
    ? auth.apiKey
    : typeof socket.handshake.headers["x-api-key"] === "string"
      ? socket.handshake.headers["x-api-key"]
      : undefined;

  if (API_KEY && provided === API_KEY) {
    next();
    return;
  }

  next(new Error("Unauthorized — provide a valid bearer token or apiKey"));
});

interface OperatorPresence {
  schoolId: string;
  deviceId: string;
  gameId: string;
  socketId: string;
  connectedAtIso: string;
  lastSeenIso: string;
}

const operatorPresenceBySocketId = new Map<string, OperatorPresence>();
const operatorPresenceByDeviceId = new Map<string, OperatorPresence>(); // Index by school+device for O(1) lookup

// Debounce game state broadcasts to max 1 per 200ms per game
interface PendingBroadcast {
  state: unknown;
  insights: unknown;
  timerId: ReturnType<typeof setTimeout>;
}

const pendingBroadcasts = new Map<string, PendingBroadcast>();
const BROADCAST_DEBOUNCE_MS = 200;

function emitToGameRooms(schoolId: string, gameId: string, eventName: string, payload: unknown): void {
  io.to(gameId).emit(eventName, payload);
  io.to(gameRoom(schoolId, gameId)).emit(eventName, payload);
}

function broadcastGameStateWithDebounce(schoolId: string, gameId: string, state: unknown, insights: unknown): void {
  const broadcastKey = `${schoolId}:${gameId}`;
  const existing = pendingBroadcasts.get(broadcastKey);
  if (existing) {
    // Update pending state/insights and keep existing timer
    existing.state = state;
    existing.insights = insights;
    return;
  }

  // Schedule broadcast for 200ms from now
  const timerId = setTimeout(() => {
    const pending = pendingBroadcasts.get(broadcastKey);
    if (pending) {
      emitToGameRooms(schoolId, gameId, "game:state", pending.state);
      emitToGameRooms(schoolId, gameId, "game:insights", pending.insights);
      pendingBroadcasts.delete(broadcastKey);
    }
  }, BROADCAST_DEBOUNCE_MS);

  pendingBroadcasts.set(broadcastKey, { state, insights, timerId });
}

function getOperatorByDeviceId(schoolId: string, deviceId: string): OperatorPresence | null {
  return operatorPresenceByDeviceId.get(`${schoolId}:${deviceId}`) ?? null;
}

function emitPresence(schoolId: string, deviceId: string): void {
  const operator = getOperatorByDeviceId(schoolId, deviceId);
  const payload = {
    deviceId,
    online: Boolean(operator),
    gameId: operator?.gameId ?? null,
    lastSeenIso: operator?.lastSeenIso ?? null
  };

  io.to(deviceRoom(schoolId, deviceId)).emit("presence:status", payload);
}

async function refreshAndBroadcastInsights(schoolId: string, gameId: string): Promise<void> {
  const insights = await refreshGameAiInsights(gameId, undefined, { schoolId });
  if (insights) {
    emitToGameRooms(schoolId, gameId, "game:insights", insights);
  }
}

// Serve stats dashboard static assets and HTML pages
const STATS_STATIC = path.resolve(__dirname, "../../../apps/stats-dashboard/static");
app.use("/static", express.static(STATS_STATIC));
app.get("/", (_req, res) => res.sendFile(path.join(STATS_STATIC, "index.html")));
app.get("/games", (_req, res) => res.sendFile(path.join(STATS_STATIC, "games.html")));
app.get("/players", (_req, res) => res.sendFile(path.join(STATS_STATIC, "players.html")));
app.get("/trends", (_req, res) => res.sendFile(path.join(STATS_STATIC, "trends.html")));
app.get("/ai-insights", (_req, res) => res.sendFile(path.join(STATS_STATIC, "ai-insights.html")));
app.get("/analysis", (_req, res) => res.sendFile(path.join(STATS_STATIC, "analysis.html")));
app.get("/onboarding", (_req, res) => res.sendFile(path.join(STATS_STATIC, "onboarding.html")));
app.get("/settings", (_req, res) => res.sendFile(path.join(STATS_STATIC, "settings.html")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/teams", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const teams = getRosterTeamsByScope({ schoolId }).map((team) => ({
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    season: team.season ?? "",
    teamColor: team.teamColor ?? "",
    coachStyle: team.coachStyle ?? "",
    playingStyle: team.playingStyle ?? "",
    teamContext: team.teamContext ?? "",
    customPrompt: team.customPrompt ?? "",
    focusInsights: team.focusInsights ?? defaultTeamAiSettings().focusInsights,
    players: team.players
  }));
  res.json({ teams });
});

app.get("/api/ai-settings", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const { team } = getPrimaryTeam(schoolId);
  res.json(extractTeamAiSettings(team));
});

app.put("/api/ai-settings", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const payload = (req.body ?? {}) as Record<string, unknown>;
  const savedTeams = upsertPrimaryTeam(schoolId, {
    playingStyle: payload.playingStyle,
    teamContext: payload.teamContext,
    customPrompt: payload.customPrompt,
    focusInsights: payload.focusInsights
  });
  res.json({ message: "AI settings saved", settings: extractTeamAiSettings(savedTeams[0]) });
});

app.put("/api/roster-sync", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const payload = (req.body ?? {}) as Record<string, unknown>;

  if (Array.isArray(payload.teams)) {
    const saved = persistSchoolTeams(schoolId, payload.teams as RosterTeam[]);
    res.json({
      message: "Roster synced successfully",
      team: saved[0]?.name ?? "",
      players_loaded: saved[0]?.players.length ?? 0
    });
    return;
  }

  const existing = getPrimaryTeam(schoolId).team;
  const teamId = existing?.id ?? "primary-team";
  const currentPlayers = new Map((existing?.players ?? []).map((player) => [normalizeNameKey(player.name), player]));
  const rosterPayload = Array.isArray(payload.roster) ? payload.roster : [];
  const players = rosterPayload
    .map((entry) => buildRosterPlayer(entry as Record<string, unknown>, teamId, currentPlayers.get(normalizeNameKey((entry as Record<string, unknown>).name))))
    .filter((player): player is RosterPlayer => Boolean(player));

  const saved = upsertPrimaryTeam(schoolId, {
    name: payload.team,
    season: payload.season,
    teamColor: payload.teamColor,
    coachStyle: payload.coachStyle,
    playingStyle: payload.playingStyle,
    teamContext: payload.teamContext,
    customPrompt: payload.customPrompt,
    focusInsights: payload.focusInsights,
    abbreviation: existing?.abbreviation ?? buildTeamAbbreviation(sanitizeTextField(payload.team, 120) || existing?.name || "Team")
  });

  saved[0]!.players = players;
  const persisted = persistSchoolTeams(schoolId, saved);
  res.json({
    message: "Roster synced successfully",
    team: persisted[0]?.name ?? "",
    players_loaded: persisted[0]?.players.length ?? 0
  });
});

app.post("/api/team", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const payload = (req.body ?? {}) as Record<string, unknown>;
  const name = sanitizeTextField(payload.name, 120);
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const saved = upsertPrimaryTeam(schoolId, payload);
  res.status(201).json({
    message: "Team created successfully",
    team: { id: saved[0]?.id ?? "primary-team", name: saved[0]?.name ?? name }
  });
});

app.post("/api/reload-data", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const teams = getRosterTeamsByScope({ schoolId });
  res.json({ ok: true, teamsLoaded: teams.length, message: "Realtime data already current" });
});

app.get("/api/players", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(getSeasonPlayers({ schoolId }));
});

app.get("/api/roster/players", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(getRosterPlayers({ schoolId }));
});

app.get("/api/player/:playerName", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const targetKey = normalizeNameKey(req.params.playerName);
  const player = getSeasonPlayers({ schoolId }).find((entry) => {
    return normalizeNameKey(entry.name) === targetKey
      || normalizeNameKey(entry.full_name) === targetKey
      || normalizeNameKey(entry.roster_info?.name) === targetKey;
  });

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json(player);
});

app.post("/api/player/:playerName", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const payload = (req.body ?? {}) as Record<string, unknown>;
  const requestedName = normalizePersonName(req.params.playerName);
  if (!requestedName) {
    res.status(400).json({ error: "Player name is required" });
    return;
  }

  const { teams, team } = getPrimaryTeam(schoolId);
  const primaryTeam: RosterTeam = team ?? {
    id: "primary-team",
    schoolId,
    name: "Team",
    abbreviation: "TEAM",
    players: []
  };

  const existingRecord = findPlayerRecord([primaryTeam], requestedName);
  const builtPlayer = buildRosterPlayer({ ...payload, name: requestedName }, primaryTeam.id, existingRecord?.player);
  if (!builtPlayer) {
    res.status(400).json({ error: "Player name is required" });
    return;
  }

  const nextPrimaryTeam: RosterTeam = {
    ...primaryTeam,
    players: existingRecord
      ? primaryTeam.players.map((player, index) => index === existingRecord.playerIndex ? builtPlayer : player)
      : [...primaryTeam.players, builtPlayer]
  };
  const nextTeams = team ? [nextPrimaryTeam, ...teams.slice(1)] : [nextPrimaryTeam];
  persistSchoolTeams(schoolId, nextTeams);

  res.status(201).json({ message: "Player saved successfully", player: builtPlayer });
});

app.delete("/api/roster/player/:playerName", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const teams = getRosterTeamsByScope({ schoolId });
  const record = findPlayerRecord(teams, req.params.playerName);
  if (!record) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const nextTeams = teams.map((team, index) => index === record.teamIndex
    ? { ...team, players: team.players.filter((_, playerIndex) => playerIndex !== record.playerIndex) }
    : team);
  persistSchoolTeams(schoolId, nextTeams);
  res.json({ message: "Player deleted successfully", player: record.player.name });
});

app.delete("/api/player/:playerName", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const teams = getRosterTeamsByScope({ schoolId });
  const record = findPlayerRecord(teams, req.params.playerName);
  if (!record) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const nextTeams = teams.map((team, index) => index === record.teamIndex
    ? { ...team, players: team.players.filter((_, playerIndex) => playerIndex !== record.playerIndex) }
    : team);
  persistSchoolTeams(schoolId, nextTeams);
  res.json({ message: "Player deleted successfully", player: record.player.name });
});

app.post("/api/player/:playerName/delete", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const teams = getRosterTeamsByScope({ schoolId });
  const record = findPlayerRecord(teams, req.params.playerName);
  if (!record) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const nextTeams = teams.map((team, index) => index === record.teamIndex
    ? { ...team, players: team.players.filter((_, playerIndex) => playerIndex !== record.playerIndex) }
    : team);
  persistSchoolTeams(schoolId, nextTeams);
  res.json({ message: "Player deleted successfully", player: record.player.name });
});

app.get("/api/season-stats", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(getSeasonTeamStats({ schoolId }));
});

app.get("/api/games", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(buildGamesPayload(schoolId));
});

app.get("/api/games/:gameId", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const game = buildGamesPayload(schoolId).find((entry) => String(entry.gameId) === String(req.params.gameId));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  res.json(game);
});

app.get("/api/games/:gameId/audit-log", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const override = getGameOverrideMap(schoolId).get(req.params.gameId);
  res.json({
    entries: override
      ? [{
        action: "manual_edit",
        gameId: req.params.gameId,
        updatedAtIso: override.updatedAtIso
      }]
      : []
  });
});

app.put("/api/games/:gameId", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const gameId = String(req.params.gameId);
  const existing = buildGamesPayload(schoolId).find((entry) => String(entry.gameId) === gameId);
  if (!existing) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const payload = (req.body ?? {}) as Record<string, unknown>;
  const vcScore = Number(payload.vc_score);
  const oppScore = Number(payload.opp_score);
  if (!Number.isFinite(vcScore) || !Number.isFinite(oppScore)) {
    res.status(400).json({ error: "vc_score and opp_score are required" });
    return;
  }

  const baseTeamStats = (payload.team_stats && typeof payload.team_stats === "object")
    ? payload.team_stats as Record<string, unknown>
    : (existing.team_stats as Record<string, unknown> | undefined) ?? {};
  const override: GameEditOverride = {
    gameId,
    date: sanitizeTextField(payload.date ?? existing.date, 32) || String(existing.date ?? ""),
    opponent: sanitizeTextField(payload.opponent ?? existing.opponent, 120) || String(existing.opponent ?? "Opponent"),
    location: (payload.location === "away" || payload.location === "neutral") ? payload.location : "home",
    vc_score: vcScore,
    opp_score: oppScore,
    result: resolveGameResult(vcScore, oppScore),
    team_stats: {
      fg: Number(baseTeamStats.fg ?? 0),
      fga: Number(baseTeamStats.fga ?? 0),
      fg3: Number(baseTeamStats.fg3 ?? 0),
      fg3a: Number(baseTeamStats.fg3a ?? 0),
      ft: Number(baseTeamStats.ft ?? 0),
      fta: Number(baseTeamStats.fta ?? 0),
      oreb: Number(baseTeamStats.oreb ?? 0),
      dreb: Number(baseTeamStats.dreb ?? 0),
      reb: Number(baseTeamStats.reb ?? 0),
      asst: Number(baseTeamStats.asst ?? 0),
      to: Number(baseTeamStats.to ?? 0),
      stl: Number(baseTeamStats.stl ?? 0),
      blk: Number(baseTeamStats.blk ?? 0),
      fouls: Number(baseTeamStats.fouls ?? 0)
    },
    player_stats: Array.isArray(payload.player_stats) ? payload.player_stats as Array<Record<string, unknown>> : [],
    updatedAtIso: new Date().toISOString()
  };

  getGameOverrideMap(schoolId).set(gameId, override);
  res.json({ message: "Game updated successfully", game: override });
});

app.delete("/api/games/:gameId", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const gameId = String(req.params.gameId);
  const removedFromState = deleteGame(gameId, { schoolId });
  const removedOverride = getGameOverrideMap(schoolId).delete(gameId);
  if (!removedFromState && !removedOverride) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  emitToGameRooms(schoolId, gameId, "game:deleted", { gameId });
  res.json({ message: "Game deleted successfully", gameId });
});

app.post("/api/reset", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  resetAllData({ schoolId });
  gameOverridesBySchool.delete(schoolId);
  res.json({ ok: true, message: "Reset complete", schoolId });
});

app.get("/api/live-context", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(getLiveContext({ schoolId }));
});

app.get("/api/leaderboards", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(buildLeaderboardsPayload(schoolId));
});

app.get("/api/team-trends", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(buildTeamTrendsPayload(schoolId));
});

app.get("/api/player-trends/:playerName", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const targetName = normalizePersonName(req.params.playerName);
  if (!targetName || targetName.length > 100) {
    res.status(400).json({ error: "Invalid player name" });
    return;
  }

  res.json(buildPlayerTrendsPayload(schoolId, targetName));
});

app.get("/api/player-comparison", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const playerNames = ([] as string[]).concat(req.query.players as string | string[] | undefined ?? [])
    .map((name) => normalizePersonName(name))
    .filter(Boolean);
  if (playerNames.length < 2) {
    res.status(400).json({ error: "At least 2 players required for comparison" });
    return;
  }

  res.json(buildPlayerComparisonPayload(schoolId, playerNames));
});

app.get("/api/advanced/team", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(buildTeamAdvancedPayload(schoolId));
});

app.get("/api/advanced/player/:playerName", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const payload = buildPlayerAdvancedPayload(schoolId, req.params.playerName);
  if (!payload) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json(payload);
});

app.get("/api/advanced/volatility", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(buildVolatilityPayload(schoolId));
});

app.get("/api/comprehensive-insights", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(buildComprehensiveInsightsPayload(schoolId));
});

app.post("/api/ai/chat", async (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const message = sanitizeTextField((req.body as Record<string, unknown> | undefined)?.message, 1200);
  const history = (req.body as Record<string, unknown> | undefined)?.history;
  const allowLiveAi = !process.env.VITEST && process.env.NODE_ENV !== "test";
  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const latestGame = allowLiveAi ? getSeasonGames({ schoolId }).slice(-1)[0] : undefined;
  if (latestGame) {
    const ai = await answerGameAiChat(latestGame.gameId, message, history, { schoolId });
    if (ai?.answer) {
      res.json({ reply: ai.answer, suggestions: ai.suggestions ?? [], usedHistoricalContext: ai.usedHistoricalContext ?? false });
      return;
    }
  }

  res.json({
    reply: `${buildTeamSummaryText(schoolId)} Coach question: ${message}`,
    suggestions: [
      "Which lineup gives us the best ball security?",
      "Who should absorb minutes if foul trouble increases?"
    ]
  });
});

app.get("/api/ai/team-summary", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json({ summary: buildTeamSummaryText(schoolId) });
});

app.post("/api/ai/analyze", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const query = sanitizeTextField((req.body as Record<string, unknown> | undefined)?.query, 1200)
    || sanitizeTextField((req.body as Record<string, unknown> | undefined)?.message, 1200);
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  res.json({
    analysis: `${buildTeamSummaryText(schoolId)} Requested analysis: ${query}`
  });
});

app.get("/api/ai/player-insights/:playerName", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const insights = buildPlayerInsightsText(schoolId, req.params.playerName);
  if (!insights) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json({ player: req.params.playerName, insights });
});

app.get("/api/ai/game-analysis/:gameId", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const analysis = buildGameAnalysisText(schoolId, req.params.gameId);
  if (!analysis) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  res.json({ gameId: req.params.gameId, analysis });
});

app.delete("/api/ai/team-summary", (_req, res) => {
  // No persistent cache to clear in this implementation — return success.
  res.json({ message: "Cache cleared" });
});

app.get("/api/season-analysis", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const force = String(req.query.force ?? "false").toLowerCase() === "true";
  res.json(buildSeasonAnalysisPayload(schoolId, force));
});

app.delete("/api/season-analysis", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  seasonAnalysisBySchool.delete(schoolId);
  res.json({ message: "Cache cleared" });
});

app.get("/api/ai/player-analysis/:playerName", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const playerName = sanitizeTextField(req.params.playerName, 100);
  if (!playerName) {
    res.status(400).json({ error: "Invalid player name" });
    return;
  }

  const schoolCache = playerAnalysisCacheBySchool.get(schoolId);
  const force = String(req.query.regenerate ?? "false").toLowerCase() === "true";
  if (!force && schoolCache?.has(playerName)) {
    res.json({ ...(schoolCache.get(playerName) as object), cached: true });
    return;
  }

  const payload = buildPlayerAnalysisPayload(schoolId, playerName);
  if (!payload) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  if (!playerAnalysisCacheBySchool.has(schoolId)) {
    playerAnalysisCacheBySchool.set(schoolId, new Map());
  }
  playerAnalysisCacheBySchool.get(schoolId)!.set(playerName, payload);
  res.json(payload);
});

app.delete("/api/ai/player-analysis/:playerName", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const playerName = sanitizeTextField(req.params.playerName, 100) ?? "";
  playerAnalysisCacheBySchool.get(schoolId)?.delete(playerName);
  res.json({ message: `Cache cleared for ${playerName}` });
});

app.get("/api/advanced/game/:gameId", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const game = buildGamesPayload(schoolId).find((g) => String(g.gameId) === String(req.params.gameId));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const ts = game.team_stats as { fg: number; fga: number; fg3: number; fg3a: number; ft: number; fta: number; asst: number; to: number; stl: number; reb: number; oreb: number; dreb: number; fouls: number; blk: number };
  res.json({
    gameId: game.gameId,
    opponent: game.opponent,
    date: game.date,
    result: game.result,
    efg_pct: ts.fga > 0 ? roundStat(((ts.fg + 0.5 * ts.fg3) / ts.fga) * 100) : 0,
    ts_pct: (2 * (ts.fg > 0 ? ts.fg : 0) + ts.fta * 0.44) > 0
      ? roundStat((game.vc_score as number) / (2 * (ts.fga + ts.fg3a * 0 + ts.fta * 0.44)) * 100)
      : 0,
    ast_to_ratio: ts.to > 0 ? roundStat(ts.asst / ts.to) : 0,
    team_stats: ts,
    player_stats: game.player_stats,
  });
});

app.get("/api/advanced/patterns", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const games = buildGamesPayload(schoolId);
  const homeGames = games.filter((g) => g.location === "home");
  const awayGames = games.filter((g) => g.location === "away");
  const avgScore = (arr: Array<Record<string, unknown>>) =>
    arr.length > 0 ? roundStat(arr.reduce((s, g) => s + (g.vc_score as number), 0) / arr.length) : 0;

  res.json({
    home_avg_score: avgScore(homeGames),
    away_avg_score: avgScore(awayGames),
    total_games: games.length,
    home_record: { wins: homeGames.filter((g) => g.result === "W").length, losses: homeGames.filter((g) => g.result === "L").length },
    away_record: { wins: awayGames.filter((g) => g.result === "W").length, losses: awayGames.filter((g) => g.result === "L").length },
  });
});

app.get("/api/advanced/insights", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json(buildComprehensiveInsightsPayload(schoolId));
});

app.get("/api/advanced/all", (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json({
    team: buildTeamAdvancedPayload(schoolId),
    volatility: buildVolatilityPayload(schoolId),
    insights: buildComprehensiveInsightsPayload(schoolId),
  });
});

app.get("/config/roster-teams", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json({ teams: getRosterTeamsByScope({ schoolId }) });
});

app.put("/config/roster-teams", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const teams = req.body?.teams;
  if (!Array.isArray(teams)) {
    res.status(400).json({ error: "teams array is required" });
    return;
  }

  const saved = saveRosterTeams(teams, { schoolId });
  io.to(schoolRoom(schoolId)).emit("roster:teams", saved);
  res.json({ teams: saved });
});

// ─────────────────────────────────────────────────────────────────────────
// Team Management Routes
// ─────────────────────────────────────────────────────────────────────────

app.get("/teams", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  res.json({ teams: getRosterTeamsByScope({ schoolId }) });
});

app.post("/teams", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const { name, abbreviation } = req.body ?? {};
  const teamColor = normalizeTeamColor(req.body?.teamColor);
  if (!name || !abbreviation) {
    res.status(400).json({ error: "name and abbreviation are required" });
    return;
  }

  const teams = getRosterTeamsByScope({ schoolId });
  const id = `team-${Date.now()}`;
  const newTeam = {
    id,
    schoolId,
    name,
    abbreviation,
    teamColor,
    players: []
  };

  teams.push(newTeam);
  saveRosterTeams(teams, { schoolId });
  io.to(schoolRoom(schoolId)).emit("roster:teams", teams);
  io.to(schoolRoom(schoolId)).emit("team:created", { team: newTeam });

  res.status(201).json({ team: newTeam });
});

app.put("/teams/:teamId", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const { name, abbreviation } = req.body ?? {};
  const teamColor = normalizeTeamColor(req.body?.teamColor);
  const teams = getRosterTeamsByScope({ schoolId });
  const team = teams.find((t) => t.id === req.params.teamId);

  if (!team) {
    res.status(404).json({ error: "team not found" });
    return;
  }

  if (name) team.name = name;
  if (abbreviation) team.abbreviation = abbreviation;
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "teamColor")) {
    team.teamColor = teamColor;
  }

  saveRosterTeams(teams, { schoolId });
  io.to(schoolRoom(schoolId)).emit("roster:teams", teams);
  io.to(schoolRoom(schoolId)).emit("team:updated", { team });

  res.json({ team });
});

app.delete("/teams/:teamId", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const teams = getRosterTeamsByScope({ schoolId });
  const idx = teams.findIndex((t) => t.id === req.params.teamId);

  if (idx < 0) {
    res.status(404).json({ error: "team not found" });
    return;
  }

  const deleted = teams.splice(idx, 1)[0];
  saveRosterTeams(teams, { schoolId });
  io.to(schoolRoom(schoolId)).emit("roster:teams", teams);
  io.to(schoolRoom(schoolId)).emit("team:deleted", { teamId: deleted.id });

  res.json({ teamId: deleted.id });
});

app.post("/teams/:teamId/players", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const { number, name, position, height, grade } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const teams = getRosterTeamsByScope({ schoolId });
  const team = teams.find((t) => t.id === req.params.teamId);

  if (!team) {
    res.status(404).json({ error: "team not found" });
    return;
  }

  const playerId = `${req.params.teamId}-${Date.now()}`;
  const player = {
    id: playerId,
    number: String(number || ""),
    name,
    position: String(position || ""),
    height: height ? String(height) : undefined,
    grade: grade ? String(grade) : undefined
  };

  team.players.push(player);
  saveRosterTeams(teams, { schoolId });
  io.to(schoolRoom(schoolId)).emit("roster:teams", teams);
  io.to(schoolRoom(schoolId)).emit("player:added", { teamId: req.params.teamId, player });

  res.status(201).json({ player });
});

app.put("/teams/:teamId/players/:playerId", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const { number, name, position, height, grade } = req.body ?? {};
  const teams = getRosterTeamsByScope({ schoolId });
  const team = teams.find((t) => t.id === req.params.teamId);

  if (!team) {
    res.status(404).json({ error: "team not found" });
    return;
  }

  const player = team.players.find((p) => p.id === req.params.playerId);
  if (!player) {
    res.status(404).json({ error: "player not found" });
    return;
  }

  if (number !== undefined) player.number = String(number);
  if (name !== undefined) player.name = name;
  if (position !== undefined) player.position = String(position);
  if (height !== undefined) player.height = height ? String(height) : undefined;
  if (grade !== undefined) player.grade = grade ? String(grade) : undefined;

  saveRosterTeams(teams, { schoolId });
  io.to(schoolRoom(schoolId)).emit("roster:teams", teams);
  io.to(schoolRoom(schoolId)).emit("player:updated", { teamId: req.params.teamId, player });

  res.json({ player });
});

app.delete("/teams/:teamId/players/:playerId", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const teams = getRosterTeamsByScope({ schoolId });
  const team = teams.find((t) => t.id === req.params.teamId);

  if (!team) {
    res.status(404).json({ error: "team not found" });
    return;
  }

  const idx = team.players.findIndex((p) => p.id === req.params.playerId);
  if (idx < 0) {
    res.status(404).json({ error: "player not found" });
    return;
  }

  const deleted = team.players.splice(idx, 1)[0];
  saveRosterTeams(teams, { schoolId });
  io.to(schoolRoom(schoolId)).emit("roster:teams", teams);
  io.to(schoolRoom(schoolId)).emit("player:deleted", { teamId: req.params.teamId, playerId: deleted.id });

  res.json({ playerId: deleted.id });
});

app.post("/api/games", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const {
    gameId,
    homeTeamId,
    awayTeamId,
    opponentName,
    opponentTeamId,
    startingLineupByTeam,
    aiContext
  } = req.body ?? {};

  if (!gameId || !homeTeamId || !awayTeamId) {
    res.status(400).json({ error: "gameId, homeTeamId, awayTeamId are required" });
    return;
  }

  const state = createGame({
    schoolId,
    gameId,
    homeTeamId,
    awayTeamId,
    opponentName,
    opponentTeamId,
    startingLineupByTeam,
    aiContext
  }, { schoolId });

  emitToGameRooms(schoolId, gameId, "game:state", state);
  emitToGameRooms(schoolId, gameId, "game:insights", []);

  res.status(201).json(state);
});

app.delete("/api/games/:gameId", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const removed = deleteGame(req.params.gameId, { schoolId });
  if (!removed) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  emitToGameRooms(schoolId, req.params.gameId, "game:deleted", { gameId: req.params.gameId });
  res.json({ gameId: req.params.gameId, deleted: true });
});

app.get("/api/games/:gameId/state", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const state = getGameState(req.params.gameId, { schoolId });

  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  res.json(state);
});

// Sync (or re-sync) the starting lineup without resetting the game.
// Only fills teams whose active lineup is currently empty, so in-game
// substitutions are never overwritten.
app.patch("/api/games/:gameId/lineup", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const { startingLineupByTeam } = req.body ?? {};
  if (!startingLineupByTeam || typeof startingLineupByTeam !== "object") {
    res.status(400).json({ error: "startingLineupByTeam is required" });
    return;
  }

  const state = patchGameLineup(req.params.gameId, startingLineupByTeam as Record<string, string[]>, { schoolId });
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  emitToGameRooms(schoolId, req.params.gameId, "game:state", state);
  res.json(state);
});

app.get("/api/games/:gameId/insights", requireApiKey, async (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const state = getGameState(req.params.gameId, { schoolId });
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const forceRefresh = req.query.force === "1" || req.query.force === "true";
  const insights = await refreshGameAiInsights(req.params.gameId, { force: forceRefresh }, { schoolId });
  res.json(insights ?? getGameInsights(req.params.gameId, { schoolId }));
});

app.get("/api/games/:gameId/ai-settings", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const state = getGameState(req.params.gameId, { schoolId });
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const settings = getGameAiSettings(req.params.gameId, { schoolId });
  res.json(settings);
});

app.put("/api/games/:gameId/ai-settings", requireApiKey, async (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const state = getGameState(req.params.gameId, { schoolId });
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const payload = (req.body ?? {}) as Partial<CoachAiSettings>;
  const updated = updateGameAiSettings(req.params.gameId, payload, { schoolId });
  if (!updated) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const insights = await refreshGameAiInsights(req.params.gameId, undefined, { schoolId });
  if (insights) {
    emitToGameRooms(schoolId, req.params.gameId, "game:insights", insights);
  }

  res.json(updated);
});

app.get("/api/games/:gameId/ai-context", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const state = getGameState(req.params.gameId, { schoolId });
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const context = getGameAiContext(req.params.gameId, { schoolId });
  res.json(context);
});

app.put("/api/games/:gameId/ai-context", requireApiKey, async (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const state = getGameState(req.params.gameId, { schoolId });
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const payload = (req.body ?? {}) as Partial<GameAiContext>;
  const updated = updateGameAiContext(req.params.gameId, payload, { schoolId });
  if (!updated) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const insights = await refreshGameAiInsights(req.params.gameId, { force: true }, { schoolId });
  if (insights) {
    emitToGameRooms(schoolId, req.params.gameId, "game:insights", insights);
  }

  res.json(updated);
});

app.get("/api/games/:gameId/ai-prompt-preview", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const state = getGameState(req.params.gameId, { schoolId });
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const preview = getGameAiPromptPreview(req.params.gameId, { schoolId });
  if (!preview) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  res.json(preview as AiPromptPreview);
});

app.post("/api/games/:gameId/ai-chat", requireApiKey, async (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const state = getGameState(req.params.gameId, { schoolId });
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const question = typeof req.body?.question === "string" ? sanitizePromptText(req.body.question, 2000) : "";
  if (!question.trim()) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  const response = await answerGameAiChat(req.params.gameId, question, req.body?.history, { schoolId });
  if (!response) {
    res.status(503).json({ error: "ai chat unavailable" });
    return;
  }

  res.json(response as CoachAiChatResponse);
});

app.get("/api/games/:gameId/events", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  const state = getGameState(req.params.gameId, { schoolId });
  if (!state) {
    res.status(404).json({ error: "game not found" });
    return;
  }

  const allEvents = getGameEvents(req.params.gameId, { schoolId });
  const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 50, 1), 500) : undefined;
  const offset = req.query.offset !== undefined ? Math.max(Number(req.query.offset) || 0, 0) : 0;

  if (limit !== undefined) {
    const paginated = allEvents.slice(offset, offset + limit);
    res.json({ events: paginated, total: allEvents.length, offset, limit });
  } else {
    res.json(allEvents);
  }
});

app.post("/api/games/:gameId/events", requireApiKey, eventRateLimiter, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  try {
    const payload = {
      ...(req.body ?? {}),
      gameId: req.params.gameId,
      schoolId
    };

    const { event, state, insights } = ingestEvent(payload, { schoolId });

    emitToGameRooms(schoolId, event.gameId, "game:event", event);
    broadcastGameStateWithDebounce(schoolId, event.gameId, state, insights);
    void refreshAndBroadcastInsights(schoolId, event.gameId);

    res.status(201).json({ event, state, insights });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "invalid event" });
  }
});

app.delete("/api/games/:gameId/events/:eventId", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  try {
    const { state, insights } = deleteEvent(req.params.gameId, req.params.eventId, { schoolId });

    emitToGameRooms(schoolId, req.params.gameId, "game:event:deleted", { eventId: req.params.eventId });
    broadcastGameStateWithDebounce(schoolId, req.params.gameId, state, insights);
    void refreshAndBroadcastInsights(schoolId, req.params.gameId);

    res.json({ state, insights });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "delete failed" });
  }
});

app.put("/api/games/:gameId/events/:eventId", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  try {
    const { event, state, insights } = updateEvent(
      req.params.gameId,
      req.params.eventId,
      req.body ?? {},
      { schoolId }
    );

    emitToGameRooms(schoolId, req.params.gameId, "game:event:updated", event);
    emitToGameRooms(schoolId, req.params.gameId, "game:state", state);
    emitToGameRooms(schoolId, req.params.gameId, "game:insights", insights);
    void refreshAndBroadcastInsights(schoolId, req.params.gameId);

    res.json({ event, state, insights });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "update failed" });
  }
});

io.on("connection", (socket) => {
  const schoolId = getSchoolIdFromSocket(socket);
  socket.join(schoolRoom(schoolId));

  function registerOperator(rawPayload: unknown): void {
    const payload = (rawPayload ?? {}) as Record<string, unknown>;
    const deviceId = typeof payload.deviceId === "string" ? payload.deviceId.trim() : "";
    const gameId = typeof payload.gameId === "string" ? payload.gameId.trim() : "";

    if (!deviceId || !gameId) {
      return;
    }

    const now = new Date().toISOString();
    const existing = operatorPresenceBySocketId.get(socket.id);

    // Remove old device ID index if changing devices.
    if (existing && existing.deviceId !== deviceId) {
      operatorPresenceByDeviceId.delete(`${schoolId}:${existing.deviceId}`);
    }

    const presence: OperatorPresence = {
      schoolId,
      deviceId,
      gameId,
      socketId: socket.id,
      connectedAtIso: existing?.connectedAtIso ?? now,
      lastSeenIso: now
    };

    operatorPresenceBySocketId.set(socket.id, presence);
    operatorPresenceByDeviceId.set(`${schoolId}:${deviceId}`, presence);

    socket.join(gameId);
    socket.join(gameRoom(schoolId, gameId));
    socket.join(deviceRoom(schoolId, deviceId));
    emitPresence(schoolId, deviceId);

    // Re-sync the starting lineup if the operator included one and the server
    // has an empty active lineup (e.g. after an API restart).
    const rawLineupByTeam = payload.startingLineupByTeam;
    if (rawLineupByTeam && typeof rawLineupByTeam === "object" && !Array.isArray(rawLineupByTeam)) {
      const updated = patchGameLineup(gameId, rawLineupByTeam as Record<string, string[]>, { schoolId });
      if (updated) {
        emitToGameRooms(schoolId, gameId, "game:state", updated);
      }
    }
  }

  socket.on("operator:register", (payload: unknown) => {
    registerOperator(payload);
  });

  socket.on("operator:heartbeat", (payload: unknown) => {
    registerOperator(payload);
  });

  socket.on("join:game", (gameId: string) => {
    if (!gameId) {
      return;
    }

    socket.join(gameId);
    socket.join(gameRoom(schoolId, gameId));
    const state = getGameState(gameId, { schoolId });
    if (state) {
      socket.emit("game:state", state);
      socket.emit("game:insights", getGameInsights(gameId, { schoolId }));
      void refreshAndBroadcastInsights(schoolId, gameId);
    }
  });

  socket.on("join:coach", (rawPayload: unknown) => {
    const payload = (rawPayload ?? {}) as Record<string, unknown>;
    const gameId = typeof payload.gameId === "string" ? payload.gameId.trim() : "";
    const deviceId = typeof payload.deviceId === "string" ? payload.deviceId.trim() : "";

    if (gameId) {
      socket.join(gameId);
      socket.join(gameRoom(schoolId, gameId));
      const state = getGameState(gameId, { schoolId });
      if (state) {
        socket.emit("game:state", state);
        socket.emit("game:insights", getGameInsights(gameId, { schoolId }));
        void refreshAndBroadcastInsights(schoolId, gameId);
      }
    }

    if (deviceId) {
      socket.join(deviceRoom(schoolId, deviceId));
      const operator = getOperatorByDeviceId(schoolId, deviceId);
      socket.emit("presence:status", {
        deviceId,
        online: Boolean(operator),
        gameId: operator?.gameId ?? null,
        lastSeenIso: operator?.lastSeenIso ?? null
      });
    }
  });

  socket.on("disconnect", () => {
    const operator = operatorPresenceBySocketId.get(socket.id);
    if (!operator) {
      return;
    }

    operatorPresenceBySocketId.delete(socket.id);
    operatorPresenceByDeviceId.delete(`${operator.schoolId}:${operator.deviceId}`);

    socket.leave(deviceRoom(operator.schoolId, operator.deviceId));
    socket.leave(gameRoom(operator.schoolId, operator.gameId));
    socket.leave(operator.gameId);

    emitPresence(operator.schoolId, operator.deviceId);
  });
});

// Factory reset — clears all game sessions and roster data for the selected school.
app.delete("/admin/reset", requireApiKey, (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  resetAllData({ schoolId });
  res.json({ ok: true, message: `All game sessions and roster data cleared for school ${schoolId}.` });
});

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
let serverStarted = false;

// Warn if API key not set in production
const NODE_ENV = process.env.NODE_ENV ?? "development";
if (NODE_ENV === "production" && !API_KEY) {
  console.warn("[realtime-api] WARNING: BTA_API_KEY not set. Event ingest endpoints are open to anyone.");
}

export async function startServer(): Promise<void> {
  if (serverStarted) {
    return;
  }

  await initializeStore().catch((error) => {
    console.error("[realtime-api] Failed to initialize store persistence", error);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      serverStarted = true;
      console.log(`Realtime API listening on http://${host}:${port}`);
      if (API_KEY) {
        console.log(`[realtime-api] API key authentication: ENABLED`);
      } else {
        console.log(`[realtime-api] API key authentication: disabled (set BTA_API_KEY to enable)`);
      }
      if (DATABASE_URL) {
        console.log("[realtime-api] Persistence backend: PostgreSQL");
      } else {
        console.log("[realtime-api] Persistence backend: file snapshot");
      }
      if (isJwtAuthEnabled()) {
        console.log("[realtime-api] JWT authentication: ENABLED");
      }
      console.log(`[realtime-api] CORS origins: ${ALLOWED_ORIGINS.join(", ")}`);
      resolve();
    });
  });
}

export async function stopServer(): Promise<void> {
  if (!serverStarted) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      serverStarted = false;
      resolve();
    });
  });
}

if (!process.env.VITEST) {
  void startServer();
}
