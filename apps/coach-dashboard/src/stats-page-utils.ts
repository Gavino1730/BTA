export interface BasicGameSummary {
  result?: string;
  vc_score: number;
  opp_score: number;
}

function resolveResult(game: BasicGameSummary): "W" | "L" | "T" {
  if (game.result === "W" || game.result === "L" || game.result === "T") {
    return game.result;
  }
  if (game.vc_score > game.opp_score) {
    return "W";
  }
  if (game.vc_score < game.opp_score) {
    return "L";
  }
  return "T";
}

export function formatRecord(wins: number | undefined, losses: number | undefined): string {
  return `${Number(wins ?? 0)}-${Number(losses ?? 0)}`;
}

export function computeCurrentStreak(games: BasicGameSummary[]): string {
  if (games.length === 0) {
    return "—";
  }

  const first = resolveResult(games[0]);
  let count = 0;

  for (const game of games) {
    if (resolveResult(game) !== first) {
      break;
    }
    count += 1;
  }

  return `${first}${count}`;
}

export function computeAverageMargin(games: BasicGameSummary[], sampleSize = 5): number {
  const window = games.slice(0, Math.max(sampleSize, 0));
  if (window.length === 0) {
    return 0;
  }

  return window.reduce((sum, game) => sum + (Number(game.vc_score ?? 0) - Number(game.opp_score ?? 0)), 0) / window.length;
}
