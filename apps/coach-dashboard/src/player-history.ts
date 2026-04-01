export interface PlayerSummary {
  playerId?: string;
  name?: string;
  full_name?: string;
  number?: string | number;
  ppg?: number;
  rpg?: number;
  apg?: number;
  spg?: number;
  bpg?: number;
  tpg?: number;
  fpg?: number;
  fg_pct?: number;
  fg3_pct?: number;
  ft_pct?: number;
  games?: number;
  games_played?: number;
  pts?: number;
  reb?: number;
  asst?: number;
  stl?: number;
  blk?: number;
  to?: number;
  fouls?: number;
  fg?: number;
  fga?: number;
  fg3?: number;
  fg3a?: number;
  ft?: number;
  fta?: number;
  role?: string;
  notes?: string;
}

export interface GamePlayerStat {
  playerId?: string;
  name?: string;
  number?: string | number;
  pts?: number;
  reb?: number;
  fg_made?: number;
  fg_att?: number;
  fg3_made?: number;
  fg3_att?: number;
  ft_made?: number;
  ft_att?: number;
  oreb?: number;
  dreb?: number;
  asst?: number;
  stl?: number;
  blk?: number;
  to?: number;
  fouls?: number;
  plus_minus?: number;
}

export interface GameSummary {
  gameId: string | number;
  date: string;
  opponent: string;
  location?: string;
  result?: string;
  vc_score: number;
  opp_score: number;
  player_stats?: GamePlayerStat[];
}

export interface PlayerGameHistoryRow {
  gameId: string;
  date: string;
  opponent: string;
  location: string;
  result: string;
  teamScore: number;
  oppScore: number;
  pts: number;
  reb: number;
  asst: number;
  stl: number;
  blk: number;
  turnovers: number;
  fouls: number;
  plusMinus: number;
  fgDisplay: string;
  fg3Display: string;
  ftDisplay: string;
}

export function normalizePlayerLookupKey(value: string | undefined | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getPlayerDisplayName(player: PlayerSummary): string {
  return player.full_name ?? player.name ?? player.playerId ?? "Unknown Player";
}

export function getPlayerGamesPlayed(player: PlayerSummary): number {
  return Number(player.games ?? player.games_played ?? 0);
}

function buildTargetKeys(player: PlayerSummary): Set<string> {
  return new Set(
    [player.playerId, player.full_name, player.name]
      .map((value) => normalizePlayerLookupKey(value))
      .filter(Boolean)
  );
}

function toResultLabel(result: string | undefined, teamScore: number, oppScore: number): string {
  if (result) {
    return result;
  }
  if (teamScore > oppScore) {
    return "W";
  }
  if (teamScore < oppScore) {
    return "L";
  }
  return "T";
}

export function buildPlayerGameHistory(player: PlayerSummary, games: GameSummary[]): PlayerGameHistoryRow[] {
  const targetKeys = buildTargetKeys(player);
  if (targetKeys.size === 0) {
    return [];
  }

  return games
    .map((game) => {
      const stat = (game.player_stats ?? []).find((entry) => {
        const nameKey = normalizePlayerLookupKey(entry.name);
        const idKey = normalizePlayerLookupKey(entry.playerId);
        return Boolean((nameKey && targetKeys.has(nameKey)) || (idKey && targetKeys.has(idKey)));
      });

      if (!stat) {
        return null;
      }

      const fgMade = Number(stat.fg_made ?? 0);
      const fgAtt = Number(stat.fg_att ?? 0);
      const fg3Made = Number(stat.fg3_made ?? 0);
      const fg3Att = Number(stat.fg3_att ?? 0);
      const ftMade = Number(stat.ft_made ?? 0);
      const ftAtt = Number(stat.ft_att ?? 0);
      const oreb = Number(stat.oreb ?? 0);
      const dreb = Number(stat.dreb ?? 0);
      const teamScore = Number(game.vc_score ?? 0);
      const oppScore = Number(game.opp_score ?? 0);

      return {
        gameId: String(game.gameId),
        date: String(game.date ?? ""),
        opponent: String(game.opponent ?? "Opponent"),
        location: String(game.location ?? "home"),
        result: toResultLabel(game.result, teamScore, oppScore),
        teamScore,
        oppScore,
        pts: Number(stat.pts ?? ((fgMade - fg3Made) * 2) + (fg3Made * 3) + ftMade),
        reb: Number(stat.reb ?? (oreb + dreb)),
        asst: Number(stat.asst ?? 0),
        stl: Number(stat.stl ?? 0),
        blk: Number(stat.blk ?? 0),
        turnovers: Number(stat.to ?? 0),
        fouls: Number(stat.fouls ?? 0),
        plusMinus: Number(stat.plus_minus ?? 0),
        fgDisplay: `${fgMade}-${fgAtt}`,
        fg3Display: `${fg3Made}-${fg3Att}`,
        ftDisplay: `${ftMade}-${ftAtt}`,
      };
    })
    .filter((row): row is PlayerGameHistoryRow => Boolean(row))
    .sort((left, right) => {
      const rightTime = new Date(right.date).getTime();
      const leftTime = new Date(left.date).getTime();
      if (Number.isFinite(rightTime) && Number.isFinite(leftTime) && rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return right.gameId.localeCompare(left.gameId, undefined, { numeric: true });
    });
}
