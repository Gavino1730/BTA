import type { GameState } from "@bta/game-state";
import { FOUL_OUT_THRESHOLD, BONUS_FOUL_THRESHOLD } from "@bta/game-state";
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
  | "pre_game"
  | "scoring_drought"
  | "depth_warning"
  | "efficiency"
  | "leverage"
  | "matchup_exploitation"
  | "three_point_streak"
  | "foul_to_give"
  | "opponent_hot_hand"
  | "cold_shooter"
  | "transition_momentum";

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

/**
 * Walk backwards through scoring events, counting consecutive points by `runTeamId`
 * without `stopTeamId` having scored. Returns total run points and the period where
 * the run started (earliest scoring event in the uninterrupted streak).
 */
function computeUninterruptedRun(
  events: GameEvent[],
  runTeamId: string,
  stopTeamId: string
): { points: number; startPeriod?: string } {
  let points = 0;
  let startPeriod: string | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const isScoringEvent =
      (e.type === "shot_attempt" && (e as Extract<GameEvent, { type: "shot_attempt" }>).made) ||
      (e.type === "free_throw_attempt" && (e as Extract<GameEvent, { type: "free_throw_attempt" }>).made);
    if (!isScoringEvent) continue;
    if (e.teamId === stopTeamId) break; // other team scored — run is over
    if (e.teamId === runTeamId) {
      const pts = e.type === "shot_attempt"
        ? (e as Extract<GameEvent, { type: "shot_attempt" }>).points
        : 1;
      points += pts;
      startPeriod = e.period; // keep overwriting; last assignment = earliest event in run
    }
  }
  return { points, startPeriod };
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
  // 3. Team foul warning (bonus territory) — fires only at the moment
  //    the latest foul just pushed the fouling team into the bonus.
  //    The dashboard scoreboard already shows the ongoing bonus state,
  //    so re-alerting every event would be pure noise.
  // ──────────────────────────────────────────────────────────────────
  if (latestEvent.type === "foul") {
    const foulingTeamId = latestEvent.teamId;
    // Period fouls for the team that just fouled
    const periodFouls = (state.teamFoulsByPeriod[foulingTeamId] ?? {})[period] ?? 0;
    if (periodFouls === BONUS_FOUL_THRESHOLD) {
      // The fouling team just hit the threshold — the opposing team just entered bonus
      const benefitingTeamId = foulingTeamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId;
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
        relatedTeamId: benefitingTeamId
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
      // Only fire once when clock first enters the ≤120s window, not on every subsequent event
      const clutchPrev = allEvents.at(-2);
      const clutchPrevClock = clutchPrev ? getClockSeconds(clutchPrev) : Infinity;
      const clutchPrevPeriod = clutchPrev?.period ?? "";
      const justEnteredWindow = clutchPrevPeriod !== period || clutchPrevClock > 120;
      if (!justEnteredWindow) {
        // Skip clutch alert for repeated events in-window, but continue evaluating other rules.
      } else {

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
            id: `${latestEvent.id}-clutch-${period}`,
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
  // 7. Run detection — uninterrupted consecutive scoring
  //    Walks backwards through ALL events; counts each team's streak
  //    of unanswered points since the other team last scored.
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
        relatedTeamId: opponentTeamId
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
        relatedTeamId: ourTeamId
      });
    }
  } else if (!ourTeamId && !opponentTeamId) {
    // Neither team is identified — fall back to event's team using recent window
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
  //    If no bench player is available, suggest a timeout instead.
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId) {
    const ourLineup = state.activeLineupsByTeam[ourTeamId] ?? [];
    const activePlayerSet = new Set(ourLineup);
    // Only flag bench-empty when a roster is provided; assume bench exists otherwise
    const hasBenchPlayer = context.rosterPlayers
      ? context.rosterPlayers.some((p) => !activePlayerSet.has(p.id))
      : true;
    for (const playerId of ourLineup) {
      const fouls = state.playerFouls[playerId] ?? 0;
      if (fouls >= 4) {
        const playerLabel = resolvePlayerLabel(playerId, resolveTeamLabel(state, ourTeamId), context);
        const isFouledOut = fouls >= 5;
        if (!hasBenchPlayer && !isFouledOut) {
          // Can't sub — suggest a timeout to manage foul exposure through scheme
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
            relatedPlayerId: playerId
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
            relatedPlayerId: playerId
          });
        }
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

  // ──────────────────────────────────────────────────────────────────
  // 10b. Opponent hot hand — an opponent player is shooting efficiently.
  //      Prompts a defensive adjustment or matchup switch.
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId && state.opponentTeamId) {
    const OPP_HOT_WINDOW = 15;
    const opponentTeamId = state.opponentTeamId;
    const recentOppShots = allEvents
      .filter((e): e is Extract<GameEvent, { type: "shot_attempt" }> =>
        e.type === "shot_attempt" && e.teamId === opponentTeamId
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
          relatedPlayerId: playerId
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
        e.type === "shot_attempt" && e.teamId === ourTeamId
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
        relatedTeamId: ourTeamId
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 20. Cold shooter — an individual player is 0-for-4 or worse in
  //     recent attempts. Coach should reduce their shot volume.
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId) {
    const COLD_WINDOW = 5;
    const recentOurShotsForCold = allEvents
      .filter((e): e is Extract<GameEvent, { type: "shot_attempt" }> =>
        e.type === "shot_attempt" && e.teamId === ourTeamId
      )
      .slice(-COLD_WINDOW * 3); // wider scan so low-volume players show up

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
          relatedPlayerId: playerId
        });
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
      (pid) => (state.playerFouls[pid] ?? 0) >= DEPTH_FOUL_THRESHOLD
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
        relatedTeamId: ourTeamId
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
    // Use explicit possession tracking when available; infer from FGA + turnovers otherwise
    // so this rule fires even when operators don't log possession_start events.
    const inferPossessions = (teamId: string): number =>
      allEvents.filter((e) => e.type === "shot_attempt" && e.teamId === teamId).length
      + allEvents.filter((e) => e.type === "turnover" && e.teamId === teamId).length;
    const explicitOurPoss = state.possessionsByTeam[ourTeamId] ?? 0;
    const explicitOppPoss = state.possessionsByTeam[state.opponentTeamId] ?? 0;
    const ourPossessions = explicitOurPoss > 0 ? explicitOurPoss : inferPossessions(ourTeamId);
    const oppPossessions = explicitOppPoss > 0 ? explicitOppPoss : inferPossessions(state.opponentTeamId);
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
          relatedTeamId: ourTeamId
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 14. Period-end urgency — last possession of Q1/Q2/Q3
  //     (Q4/OT late-clock is handled by the clutch rule above)
  // ──────────────────────────────────────────────────────────────────
  if (clockEnabled) {
    const clockSec = getClockSeconds(latestEvent);
    const isRegularPeriodNotFinal = period === "Q1" || period === "Q2" || period === "Q3";
    if (isRegularPeriodNotFinal && clockSec > 0 && clockSec <= 18) {
      const periodDurationSec = 480; // NFHS: 8-min quarters
      // Only emit once per period-end window: check if previous event was also in this window
      // to avoid repeated alerts on consecutive events in garbage time. Use a simple guard:
      // only alert when the clock just entered the window (previous clock > 18 or not in same period).
      const prevEvent = allEvents.at(-2);
      const prevClock = prevEvent ? getClockSeconds(prevEvent) : Infinity;
      const prevPeriod = prevEvent?.period ?? "";
      if (prevPeriod !== period || prevClock > 18) {
        insights.push({
          id: `${latestEvent.id}-period-end-${period}`,
          gameId: latestEvent.gameId,
          type: "leverage",
          priority: "info",
          createdAtIso: now,
          confidence: "high",
          message: `Last possession of ${period} — get a quality look`,
          explanation: "Last few seconds of the period. Use remaining clock for a high-percentage shot. Communicate the play and avoid a rushed, low-quality attempt.",
          relatedTeamId: ourTeamId ?? latestEvent.teamId
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 15. Opponent drawing fouls at high rate — we are fouling too much
  // ──────────────────────────────────────────────────────────────────
  if (state.opponentTeamId) {
    const OPP_FT_THRESHOLD = 6;
    const recentOppFTs = recentEvents.filter(
      (e): e is Extract<GameEvent, { type: "free_throw_attempt" }> =>
        e.type === "free_throw_attempt" && e.teamId === state.opponentTeamId && e.attemptNumber === 1
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
        relatedTeamId: state.opponentTeamId
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 16. Timeout budget awareness — in Q4/OT, low timeout reserves
  //     should trigger urgency when game is still within reach.
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId && latestEvent.type === "timeout" && latestEvent.teamId === ourTeamId) {
    const isLateGame = period === "Q4" || isOvertimePeriod(period);
    if (isLateGame && state.opponentTeamId) {
      const TOTAL_TIMEOUTS = 5;
      const used = state.timeoutsByTeam[ourTeamId] ?? 0;
      const left = Math.max(0, TOTAL_TIMEOUTS - used);
      const ourScore = state.scoreByTeam[ourTeamId] ?? 0;
      const oppScore = state.scoreByTeam[state.opponentTeamId] ?? 0;
      const margin = ourScore - oppScore;
      const withinReach = margin >= -8;

      if (left < 2 && withinReach) {
        insights.push({
          id: `${latestEvent.id}-timeout-budget`,
          gameId: latestEvent.gameId,
          type: "timeout_suggestion",
          priority: "important",
          createdAtIso: now,
          confidence: "high",
          message: `Timeout budget low: ${left} left in ${period}`,
          explanation: "Late game with limited timeouts. Save remaining stoppages for must-have possessions and defensive matchup control.",
          relatedTeamId: ourTeamId
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 17. Matchup exploitation — a defender with an active matchup
  //     assignment has accumulated foul trouble, signalling a risk
  //     to the current defensive assignment.
  // ──────────────────────────────────────────────────────────────────
  if (latestEvent.type === "foul" && ourTeamId) {
    const foulEvent = latestEvent as Extract<GameEvent, { type: "foul" }>;
    const defenderId: string = (foulEvent as unknown as Record<string, string>).playerId ?? "";
    if (defenderId) {
      const assignments = state.activeMatchupsByTeam[ourTeamId] ?? {};
      const assignedOppId = assignments[defenderId];
      if (assignedOppId) {
        const fouls = state.playerFouls[defenderId] ?? 0;
        const MATCHUP_FOUL_THRESHOLD = 3;
        if (fouls >= MATCHUP_FOUL_THRESHOLD) {
          const teamLabel = resolveTeamLabel(state, ourTeamId);
          const defLabel = resolvePlayerLabel(defenderId, teamLabel, context);
          // Strip "opp-" prefix to get opponent jersey number
          const oppJersey = assignedOppId.replace(/^opp-/i, "");
          const warning = fouls >= FOUL_OUT_THRESHOLD - 1 ? "near foul-out" : `${fouls} fouls`;
          insights.push({
            id: `${latestEvent.id}-matchup-foul-${defenderId}`,
            gameId: latestEvent.gameId,
            type: "matchup_exploitation",
            priority: fouls >= FOUL_OUT_THRESHOLD - 1 ? "urgent" : "important",
            createdAtIso: now,
            confidence: "high",
            message: `${defLabel} (${warning}) assigned to guard #${oppJersey} — consider a switch`,
            explanation: `${defLabel} is in foul trouble while covering opponent #${oppJersey}. Keeping this matchup risks a foul-out or strategic fouling by the opponent. Consider switching assignments or adjusting the defensive scheme.`,
            relatedTeamId: ourTeamId,
            relatedPlayerId: defenderId
          });
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 18. Opponent 3PT streak — if opponent hits 3 or more of their last
  //     6 three-point attempts, flag a defensive scheme adjustment.
  // ──────────────────────────────────────────────────────────────────
  if (state.opponentTeamId) {
    const OPP_3PT_WINDOW = 6;
    const OPP_3PT_HIT_THRESHOLD = 3;
    const recent3PAs = allEvents
      .filter(
        (e): e is Extract<GameEvent, { type: "shot_attempt" }> =>
          e.type === "shot_attempt" && e.teamId === state.opponentTeamId &&
          (e as Extract<GameEvent, { type: "shot_attempt" }>).points === 3
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
          relatedTeamId: state.opponentTeamId
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 19. Fouls to give — late Q4/OT reminder that our team can foul
  //     without sending the opponent to the line yet. Useful for
  //     disrupting a late-game possession without burning a timeout.
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId && clockEnabled) {
    const isLateGame = period === "Q4" || isOvertimePeriod(period);
    const clockSec = getClockSeconds(latestEvent);
    const FOUlS_TO_GIVE_WINDOW = 45;
    if (isLateGame && clockSec > 0 && clockSec <= FOUlS_TO_GIVE_WINDOW) {
      const ourPeriodFouls = (state.teamFoulsByPeriod[ourTeamId] ?? {})[period] ?? 0;
      const foulsRemaining = Math.max(0, BONUS_FOUL_THRESHOLD - 1 - ourPeriodFouls);
      // Only alert once per entry into this window (same guard as period-end urgency)
      const prevEvent = allEvents.at(-2);
      const prevClock = prevEvent ? getClockSeconds(prevEvent) : Infinity;
      const prevPeriod = prevEvent?.period ?? "";
      const justEnteredWindow = prevPeriod !== period || prevClock > FOUlS_TO_GIVE_WINDOW;
      if (foulsRemaining >= 1 && justEnteredWindow) {
        insights.push({
          id: `${latestEvent.id}-fouls-to-give`,
          gameId: latestEvent.gameId,
          type: "foul_to_give",
          priority: "info",
          createdAtIso: now,
          confidence: "high",
          message: `${foulsRemaining} foul${foulsRemaining > 1 ? "s" : ""} to give — can foul without sending them to the line`,
          explanation: `We have ${foulsRemaining} defensive foul${foulsRemaining > 1 ? "s" : ""} available before the bonus is triggered. Use them to stop the clock, deny an inbound, or break up a possession without giving free throws.`,
          relatedTeamId: ourTeamId
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 21. Transition momentum — opponent converting turnovers/steals
  //     into quick buckets. Signals a need for defensive discipline.
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId && state.opponentTeamId) {
    const opponentTeamId = state.opponentTeamId;
    const TRANSITION_WINDOW = 20;
    const recentForTransition = allEvents.slice(-TRANSITION_WINDOW);
    let transitionScores = 0;

    for (let i = 0; i < recentForTransition.length; i++) {
      const e = recentForTransition[i];
      const isTrigger =
        (e.type === "steal" && e.teamId === opponentTeamId) ||
        (e.type === "turnover" && e.teamId === ourTeamId);
      if (!isTrigger) continue;
      // Count as transition if opponent scores within the next 3 events
      for (let j = i + 1; j <= i + 3 && j < recentForTransition.length; j++) {
        const next = recentForTransition[j];
        if (next.type === "shot_attempt" && next.teamId === opponentTeamId && next.made) {
          transitionScores++;
          break;
        }
      }
    }

    if (transitionScores >= 2) {
      const oppLabel = resolveTeamLabel(state, opponentTeamId);
      insights.push({
        id: `${latestEvent.id}-transition`,
        gameId: latestEvent.gameId,
        type: "transition_momentum",
        priority: "important",
        createdAtIso: now,
        confidence: "medium",
        message: `🏃 ${oppLabel} converting turnovers into transition points (${transitionScores}x)`,
        explanation: `${oppLabel} has scored quickly off ${transitionScores} live-ball turnovers in recent possessions. Slow down after misses and turnovers — get organized in transition defense before the opponent can push.`,
        relatedTeamId: opponentTeamId
      });
    }
  }

  return insights;
}
