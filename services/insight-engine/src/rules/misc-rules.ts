import type { LiveInsight } from "../types.js";
import type { RuleContext } from "../rule-context.js";
import { resolveTeamLabel } from "../utils.js";

export function generateMiscInsights(ctx: RuleContext): LiveInsight[] {
  const { context, recentEvents, ourTeamId, now } = ctx;
  const { state, latestEvent } = context;
  const insights: LiveInsight[] = [];

  // ──────────────────────────────────────────────────────────────────
  // 6. Turnover pressure (our team)
  // ──────────────────────────────────────────────────────────────────
  const recentOurTurnovers = recentEvents.filter(
    (event) => event.type === "turnover" && (ourTeamId == null || event.teamId === ourTeamId),
  ).length;
  if (recentOurTurnovers >= 3) {
    const toTeamId = ourTeamId ?? latestEvent.teamId;
    const toTeamLabel = resolveTeamLabel(state, toTeamId);
    insights.push({
      id: `${latestEvent.id}-turnover-pressure`,
      gameId: latestEvent.gameId,
      type: "turnover_pressure",
      priority: "important",
      createdAtIso: now,
      confidence: "medium",
      message: `${toTeamLabel} has ${recentOurTurnovers} turnovers in recent possessions`,
      explanation: "Ball pressure is disrupting the offense. Simplify entry actions, use timeouts to reset, or sub in a calmer ball-handler.",
      relatedTeamId: toTeamId,
    });
  }

  return insights;
}
