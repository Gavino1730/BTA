import {
  getRosterTeamsByScope,
  getSeasonGames,
  getGameState,
  getGameEvents,
  getGameOverrideMap,
} from "../store.js";

// ---------------------------------------------------------------------------
// Local string utilities (pure, no external deps)
// ---------------------------------------------------------------------------

export function normalizePersonName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeNameKey(value: unknown): string {
  return normalizePersonName(value).toLowerCase();
}

// ---------------------------------------------------------------------------
// AI safety metadata
// ---------------------------------------------------------------------------

export interface AiSafetyMetadata {
  safetyLabel: "standard" | "caution";
  containsActionLikeContent: boolean;
  warningMessage?: string;
}

const ACTION_MIMIC_PATTERNS = [
  /\b(click|tap|press)\b.{0,40}\b(button|link|banner|prompt)\b/i,
  /\b(authorize|approve|confirm)\b.{0,40}\b(payment|purchase|charge|subscription)\b/i,
  /\benter\b.{0,40}\b(password|passcode|verification code|credit card|card number|bank account)\b/i,
  /\b(send|wire|transfer)\b.{0,40}\b(money|payment|funds)\b/i,
  /\burgent(ly)?\b/i,
  /\bignore\b.{0,40}\bpolicy|warning|security/i,
];

function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStrings(entry, output);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectStrings(nested, output);
    }
  }
}

export function buildAiSafetyMetadata(value: unknown): AiSafetyMetadata {
  const strings: string[] = [];
  collectStrings(value, strings);
  const combined = strings.join("\n");
  const containsActionLikeContent = ACTION_MIMIC_PATTERNS.some((pattern) => pattern.test(combined));
  if (!containsActionLikeContent) {
    return { safetyLabel: "standard", containsActionLikeContent: false };
  }
  return {
    safetyLabel: "caution",
    containsActionLikeContent: true,
    warningMessage:
      "AI-generated guidance may include action-like language. Verify requests for clicks, approvals, credentials, or payments independently.",
  };
}

// ---------------------------------------------------------------------------
// Math utilities
// ---------------------------------------------------------------------------

export function roundStat(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

export function resolveGameResult(vcScore: number, oppScore: number): "W" | "L" | "T" {
  if (vcScore > oppScore) return "W";
  if (vcScore < oppScore) return "L";
  return "T";
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
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
  if (teamIds.has(state.homeTeamId)) return state.homeTeamId;
  if (teamIds.has(state.awayTeamId)) return state.awayTeamId;
  return state.homeTeamId;
}

export function getSchoolAnalyticsContext(schoolId: string) {
  const teams = getRosterTeamsByScope({ schoolId });
  const teamIds = new Set(teams.map((team) => team.id));
  const seasonGames = getSeasonGames({ schoolId })
    .slice()
    .sort((left, right) => {
      const leftNumeric = Number(left.gameId);
      const rightNumeric = Number(right.gameId);
      const leftIsNumeric = Number.isFinite(leftNumeric);
      const rightIsNumeric = Number.isFinite(rightNumeric);
      if (leftIsNumeric && rightIsNumeric) return leftNumeric - rightNumeric;
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
  if (!state) return [];
  const rosterTeamIds = new Set(getRosterTeamsByScope({ schoolId }).map((team) => team.id));
  const ourTeamId = getOurTeamId(state, rosterTeamIds);
  const playerStatsByTeam = state.playerStatsByTeam[ourTeamId] ?? {};
  const rosterPlayerById = getRosterPlayerByIdForSchool(schoolId);
  const threePointByPlayer = new Map<string, { made: number; attempts: number }>();

  for (const event of getGameEvents(gameId, { schoolId })) {
    if (event.type !== "shot_attempt" || event.teamId !== ourTeamId || event.points !== 3) continue;
    const current = threePointByPlayer.get(event.playerId) ?? { made: 0, attempts: 0 };
    current.attempts += 1;
    if (event.made) current.made += 1;
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
    if (!override) return base;

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
