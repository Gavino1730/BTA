import type { GameState } from "@bta/game-state";
import { FOUL_OUT_THRESHOLD } from "@bta/game-state";
import { isOvertimePeriod, type GameEvent } from "@bta/shared-schema";

export type InsightType =
  | "ai_coaching"
  | "run_detection"
  | "foul_trouble"
  | "foul_warning"
  | "sub_suggestion"
  | "timeout_suggestion"
  | "turnover_pressure"
  | "shot_profile"
  | "hot_hand"
  | "team_foul_warning"
  | "ot_awareness"
  | "pre_game";

export interface LiveInsight {
  id: string;
  gameId: string;
  type: InsightType;
  /** Urgency tier: urgent = needs immediate action, important = act soon, info = situational awareness */
  priority: "urgent" | "important" | "info";
  createdAtIso: string;
  confidence: "high" | "medium";
  message: string;
  explanation: string;
  relatedTeamId?: string;
  relatedPlayerId?: string;
}

export interface InsightContext {
  state: GameState;
  latestEvent: GameEvent;
  /** Whether the operator has clock tracking enabled (undefined = unknown = treat as enabled) */
  clockEnabled?: boolean;
  /**
   * Optional roster player list so insights can display "#5 Marcus Johnson" instead of raw player IDs.
   * Pass the players for the home team (our team). Format: [{id, number, name}]
   */
  rosterPlayers?: Array<{ id: string; number?: string; name: string }>;
}

const MAX_RECENT_EVENTS = 10;

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function prettifyTeamId(teamId: string): string {
  const normalized = teamId.toLowerCase();
  if (normalized === "home" || normalized === "team-home") {
    return "Home";
  }
  if (normalized === "away" || normalized === "team-away") {
    return "Away";
  }
  return toTitleCase(teamId.replace(/^team[-_]/i, ""));
}

function resolveTeamLabel(state: GameState, teamId: string): string {
  const opponentName = state.opponentName?.trim();
  if (opponentName && state.opponentTeamId === teamId) {
    return opponentName;
  }
  return prettifyTeamId(teamId);
}

function resolvePlayerLabel(playerId: string, teamLabel: string, context?: InsightContext): string {
  const normalized = playerId.toLowerCase();
  if (
    normalized === "home-team"
    || normalized === "away-team"
    || normalized === "team-home"
    || normalized === "team-away"
    || normalized.endsWith("-team")
  ) {
    return `${teamLabel} team`;
  }
  // Try roster lookup first for proper "#5 Marcus Johnson" format
  if (context?.rosterPlayers) {
    const found = context.rosterPlayers.find((p) => p.id === playerId);
    if (found) {
      return found.number ? `#${found.number} ${found.name}` : found.name;
    }
  }
  // Pretty-print raw ID: strip common prefix, title-case
  return playerId
    .replace(/^[a-z]{1,4}[-_]/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    || playerId;
}

/** Derive the "our team" id from the game state (if opponentTeamId is set, the other side is ours) */
function resolveOurTeamId(state: GameState): string | null {
  if (!state.opponentTeamId) return null;
  if (state.homeTeamId !== state.opponentTeamId) return state.homeTeamId;
  if (state.awayTeamId !== state.opponentTeamId) return state.awayTeamId;
  return null;
}

/**
 * Returns true when the game hasn't really started:
 * still Q1, 0-0 score, and at most a handful of events (< 5).
 */
function isPreGameState(state: GameState): boolean {
  const totalScore = Object.values(state.scoreByTeam).reduce((sum, s) => sum + s, 0);
  return state.currentPeriod === "Q1" && totalScore === 0 && state.events.length < 5;
}

function getClockSeconds(event: GameEvent): number {
  return event.clockSecondsRemaining ?? 0;
}

export function generateInsights(context: InsightContext): LiveInsight[] {
  const insights: LiveInsight[] = [];
  const { state, latestEvent } = context;
  // clockEnabled undefined → treat as enabled (don't suppress time-sensitive alerts)
  const clockEnabled = context.clockEnabled !== false;

  const now = new Date().toISOString();
  const allEvents = state.events;
  const recentEvents = allEvents.slice(-MAX_RECENT_EVENTS);
  const period = state.currentPeriod;
  const ourTeamId = resolveOurTeamId(state);
  const eventTeamLabel = resolveTeamLabel(state, latestEvent.teamId);

  // ──────────────────────────────────────────────────────────────────
  // 1. Pre-game / no meaningful data guard
  // ──────────────────────────────────────────────────────────────────
  if (isPreGameState(state)) {
    insights.push({
      id: `${latestEvent.id}-pregame`,
      gameId: latestEvent.gameId,
      type: "pre_game",
      priority: "info",
      createdAtIso: now,
      confidence: "medium",
      message: "Game hasn't fully started yet — good luck out there! 🏀",
      explanation: "No meaningful stats yet. Insights will appear as the game develops.",
      relatedTeamId: latestEvent.teamId
    });
    return insights;
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. Foul trouble — individual player (our side has priority label)
  // ──────────────────────────────────────────────────────────────────
  if (latestEvent.type === "foul") {
    const foulCount = state.playerFouls[latestEvent.playerId] ?? 0;
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
          ? `${foulSubject} is no longer eligible to play. Replace immediately and update matchup assignments.`
          : `${foulSubject} is no longer eligible to play. Attack their replacement and pressure depth.` ,
        relatedTeamId: latestEvent.teamId,
        relatedPlayerId: latestEvent.playerId
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
        relatedPlayerId: latestEvent.playerId
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
        relatedPlayerId: latestEvent.playerId
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. Team foul warning (bonus territory)
  // ──────────────────────────────────────────────────────────────────
  for (const [teamId, inBonus] of Object.entries(state.bonusByTeam)) {
    if (inBonus) {
      const teamLabel = resolveTeamLabel(state, teamId);
      const isOurBonus = teamId === ourTeamId;
      insights.push({
        id: `${latestEvent.id}-bonus-${teamId}`,
        gameId: latestEvent.gameId,
        type: "team_foul_warning",
        priority: "important",
        createdAtIso: now,
        confidence: "high",
        message: isOurBonus
          ? `${teamLabel} is in the bonus — attack the basket`
          : `${teamLabel} is in bonus — protect the ball on offense`,
        explanation: isOurBonus
          ? "Opposing team has 5+ fouls this period. Drive to the rim and draw contact — every foul produces two free throws."
          : "We have 5+ fouls this period. Avoid unnecessary contact and keep the opponent out of the line.",
        relatedTeamId: teamId
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 4. OT awareness
  // ──────────────────────────────────────────────────────────────────
  if (isOvertimePeriod(period)) {
    const otNumber = parseInt(period.slice(2), 10);
    const ourScore = ourTeamId ? (state.scoreByTeam[ourTeamId] ?? 0) : null;
    const scores = Object.entries(state.scoreByTeam);
    const [, scoreA] = scores[0] ?? ["", 0];
    const [, scoreB] = scores[1] ?? ["", 0];
    const margin = Math.abs((scoreA as number) - (scoreB as number));

    // Only emit this once per OT period start (within the first 2 OT events)
    const otEvents = allEvents.filter(e => e.period === period);
    if (otEvents.length <= 2) {
      const timeoutNote = clockEnabled
        ? "Each OT period has 1 full timeout per team. Use it wisely."
        : "Note: clock tracking is off — monitor timeouts manually.";
      insights.push({
        id: `${latestEvent.id}-ot-${period}`,
        gameId: latestEvent.gameId,
        type: "ot_awareness",
        priority: "info",
        createdAtIso: now,
        confidence: "high",
        message: `Overtime ${otNumber > 1 ? otNumber : ""}— tied game, every possession matters`,
        explanation: `${timeoutNote} 4-minute period. ${margin === 0 && ourScore != null ? "First team to act decisively often wins." : ""}`,
        relatedTeamId: latestEvent.teamId
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 5. Clutch / late-game situational awareness (clock must be enabled)
  // ──────────────────────────────────────────────────────────────────
  if (clockEnabled) {
    const clockSec = getClockSeconds(latestEvent);
    const isQ4OrOT = period === "Q4" || isOvertimePeriod(period);

    if (isQ4OrOT && clockSec <= 120 && clockSec > 0) {
      const scores = Object.entries(state.scoreByTeam);
      const [teamA, scoreA] = scores[0] ?? ["", 0];
      const [teamB, scoreB] = scores[1] ?? ["", 0];
      const ourScore = ourTeamId ? (state.scoreByTeam[ourTeamId] ?? 0) : null;
      const theirTeamId = teamA === ourTeamId ? teamB : teamA;
      const theirScore = ourTeamId ? (state.scoreByTeam[theirTeamId] ?? 0) : null;
      const margin = ourScore != null && theirScore != null ? ourScore - theirScore : null;

      let message = "";
      let explanation = "";

      if (margin != null) {
        const abs = Math.abs(margin);
        const clockStr = clockSec >= 60
          ? `${Math.floor(clockSec / 60)}:${String(clockSec % 60).padStart(2, "0")}`
          : `${clockSec}s`;

        if (margin === 0) {
          message = `Tied with ${clockStr} left — next score wins it`;
          explanation = clockSec <= 30
            ? "Timeout use: if you have one left, use it now to set up the last possession. Foul if they get the ball first."
            : "Protect the ball and get a quality shot attempt. Limit turnovers at all costs.";
        } else if (margin > 0 && abs <= 3) {
          message = `Up ${abs} with ${clockStr} — protect the lead`;
          explanation = abs === 1
            ? "If possible, foul is not beneficial yet. Force a tough shot and secure the rebound."
            : "Make them score twice. Foul if the shot clock is emptying; avoid giving up 3-point looks.";
        } else if (margin < 0 && abs <= 6) {
          message = `Down ${abs} with ${clockStr} — need a stop then score`;
          explanation = abs <= 2
            ? "One possession. Get a stop and push pace; consider a quick timeout to draw up a set play."
            : `Down ${abs} with ${clockStr}. Foul quickly to extend the game, then execute a 3-point play or get two quick stops.`;
        } else if (margin < 0 && abs > 6 && clockSec <= 60) {
          message = `Down ${abs} with ${clockStr} — foul immediately`;
          explanation = "Must foul to stop the clock and force free throws. Don't waste seconds.";
        }
      } else {
        // No "our team" context available
        if (Math.abs((scoreA as number) - (scoreB as number)) <= 3) {
          const aScore = scoreA as number;
          const bScore = scoreB as number;
          message = `One-possession game with ${clockSec}s left`;
          explanation = `${aScore} – ${bScore}. Next turnover or foul shift could decide this game.`;
        }
      }

      if (message) {
        insights.push({
          id: `${latestEvent.id}-clutch-${period}-${clockSec}`,
          gameId: latestEvent.gameId,
          type: "timeout_suggestion",
          priority: "urgent",
          createdAtIso: now,
          confidence: "high",
          message,
          explanation,
          relatedTeamId: ourTeamId ?? latestEvent.teamId
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 6. Turnover pressure (our team)
  // ──────────────────────────────────────────────────────────────────
  const recentOurTurnovers = recentEvents.filter(
    (event) => event.type === "turnover" && (ourTeamId == null || event.teamId === ourTeamId)
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
      relatedTeamId: toTeamId
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // 7. Opponent run detection — alert so our team can respond
  // ──────────────────────────────────────────────────────────────────
  const opponentTeamId = state.opponentTeamId;
  if (opponentTeamId) {
    const recentOppMade = recentEvents.filter(
      (event): event is Extract<GameEvent, { type: "shot_attempt" }> =>
        event.type === "shot_attempt" && event.teamId === opponentTeamId && event.made
    );
    const oppRunPoints = recentOppMade.reduce((sum, event) => sum + event.points, 0);
    if (oppRunPoints >= 8) {
      const oppLabel = resolveTeamLabel(state, opponentTeamId);
      insights.push({
        id: `${latestEvent.id}-opp-run`,
        gameId: latestEvent.gameId,
        type: "run_detection",
        priority: "urgent",
        createdAtIso: now,
        confidence: "high",
        message: `⚠️ ${oppLabel} on an ${oppRunPoints}-pt run — consider a timeout`,
        explanation: "Opponent momentum is building. A timeout can reset their rhythm, tighten your defense, and give your bench a breather.",
        relatedTeamId: opponentTeamId
      });
    }
  }

  // Our team run detection (positive momentum context)
  if (ourTeamId) {
    const recentOurMade = recentEvents.filter(
      (event): event is Extract<GameEvent, { type: "shot_attempt" }> =>
        event.type === "shot_attempt" && event.teamId === ourTeamId && event.made
    );
    const ourRunPoints = recentOurMade.reduce((sum, event) => sum + event.points, 0);
    if (ourRunPoints >= 8) {
      const ourLabel = resolveTeamLabel(state, ourTeamId);
      insights.push({
        id: `${latestEvent.id}-our-run`,
        gameId: latestEvent.gameId,
        type: "run_detection",
        priority: "info",
        createdAtIso: now,
        confidence: "high",
        message: `${ourLabel} on a ${ourRunPoints}-pt run — keep the pressure on`,
        explanation: "Momentum is with us. Maintain pace and avoid empty possessions — don't let the opponent call timeout to reset.",
        relatedTeamId: ourTeamId
      });
    }
  } else {
    // No "our team" context — fall back to both teams
    const recentMade = recentEvents.filter(
      (event): event is Extract<GameEvent, { type: "shot_attempt" }> =>
        event.type === "shot_attempt" && event.teamId === latestEvent.teamId && event.made
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
        explanation: "Recent made shots show momentum swing; consider timeout or matchup change.",
        relatedTeamId: latestEvent.teamId
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 8. Shot profile (perimeter-heavy) — our team
  // ──────────────────────────────────────────────────────────────────
  const ourSideId = ourTeamId ?? latestEvent.teamId;
  const recentShots = recentEvents.filter(
    (event): event is Extract<GameEvent, { type: "shot_attempt" }> =>
      event.type === "shot_attempt" && event.teamId === ourSideId
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
        relatedTeamId: ourSideId
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
        relatedTeamId: ourSideId
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 9. Sub suggestion — player with 4 fouls still on court
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId) {
    const ourLineup = state.activeLineupsByTeam[ourTeamId] ?? [];
    for (const playerId of ourLineup) {
      const fouls = state.playerFouls[playerId] ?? 0;
      if (fouls >= 4) {
        const playerLabel = resolvePlayerLabel(playerId, resolveTeamLabel(state, ourTeamId), context);
        const isFouledOut = fouls >= 5;
        insights.push({
          id: `${latestEvent.id}-sub-${playerId}`,
          gameId: latestEvent.gameId,
          type: "sub_suggestion",
          priority: isFouledOut ? "urgent" : "important",
          createdAtIso: now,
          confidence: "high",
          message: isFouledOut
            ? `Lineup correction: remove ${playerLabel} (${fouls} fouls, FOULED OUT)`
            : `Sub suggestion: rest ${playerLabel} (${fouls} fouls, foul-out risk)` ,
          explanation: isFouledOut
            ? `${playerLabel} has fouled out and cannot stay on court. Replace immediately.`
            : `${playerLabel} is one foul from fouling out. Sit them now to protect roster depth for late-game situations.`,
          relatedTeamId: ourTeamId,
          relatedPlayerId: playerId
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 10. Hot hand — player making shots efficiently in recent possessions
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId) {
    const HOT_HAND_WINDOW = 15;
    const recentOurShots = allEvents
      .filter((e): e is Extract<GameEvent, { type: "shot_attempt" }> =>
        e.type === "shot_attempt" && e.teamId === ourTeamId
      )
      .slice(-HOT_HAND_WINDOW);

    // Tally makes and attempts per player in recent window
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
        const playerLabel = resolvePlayerLabel(playerId, resolveTeamLabel(state, ourTeamId), context);
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
          relatedPlayerId: playerId
        });
      }
    }
  }

  return insights;
}
