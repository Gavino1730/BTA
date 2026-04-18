import { FOUL_OUT_THRESHOLD, BONUS_FOUL_THRESHOLD } from "@bta/game-state";
import type { LiveInsight } from "../types.js";
import type { RuleContext } from "../rule-context.js";
import { resolveTeamLabel, resolvePlayerLabel } from "../utils.js";

export function generateFoulInsights(ctx: RuleContext): LiveInsight[] {
  const { context, ourTeamId, period, now } = ctx;
  const { state, latestEvent } = context;
  const insights: LiveInsight[] = [];

  // ──────────────────────────────────────────────────────────────────
  // 2. Foul trouble — individual player (our side has priority label)
  // ──────────────────────────────────────────────────────────────────
  if (latestEvent.type === "foul") {
    const foulCount = state.playerFouls[latestEvent.playerId] ?? 0;
    const eventTeamLabel = resolveTeamLabel(state, latestEvent.teamId);
    const playerLabel = resolvePlayerLabel(latestEvent.playerId, eventTeamLabel, context);
    const isOurPlayer = ourTeamId == null || latestEvent.teamId === ourTeamId;
    const foulSubject = playerLabel;
    const FOUL_DANGER_THRESHOLD = 4;
    const FOUL_WARNING_THRESHOLD = 2;

    if (foulCount >= FOUL_OUT_THRESHOLD) {
      insights.push({
        id: `${latestEvent.id}-foul-out`,
        gameId: latestEvent.gameId,
        type: "foul_trouble",
        priority: "urgent",
        createdAtIso: now,
        confidence: "high",
        message: `🚫 ${foulSubject} has FOULED OUT (${foulCount} fouls)`,
        explanation: isOurPlayer
          ? `${foulSubject} is no longer eligible to play. Replace immediately and update defensive assignments.`
          : `${foulSubject} is no longer eligible to play. Attack their replacement and pressure depth.`,
        relatedTeamId: latestEvent.teamId,
        relatedPlayerId: latestEvent.playerId,
      });
    } else if (foulCount >= FOUL_DANGER_THRESHOLD) {
      insights.push({
        id: `${latestEvent.id}-foul-danger`,
        gameId: latestEvent.gameId,
        type: "foul_trouble",
        priority: "important",
        createdAtIso: now,
        confidence: "high",
        message: `⚠️ ${foulSubject} has ${foulCount} fouls — foul-out risk (not fouled out)`,
        explanation: isOurPlayer
          ? `${foulCount} personal fouls. Consider sitting ${foulSubject} immediately to protect roster depth.`
          : `${foulCount} personal fouls. Target ${foulSubject} in the post and on drives to force them off the floor.`,
        relatedTeamId: latestEvent.teamId,
        relatedPlayerId: latestEvent.playerId,
      });
    } else if (foulCount >= FOUL_WARNING_THRESHOLD) {
      insights.push({
        id: `${latestEvent.id}-foul-watch`,
        gameId: latestEvent.gameId,
        type: "foul_warning",
        priority: "info",
        createdAtIso: now,
        confidence: "medium",
        message: `Foul watch: ${foulSubject} is at ${foulCount} fouls`,
        explanation: isOurPlayer
          ? `${foulSubject} has ${foulCount} fouls. Start planning a possible substitution or reduced minutes to manage foul risk.`
          : `${foulSubject} on the other side has ${foulCount} fouls. Consider attacking their defensive assignments.`,
        relatedTeamId: latestEvent.teamId,
        relatedPlayerId: latestEvent.playerId,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. Team foul warning (bonus territory) — fires only at the moment
  //    the latest foul just pushed the fouling team into the bonus.
  // ──────────────────────────────────────────────────────────────────
  if (latestEvent.type === "foul") {
    const foulingTeamId = latestEvent.teamId;
    const periodFouls = (state.teamFoulsByPeriod[foulingTeamId] ?? {})[period] ?? 0;
    if (periodFouls === BONUS_FOUL_THRESHOLD) {
      const benefitingTeamId = foulingTeamId === state.homeTeamId
        ? state.awayTeamId
        : state.homeTeamId;
      const benefitingLabel = resolveTeamLabel(state, benefitingTeamId);
      const foulingLabel = resolveTeamLabel(state, foulingTeamId);
      const isOurBonus = benefitingTeamId === ourTeamId;
      insights.push({
        id: `${latestEvent.id}-bonus-${benefitingTeamId}`,
        gameId: latestEvent.gameId,
        type: "team_foul_warning",
        priority: "important",
        createdAtIso: now,
        confidence: "high",
        message: isOurBonus
          ? `${benefitingLabel} enters the bonus — attack the basket`
          : `${foulingLabel} has ${BONUS_FOUL_THRESHOLD} fouls — protect the ball`,
        explanation: isOurBonus
          ? `${foulingLabel} has hit ${BONUS_FOUL_THRESHOLD} team fouls this period. Drive to the rim and draw contact — every foul sends us to the line for 2 shots.`
          : `We have ${BONUS_FOUL_THRESHOLD} fouls this period. Any additional foul sends ${benefitingLabel} to the line. Be selective with contests — no reaching.`,
        relatedTeamId: benefitingTeamId,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 9. Sub suggestion — player with 4 fouls still on court
  //    If no bench player is available, suggest a timeout instead.
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId) {
    const ourLineup = state.activeLineupsByTeam[ourTeamId] ?? [];
    const activePlayerSet = new Set(ourLineup);
    const hasBenchPlayer = context.rosterPlayers
      ? context.rosterPlayers.some((p) => !activePlayerSet.has(p.id))
      : true;
    for (const playerId of ourLineup) {
      const fouls = state.playerFouls[playerId] ?? 0;
      if (fouls >= 4) {
        const playerLabel = resolvePlayerLabel(
          playerId,
          resolveTeamLabel(state, ourTeamId),
          context,
        );
        const isFouledOut = fouls >= 5;
        if (!hasBenchPlayer && !isFouledOut) {
          insights.push({
            id: `${latestEvent.id}-sub-${playerId}`,
            gameId: latestEvent.gameId,
            type: "timeout_suggestion",
            priority: "important",
            createdAtIso: now,
            confidence: "high",
            message: `Timeout: manage ${playerLabel} foul risk (${fouls} fouls, no bench depth)`,
            explanation: `${playerLabel} has ${fouls} fouls and is one foul from fouling out, but no bench players are available. Call a timeout to build a scheme that limits their foul exposure.`,
            relatedTeamId: ourTeamId,
            relatedPlayerId: playerId,
          });
        } else {
          insights.push({
            id: `${latestEvent.id}-sub-${playerId}`,
            gameId: latestEvent.gameId,
            type: "sub_suggestion",
            priority: isFouledOut ? "urgent" : "important",
            createdAtIso: now,
            confidence: "high",
            message: isFouledOut
              ? `Lineup correction: remove ${playerLabel} (${fouls} fouls, FOULED OUT)`
              : `Sub suggestion: rest ${playerLabel} (${fouls} fouls, foul-out risk)`,
            explanation: isFouledOut
              ? `${playerLabel} has fouled out and cannot stay on court. Replace immediately.`
              : `${playerLabel} is one foul from fouling out. Sit them now to protect roster depth for late-game situations.`,
            relatedTeamId: ourTeamId,
            relatedPlayerId: playerId,
          });
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 12. Depth warning — multiple active players in foul trouble
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId) {
    const DEPTH_FOUL_THRESHOLD = 3;
    const ourLineupForDepth = state.activeLineupsByTeam[ourTeamId] ?? [];
    const foulRiskInLineup = ourLineupForDepth.filter(
      (pid) => (state.playerFouls[pid] ?? 0) >= DEPTH_FOUL_THRESHOLD,
    );
    if (foulRiskInLineup.length >= 2) {
      const teamLabel = resolveTeamLabel(state, ourTeamId);
      const foulCounts = foulRiskInLineup
        .slice(0, 3)
        .map((pid) => {
          const label = resolvePlayerLabel(pid, teamLabel, context);
          const fouls = state.playerFouls[pid] ?? 0;
          return `${label} (${fouls})`;
        })
        .join(", ");
      insights.push({
        id: `${latestEvent.id}-depth`,
        gameId: latestEvent.gameId,
        type: "depth_warning",
        priority: "important",
        createdAtIso: now,
        confidence: "high",
        message: `⚠️ ${foulRiskInLineup.length} players on court with 3+ fouls: ${foulCounts}`,
        explanation: `Rotation depth is at risk. With ${foulRiskInLineup.length} players in foul trouble simultaneously, one whistle forces a disruptive sub. Consider rotating at least one of them now while it's your decision, not the referee's.`,
        relatedTeamId: ourTeamId,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 15. Opponent drawing fouls at high rate — we are fouling too much
  // ──────────────────────────────────────────────────────────────────
  if (state.opponentTeamId) {
    const OPP_FT_THRESHOLD = 6;
    const recentOppFTs = ctx.recentEvents.filter(
      (e): e is Extract<typeof e, { type: "free_throw_attempt" }> =>
        e.type === "free_throw_attempt"
        && e.teamId === state.opponentTeamId
        && (e as Extract<typeof e, { type: "free_throw_attempt" }>).attemptNumber === 1,
    );
    if (recentOppFTs.length >= OPP_FT_THRESHOLD) {
      const oppLabel = resolveTeamLabel(state, state.opponentTeamId);
      insights.push({
        id: `${latestEvent.id}-foul-rate`,
        gameId: latestEvent.gameId,
        type: "team_foul_warning",
        priority: "important",
        createdAtIso: now,
        confidence: "high",
        message: `${oppLabel} drawing fouls at will — ${recentOppFTs.length} FT trips in recent events`,
        explanation: "We are sending them to the line repeatedly. Tighten defensive positioning, avoid reaching, and emphasize legal contests. Free throws are the most efficient points they can score.",
        relatedTeamId: state.opponentTeamId,
      });
    }
  }

  return insights;
}
