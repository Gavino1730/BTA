import {
  createInitialGameState,
  type GameState,
} from "@bta/game-state";
import { type LiveInsight } from "@bta/insight-engine";
import {
  parseGameEvent,
  type GameEvent,
} from "@bta/shared-schema";
import type {
  AiPromptPreview,
  AiUsageTotals,
  CoachAiChatMessage,
  CoachAiChatResponse,
  CoachAiSettings,
  CreateGameInput,
  GameAiContext,
  GameAiErrorCode,
  GameAiStatus,
  GameEditOverride,
  LiveContextPayload,
  SeasonGameSummary,
  SeasonPlayerSummary,
  SeasonTeamStats,
  TenantScope,
} from "./core-store.js";

interface GameSessionLike {
  schoolId: string;
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  startingLineupByTeam?: Record<string, string[]>;
  aiSettings: CoachAiSettings;
  aiContext: GameAiContext;
  historicalContextSummary: string;
  historicalContextFetchedAtMs: number;
  state: GameState;
  eventsById: Map<string, GameEvent>;
  eventIdsBySequence: Map<number, string>;
  ruleInsights: LiveInsight[];
  aiInsights: LiveInsight[];
  aiRefreshInFlight: Promise<LiveInsight[] | null> | null;
  aiStatus: GameAiStatus;
  lastAiRefreshAtMs: number;
  lastAiEventCount: number;
  lastAiFingerprint: string;
  submitted: boolean;
}

interface BuildSchoolAnalyticsResult {
  seasonTeamStats: SeasonTeamStats;
  games: SeasonGameSummary[];
  players: SeasonPlayerSummary[];
  liveContext: LiveContextPayload;
}

interface GameStoreDependencies {
  resolveSchoolId: (scope?: TenantScope) => string;
  resolveRequiredSchoolId: (inputSchoolId: unknown, scope?: TenantScope) => string;
  buildGameSessionKey: (gameId: string, schoolId: string) => string;
  sessions: Map<string, GameSessionLike>;
  persistSessions: () => void;
  defaultCoachAiSettings: () => CoachAiSettings;
  sanitizeGameAiContext: (input: Partial<GameAiContext> | null | undefined) => GameAiContext;
  defaultGameAiStatus: () => GameAiStatus;
  getSession: (gameId: string, scope?: TenantScope) => GameSessionLike | null;
  getMostRecentActiveSessionForSchool: (schoolId: string) => GameSessionLike | null;
  getMostRecentActiveSessionForTeam: (schoolId: string, teamId: string) => GameSessionLike | null;
  sanitizeCoachAiSettings: (input: Partial<CoachAiSettings> | null | undefined) => CoachAiSettings;
  liveAiModel: string;
  listOrderedEvents: (session: GameSessionLike) => GameEvent[];
  recomputeSession: (session: GameSessionLike) => void;
  combineInsights: (session: GameSessionLike) => LiveInsight[];
  buildSchoolAnalytics: (scope?: TenantScope) => BuildSchoolAnalyticsResult;
  buildAiInsightPrompt: (session: GameSessionLike, orderedEvents: GameEvent[], historicalContextSummary: string) => string;
  trimToLength: (value: unknown, maxLength: number) => string;
  sanitizeAiChatHistory: (history: unknown) => CoachAiChatMessage[];
  requestAiChatResponse: (
    session: GameSessionLike,
    question: string,
    history: CoachAiChatMessage[],
  ) => Promise<CoachAiChatResponse | null>;
  getOpenAiApiKey: () => string;
  markAiFailure: (session: GameSessionLike, code: GameAiErrorCode, message: string, status?: number) => void;
  historicalContextTtlMs: number;
  liveAiMinEvents: number;
  liveAiRefreshEveryEvents: number;
  liveAiMinIntervalMs: number;
  fetchHistoricalContextSummary: (session: GameSessionLike) => Promise<string>;
  requestAiInsights: (session: GameSessionLike, orderedEvents: GameEvent[]) => Promise<LiveInsight[]>;
}

export function createGameStore(deps: GameStoreDependencies) {
  const createGame = (input: CreateGameInput, scope?: TenantScope): GameState => {
    const schoolId = deps.resolveRequiredSchoolId(input.schoolId, scope);
    const state = createInitialGameState(
      input.gameId,
      input.homeTeamId,
      input.awayTeamId,
      input.opponentName,
      input.opponentTeamId,
    );

    const seededLineups: Record<string, string[]> = {};

    if (input.startingLineupByTeam) {
      for (const [teamId, lineup] of Object.entries(input.startingLineupByTeam)) {
        if (teamId !== input.homeTeamId && teamId !== input.awayTeamId) {
          continue;
        }

        const seededLineup = Array.isArray(lineup)
          ? [...new Set(lineup.map((playerId) => String(playerId).trim()).filter(Boolean))].slice(0, 5)
          : [];

        state.activeLineupsByTeam[teamId] = seededLineup;
        seededLineups[teamId] = seededLineup;
      }
    }

    if (Object.keys(seededLineups).length > 0) {
      state.startingLineupByTeam = seededLineups;
    }

    deps.sessions.set(deps.buildGameSessionKey(input.gameId, schoolId), {
      schoolId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      opponentName: input.opponentName,
      opponentTeamId: input.opponentTeamId,
      startingLineupByTeam: Object.keys(seededLineups).length > 0 ? seededLineups : undefined,
      aiSettings: deps.defaultCoachAiSettings(),
      aiContext: deps.sanitizeGameAiContext(input.aiContext),
      historicalContextSummary: "",
      historicalContextFetchedAtMs: 0,
      state,
      eventsById: new Map<string, GameEvent>(),
      eventIdsBySequence: new Map<number, string>(),
      ruleInsights: [],
      aiInsights: [],
      aiRefreshInFlight: null,
      aiStatus: deps.defaultGameAiStatus(),
      lastAiRefreshAtMs: 0,
      lastAiEventCount: 0,
      lastAiFingerprint: "",
      submitted: false,
    });

    deps.persistSessions();

    return state;
  };

  const getActiveGameState = (scope?: TenantScope): GameState | null => {
    const schoolId = deps.resolveSchoolId(scope);
    const activeSession = scope?.teamId
      ? deps.getMostRecentActiveSessionForTeam(schoolId, scope.teamId)
      : deps.getMostRecentActiveSessionForSchool(schoolId);
    return activeSession?.state ?? null;
  };

  const getActiveGameId = (scope?: TenantScope): string | null => {
    return getActiveGameState(scope)?.gameId ?? null;
  };

  const submitGame = (gameId: string, scope?: TenantScope): boolean => {
    const session = deps.getSession(gameId, scope);
    if (!session) {
      return false;
    }
    session.submitted = true;
    deps.persistSessions();
    return true;
  };

  const isGameSubmitted = (gameId: string, scope?: TenantScope): boolean => {
    return deps.getSession(gameId, scope)?.submitted === true;
  };

  const deleteGame = (gameId: string, scope?: TenantScope): boolean => {
    const removed = deps.sessions.delete(deps.buildGameSessionKey(gameId, deps.resolveSchoolId(scope)));
    if (removed) {
      deps.persistSessions();
    }
    return removed;
  };

  const patchGameLineup = (
    gameId: string,
    startingLineupByTeam: Record<string, string[]>,
    scope?: TenantScope,
  ): GameState | null => {
    const session = deps.getSession(gameId, scope);
    if (!session) {
      return null;
    }

    let changed = false;
    for (const [teamId, lineup] of Object.entries(startingLineupByTeam)) {
      if (teamId !== session.homeTeamId && teamId !== session.awayTeamId) {
        continue;
      }
      const existing = session.state.activeLineupsByTeam[teamId] ?? [];
      if (existing.length >= 5) {
        continue;
      }

      const incoming = [...new Set(lineup.map((id) => String(id).trim()).filter(Boolean))];
      if (incoming.length === 0) {
        continue;
      }

      const merged = [...existing];
      for (const playerId of incoming) {
        if (merged.length >= 5) {
          break;
        }
        if (!merged.includes(playerId)) {
          merged.push(playerId);
        }
      }

      if (merged.length === existing.length) {
        continue;
      }

      session.state = {
        ...session.state,
        activeLineupsByTeam: {
          ...session.state.activeLineupsByTeam,
          [teamId]: merged,
        },
      };
      session.startingLineupByTeam = {
        ...(session.startingLineupByTeam ?? {}),
        [teamId]: merged,
      };
      changed = true;
    }

    if (changed) {
      deps.persistSessions();
    }

    return session.state;
  };

  const getGameState = (gameId: string, scope?: TenantScope): GameState | null => {
    return deps.getSession(gameId, scope)?.state ?? null;
  };

  const getGameStateByScope = (gameId: string, scope?: TenantScope): GameState | null => {
    return getGameState(gameId, scope);
  };

  const getGameAiSettings = (gameId: string, scope?: TenantScope): CoachAiSettings | null => {
    const session = deps.getSession(gameId, scope);
    if (!session) {
      return null;
    }
    return deps.sanitizeCoachAiSettings(session.aiSettings);
  };

  const getGameAiContext = (gameId: string, scope?: TenantScope): GameAiContext | null => {
    const session = deps.getSession(gameId, scope);
    if (!session) {
      return null;
    }
    return deps.sanitizeGameAiContext(session.aiContext);
  };

  const getGameAiStatus = (gameId: string, scope?: TenantScope): GameAiStatus | null => {
    const session = deps.getSession(gameId, scope);
    if (!session) {
      return null;
    }
    return { ...session.aiStatus, model: deps.liveAiModel };
  };

  const getAiUsageTotals = (scope?: TenantScope): AiUsageTotals => {
    const schoolId = scope ? deps.resolveSchoolId(scope) : null;
    const sessionsToCount = schoolId
      ? [...deps.sessions.values()].filter((session) => session.schoolId === schoolId)
      : [...deps.sessions.values()];

    return sessionsToCount.reduce<AiUsageTotals>((acc, session) => {
      acc.activeGames += 1;
      acc.totalTokensUsed += Math.max(0, Math.floor(Number(session.aiStatus.totalTokensUsed ?? 0)));
      acc.totalEstimatedCostUsd = Number(
        (acc.totalEstimatedCostUsd + Math.max(0, Number(session.aiStatus.totalEstimatedCostUsd ?? 0))).toFixed(6),
      );
      return acc;
    }, {
      activeGames: 0,
      totalTokensUsed: 0,
      totalEstimatedCostUsd: 0,
    });
  };

  const updateGameAiSettings = (
    gameId: string,
    settings: Partial<CoachAiSettings>,
    scope?: TenantScope,
  ): CoachAiSettings | null => {
    const session = deps.getSession(gameId, scope);
    if (!session) {
      return null;
    }

    session.aiSettings = deps.sanitizeCoachAiSettings({
      ...session.aiSettings,
      ...settings,
    });
    session.lastAiFingerprint = "";
    session.lastAiRefreshAtMs = 0;
    deps.persistSessions();
    return session.aiSettings;
  };

  const updateGameAiContext = (
    gameId: string,
    context: Partial<GameAiContext>,
    scope?: TenantScope,
  ): GameAiContext | null => {
    const session = deps.getSession(gameId, scope);
    if (!session) {
      return null;
    }

    session.aiContext = deps.sanitizeGameAiContext({
      ...session.aiContext,
      ...context,
    });
    deps.recomputeSession(session);
    session.lastAiFingerprint = "";
    session.lastAiRefreshAtMs = 0;
    deps.persistSessions();
    return session.aiContext;
  };

  const getGameAiPromptPreview = (gameId: string, scope?: TenantScope): AiPromptPreview | null => {
    const session = deps.getSession(gameId, scope);
    if (!session) {
      return null;
    }

    const orderedEvents = deps.listOrderedEvents(session);
    const coachSettings = deps.sanitizeCoachAiSettings(session.aiSettings);
    const userPrompt = deps.buildAiInsightPrompt(
      { ...session, aiSettings: coachSettings },
      orderedEvents,
      session.historicalContextSummary,
    );

    return {
      model: deps.liveAiModel,
      userPrompt,
      systemGuide: [
        "Uses only provided game state and recent events.",
        "Prioritizes our team outcome and avoids speculative play calls.",
        "Returns strict JSON coaching insights with trigger/action/why-now structure.",
        "Keeps hidden internal safety and policy rules private.",
      ],
      coachSettings,
      recentEventCount: orderedEvents.length,
      generatedAtIso: new Date().toISOString(),
    };
  };

  const answerGameAiChat = async (
    gameId: string,
    question: string,
    history?: unknown,
    scope?: TenantScope,
  ): Promise<CoachAiChatResponse | null> => {
    const session = deps.getSession(gameId, scope);
    const trimmedQuestion = deps.trimToLength(question, 1200);
    if (!session || !trimmedQuestion) {
      return null;
    }

    return deps.requestAiChatResponse(session, trimmedQuestion, deps.sanitizeAiChatHistory(history));
  };

  const getGameInsights = (gameId: string, scope?: TenantScope): LiveInsight[] => {
    const session = deps.getSession(gameId, scope);
    return session ? deps.combineInsights(session) : [];
  };

  const getGameEvents = (gameId: string, scope?: TenantScope): GameEvent[] => {
    const session = deps.getSession(gameId, scope);
    if (!session) {
      return [];
    }

    return deps.listOrderedEvents(session);
  };

  const getSeasonTeamStats = (scope?: TenantScope): SeasonTeamStats => {
    return deps.buildSchoolAnalytics(scope).seasonTeamStats;
  };

  const getSeasonGames = (scope?: TenantScope): SeasonGameSummary[] => {
    return deps.buildSchoolAnalytics(scope).games;
  };

  const getSeasonPlayers = (scope?: TenantScope): SeasonPlayerSummary[] => {
    return deps.buildSchoolAnalytics(scope).players;
  };

  const getLiveContext = (scope?: TenantScope): LiveContextPayload => {
    return deps.buildSchoolAnalytics(scope).liveContext;
  };

  const getRosterPlayers = (scope?: TenantScope): SeasonPlayerSummary[] => {
    return deps.buildSchoolAnalytics(scope).players;
  };

  const refreshGameAiInsights = async (
    gameId: string,
    options?: { force?: boolean },
    scope?: TenantScope,
  ): Promise<LiveInsight[] | null> => {
    const session = deps.getSession(gameId, scope);
    if (!session) {
      return null;
    }

    const forceRefresh = options?.force === true;

    if (!deps.getOpenAiApiKey()) {
      deps.markAiFailure(session, "missing_api_key", "OPENAI_API_KEY is not configured", 503);
      return null;
    }

    const orderedEvents = deps.listOrderedEvents(session);
    const latestStoredEvent = orderedEvents[orderedEvents.length - 1];
    const isPeriodTransition = latestStoredEvent?.type === "period_transition";
    if (isPeriodTransition || Date.now() - session.historicalContextFetchedAtMs >= deps.historicalContextTtlMs) {
      const summary = await deps.fetchHistoricalContextSummary(session);
      if (summary) {
        session.historicalContextSummary = summary;
        session.historicalContextFetchedAtMs = Date.now();
      }
    }

    if (orderedEvents.length < deps.liveAiMinEvents) {
      if (session.aiInsights.length > 0) {
        session.aiInsights = [];
        session.lastAiEventCount = orderedEvents.length;
        session.lastAiFingerprint = "";
        deps.persistSessions();
        return deps.combineInsights(session);
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
      ...Object.entries(session.state.scoreByTeam).flat(),
    ].join("|");

    const now = Date.now();
    const hasEnoughNewEvents = orderedEvents.length - session.lastAiEventCount >= deps.liveAiRefreshEveryEvents;
    const intervalElapsed = now - session.lastAiRefreshAtMs >= deps.liveAiMinIntervalMs;
    const shouldRefresh = session.aiInsights.length === 0 || fingerprint !== session.lastAiFingerprint;

    if (!forceRefresh && (!shouldRefresh || (!hasEnoughNewEvents && !intervalElapsed && session.aiInsights.length > 0))) {
      return null;
    }

    if (session.aiRefreshInFlight) {
      return session.aiRefreshInFlight;
    }

    session.aiRefreshInFlight = deps.requestAiInsights(session, orderedEvents)
      .then((aiInsights) => {
        if (aiInsights.length > 0) {
          session.aiInsights = aiInsights;
          session.lastAiRefreshAtMs = Date.now();
          session.lastAiEventCount = orderedEvents.length;
          session.lastAiFingerprint = fingerprint;
          deps.persistSessions();
        } else {
          session.lastAiEventCount = orderedEvents.length;
        }
        return deps.combineInsights(session);
      })
      .catch(() => {
        deps.markAiFailure(session, "network_error", "AI insights refresh failed unexpectedly", 503);
        return deps.combineInsights(session);
      })
      .finally(() => {
        session.aiRefreshInFlight = null;
      });

    return session.aiRefreshInFlight;
  };

  const ingestEvent = (
    rawEvent: unknown,
    scope?: TenantScope,
  ): {
    event: GameEvent;
    state: GameState;
    insights: LiveInsight[];
  } => {
    const schoolId = deps.resolveRequiredSchoolId((rawEvent as { schoolId?: unknown } | null)?.schoolId, scope);
    const event = parseGameEvent({ ...(rawEvent as object), schoolId });
    const session = deps.getSession(event.gameId, { schoolId });

    if (!session) {
      throw new Error(`Game not found: ${event.gameId}`);
    }

    if (session.submitted) {
      throw new Error(`Game already submitted: ${event.gameId}`);
    }

    const existingEventId = session.eventIdsBySequence.get(event.sequence);
    if (existingEventId && existingEventId !== event.id) {
      throw new Error(`Sequence ${event.sequence} already belongs to event ${existingEventId}`);
    }

    const existingEvent = session.eventsById.get(event.id);
    if (existingEvent) {
      if (JSON.stringify(existingEvent) !== JSON.stringify(event)) {
        throw new Error(`Event ${event.id} already exists with different payload`);
      }
      return { event, state: session.state, insights: deps.combineInsights(session) };
    }

    session.eventsById.set(event.id, event);
    session.eventIdsBySequence.set(event.sequence, event.id);
    deps.recomputeSession(session);
    deps.persistSessions();

    return {
      event,
      state: session.state,
      insights: deps.combineInsights(session),
    };
  };

  const deleteEvent = (
    gameId: string,
    eventId: string,
    scope?: TenantScope,
    precondition?: { expectedSequence?: number },
  ): {
    state: GameState;
    insights: LiveInsight[];
  } => {
    const session = deps.getSession(gameId, scope);

    if (!session) {
      throw new Error(`Game not found: ${gameId}`);
    }

    if (session.submitted) {
      throw new Error(`Game already submitted: ${gameId}`);
    }

    const event = session.eventsById.get(eventId);
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    if (precondition?.expectedSequence !== undefined && event.sequence !== precondition.expectedSequence) {
      throw new Error(`Event ${eventId} version mismatch: expected sequence ${precondition.expectedSequence}, actual ${event.sequence}`);
    }

    session.eventsById.delete(eventId);
    session.eventIdsBySequence.delete(event.sequence);
    deps.recomputeSession(session);
    deps.persistSessions();

    return {
      state: session.state,
      insights: deps.combineInsights(session),
    };
  };

  const updateEvent = (
    gameId: string,
    eventId: string,
    rawEvent: unknown,
    scope?: TenantScope,
    precondition?: { expectedSequence?: number },
  ): {
    event: GameEvent;
    state: GameState;
    insights: LiveInsight[];
  } => {
    const schoolId = deps.resolveRequiredSchoolId((rawEvent as { schoolId?: unknown } | null)?.schoolId, scope);
    const session = deps.getSession(gameId, { schoolId });
    if (!session) {
      throw new Error(`Game not found: ${gameId}`);
    }

    if (session.submitted) {
      throw new Error(`Game already submitted: ${gameId}`);
    }

    const existing = session.eventsById.get(eventId);
    if (!existing) {
      throw new Error(`Event not found: ${eventId}`);
    }

    if (precondition?.expectedSequence !== undefined && existing.sequence !== precondition.expectedSequence) {
      throw new Error(`Event ${eventId} version mismatch: expected sequence ${precondition.expectedSequence}, actual ${existing.sequence}`);
    }

    const parsed = parseGameEvent({
      ...(rawEvent as object),
      id: eventId,
      gameId,
      schoolId,
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

    deps.recomputeSession(session);
    deps.persistSessions();

    return {
      event: parsed,
      state: session.state,
      insights: deps.combineInsights(session),
    };
  };

  return {
    createGame,
    getActiveGameState,
    getActiveGameId,
    submitGame,
    isGameSubmitted,
    deleteGame,
    patchGameLineup,
    getGameState,
    getGameStateByScope,
    getGameAiSettings,
    getGameAiContext,
    getGameAiStatus,
    getAiUsageTotals,
    updateGameAiSettings,
    updateGameAiContext,
    getGameAiPromptPreview,
    answerGameAiChat,
    getGameInsights,
    getGameEvents,
    getSeasonTeamStats,
    getSeasonGames,
    getSeasonPlayers,
    getLiveContext,
    getRosterPlayers,
    refreshGameAiInsights,
    ingestEvent,
    deleteEvent,
    updateEvent,
  };
}
