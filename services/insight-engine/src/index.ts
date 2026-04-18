// Re-export public types for consumers of @bta/insight-engine
export type { InsightType, LiveInsight, InsightContext } from "./types.js";
import type { InsightContext } from "./types.js";
import type { LiveInsight } from "./types.js";
import { isPreGameState } from "./utils.js";
import { buildRuleContext } from "./rule-context.js";
import { generateFoulInsights } from "./rules/foul-rules.js";
import { generateClockInsights } from "./rules/clock-rules.js";
import { generateShootingInsights } from "./rules/shooting-rules.js";
import { generateMomentumInsights } from "./rules/momentum-rules.js";
import { generateMiscInsights } from "./rules/misc-rules.js";

export function generateInsights(context: InsightContext): LiveInsight[] {
  const { state, latestEvent } = context;
  const now = new Date().toISOString();

  // Section 1: pre-game guard — early exit before building full context
  if (isPreGameState(state)) {
    return [{
      id: `${latestEvent.id}-pregame`,
      gameId: latestEvent.gameId,
      type: "pre_game",
      priority: "info",
      createdAtIso: now,
      confidence: "medium",
      message: "Game hasn't fully started yet — good luck out there! 🏀",
      explanation: "No meaningful stats yet. Insights will appear as the game develops.",
      relatedTeamId: latestEvent.teamId,
    }];
  }

  const ctx = buildRuleContext(context);
  return [
    ...generateFoulInsights(ctx),
    ...generateClockInsights(ctx),
    ...generateShootingInsights(ctx),
    ...generateMomentumInsights(ctx),
    ...generateMiscInsights(ctx),
  ];
}

