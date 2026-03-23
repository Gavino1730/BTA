import type { GameState } from "@bta/game-state";
import type { GameEvent } from "@bta/shared-schema";

export type InsightType =
  | "run_detection"
  | "foul_trouble"
  | "turnover_pressure"
  | "shot_profile";

export interface LiveInsight {
  id: string;
  gameId: string;
  type: InsightType;
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
}

const MAX_RECENT_EVENTS = 8;

export function generateInsights(context: InsightContext): LiveInsight[] {
  const insights: LiveInsight[] = [];
  const { state, latestEvent } = context;

  const recentEvents = state.events.slice(-MAX_RECENT_EVENTS);
  const now = new Date().toISOString();

  if (latestEvent.type === "foul") {
    const foulCount = state.playerFouls[latestEvent.playerId] ?? 0;
    if (foulCount >= 3) {
      insights.push({
        id: `${latestEvent.id}-foul-trouble`,
        gameId: latestEvent.gameId,
        type: "foul_trouble",
        createdAtIso: now,
        confidence: "high",
        message: `Player ${latestEvent.playerId} has ${foulCount} fouls`,
        explanation: "Foul threshold reached; substitution or coverage adjustment may be needed.",
        relatedTeamId: latestEvent.teamId,
        relatedPlayerId: latestEvent.playerId
      });
    }
  }

  const recentTurnovers = recentEvents.filter(
    (event) => event.type === "turnover" && event.teamId === latestEvent.teamId
  ).length;
  if (recentTurnovers >= 3) {
    insights.push({
      id: `${latestEvent.id}-turnover-pressure`,
      gameId: latestEvent.gameId,
      type: "turnover_pressure",
      createdAtIso: now,
      confidence: "medium",
      message: `${latestEvent.teamId} has ${recentTurnovers} turnovers in recent possessions`,
      explanation: "Ball pressure appears to be disrupting offense; simplify entries and spacing.",
      relatedTeamId: latestEvent.teamId
    });
  }

  const recentMade = recentEvents.filter(
    (
      event
    ): event is Extract<GameEvent, { type: "shot_attempt" }> =>
      event.type === "shot_attempt" && event.teamId === latestEvent.teamId && event.made
  );
  const runPoints = recentMade.reduce((sum, event) => sum + event.points, 0);

  if (runPoints >= 8) {
    insights.push({
      id: `${latestEvent.id}-run`,
      gameId: latestEvent.gameId,
      type: "run_detection",
      createdAtIso: now,
      confidence: "high",
      message: `${latestEvent.teamId} is on an ${runPoints}-point run`,
      explanation: "Recent made shots show momentum swing; consider timeout or matchup change.",
      relatedTeamId: latestEvent.teamId
    });
  }

  const recentShots = recentEvents.filter(
    (event): event is Extract<GameEvent, { type: "shot_attempt" }> =>
      event.type === "shot_attempt" && event.teamId === latestEvent.teamId
  );

  if (recentShots.length >= 4) {
    const threes = recentShots.filter((shot) => shot.points === 3).length;
    if (threes / recentShots.length >= 0.75) {
      insights.push({
        id: `${latestEvent.id}-shot-profile`,
        gameId: latestEvent.gameId,
        type: "shot_profile",
        createdAtIso: now,
        confidence: "medium",
        message: `${latestEvent.teamId} is heavily relying on perimeter attempts`,
        explanation:
          "Recent shot mix is perimeter-heavy; evaluate rim pressure and paint touches.",
        relatedTeamId: latestEvent.teamId
      });
    }
  }

  return insights;
}
