import type { GameEvent } from "@bta/shared-schema";
import type { LiveInsight } from "../types.js";
import type { RuleContext } from "../rule-context.js";
import { resolveTeamLabel, computeUninterruptedRun } from "../utils.js";

export function generateMomentumInsights(ctx: RuleContext): LiveInsight[] {
  const { context, allEvents, ourTeamId, eventTeamLabel, period, now } = ctx;
  const { state, latestEvent } = context;
  const insights: LiveInsight[] = [];

  // ──────────────────────────────────────────────────────────────────
  // 7. Run detection — uninterrupted consecutive scoring
  // ──────────────────────────────────────────────────────────────────
  const opponentTeamId = state.opponentTeamId;
  if (opponentTeamId && ourTeamId) {
    const { points: oppRunPoints, startPeriod: oppRunPeriod } =
      computeUninterruptedRun(allEvents, opponentTeamId, ourTeamId);
    if (oppRunPoints >= 8) {
      const oppLabel = resolveTeamLabel(state, opponentTeamId);
      const periodNote = oppRunPeriod && oppRunPeriod !== period ? ` (started ${oppRunPeriod})` : "";
      insights.push({
        id: `${latestEvent.id}-opp-run`,
        gameId: latestEvent.gameId,
        type: "run_detection",
        priority: "urgent",
        createdAtIso: now,
        confidence: "high",
        message: `⚠️ ${oppLabel} on a ${oppRunPoints}-0 run${periodNote} — consider a timeout`,
        explanation: "Opponent has scored every basket since our last field goal. A timeout resets their rhythm, tightens your defense, and breaks their momentum.",
        relatedTeamId: opponentTeamId,
      });
    }

    const { points: ourRunPoints, startPeriod: ourRunPeriod } =
      computeUninterruptedRun(allEvents, ourTeamId, opponentTeamId);
    if (ourRunPoints >= 8) {
      const ourLabel = resolveTeamLabel(state, ourTeamId);
      const periodNote = ourRunPeriod && ourRunPeriod !== period ? ` (started ${ourRunPeriod})` : "";
      insights.push({
        id: `${latestEvent.id}-our-run`,
        gameId: latestEvent.gameId,
        type: "run_detection",
        priority: "info",
        createdAtIso: now,
        confidence: "high",
        message: `${ourLabel} on a ${ourRunPoints}-0 run${periodNote} — keep the pressure on`,
        explanation: "We've scored every basket since their last field goal. Maintain pace and avoid empty possessions — don't let them call timeout to reset.",
        relatedTeamId: ourTeamId,
      });
    }
  } else if (!ourTeamId && !opponentTeamId) {
    const recentMade = ctx.recentEvents.filter(
      (event): event is Extract<GameEvent, { type: "shot_attempt" }> =>
        event.type === "shot_attempt" && event.teamId === latestEvent.teamId && event.made,
    );
    const runPoints = recentMade.reduce((sum, event) => sum + event.points, 0);
    if (runPoints >= 8) {
      insights.push({
        id: `${latestEvent.id}-run`,
        gameId: latestEvent.gameId,
        type: "run_detection",
        priority: "info",
        createdAtIso: now,
        confidence: "high",
        message: `${eventTeamLabel} is on a ${runPoints}-point run`,
        explanation: "Recent made shots show momentum swing; consider a timeout or defensive adjustment.",
        relatedTeamId: latestEvent.teamId,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 13. Possession efficiency gap — opponent converting possessions
  //     significantly better than our team (PPP divergence)
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId && state.opponentTeamId) {
    const MIN_POSSESSIONS = 15;
    const EFFICIENCY_GAP = 0.25;
    const inferPossessions = (teamId: string): number =>
      allEvents.filter((e) => e.type === "shot_attempt" && e.teamId === teamId).length
      + allEvents.filter((e) => e.type === "turnover" && e.teamId === teamId).length;
    const explicitOurPoss = state.possessionsByTeam[ourTeamId] ?? 0;
    const explicitOppPoss = state.possessionsByTeam[state.opponentTeamId] ?? 0;
    const ourPossessions = explicitOurPoss > 0 ? explicitOurPoss : inferPossessions(ourTeamId);
    const oppPossessions = explicitOppPoss > 0
      ? explicitOppPoss
      : inferPossessions(state.opponentTeamId);
    const ourPoints = state.scoreByTeam[ourTeamId] ?? 0;
    const oppPoints = state.scoreByTeam[state.opponentTeamId] ?? 0;

    if (ourPossessions >= MIN_POSSESSIONS && oppPossessions >= MIN_POSSESSIONS) {
      const ourPPP = ourPoints / ourPossessions;
      const oppPPP = oppPoints / oppPossessions;
      const gap = oppPPP - ourPPP;
      if (gap >= EFFICIENCY_GAP) {
        const oppLabel = resolveTeamLabel(state, state.opponentTeamId);
        const ourLabel = resolveTeamLabel(state, ourTeamId);
        insights.push({
          id: `${latestEvent.id}-efficiency`,
          gameId: latestEvent.gameId,
          type: "efficiency",
          priority: "important",
          createdAtIso: now,
          confidence: "medium",
          message: `Efficiency gap: ${oppLabel} at ${oppPPP.toFixed(2)} PPP vs ${ourLabel} at ${ourPPP.toFixed(2)} PPP`,
          explanation: `${oppLabel} is getting significantly more value per possession. Prioritize higher-percentage looks — more rim attacks, fewer contested threes — and limit their transition opportunities.`,
          relatedTeamId: ourTeamId,
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 18. Opponent 3PT streak
  // ──────────────────────────────────────────────────────────────────
  if (state.opponentTeamId) {
    const OPP_3PT_WINDOW = 6;
    const OPP_3PT_HIT_THRESHOLD = 3;
    const recent3PAs = allEvents
      .filter(
        (e): e is Extract<GameEvent, { type: "shot_attempt" }> =>
          e.type === "shot_attempt"
          && e.teamId === state.opponentTeamId
          && (e as Extract<GameEvent, { type: "shot_attempt" }>).points === 3,
      )
      .slice(-OPP_3PT_WINDOW);

    if (recent3PAs.length >= OPP_3PT_WINDOW) {
      const made3s = recent3PAs.filter((e) => e.made).length;
      if (made3s >= OPP_3PT_HIT_THRESHOLD) {
        const oppLabel = resolveTeamLabel(state, state.opponentTeamId);
        const pct = Math.round((made3s / recent3PAs.length) * 100);
        insights.push({
          id: `${latestEvent.id}-3pt-streak`,
          gameId: latestEvent.gameId,
          type: "three_point_streak",
          priority: "important",
          createdAtIso: now,
          confidence: "high",
          message: `${oppLabel} hitting ${made3s}/${recent3PAs.length} recent 3s (${pct}%) — close out harder`,
          explanation: `${oppLabel} is getting rhythm from behind the arc. Step up on three-point shooters earlier, contest with a hand in their face, and consider switching defensive assignments to disrupt their catch-and-shoot looks.`,
          relatedTeamId: state.opponentTeamId,
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 21. Transition momentum — opponent converting turnovers/steals
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId && state.opponentTeamId) {
    const opponentId = state.opponentTeamId;
    const TRANSITION_WINDOW = 20;
    const recentForTransition = allEvents.slice(-TRANSITION_WINDOW);
    let transitionScores = 0;

    for (let i = 0; i < recentForTransition.length; i++) {
      const e = recentForTransition[i];
      if (
        (e.type === "turnover" || e.type === "steal") && e.teamId === ourTeamId
      ) {
        // Look ahead for a quick opponent score
        const nextShot = recentForTransition.slice(i + 1, i + 4).find(
          (n): n is Extract<GameEvent, { type: "shot_attempt" }> =>
            n.type === "shot_attempt" && n.teamId === opponentId && n.made,
        );
        if (nextShot) transitionScores++;
      }
    }

    if (transitionScores >= 2) {
      const oppLabel = resolveTeamLabel(state, opponentId);
      insights.push({
        id: `${latestEvent.id}-transition`,
        gameId: latestEvent.gameId,
        type: "transition_momentum",
        priority: "important",
        createdAtIso: now,
        confidence: "high",
        message: `⚡ ${oppLabel} scoring ${transitionScores} transition buckets — protect the ball`,
        explanation: "Opponent is capitalizing on turnovers with fast-break points. Slow down, secure possessions, and prevent easy transition opportunities.",
        relatedTeamId: opponentId,
      });
    }
  }

  return insights;
}
