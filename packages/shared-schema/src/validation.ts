import { z } from "zod";
import {
  EVENT_TYPES,
  FOUL_TYPES,
  SHOT_ZONES,
  TIMEOUT_TYPES,
  TURNOVER_TYPES,
  type GameEvent
} from "./types.js";

// Period must be Q1–Q4 or OT1, OT2, etc. per NFHS rules
const periodSchema = z.string().regex(/^(Q[1-4]|OT\d+)$/, "Period must be Q1, Q2, Q3, Q4, OT1, OT2, etc.");

const baseSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  gameId: z.string().min(1),
  sequence: z.number().int().min(1),
  timestampIso: z.string().datetime(),
  period: periodSchema,
  clockSecondsRemaining: z.number().min(0),
  teamId: z.string().min(1),
  operatorId: z.string().min(1),
  type: z.enum(EVENT_TYPES)
});

// Field goals only (2pt or 3pt) — free throws use free_throw_attempt
const shotAttemptSchema = baseSchema.extend({
  type: z.literal("shot_attempt"),
  playerId: z.string().min(1),
  made: z.boolean(),
  points: z.union([z.literal(2), z.literal(3)]),
  zone: z.enum(SHOT_ZONES),
  assistedByPlayerId: z.string().min(1).optional()
});

// Individual free throw — each FT tracked as a separate event per NFHS rules
const freeThrowAttemptSchema = baseSchema.extend({
  type: z.literal("free_throw_attempt"),
  playerId: z.string().min(1),
  made: z.boolean(),
  attemptNumber: z.number().int().min(1),
  totalAttempts: z.number().int().min(1).max(3)
});

const reboundSchema = baseSchema.extend({
  type: z.literal("rebound"),
  playerId: z.string().min(1),
  offensive: z.boolean()
});

const turnoverSchema = baseSchema.extend({
  type: z.literal("turnover"),
  playerId: z.string().min(1).optional(),
  turnoverType: z.enum(TURNOVER_TYPES),
  forcedByPlayerId: z.string().min(1).optional()
});

const foulSchema = baseSchema.extend({
  type: z.literal("foul"),
  playerId: z.string().min(1),
  foulType: z.enum(FOUL_TYPES),
  onPlayerId: z.string().min(1).optional(),
  shootingFoulPoints: z.union([z.literal(2), z.literal(3)]).optional(),
  andOne: z.boolean().optional()
});

const assistSchema = baseSchema.extend({
  type: z.literal("assist"),
  playerId: z.string().min(1),
  scorerPlayerId: z.string().min(1)
});

const stealSchema = baseSchema.extend({
  type: z.literal("steal"),
  playerId: z.string().min(1),
  againstPlayerId: z.string().min(1).optional()
});

const blockSchema = baseSchema.extend({
  type: z.literal("block"),
  playerId: z.string().min(1),
  againstPlayerId: z.string().min(1).optional()
});

const substitutionSchema = baseSchema.extend({
  type: z.literal("substitution"),
  playerOutId: z.string().min(1),
  playerInId: z.string().min(1)
});

const possessionStartSchema = baseSchema.extend({
  type: z.literal("possession_start"),
  possessedByTeamId: z.string().min(1)
});

const possessionEndSchema = baseSchema.extend({
  type: z.literal("possession_end"),
  possessedByTeamId: z.string().min(1),
  result: z.union([
    z.literal("made_basket"),
    z.literal("def_rebound"),
    z.literal("turnover"),
    z.literal("foul_shots"),
    z.literal("end_of_period")
  ])
});

const timeoutSchema = baseSchema.extend({
  type: z.literal("timeout"),
  timeoutType: z.enum(TIMEOUT_TYPES)
});

// Period transition — used to log period changes and trigger team foul resets
const periodTransitionSchema = baseSchema.extend({
  type: z.literal("period_transition"),
  newPeriod: periodSchema
});

export const gameEventSchema = z.discriminatedUnion("type", [
  shotAttemptSchema,
  freeThrowAttemptSchema,
  reboundSchema,
  turnoverSchema,
  foulSchema,
  assistSchema,
  stealSchema,
  blockSchema,
  substitutionSchema,
  possessionStartSchema,
  possessionEndSchema,
  timeoutSchema,
  periodTransitionSchema
]).refine(
  (event) => {
    // Validate free throw cross-constraints
    if (event.type === "free_throw_attempt") {
      return event.attemptNumber <= event.totalAttempts;
    }
    return true;
  },
  {
    message: "attemptNumber must be <= totalAttempts",
    path: ["attemptNumber"]
  }
).refine(
  (event) => {
    if (event.type === "period_transition") {
      return event.newPeriod !== event.period;
    }
    return true;
  },
  { message: "newPeriod must differ from the current period", path: ["newPeriod"] }
);

export function parseGameEvent(input: unknown): GameEvent {
  return gameEventSchema.parse(input) as GameEvent;
}

export function isGameEvent(input: unknown): input is GameEvent {
  return gameEventSchema.safeParse(input).success;

/** Maximum clock seconds allowed per period type (NFHS: 8-min quarters, 4-min OT). */
}

/** Maximum clock seconds allowed per period type (NFHS: 8-min quarters, 4-min OT). */
const CLOCK_MAX_BY_PERIOD: Record<string, number> = {
  Q1: 480, Q2: 480, Q3: 480, Q4: 480,
};
const OT_CLOCK_MAX = 240;

function clockMaxForPeriod(period: string): number {
  return CLOCK_MAX_BY_PERIOD[period] ?? OT_CLOCK_MAX;
}

/**
 * Validates that a sequence of events has strictly increasing `sequence` values
 * and that each event's `clockSecondsRemaining` does not exceed the NFHS maximum
 * for its period.
 *
 * Returns an array of error strings (empty when valid).
 */
export function validateEventSequence(events: GameEvent[]): string[] {
  const errors: string[] = [];
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    if (curr.sequence <= prev.sequence) {
      errors.push(
        `Event at index ${i} (id="${curr.id}") has sequence ${curr.sequence} ` +
        `which is not greater than previous sequence ${prev.sequence}.`
      );
    }
  }
  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    const max = clockMaxForPeriod(evt.period);
    if (evt.clockSecondsRemaining > max) {
      errors.push(
        `Event at index ${i} (id="${evt.id}", period="${evt.period}") has ` +
        `clockSecondsRemaining=${evt.clockSecondsRemaining} which exceeds max ${max}s for that period.`
      );
    }
  }
  return errors;
}
