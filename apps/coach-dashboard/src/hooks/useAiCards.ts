import { useMemo } from "react";
import type { PlayerStats, TeamStats } from "@bta/game-state";
import type { AiSignalCard, Insight, RotationWatchNote } from "../helpers/index.js";

interface TeamData {
  score: number;
  bonus: boolean;
  possessions: number;
  activeLineup: string[];
  teamStats: TeamStats;
  playerStats: Record<string, PlayerStats>;
  timeoutsUsed: number;
  periodFouls: number;
}

interface RotationContext {
  teamId: string;
  onCourt: string[];
  bench: string[];
  watchNotes: RotationWatchNote[];
  isEstimatedLineup: boolean;
  liveCount: number;
}

interface Params {
  aiInsights: Insight[];
  rulesInsights: Insight[];
  rotationContext: RotationContext | null;
  aggregatedTeams: Record<string, TeamData>;
  coachedTeamId: string;
  aiChatSuggestions: string[];
  displayPlayerName: (teamId: string, playerId: string) => string;
  prettifyInsightText: (text: string, relatedTeamId?: string | null, relatedPlayerId?: string | null) => string;
}

export function useAiCards({
  aiInsights,
  rulesInsights,
  rotationContext,
  aggregatedTeams,
  coachedTeamId,
  aiChatSuggestions,
  displayPlayerName,
  prettifyInsightText,
}: Params) {
  const aiSubSuggestionCards = useMemo(() => {
    const cards: AiSignalCard[] = [];

    for (const insight of [...aiInsights, ...rulesInsights]) {
      if (insight.type === "sub_suggestion" || /\bsub\b|lineup|rest/i.test(`${insight.message} ${insight.explanation}`)) {
        cards.push({
          id: `sub-${insight.id}`,
          title: prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId),
          detail: prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId),
          tone: insight.confidence === "high" ? "high" : "medium",
        });
      }
    }

    if (cards.length === 0 && rotationContext?.watchNotes.some((note) => note.level === "high")) {
      for (const note of rotationContext.watchNotes.filter((entry) => entry.level === "high").slice(0, 2)) {
        cards.push({
          id: `fallback-sub-${note.playerId}`,
          title: `Consider a sub for ${displayPlayerName(rotationContext.teamId, note.playerId)}`,
          detail: note.reason,
          tone: "high",
        });
      }
    }

    return cards.slice(0, 4);
  }, [aiInsights, displayPlayerName, prettifyInsightText, rotationContext, rulesInsights]);

  const aiFoulAlertCards = useMemo(() => {
    const cards: AiSignalCard[] = [];

    for (const insight of [...rulesInsights, ...aiInsights]) {
      if (["foul_warning", "foul_trouble", "team_foul_warning"].includes(insight.type) || /foul|bonus/i.test(`${insight.message} ${insight.explanation}`)) {
        cards.push({
          id: `foul-${insight.id}`,
          title: prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId),
          detail: prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId),
          tone: insight.confidence === "high" ? "high" : "medium",
        });
      }
    }

    return cards.slice(0, 5);
  }, [aiInsights, prettifyInsightText, rulesInsights]);

  const aiEfficiencyCards = useMemo(() => {
    const cards: AiSignalCard[] = [];

    for (const insight of [...rulesInsights, ...aiInsights]) {
      if (["hot_hand", "shot_profile"].includes(insight.type) || /efficient|hot hand|shooting|scoring/i.test(`${insight.message} ${insight.explanation}`)) {
        cards.push({
          id: `eff-${insight.id}`,
          title: prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId),
          detail: prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId),
          tone: insight.confidence === "high" ? "high" : "default",
        });
      }
    }

    if (coachedTeamId) {
      const efficientPlayers = Object.values(aggregatedTeams[coachedTeamId]?.playerStats ?? {})
        .filter((player) => player.fgAttempts >= 4 && player.fgMade / Math.max(player.fgAttempts, 1) >= 0.55)
        .sort((left, right) => right.points - left.points || right.fgMade - left.fgMade)
        .slice(0, 3);

      for (const player of efficientPlayers) {
        const fgPct = Math.round((player.fgMade / Math.max(player.fgAttempts, 1)) * 100);
        cards.push({
          id: `eff-live-${player.playerId}`,
          title: `${displayPlayerName(coachedTeamId, player.playerId)} is producing efficiently`,
          detail: `${player.points} pts on ${player.fgMade}/${player.fgAttempts} FG (${fgPct}%), plus ${player.assists} ast and ${player.reboundsOff + player.reboundsDef} reb.`,
          tone: player.points >= 12 ? "high" : "default",
        });
      }
    }

    return cards.slice(0, 5);
  }, [aggregatedTeams, aiInsights, coachedTeamId, displayPlayerName, prettifyInsightText, rulesInsights]);

  const aiQuickQuestions = useMemo(() => {
    if (aiChatSuggestions.length > 0) {
      return aiChatSuggestions;
    }
    return [
      "Who should we sub next and why?",
      "Which player is most efficient right now?",
      "Are we in team foul trouble soon?",
      "What should be our next coaching adjustment?",
    ];
  }, [aiChatSuggestions]);

  return { aiSubSuggestionCards, aiFoulAlertCards, aiEfficiencyCards, aiQuickQuestions };
}
