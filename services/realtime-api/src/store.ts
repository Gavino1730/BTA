import {
  applyEvent,
  createInitialGameState,
  replayEvents,
  type GameState
} from "@bta/game-state";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { resolve } from "node:path";
import {
  generateInsights,
  type LiveInsight
} from "@bta/insight-engine";
import { parseGameEvent, type GameEvent } from "@bta/shared-schema";

export interface CreateGameInput {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
}

interface GameSession {
  homeTeamId: string;
  awayTeamId: string;
  state: GameState;
  eventsById: Map<string, GameEvent>;
  eventIdsBySequence: Map<number, string>;
  insights: LiveInsight[];
}

interface PersistedGameSession {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  events: GameEvent[];
}

const sessions = new Map<string, GameSession>();
const persistenceEnabled = !process.env.VITEST && process.env.NODE_ENV !== "test";
const dataDirectory = resolve(process.cwd(), ".bta-data");
const dataFile = resolve(dataDirectory, "realtime-api.json");

function persistSessions() {
  if (!persistenceEnabled) {
    return;
  }

  mkdirSync(dataDirectory, { recursive: true });

  const payload: PersistedGameSession[] = [...sessions.values()].map((session) => ({
    gameId: session.state.gameId,
    homeTeamId: session.homeTeamId,
    awayTeamId: session.awayTeamId,
    events: listOrderedEvents(session)
  }));

  writeFileSync(dataFile, JSON.stringify(payload, null, 2), "utf8");
}

function restoreSessions() {
  if (!persistenceEnabled || !existsSync(dataFile)) {
    return;
  }

  const payload = JSON.parse(readFileSync(dataFile, "utf8")) as PersistedGameSession[];
  for (const session of payload) {
    const initialState = createInitialGameState(
      session.gameId,
      session.homeTeamId,
      session.awayTeamId
    );
    const restoredSession: GameSession = {
      homeTeamId: session.homeTeamId,
      awayTeamId: session.awayTeamId,
      state: replayEvents(initialState, session.events),
      eventsById: new Map(session.events.map((event) => [event.id, event])),
      eventIdsBySequence: new Map(session.events.map((event) => [event.sequence, event.id])),
      insights: []
    };

    recomputeSession(restoredSession);
    sessions.set(session.gameId, restoredSession);
  }
}

restoreSessions();

export function createGame(input: CreateGameInput): GameState {
  const state = createInitialGameState(
    input.gameId,
    input.homeTeamId,
    input.awayTeamId
  );

  sessions.set(input.gameId, {
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    state,
    eventsById: new Map<string, GameEvent>(),
    eventIdsBySequence: new Map<number, string>(),
    insights: []
  });

  persistSessions();

  return state;
}

export function getGameState(gameId: string): GameState | null {
  return sessions.get(gameId)?.state ?? null;
}

export function getGameInsights(gameId: string): LiveInsight[] {
  return sessions.get(gameId)?.insights ?? [];
}

export function getGameEvents(gameId: string): GameEvent[] {
  const session = sessions.get(gameId);
  if (!session) {
    return [];
  }

  return listOrderedEvents(session);
}

function listOrderedEvents(session: GameSession): GameEvent[] {
  return [...session.eventsById.values()].sort((left, right) => left.sequence - right.sequence);
}

function recomputeSession(session: GameSession): void {
  const orderedEvents = listOrderedEvents(session);
  const initialState = createInitialGameState(
    session.state.gameId,
    session.homeTeamId,
    session.awayTeamId
  );

  session.state = replayEvents(initialState, orderedEvents);

  const insightIds = new Set<string>();
  const insights: LiveInsight[] = [];
  let rollingState = initialState;

  for (const event of orderedEvents) {
    rollingState = applyEvent(rollingState, event);
    const nextInsights = generateInsights({
      state: rollingState,
      latestEvent: event
    }).filter((insight) => !insightIds.has(insight.id));

    for (const insight of nextInsights) {
      insightIds.add(insight.id);
      insights.unshift(insight);
    }
  }

  session.insights = insights.slice(0, 50);
}

export function ingestEvent(rawEvent: unknown): {
  event: GameEvent;
  state: GameState;
  insights: LiveInsight[];
} {
  const event = parseGameEvent(rawEvent);
  const session = sessions.get(event.gameId);

  if (!session) {
    throw new Error(`Game not found: ${event.gameId}`);
  }

  const existingEventId = session.eventIdsBySequence.get(event.sequence);
  if (existingEventId && existingEventId !== event.id) {
    throw new Error(`Sequence ${event.sequence} already belongs to event ${existingEventId}`);
  }

  if (session.eventsById.has(event.id)) {
    return { event, state: session.state, insights: session.insights };
  }

  session.eventsById.set(event.id, event);
  session.eventIdsBySequence.set(event.sequence, event.id);
  recomputeSession(session);
  persistSessions();

  return {
    event,
    state: session.state,
    insights: session.insights
  };
}

export function deleteEvent(gameId: string, eventId: string): {
  state: GameState;
  insights: LiveInsight[];
} {
  const session = sessions.get(gameId);

  if (!session) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const event = session.eventsById.get(eventId);
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  session.eventsById.delete(eventId);
  session.eventIdsBySequence.delete(event.sequence);
  recomputeSession(session);
  persistSessions();

  return {
    state: session.state,
    insights: session.insights
  };
}

export function updateEvent(gameId: string, eventId: string, rawEvent: unknown): {
  event: GameEvent;
  state: GameState;
  insights: LiveInsight[];
} {
  const session = sessions.get(gameId);
  if (!session) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const existing = session.eventsById.get(eventId);
  if (!existing) {
    throw new Error(`Event not found: ${eventId}`);
  }

  const parsed = parseGameEvent({
    ...(rawEvent as object),
    id: eventId,
    gameId
  });

  const currentOwner = session.eventIdsBySequence.get(parsed.sequence);
  if (currentOwner && currentOwner !== eventId) {
    throw new Error(`Sequence ${parsed.sequence} already belongs to event ${currentOwner}`);
  }

  session.eventsById.set(eventId, parsed);
  if (existing.sequence !== parsed.sequence) {
    session.eventIdsBySequence.delete(existing.sequence);
  }
  session.eventIdsBySequence.set(parsed.sequence, eventId);

  recomputeSession(session);
  persistSessions();

  return {
    event: parsed,
    state: session.state,
    insights: session.insights
  };
}
