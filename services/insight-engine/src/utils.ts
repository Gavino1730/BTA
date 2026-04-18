import type { GameState } from "@bta/game-state";
import type { GameEvent } from "@bta/shared-schema";
import type { InsightContext } from "./types.js";

export const MAX_RECENT_EVENTS = 10;

export function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function prettifyTeamId(teamId: string): string {
  const normalized = teamId.toLowerCase();
  if (normalized === "home" || normalized === "team-home") {
    return "Home";
  }
  if (normalized === "away" || normalized === "team-away") {
    return "Away";
  }
  return toTitleCase(teamId.replace(/^team[-_]/i, ""));
}

export function resolveTeamLabel(state: GameState, teamId: string): string {
  const opponentName = state.opponentName?.trim();
  if (opponentName && state.opponentTeamId === teamId) {
    return opponentName;
  }
  return prettifyTeamId(teamId);
}

export function resolvePlayerLabel(
  playerId: string,
  teamLabel: string,
  context?: InsightContext,
): string {
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
  if (context?.rosterPlayers) {
    const found = context.rosterPlayers.find((p) => p.id === playerId);
    if (found) {
      return found.number ? `#${found.number} ${found.name}` : found.name;
    }
  }
  return playerId
    .replace(/^[a-z]{1,4}[-_]/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    || playerId;
}

/** Derive the "our team" id from the game state (if opponentTeamId is set, the other side is ours) */
export function resolveOurTeamId(state: GameState): string | null {
  if (!state.opponentTeamId) return null;
  if (state.homeTeamId !== state.opponentTeamId) return state.homeTeamId;
  if (state.awayTeamId !== state.opponentTeamId) return state.awayTeamId;
  return null;
}

/**
 * Returns true when the game hasn't really started:
 * still Q1, 0-0 score, and at most a handful of events (< 5).
 */
export function isPreGameState(state: GameState): boolean {
  const totalScore = Object.values(state.scoreByTeam).reduce((sum, s) => sum + s, 0);
  return state.currentPeriod === "Q1" && totalScore === 0 && state.events.length < 5;
}

export function getClockSeconds(event: GameEvent): number {
  return event.clockSecondsRemaining ?? 0;
}

/**
 * Walk backwards through scoring events, counting consecutive points by `runTeamId`
 * without `stopTeamId` having scored. Returns total run points and the period where
 * the run started (earliest scoring event in the uninterrupted streak).
 */
export function computeUninterruptedRun(
  events: GameEvent[],
  runTeamId: string,
  stopTeamId: string,
): { points: number; startPeriod?: string } {
  let points = 0;
  let startPeriod: string | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const isScoringEvent =
      (e.type === "shot_attempt" && (e as Extract<GameEvent, { type: "shot_attempt" }>).made) ||
      (e.type === "free_throw_attempt" && (e as Extract<GameEvent, { type: "free_throw_attempt" }>).made);
    if (!isScoringEvent) continue;
    if (e.teamId === stopTeamId) break;
    if (e.teamId === runTeamId) {
      const pts = e.type === "shot_attempt"
        ? (e as Extract<GameEvent, { type: "shot_attempt" }>).points
        : 1;
      points += pts;
      startPeriod = e.period;
    }
  }
  return { points, startPeriod };
}
