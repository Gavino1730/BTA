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
  opponentName?: string;
  opponentTeamId?: string;
}

export interface RosterPlayer {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;
  grade?: string;
}

export interface RosterTeam {
  id: string;
  name: string;
  abbreviation: string;
  players: RosterPlayer[];
}

interface GameSession {
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  state: GameState;
  eventsById: Map<string, GameEvent>;
  eventIdsBySequence: Map<number, string>;
  ruleInsights: LiveInsight[];
  aiInsights: LiveInsight[];
  aiRefreshInFlight: Promise<LiveInsight[] | null> | null;
  lastAiRefreshAtMs: number;
  lastAiEventCount: number;
  lastAiFingerprint: string;
}

interface PersistedGameSession {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  events: GameEvent[];
}

interface PersistedSnapshot {
  sessions: PersistedGameSession[];
  rosterTeams: RosterTeam[];
}

const sessions = new Map<string, GameSession>();
let rosterTeams: RosterTeam[] = [];
const persistenceEnabled = !process.env.VITEST && process.env.NODE_ENV !== "test";
const dataDirectory = resolve(process.cwd(), ".bta-data");
const dataFile = resolve(dataDirectory, "realtime-api.json");
const OPENAI_API_URL = process.env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions";
const LIVE_AI_MODEL = process.env.BTA_LIVE_INSIGHT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const LIVE_AI_TIMEOUT_MS = readEnvNumber("BTA_LIVE_INSIGHT_TIMEOUT_MS", 12000);
const LIVE_AI_MIN_EVENTS = readEnvNumber("BTA_LIVE_INSIGHT_MIN_EVENTS", 4);
const LIVE_AI_REFRESH_EVERY_EVENTS = readEnvNumber("BTA_LIVE_INSIGHT_REFRESH_EVERY_EVENTS", 3);
const LIVE_AI_MIN_INTERVAL_MS = readEnvNumber("BTA_LIVE_INSIGHT_MIN_INTERVAL_MS", 20000);
const LIVE_AI_RECENT_EVENT_WINDOW = readEnvNumber("BTA_LIVE_INSIGHT_RECENT_EVENT_WINDOW", 8);

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getOpenAiApiKey(): string {
  return process.env.OPENAI_API_KEY ?? "";
}

function combineInsights(session: GameSession): LiveInsight[] {
  return [...session.aiInsights, ...session.ruleInsights]
    .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso))
    .slice(0, 50);
}

function describeEvent(event: GameEvent): string {
  switch (event.type) {
    case "shot_attempt":
      return `${event.teamId} ${event.made ? "made" : "missed"} ${event.points}pt shot (${event.zone})`;
    case "free_throw_attempt":
      return `${event.teamId} ${event.made ? "made" : "missed"} free throw ${event.attemptNumber}/${event.totalAttempts}`;
    case "rebound":
      return `${event.teamId} ${event.offensive ? "offensive" : "defensive"} rebound by ${event.playerId}`;
    case "turnover":
      return `${event.teamId} turnover${event.playerId ? ` by ${event.playerId}` : ""} (${event.turnoverType})`;
    case "foul":
      return `${event.teamId} foul on ${event.playerId} (${event.foulType})`;
    case "assist":
      return `${event.teamId} assist by ${event.playerId}`;
    case "steal":
      return `${event.teamId} steal by ${event.playerId}`;
    case "block":
      return `${event.teamId} block by ${event.playerId}`;
    case "substitution":
      return `${event.teamId} substitution ${event.playerOutId} -> ${event.playerInId}`;
    case "possession_start":
      return `possession starts for ${event.possessedByTeamId}`;
    case "possession_end":
      return `possession ends for ${event.possessedByTeamId} (${event.result})`;
    case "timeout":
      return `${event.teamId} timeout (${event.timeoutType})`;
    case "period_transition":
      return `period starts: ${event.newPeriod}`;
  }

  return "unknown event";
}

function summarizeTeamState(state: GameState, teamId: string): string {
  const teamStats = state.teamStats[teamId];
  const players = Object.values(state.playerStatsByTeam[teamId] ?? {});
  const topScorer = [...players].sort((left, right) => right.points - left.points)[0];

  return [
    `${teamId}: ${state.scoreByTeam[teamId] ?? 0} pts`,
    `FG ${teamStats?.shooting.fgMade ?? 0}/${teamStats?.shooting.fgAttempts ?? 0}`,
    `FT ${teamStats?.shooting.ftMade ?? 0}/${teamStats?.shooting.ftAttempts ?? 0}`,
    `TO ${teamStats?.turnovers ?? 0}`,
    `Fouls ${teamStats?.fouls ?? 0}`,
    `Bonus ${state.bonusByTeam[teamId] ? "yes" : "no"}`,
    topScorer ? `Top scorer ${topScorer.playerId} (${topScorer.points})` : "Top scorer none"
  ].join(", ");
}

function isOpeningSample(state: GameState, orderedEvents: GameEvent[]): boolean {
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const inEarlyQ1 = state.currentPeriod === "Q1" && (latestEvent?.clockSecondsRemaining ?? 0) >= 390;
  const lowEventVolume = orderedEvents.length < 10;
  return inEarlyQ1 || lowEventVolume;
}

function buildAiInsightPrompt(session: GameSession, orderedEvents: GameEvent[]): string {
  const state = session.state;
  const recentEvents = orderedEvents.slice(-LIVE_AI_RECENT_EVENT_WINDOW);
  const openingSample = isOpeningSample(state, orderedEvents);
  const teams = [session.homeTeamId, session.awayTeamId]
    .filter((teamId, index, all) => all.indexOf(teamId) === index);

  const scoreLine = teams
    .map((teamId) => `${teamId} ${state.scoreByTeam[teamId] ?? 0}`)
    .join(" | ");

  const teamLines = teams.map((teamId) => summarizeTeamState(state, teamId)).join("\n");
  const recentEventLines = recentEvents.map((event) => `- ${describeEvent(event)}`).join("\n");

  return [
    `Game: ${state.gameId}`,
    `Current period: ${state.currentPeriod}`,
    `Event count: ${orderedEvents.length}`,
    `Sample context: ${openingSample ? "opening_small_sample" : "stabilized"}`,
    `Score: ${scoreLine}`,
    "Team snapshots:",
    teamLines,
    "Recent events:",
    recentEventLines || "- none",
    openingSample
      ? "Guidance: keep claims conservative; avoid momentum/run language and avoid broad trend conclusions."
      : "Guidance: include decisive tactical calls grounded in current data."
  ].join("\n");
}

function parseAiInsightResponse(content: string, session: GameSession, latestEvent: GameEvent): LiveInsight[] {
  const parsed = JSON.parse(content) as { insights?: unknown };
  const rawInsights = Array.isArray(parsed.insights) ? parsed.insights : [];
  const validTeams = new Set(Object.keys(session.state.scoreByTeam));
  const createdAtIso = new Date().toISOString();

  const insights = rawInsights
    .map((item, index): LiveInsight | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const message = typeof raw.message === "string" ? raw.message.trim() : "";
      const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";
      if (!message || !explanation) {
        return null;
      }

      const relatedTeamId = typeof raw.relatedTeamId === "string" && validTeams.has(raw.relatedTeamId)
        ? raw.relatedTeamId
        : undefined;
      const confidence = raw.confidence === "high" ? "high" : "medium";

      return {
        id: `ai-${latestEvent.id}-${index}`,
        gameId: session.state.gameId,
        type: "ai_coaching",
        createdAtIso,
        confidence,
        message,
        explanation,
        relatedTeamId
      };
    })
    .filter((insight): insight is LiveInsight => insight !== null);

  return insights.slice(0, 2);
}

async function requestAiInsights(session: GameSession, orderedEvents: GameEvent[]): Promise<LiveInsight[]> {
  const apiKey = getOpenAiApiKey();
  const latestEvent = orderedEvents[orderedEvents.length - 1];

  if (!apiKey || !latestEvent) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_AI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: LIVE_AI_MODEL,
        temperature: 0.2,
        max_tokens: 250,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a varsity bench assistant speaking to coaches in real time.",
              "Use only the provided game state and recent events; do not invent data.",
              "Prioritize immediate tactical decisions for the next 1-2 possessions.",
              "Tone: direct, practical, no fluff, no long analysis paragraphs.",
              "Output strict JSON object only with shape {\"insights\":[...] }.",
              "Each insight object must include: message, explanation, relatedTeamId optional, confidence.",
              "message: one short command-style coaching call.",
              "explanation: one short stat-grounded reason from provided data.",
              "Write at most 2 insights. No markdown. No code fences."
            ].join(" ")
          },
          {
            role: "user",
            content: buildAiInsightPrompt(session, orderedEvents)
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsedInsights = parseAiInsightResponse(content, session, latestEvent);
    if (!isOpeningSample(session.state, orderedEvents)) {
      return parsedInsights;
    }

    return parsedInsights
      .slice(0, 1)
      .map((insight) => ({
        ...insight,
        explanation: insight.explanation.includes("Opening sample")
          ? insight.explanation
          : `Opening sample: ${insight.explanation}`
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function persistSessions() {
  if (!persistenceEnabled) {
    return;
  }

  mkdirSync(dataDirectory, { recursive: true });

  const payload: PersistedSnapshot = {
    sessions: [...sessions.values()].map((session) => ({
      gameId: session.state.gameId,
      homeTeamId: session.homeTeamId,
      awayTeamId: session.awayTeamId,
      opponentName: session.opponentName,
      opponentTeamId: session.opponentTeamId,
      events: listOrderedEvents(session)
    })),
    rosterTeams
  };

  writeFileSync(dataFile, JSON.stringify(payload, null, 2), "utf8");
}

function restoreSessions() {
  if (!persistenceEnabled || !existsSync(dataFile)) {
    return;
  }

  const payload = JSON.parse(readFileSync(dataFile, "utf8")) as PersistedSnapshot | PersistedGameSession[];
  const persistedSessions = Array.isArray(payload) ? payload : payload.sessions;
  const persistedRosterTeams = Array.isArray(payload) ? [] : payload.rosterTeams;

  rosterTeams = Array.isArray(persistedRosterTeams) ? persistedRosterTeams : [];

  for (const session of persistedSessions) {
    const initialState = createInitialGameState(
      session.gameId,
      session.homeTeamId,
      session.awayTeamId,
      session.opponentName,
      session.opponentTeamId
    );
    const restoredSession: GameSession = {
      homeTeamId: session.homeTeamId,
      awayTeamId: session.awayTeamId,
      opponentName: session.opponentName,
      opponentTeamId: session.opponentTeamId,
      state: replayEvents(initialState, session.events),
      eventsById: new Map(session.events.map((event) => [event.id, event])),
      eventIdsBySequence: new Map(session.events.map((event) => [event.sequence, event.id])),
      ruleInsights: [],
      aiInsights: [],
      aiRefreshInFlight: null,
      lastAiRefreshAtMs: 0,
      lastAiEventCount: 0,
      lastAiFingerprint: ""
    };

    recomputeSession(restoredSession);
    sessions.set(session.gameId, restoredSession);
  }
}

restoreSessions();

export function getRosterTeams(): RosterTeam[] {
  return rosterTeams;
}

export function saveRosterTeams(next: RosterTeam[]): RosterTeam[] {
  rosterTeams = Array.isArray(next) ? next : [];
  persistSessions();
  return rosterTeams;
}

export function createGame(input: CreateGameInput): GameState {
  const state = createInitialGameState(
    input.gameId,
    input.homeTeamId,
    input.awayTeamId,
    input.opponentName,
    input.opponentTeamId
  );

  sessions.set(input.gameId, {
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    opponentName: input.opponentName,
    opponentTeamId: input.opponentTeamId,
    state,
    eventsById: new Map<string, GameEvent>(),
    eventIdsBySequence: new Map<number, string>(),
    ruleInsights: [],
    aiInsights: [],
    aiRefreshInFlight: null,
    lastAiRefreshAtMs: 0,
    lastAiEventCount: 0,
    lastAiFingerprint: ""
  });

  persistSessions();

  return state;
}

export function deleteGame(gameId: string): boolean {
  const removed = sessions.delete(gameId);
  if (removed) {
    persistSessions();
  }
  return removed;
}

export function getGameState(gameId: string): GameState | null {
  return sessions.get(gameId)?.state ?? null;
}

export function getGameInsights(gameId: string): LiveInsight[] {
  const session = sessions.get(gameId);
  return session ? combineInsights(session) : [];
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
    session.awayTeamId,
    session.opponentName,
    session.opponentTeamId
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

  session.ruleInsights = insights.slice(0, 50);
}

export async function refreshGameAiInsights(gameId: string): Promise<LiveInsight[] | null> {
  const session = sessions.get(gameId);
  if (!session) {
    return null;
  }

  if (!getOpenAiApiKey()) {
    return null;
  }

  const orderedEvents = listOrderedEvents(session);
  if (orderedEvents.length < LIVE_AI_MIN_EVENTS) {
    if (session.aiInsights.length > 0) {
      session.aiInsights = [];
      session.lastAiEventCount = orderedEvents.length;
      session.lastAiFingerprint = "";
      persistSessions();
      return combineInsights(session);
    }

    return null;
  }

  const latestEvent = orderedEvents[orderedEvents.length - 1];
  if (!latestEvent) {
    return null;
  }

  const fingerprint = [
    orderedEvents.length,
    latestEvent.id,
    latestEvent.sequence,
    session.state.currentPeriod,
    latestEvent.clockSecondsRemaining,
    ...Object.entries(session.state.scoreByTeam).flat()
  ].join("|");

  const now = Date.now();
  const hasEnoughNewEvents = orderedEvents.length - session.lastAiEventCount >= LIVE_AI_REFRESH_EVERY_EVENTS;
  const intervalElapsed = now - session.lastAiRefreshAtMs >= LIVE_AI_MIN_INTERVAL_MS;
  const shouldRefresh = session.aiInsights.length === 0 || fingerprint !== session.lastAiFingerprint;

  if (!shouldRefresh || (!hasEnoughNewEvents && !intervalElapsed && session.aiInsights.length > 0)) {
    return null;
  }

  if (session.aiRefreshInFlight) {
    return session.aiRefreshInFlight;
  }

  session.aiRefreshInFlight = requestAiInsights(session, orderedEvents)
    .then((aiInsights) => {
      session.aiInsights = aiInsights;
      session.lastAiRefreshAtMs = Date.now();
      session.lastAiEventCount = orderedEvents.length;
      session.lastAiFingerprint = fingerprint;
      persistSessions();
      return combineInsights(session);
    })
    .finally(() => {
      session.aiRefreshInFlight = null;
    });

  return session.aiRefreshInFlight;
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
    return { event, state: session.state, insights: combineInsights(session) };
  }

  session.eventsById.set(event.id, event);
  session.eventIdsBySequence.set(event.sequence, event.id);
  recomputeSession(session);
  persistSessions();

  return {
    event,
    state: session.state,
    insights: combineInsights(session)
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
    insights: combineInsights(session)
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
    insights: combineInsights(session)
  };
}
