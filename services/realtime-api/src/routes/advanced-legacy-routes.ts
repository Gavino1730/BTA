import type { Express, Request } from "express";

type TeamStats = {
  fg: number;
  fga: number;
  fg3: number;
  fg3a: number;
  ft: number;
  fta: number;
  asst: number;
  to: number;
  stl: number;
  reb: number;
  oreb: number;
  dreb: number;
  fouls: number;
  blk: number;
};

type LegacyGamePayload = Record<string, unknown> & {
  gameId: string | number;
  opponent?: unknown;
  date?: unknown;
  result?: unknown;
  vc_score?: unknown;
  location?: unknown;
  player_stats?: unknown;
  team_stats?: unknown;
};

interface RegisterAdvancedLegacyRoutesOptions {
  getSchoolIdFromRequest: (req: Request) => string;
  buildGamesPayload: (schoolId: string) => Array<Record<string, unknown>>;
  roundStat: (value: number, digits?: number) => number;
  buildComprehensiveInsightsPayload: (schoolId: string) => unknown;
  buildTeamAdvancedPayload: (schoolId: string) => unknown;
  buildVolatilityPayload: (schoolId: string) => unknown;
}

export function registerAdvancedLegacyRoutes(app: Express, options: RegisterAdvancedLegacyRoutesOptions): void {
  app.get("/api/advanced/game/:gameId", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const game = options.buildGamesPayload(schoolId)
      .find((g) => String((g as LegacyGamePayload).gameId) === String(req.params.gameId)) as LegacyGamePayload | undefined;
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    const ts = game.team_stats as TeamStats;
    res.json({
      gameId: game.gameId,
      opponent: game.opponent,
      date: game.date,
      result: game.result,
      efg_pct: ts.fga > 0 ? options.roundStat(((ts.fg + 0.5 * ts.fg3) / ts.fga) * 100) : 0,
      ts_pct: (2 * (ts.fg > 0 ? ts.fg : 0) + ts.fta * 0.44) > 0
        ? options.roundStat((game.vc_score as number) / (2 * (ts.fga + ts.fg3a * 0 + ts.fta * 0.44)) * 100)
        : 0,
      ast_to_ratio: ts.to > 0 ? options.roundStat(ts.asst / ts.to) : 0,
      team_stats: ts,
      player_stats: game.player_stats,
    });
  });

  app.get("/api/advanced/patterns", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const games = options.buildGamesPayload(schoolId);
    const homeGames = games.filter((g) => g.location === "home");
    const awayGames = games.filter((g) => g.location === "away");
    const avgScore = (arr: Array<Record<string, unknown>>) =>
      arr.length > 0 ? options.roundStat(arr.reduce((s, g) => s + (g.vc_score as number), 0) / arr.length) : 0;

    res.json({
      home_avg_score: avgScore(homeGames),
      away_avg_score: avgScore(awayGames),
      total_games: games.length,
      home_record: { wins: homeGames.filter((g) => g.result === "W").length, losses: homeGames.filter((g) => g.result === "L").length },
      away_record: { wins: awayGames.filter((g) => g.result === "W").length, losses: awayGames.filter((g) => g.result === "L").length },
    });
  });

  app.get("/api/advanced/insights", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json(options.buildComprehensiveInsightsPayload(schoolId));
  });

  app.get("/api/advanced/all", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json({
      team: options.buildTeamAdvancedPayload(schoolId),
      volatility: options.buildVolatilityPayload(schoolId),
      insights: options.buildComprehensiveInsightsPayload(schoolId),
    });
  });
}
