import { z } from "zod";
import {
  EVENT_TYPES,
  FOUL_TYPES,
  SHOT_ZONES,
  TIMEOUT_TYPES,
  TURNOVER_TYPES,
  type GameEvent
} from "./types.js";

const baseSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  sequence: z.number().int().min(1),
  timestampIso: z.string().datetime(),
  period: z.number().int().min(1),
  clockSecondsRemaining: z.number().min(0),
  teamId: z.string().min(1),
  operatorId: z.string().min(1),
  type: z.enum(EVENT_TYPES)
});

const shotAttemptSchema = baseSchema.extend({
  type: z.literal("shot_attempt"),
  playerId: z.string().min(1),
  made: z.boolean(),
  points: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  zone: z.enum(SHOT_ZONES),
  assistedByPlayerId: z.string().min(1).optional()
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
  onPlayerId: z.string().min(1).optional()
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

export const gameEventSchema = z.discriminatedUnion("type", [
  shotAttemptSchema,
  reboundSchema,
  turnoverSchema,
  foulSchema,
  assistSchema,
  stealSchema,
  blockSchema,
  substitutionSchema,
  possessionStartSchema,
  possessionEndSchema,
  timeoutSchema
]);

export function parseGameEvent(input: unknown): GameEvent {
  return gameEventSchema.parse(input) as GameEvent;
}

export function isGameEvent(input: unknown): input is GameEvent {
  return gameEventSchema.safeParse(input).success;
}
