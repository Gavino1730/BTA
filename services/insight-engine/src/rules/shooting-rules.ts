import type { GameEvent } from "@bta/shared-schema";
import type { LiveInsight } from "../types.js";
import type { RuleContext } from "../rule-context.js";
import { resolveTeamLabel, resolvePlayerLabel } from "../utils.js";

export function generateShootingInsights(ctx: RuleContext): LiveInsight[] {
  const { context, allEvents, recentEvents, ourTeamId, now } = ctx;
  const { state, latestEvent } = context;
  const insights: LiveInsight[] = [];

  // ──────────────────────────────────────────────────────────────────
  // 8. Shot profile (perimeter-heavy) — our team
  // ──────────────────────────────────────────────────────────────────
  const ourSideId = ourTeamId ?? latestEvent.teamId;
  const recentShots = recentEvents.filter(
    (event): event is Extract<GameEvent, { type: "shot_attempt" }> =>
      event.type === "shot_attempt" && event.teamId === ourSideId,
  );
  if (recentShots.length >= 4) {
    const threes = recentShots.filter((shot) => shot.points === 3).length;
    const madeTwos = recentShots.filter((s) => s.points === 2 && s.made).length;
    const missedTwos = recentShots.filter((s) => s.points === 2 && !s.made).length;
    const ourLabel = resolveTeamLabel(state, ourSideId);

    if (threes / recentShots.length >= 0.75) {
      insights.push({
        id: `${latestEvent.id}-shot-profile`,
        gameId: latestEvent.gameId,
        type: "shot_profile",
        priority: "info",
        createdAtIso: now,
        confidence: "medium",
        message: `${ourLabel} is relying heavily on perimeter attempts`,
        explanation: "Recent shot mix is perimeter-heavy. Look for more paint touches and second-chance opportunities before settling for threes.",
        relatedTeamId: ourSideId,
      });
    } else if (missedTwos >= 3 && madeTwos === 0) {
      insights.push({
        id: `${latestEvent.id}-shot-miss-run`,
        gameId: latestEvent.gameId,
        type: "shot_profile",
        priority: "info",
        createdAtIso: now,
        confidence: "medium",
        message: `${ourLabel} is struggling on mid-range looks`,
        explanation: "Multiple missed 2-point attempts in a row. Try attacking the rim or spacing out for 3s if mid-range isn't falling.",
        relatedTeamId: ourSideId,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 10. Hot hand — player making shots efficiently in recent possessions
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId) {
    const HOT_HAND_WINDOW = 15;
    const recentOurShots = allEvents
      .filter((e): e is Extract<GameEvent, { type: "shot_attempt" }> =>
        e.type === "shot_attempt" && e.teamId === ourTeamId,
      )
      .slice(-HOT_HAND_WINDOW);

    const playerShotWindow = new Map<string, { makes: number; attempts: number }>();
    for (const shot of recentOurShots) {
      const entry = playerShotWindow.get(shot.playerId) ?? { makes: 0, attempts: 0 };
      entry.attempts++;
      if (shot.made) entry.makes++;
      playerShotWindow.set(shot.playerId, entry);
    }

    for (const [playerId, { makes, attempts }] of playerShotWindow.entries()) {
      if (attempts >= 4 && makes >= 3 && makes / attempts >= 0.6) {
        const pctStr = Math.round((makes / attempts) * 100);
        const playerLabel = resolvePlayerLabel(
          playerId,
          resolveTeamLabel(state, ourTeamId),
          context,
        );
        insights.push({
          id: `${latestEvent.id}-hot-${playerId}`,
          gameId: latestEvent.gameId,
          type: "hot_hand",
          priority: "important",
          createdAtIso: now,
          confidence: "high",
          message: `🔥 Hot hand: ${playerLabel} — ${makes}/${attempts} in recent looks (${pctStr}% FG)`,
          explanation: `${playerLabel} is locked in right now. Feed them more looks — an in-rhythm shooter is a high-value possession.`,
          relatedTeamId: ourTeamId,
          relatedPlayerId: playerId,
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 10b. Opponent hot hand — an opponent player is shooting efficiently
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId && state.opponentTeamId) {
    const OPP_HOT_WINDOW = 15;
    const opponentTeamId = state.opponentTeamId;
    const recentOppShots = allEvents
      .filter((e): e is Extract<GameEvent, { type: "shot_attempt" }> =>
        e.type === "shot_attempt" && e.teamId === opponentTeamId,
      )
      .slice(-OPP_HOT_WINDOW);

    const oppPlayerWindow = new Map<string, { makes: number; attempts: number }>();
    for (const shot of recentOppShots) {
      const entry = oppPlayerWindow.get(shot.playerId) ?? { makes: 0, attempts: 0 };
      entry.attempts++;
      if (shot.made) entry.makes++;
      oppPlayerWindow.set(shot.playerId, entry);
    }

    for (const [playerId, { makes, attempts }] of oppPlayerWindow.entries()) {
      if (attempts >= 4 && makes >= 3 && makes / attempts >= 0.6) {
        const pctStr = Math.round((makes / attempts) * 100);
        const oppLabel = resolveTeamLabel(state, opponentTeamId);
        const playerLabel = resolvePlayerLabel(playerId, oppLabel, context);
        insights.push({
          id: `${latestEvent.id}-opp-hot-${playerId}`,
          gameId: latestEvent.gameId,
          type: "opponent_hot_hand",
          priority: "important",
          createdAtIso: now,
          confidence: "high",
          message: `⚠️ ${playerLabel} is on fire — ${makes}/${attempts} recent shots (${pctStr}%)`,
          explanation: `${playerLabel} is shooting with high efficiency right now. Lock them down — send a better defender, deny catches, or shade help their way.`,
          relatedTeamId: opponentTeamId,
          relatedPlayerId: playerId,
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 11. Scoring drought — our team has gone cold from the field
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId) {
    const DROUGHT_WINDOW = 6;
    const recentOurShots = allEvents
      .filter((e): e is Extract<GameEvent, { type: "shot_attempt" }> =>
        e.type === "shot_attempt" && e.teamId === ourTeamId,
      )
      .slice(-DROUGHT_WINDOW);

    if (recentOurShots.length >= DROUGHT_WINDOW && recentOurShots.every((s) => !s.made)) {
      const ourLabel = resolveTeamLabel(state, ourTeamId);
      insights.push({
        id: `${latestEvent.id}-drought`,
        gameId: latestEvent.gameId,
        type: "scoring_drought",
        priority: "important",
        createdAtIso: now,
        confidence: "high",
        message: `❄️ ${ourLabel} scoreless on last ${DROUGHT_WINDOW} field goal attempts`,
        explanation: "Offense has gone cold. Try a set play for a rim attack, move the ball inside, or call a timeout to reset the half-court offense.",
        relatedTeamId: ourTeamId,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 20. Cold shooter — an individual player is 0-for-4 or worse
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId) {
    const COLD_WINDOW = 5;
    const recentOurShotsForCold = allEvents
      .filter((e): e is Extract<GameEvent, { type: "shot_attempt" }> =>
        e.type === "shot_attempt" && e.teamId === ourTeamId,
      )
      .slice(-COLD_WINDOW * 3);

    const coldWindow = new Map<string, { makes: number; attempts: number }>();
    for (const shot of recentOurShotsForCold) {
      const entry = coldWindow.get(shot.playerId) ?? { makes: 0, attempts: 0 };
      entry.attempts++;
      if (shot.made) entry.makes++;
      coldWindow.set(shot.playerId, entry);
    }

    for (const [playerId, { makes, attempts }] of coldWindow.entries()) {
      if (attempts >= 4 && makes === 0) {
        const ourLabel = resolveTeamLabel(state, ourTeamId);
        const playerLabel = resolvePlayerLabel(playerId, ourLabel, context);
        insights.push({
          id: `${latestEvent.id}-cold-${playerId}`,
          gameId: latestEvent.gameId,
          type: "cold_shooter",
          priority: "info",
          createdAtIso: now,
          confidence: "medium",
          message: `🥶 ${playerLabel} 0-for-${attempts} in recent looks — reduce shot volume`,
          explanation: `${playerLabel} is struggling from the field right now. Consider running sets for other players until they can get an easy look to rebuild rhythm.`,
          relatedTeamId: ourTeamId,
          relatedPlayerId: playerId,
        });
      }
    }
  }

  return insights;
}
