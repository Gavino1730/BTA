import { BONUS_FOUL_THRESHOLD } from "@bta/game-state";
import { isOvertimePeriod } from "@bta/shared-schema";
import type { LiveInsight } from "../types.js";
import type { RuleContext } from "../rule-context.js";
import { resolveTeamLabel, getClockSeconds } from "../utils.js";

export function generateClockInsights(ctx: RuleContext): LiveInsight[] {
  const { context, allEvents, ourTeamId, period, now, clockEnabled } = ctx;
  const { state, latestEvent } = context;
  const insights: LiveInsight[] = [];

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
    const otEvents = allEvents.filter((e) => e.period === period);
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
        relatedTeamId: latestEvent.teamId,
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
      const clutchPrev = allEvents.at(-2);
      const clutchPrevClock = clutchPrev ? getClockSeconds(clutchPrev) : Infinity;
      const clutchPrevPeriod = clutchPrev?.period ?? "";
      const justEnteredWindow = clutchPrevPeriod !== period || clutchPrevClock > 120;
      if (justEnteredWindow) {
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
            relatedTeamId: ourTeamId ?? latestEvent.teamId,
          });
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 14. Period-end urgency — last possession of Q1/Q2/Q3
  // ──────────────────────────────────────────────────────────────────
  if (clockEnabled) {
    const clockSec = getClockSeconds(latestEvent);
    const isRegularPeriodNotFinal = period === "Q1" || period === "Q2" || period === "Q3";
    if (isRegularPeriodNotFinal && clockSec > 0 && clockSec <= 18) {
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
          relatedTeamId: ourTeamId ?? latestEvent.teamId,
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 16. Timeout budget awareness — in Q4/OT, low timeout reserves
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
          explanation: "Late game with limited timeouts. Save remaining stoppages for must-have possessions and defensive control.",
          relatedTeamId: ourTeamId,
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 19. Fouls to give — late Q4/OT reminder
  // ──────────────────────────────────────────────────────────────────
  if (ourTeamId && clockEnabled) {
    const isLateGame = period === "Q4" || isOvertimePeriod(period);
    const clockSec = getClockSeconds(latestEvent);
    const FOULS_TO_GIVE_WINDOW = 45;
    if (isLateGame && clockSec > 0 && clockSec <= FOULS_TO_GIVE_WINDOW) {
      const ourPeriodFouls = (state.teamFoulsByPeriod[ourTeamId] ?? {})[period] ?? 0;
      const foulsRemaining = Math.max(0, BONUS_FOUL_THRESHOLD - 1 - ourPeriodFouls);
      const prevEvent = allEvents.at(-2);
      const prevClock = prevEvent ? getClockSeconds(prevEvent) : Infinity;
      const prevPeriod = prevEvent?.period ?? "";
      const justEnteredWindow = prevPeriod !== period || prevClock > FOULS_TO_GIVE_WINDOW;
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
          relatedTeamId: ourTeamId,
        });
      }
    }
  }

  return insights;
}
