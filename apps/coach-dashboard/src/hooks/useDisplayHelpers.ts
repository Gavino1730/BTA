import { useMemo } from "react";
import {
  toTitleCase, replaceToken,
  type GameState, type RosterPlayer, type RosterTeam,
} from "../helpers/index.js";
import type { CanonicalSideIds, AggregatedTeam } from "./useGameTeams.js";

type SetupNames = {
  myTeamId: string;
  myTeamName: string;
  opponentName: string;
  vcSide: "home" | "away";
  homeColor: string;
  awayColor: string;
};

type DisplayHelpersParams = {
  rosterTeams: RosterTeam[];
  setupNames: SetupNames;
  state: GameState | null;
  teams: string[];
  rawTeamIds: string[];
  aggregatedTeams: Record<string, AggregatedTeam>;
  canonicalTeamId: (id: string) => string;
  canonicalSideIds: CanonicalSideIds;
};

export type RosterLabels = {
  teamNameById: Record<string, string>;
  playerNameByTeamAndId: Record<string, string>;
  playerNameById: Record<string, string>;
};

export function useDisplayHelpers({
  rosterTeams,
  setupNames,
  state,
  teams,
  rawTeamIds,
  aggregatedTeams,
  canonicalTeamId,
  canonicalSideIds,
}: DisplayHelpersParams): {
  rosterLabels: RosterLabels;
  playersByTeamId: Record<string, RosterPlayer[]>;
  teamColorById: Record<string, string>;
  displayTeamName: (teamId: string) => string;
  displayPlayerName: (teamId: string, playerId: string) => string;
  getScoreboardLineup: (teamId: string) => { playerIds: string[]; isEstimated: boolean };
  prettifyInsightText: (text: string, relatedTeamId?: string, relatedPlayerId?: string) => string;
} {
  const rosterLabels: RosterLabels = useMemo(() => {
    const teamNameById: Record<string, string> = {};
    const playerNameByTeamAndId: Record<string, string> = {};
    const playerNameById: Record<string, string> = {};

    for (const team of rosterTeams) {
      const teamDisplay = team.name.trim() || team.abbreviation.trim() || team.id;
      teamNameById[team.id] = teamDisplay;

      for (const player of team.players) {
        const playerDisplay = player.name.trim() || (player.number.trim() ? `#${player.number.trim()}` : player.id);
        playerNameByTeamAndId[`${team.id}:${player.id}`] = playerDisplay;

        if (!playerNameById[player.id]) {
          playerNameById[player.id] = playerDisplay;
        }
      }
    }

    return {
      teamNameById,
      playerNameByTeamAndId,
      playerNameById,
    };
  }, [rosterTeams]);

  const playersByTeamId = useMemo(() => {
    const byTeamId: Record<string, RosterPlayer[]> = {};
    for (const team of rosterTeams) {
      byTeamId[team.id] = team.players;
    }
    return byTeamId;
  }, [rosterTeams]);

  const teamColorById = useMemo(() => {
    const map: Record<string, string> = {};
    // Seed with operator-provided URL colors so they apply even without a roster entry
    if (setupNames.homeColor) map[canonicalSideIds.homeId] = setupNames.homeColor;
    if (setupNames.awayColor) map[canonicalSideIds.awayId] = setupNames.awayColor;
    // rosterTeams colors take priority over operator URL defaults
    for (const team of rosterTeams) {
      if (team.teamColor) map[team.id] = team.teamColor;
    }
    return map;
  }, [rosterTeams, setupNames.homeColor, setupNames.awayColor, canonicalSideIds.homeId, canonicalSideIds.awayId]);

  function displayTeamName(teamId: string): string {
    const canonicalId = canonicalTeamId(teamId);
    // Prefer the live game-state opponent name over the URL param - the URL may carry
    // a stale value from a previous game that was bookmarked or scanned weeks ago.
    const opponentName = state?.opponentName || setupNames.opponentName || "";

    // When myTeamId is available in the URL it is the definitive check.
    const ourRawSideId = setupNames.vcSide === "away" ? state?.awayTeamId : state?.homeTeamId;
    const isOurTeam = setupNames.myTeamId !== ""
      ? (teamId === setupNames.myTeamId ||
         canonicalId === setupNames.myTeamId ||
         canonicalTeamId(setupNames.myTeamId) === canonicalId)
      : ((teams.length > 0 && teamId === teams[0]) ||
         (Boolean(ourRawSideId) && teamId === ourRawSideId));

    if (isOurTeam) {
      const rosterLabel = rosterLabels.teamNameById[canonicalId] ?? rosterLabels.teamNameById[teamId];
      if (setupNames.myTeamName && setupNames.myTeamName !== opponentName) return setupNames.myTeamName;
      if (rosterLabel) return rosterLabel;
      // Do not fall back to myTeamName when it equals opponentName — that would show
      // two cards with the same label.  Instead use the canonical-ID fallback below.
      const fallback = canonicalId.replace(/^team[-_]/i, "");
      return toTitleCase(fallback);
    }

    if (opponentName) return opponentName;

    const rosterLabel = rosterLabels.teamNameById[canonicalId] ?? rosterLabels.teamNameById[teamId];
    if (rosterLabel) return rosterLabel;

    const fallback = canonicalId.replace(/^team[-_]/i, "");
    return toTitleCase(fallback);
  }

  function displayPlayerName(teamId: string, playerId: string): string {
    const canonicalId = canonicalTeamId(teamId);
    const normalizedPlayerId = playerId.toLowerCase();
    const normalizedTeamId = teamId.toLowerCase();
    const normalizedCanonicalId = canonicalId.toLowerCase();
    const teamLevelAliases = new Set<string>([
      "home-team",
      "away-team",
      "team-home",
      "team-away",
      normalizedTeamId,
      normalizedCanonicalId,
      `${normalizedTeamId}-team`,
      `${normalizedCanonicalId}-team`,
    ]);

    if (teamLevelAliases.has(normalizedPlayerId)) {
      return displayTeamName(teamId);
    }

    return rosterLabels.playerNameByTeamAndId[`${canonicalId}:${playerId}`]
      ?? rosterLabels.playerNameByTeamAndId[`${teamId}:${playerId}`]
      ?? rosterLabels.playerNameById[playerId]
      ?? playerId;
  }

  function getScoreboardLineup(teamId: string): { playerIds: string[]; isEstimated: boolean } {
    const canonicalId = canonicalTeamId(teamId);
    // Fall back to canonical-keyed bucket when teamId is a side-alias like "away".
    const teamBucket = aggregatedTeams[teamId] ?? aggregatedTeams[canonicalId];
    // Exclude any player ID that is itself a team identifier (e.g. "team-oes" leaking
    // into the active lineup from starting-lineup initialization).
    const knownTeamIds = new Set([
      "home", "away", "home-team", "away-team", "team-home", "team-away",
      ...rawTeamIds,
      ...Object.keys(aggregatedTeams),
      // Also exclude "<teamId>-team" pseudo-IDs emitted by the operator when
      // tracking opponent shots without a specific player selected.
      ...rawTeamIds.map((id) => `${id}-team`),
      ...Object.keys(aggregatedTeams).map((id) => `${id}-team`),
    ].map((id) => id.toLowerCase()));
    const isRealPlayer = (pid: string) => Boolean(pid) && !knownTeamIds.has(pid.toLowerCase());
    const liveLineup = [...new Set(teamBucket?.activeLineup ?? [])].filter(isRealPlayer);
    if (liveLineup.length >= 5) {
      return { playerIds: liveLineup.slice(0, 5), isEstimated: false };
    }

    const statEntries = Object.entries(teamBucket?.playerStats ?? {});
    const activeByStats = statEntries
      .filter(([, statLine]) => {
        const touches =
          statLine.points
          + statLine.fgAttempts
          + statLine.ftAttempts
          + statLine.reboundsOff
          + statLine.reboundsDef
          + statLine.assists
          + statLine.steals
          + statLine.blocks
          + statLine.turnovers
          + statLine.fouls;
        return touches > 0;
      })
      .sort((left, right) => {
        const leftTouches =
          left[1].points
          + left[1].fgAttempts
          + left[1].ftAttempts
          + left[1].reboundsOff
          + left[1].reboundsDef
          + left[1].assists
          + left[1].steals
          + left[1].blocks
          + left[1].turnovers
          + left[1].fouls;
        const rightTouches =
          right[1].points
          + right[1].fgAttempts
          + right[1].ftAttempts
          + right[1].reboundsOff
          + right[1].reboundsDef
          + right[1].assists
          + right[1].steals
          + right[1].blocks
          + right[1].turnovers
          + right[1].fouls;
        return rightTouches - leftTouches;
      })
      .map(([playerId]) => playerId);

    const rosterOrder = (playersByTeamId[canonicalId] ?? playersByTeamId[teamId] ?? []).map((player) => player.id);
    const combined = [...new Set([...liveLineup, ...activeByStats, ...rosterOrder])].filter(isRealPlayer).slice(0, 5);

    return {
      playerIds: combined,
      isEstimated: combined.length > liveLineup.length,
    };
  }

  function prettifyInsightText(
    text: string,
    relatedTeamId?: string,
    relatedPlayerId?: string
  ): string {
    let formatted = text;

    const teamIdsToNormalize = new Set<string>([
      ...teams,
      ...rawTeamIds,
      state?.homeTeamId ?? "",
      state?.awayTeamId ?? "",
      state?.opponentTeamId ?? "",
      relatedTeamId ?? "",
    ].filter(Boolean));

    for (const teamId of teamIdsToNormalize) {
      formatted = replaceToken(formatted, teamId, displayTeamName(teamId));
    }

    if (relatedTeamId && relatedPlayerId) {
      formatted = replaceToken(
        formatted,
        relatedPlayerId,
        displayPlayerName(relatedTeamId, relatedPlayerId)
      );
    }

    for (const [playerId, playerName] of Object.entries(rosterLabels.playerNameById)) {
      formatted = replaceToken(formatted, playerId, playerName);
    }

    return formatted;
  }

  return {
    rosterLabels,
    playersByTeamId,
    teamColorById,
    displayTeamName,
    displayPlayerName,
    getScoreboardLineup,
    prettifyInsightText,
  };
}
