import {
  applyEvent,
  createInitialGameState,
  replayEvents,
  type GameState,
} from "@bta/game-state";
import {
  generateInsights,
  type LiveInsight,
} from "@bta/insight-engine";
import type { GameEvent } from "@bta/shared-schema";

interface RuntimeSessionLike {
  schoolId: string;
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  aiContext: {
    clockEnabled: boolean;
  };
  state: GameState;
  ruleInsights: LiveInsight[];
  aiInsights: LiveInsight[];
}

interface RuntimeRosterTeamLike {
  id: string;
  players: Array<{
    id: string;
    number?: string;
    name: string;
  }>;
}

interface SessionRuntimeDependencies {
  getRosterTeamsForSchool: (schoolId: string) => RuntimeRosterTeamLike[];
  listOrderedEvents: (session: RuntimeSessionLike) => GameEvent[];
}

export function createSessionRuntime(deps: SessionRuntimeDependencies) {
  const combineInsights = (session: RuntimeSessionLike): LiveInsight[] => {
    return [...session.aiInsights, ...session.ruleInsights]
      .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso))
      .slice(0, 20);
  };

  const recomputeSession = (session: RuntimeSessionLike): void => {
    const orderedEvents = deps.listOrderedEvents(session);
    const initialState = createInitialGameState(
      session.state.gameId,
      session.homeTeamId,
      session.awayTeamId,
      session.opponentName,
      session.opponentTeamId,
    );

    session.state = replayEvents(initialState, orderedEvents);

    const insightIds = new Set<string>();
    const latestByCondition = new Map<string, string>();
    const insights: LiveInsight[] = [];
    let rollingState = initialState;

    const ourTeamIdForInsights = session.state.opponentTeamId
      ? (session.homeTeamId !== session.state.opponentTeamId ? session.homeTeamId : session.awayTeamId)
      : session.homeTeamId;
    const rosterTeamForInsights = deps.getRosterTeamsForSchool(session.schoolId).find((team) => team.id === ourTeamIdForInsights);
    const rosterPlayersForInsights = rosterTeamForInsights?.players.map((player) => ({
      id: player.id,
      number: player.number,
      name: player.name,
    }));

    for (const event of orderedEvents) {
      rollingState = applyEvent(rollingState, event);
      const nextInsights = generateInsights({
        state: rollingState,
        latestEvent: event,
        clockEnabled: session.aiContext.clockEnabled,
        rosterPlayers: rosterPlayersForInsights,
      }).filter((insight) => !insightIds.has(insight.id));

      for (const insight of nextInsights) {
        const conditionKey = `${insight.type}:${insight.relatedTeamId ?? ""}:${insight.relatedPlayerId ?? ""}`;
        const supersededId = latestByCondition.get(conditionKey);
        if (supersededId !== undefined) {
          const oldIdx = insights.findIndex((entry) => entry.id === supersededId);
          if (oldIdx !== -1) {
            insights.splice(oldIdx, 1);
          }
          insightIds.delete(supersededId);
        }
        latestByCondition.set(conditionKey, insight.id);
        insightIds.add(insight.id);
        insights.unshift(insight);
      }
    }

    const totalScore = Object.values(session.state.scoreByTeam ?? {}).reduce((sum, value) => sum + value, 0);
    const stillPreGame = session.state.currentPeriod === "Q1" && totalScore === 0 && session.state.events.length < 5;
    const finalInsights = stillPreGame ? insights : insights.filter((insight) => insight.type !== "pre_game");

    session.ruleInsights = finalInsights.slice(0, 15);

    const ourTeamIdForFilter = session.state.opponentTeamId
      ? (session.homeTeamId !== session.state.opponentTeamId ? session.homeTeamId : session.awayTeamId)
      : session.homeTeamId;
    const currentLineupForFilter = new Set(session.state.activeLineupsByTeam[ourTeamIdForFilter] ?? []);
    session.ruleInsights = session.ruleInsights.filter(
      (insight) =>
        insight.type !== "sub_suggestion"
        || insight.relatedPlayerId == null
        || !currentLineupForFilter.has(insight.relatedPlayerId),
    );
  };

  return {
    combineInsights,
    recomputeSession,
  };
}
