import { useMemo } from "react";
import type { TeamStats, PlayerStats } from "@bta/game-state";
import { emptyTeamStats, mergeTeamStats, mergePlayerStats, type GameState } from "../helpers/index.js";

export type AggregatedTeam = {
  score: number;
  bonus: boolean;
  possessions: number;
  activeLineup: string[];
  teamStats: TeamStats;
  playerStats: Record<string, PlayerStats>;
  timeoutsUsed: number;
  periodFouls: number;
};

export type CanonicalSideIds = {
  homeId: string;
  awayId: string;
  homeAliases: Set<string>;
  awayAliases: Set<string>;
};

type SetupNames = {
  myTeamId: string;
  vcSide: "home" | "away";
  homeColor?: string;
  awayColor?: string;
};

export function useGameTeams(
  state: GameState | null,
  setupNames: SetupNames,
): {
  canonicalSideIds: CanonicalSideIds;
  canonicalTeamId: (teamId: string) => string;
  rawTeamIds: string[];
  aggregatedTeams: Record<string, AggregatedTeam>;
  teams: string[];
} {
  const canonicalSideIds: CanonicalSideIds = useMemo(() => {
    // The game state's homeTeamId / awayTeamId are the authoritative structural
    // identifiers. URL params (myTeamId, vcSide) are display hints only.
    // Using opponentTeamId in aliases caused both raw team IDs to collapse to
    // the same canonical ID when VC plays away, doubling scores and merging
    // player cards into a single slot.
    const stateHomeId = state?.homeTeamId;
    const stateAwayId = state?.awayTeamId;

    const homeId = stateHomeId || (setupNames.vcSide === "home" ? (setupNames.myTeamId || "home") : "home");
    const awayId = stateAwayId || (setupNames.vcSide === "away" ? (setupNames.myTeamId || "away") : "away");

    // Only alias myTeamId to the side matching vcSide when state confirms
    // that myTeamId is NOT already assigned to the opposite side. This prevents
    // a stale/wrong vcSide in the URL from creating alias collisions.
    const myId = setupNames.myTeamId || "";
    const myTeamOnHome = myId && myId !== stateAwayId
      ? (setupNames.vcSide === "home" ? myId : undefined)
      : undefined;
    const myTeamOnAway = myId && myId !== stateHomeId
      ? (setupNames.vcSide === "away" ? myId : undefined)
      : undefined;

    const homeAliases = new Set<string>([
      "home",
      "team-home",
      stateHomeId,
      myTeamOnHome,
      // Bridge "evil" <-> "team-evil" so events from older sessions still
      // collapse to the correct side even if the ID format changed.
      stateHomeId && !stateHomeId.startsWith("team-") ? `team-${stateHomeId}` : undefined,
    ].filter((value): value is string => Boolean(value)));

    const awayAliases = new Set<string>([
      "away",
      "team-away",
      stateAwayId,
      myTeamOnAway,
      stateAwayId && !stateAwayId.startsWith("team-") ? `team-${stateAwayId}` : undefined,
    ].filter((value): value is string => Boolean(value)));

    return {
      homeId,
      awayId,
      homeAliases,
      awayAliases,
    };
  }, [
    setupNames.myTeamId,
    setupNames.vcSide,
    state?.awayTeamId,
    state?.homeTeamId,
  ]);

  function canonicalTeamId(teamId: string): string {
    if (canonicalSideIds.homeAliases.has(teamId)) {
      return canonicalSideIds.homeId;
    }

    if (canonicalSideIds.awayAliases.has(teamId)) {
      return canonicalSideIds.awayId;
    }

    return teamId;
  }

  const rawTeamIds = useMemo(() => {
    return [...new Set([
      ...Object.keys(state?.scoreByTeam ?? {}),
      ...Object.keys(state?.bonusByTeam ?? {}),
      ...Object.keys(state?.possessionsByTeam ?? {}),
      ...Object.keys(state?.activeLineupsByTeam ?? {}),
      ...Object.keys(state?.teamStats ?? {}),
      ...Object.keys(state?.playerStatsByTeam ?? {}),
    ])];
  }, [state]);

  const aggregatedTeams = useMemo(() => {
    const aggregated: Record<string, AggregatedTeam> = {};

    function ensureTeam(teamId: string) {
      aggregated[teamId] ??= {
        score: 0,
        bonus: false,
        possessions: 0,
        activeLineup: [],
        teamStats: emptyTeamStats(),
        playerStats: {},
        timeoutsUsed: 0,
        periodFouls: 0,
      };

      return aggregated[teamId];
    }

    for (const rawTeamId of rawTeamIds) {
      const teamId = canonicalTeamId(rawTeamId);
      const target = ensureTeam(teamId);
      target.score += state?.scoreByTeam?.[rawTeamId] ?? 0;
      target.bonus = target.bonus || (state?.bonusByTeam?.[rawTeamId] ?? false);
      // Fall back to inferred possessions (FGA + turnovers) when operators don't log possession_start
      const explicitPoss = state?.possessionsByTeam?.[rawTeamId] ?? 0;
      const inferredPoss = explicitPoss > 0
        ? 0
        : (state?.teamStats?.[rawTeamId]?.shooting?.fgAttempts ?? 0)
          + (state?.teamStats?.[rawTeamId]?.turnovers ?? 0);
      target.possessions += explicitPoss + inferredPoss;
      target.activeLineup = [...new Set([
        ...target.activeLineup,
        ...(state?.activeLineupsByTeam?.[rawTeamId] ?? []),
      ])];
      mergeTeamStats(target.teamStats, state?.teamStats?.[rawTeamId]);
      mergePlayerStats(target.playerStats, state?.playerStatsByTeam?.[rawTeamId]);
      target.timeoutsUsed += state?.timeoutsByTeam?.[rawTeamId] ?? 0;
      // Sum fouls for the current period from teamFoulsByPeriod
      const periodFoulMap = state?.teamFoulsByPeriod?.[rawTeamId] ?? {};
      const currentPeriod = state?.currentPeriod ?? "Q1";
      target.periodFouls += periodFoulMap[currentPeriod] ?? 0;
    }

    return aggregated;
  }, [rawTeamIds, setupNames.myTeamId, setupNames.vcSide, state]);

  const teams = useMemo(() => {
    const homeSlot = canonicalSideIds.homeId;
    // Guard: when both canonical IDs collapse to the same value (e.g. bad game
    // setup where homeTeamId === awayTeamId), fall back to the raw state IDs so
    // both team cards are always rendered.
    const awaySlot =
      canonicalSideIds.awayId !== canonicalSideIds.homeId
        ? canonicalSideIds.awayId
        : (state?.awayTeamId && state.awayTeamId !== state?.homeTeamId
            ? state?.awayTeamId
            : "away");

    // When the live game state unambiguously places myTeamId on the opposite side
    // from what vcSide says (e.g. the operator started the game with sides flipped),
    // use the state-confirmed side for ordering so VC always appears at index 0.
    const vcIsConfirmedAway =
      Boolean(setupNames.myTeamId) &&
      Boolean(state?.awayTeamId) &&
      setupNames.myTeamId === state?.awayTeamId;
    const vcIsConfirmedHome =
      Boolean(setupNames.myTeamId) &&
      Boolean(state?.homeTeamId) &&
      setupNames.myTeamId === state?.homeTeamId;
    const effectiveVcSide = vcIsConfirmedAway ? "away" : vcIsConfirmedHome ? "home" : setupNames.vcSide;

    // Always put our team (vc side) at index 0 so it renders on the left.
    const preferred = (effectiveVcSide === "away" ? [awaySlot, homeSlot] : [homeSlot, awaySlot])
      .filter((teamId): teamId is string => Boolean(teamId));
    const preferredUnique = [...new Set(preferred)];

    // Render exactly two team cards. Extra aggregated IDs can appear from stale
    // aliases or historic payloads and should never create a third scoreboard team.
    if (preferredUnique.length >= 2) {
      return preferredUnique.slice(0, 2);
    }

    const observedFallback = [...new Set(
      Object.keys(aggregatedTeams)
        .map((teamId) => canonicalTeamId(teamId))
        .filter((teamId): teamId is string => Boolean(teamId) && !preferredUnique.includes(teamId))
    )];

    return [...preferredUnique, ...observedFallback].slice(0, 2);
  }, [aggregatedTeams, canonicalSideIds.awayId, canonicalSideIds.homeId, setupNames.vcSide, setupNames.myTeamId, state?.awayTeamId, state?.homeTeamId]);

  return { canonicalSideIds, canonicalTeamId, rawTeamIds, aggregatedTeams, teams };
}
