import type { GameState } from "@bta/game-state";
import type { GameEvent } from "@bta/shared-schema";

export type InsightType =
  | "ai_coaching"
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

function resolvePlayerLabel(playerId: string, teamLabel: string): string {
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

  return playerId;
}

export function generateInsights(context: InsightContext): LiveInsight[] {
  const insights: LiveInsight[] = [];
  const { state, latestEvent } = context;
  const teamLabel = resolveTeamLabel(state, latestEvent.teamId);

  const recentEvents = state.events.slice(-MAX_RECENT_EVENTS);
  const now = new Date().toISOString();

  if (latestEvent.type === "foul") {
    const foulCount = state.playerFouls[latestEvent.playerId] ?? 0;
    if (foulCount >= 3) {
      const playerLabel = resolvePlayerLabel(latestEvent.playerId, teamLabel);
      const foulSubject = playerLabel.toLowerCase().endsWith(" team") ? playerLabel : `Player ${playerLabel}`;
      insights.push({
        id: `${latestEvent.id}-foul-trouble`,
        gameId: latestEvent.gameId,
        type: "foul_trouble",
        createdAtIso: now,
        confidence: "high",
        message: `${foulSubject} has ${foulCount} fouls`,
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
      message: `${teamLabel} has ${recentTurnovers} turnovers in recent possessions`,
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
      message: `${teamLabel} is on an ${runPoints}-point run`,
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
        message: `${teamLabel} is heavily relying on perimeter attempts`,
        explanation:
          "Recent shot mix is perimeter-heavy; evaluate rim pressure and paint touches.",
        relatedTeamId: latestEvent.teamId
      });
    }
  }

  return insights;
}
