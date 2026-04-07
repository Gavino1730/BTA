import { useMemo } from "react";
import type { PlayerStats, LineupUnitStats } from "@bta/game-state";
import { aggregateLineupStats, computeLineupSegments } from "@bta/game-state";
import type { GameState, RotationWatchNote, RosterTeam } from "../helpers/index.js";
import type { AggregatedTeam, CanonicalSideIds } from "./useGameTeams.js";

type SetupNames = {
  myTeamId: string;
  vcSide: "home" | "away";
};

type Params = {
  teams: string[];
  aggregatedTeams: Record<string, AggregatedTeam>;
  canonicalTeamId: (id: string) => string;
  canonicalSideIds: CanonicalSideIds;
  state: GameState | null;
  setupNames: SetupNames;
  rosterTeams: RosterTeam[];
};

export type RotationContext = {
  teamId: string;
  onCourt: string[];
  bench: string[];
  watchNotes: RotationWatchNote[];
  isEstimatedLineup: boolean;
  liveCount: number;
};

export function useGameMemos({
  teams,
  aggregatedTeams,
  canonicalTeamId,
  canonicalSideIds,
  state,
  setupNames,
  rosterTeams,
}: Params): {
  leadersByTeam: Record<string, { scoringLeader?: PlayerStats; foulLeader?: PlayerStats }>;
  coachedTeamId: string;
  lineupUnitStats: LineupUnitStats[] | null;
  rotationContext: RotationContext | null;
} {
  const leadersByTeam = useMemo(() => {
    return Object.fromEntries(
      teams.map((teamId) => {
        const canonId = canonicalTeamId(teamId);
        const td = aggregatedTeams[teamId] ?? aggregatedTeams[canonId];
        const players = Object.values(td?.playerStats ?? {});
        const scoringLeader = players
          .filter((player) => player.points > 0)
          .slice()
          .sort((left, right) => right.points - left.points || left.playerId.localeCompare(right.playerId))[0];
        const foulLeader = players
          .filter((player) => player.fouls > 0)
          .slice()
          .sort((left, right) => right.fouls - left.fouls || left.playerId.localeCompare(right.playerId))[0];

        return [teamId, { scoringLeader, foulLeader }];
      })
    ) as Record<string, { scoringLeader?: PlayerStats; foulLeader?: PlayerStats }>;
  }, [aggregatedTeams, teams]);

  const coachedTeamId = useMemo(() => {
    if (setupNames.myTeamId) {
      return canonicalTeamId(setupNames.myTeamId);
    }

    // When myTeamId isn't in the URL, prefer the team whose starting lineup is
    // seeded in the game state - avoids defaulting to the opponent's (home) slot.
    const lineupEntry = Object.entries(state?.activeLineupsByTeam ?? {})
      .find(([, lineup]) => lineup.length > 0);
    if (lineupEntry) {
      return canonicalTeamId(lineupEntry[0]);
    }

    return setupNames.vcSide === "away" ? canonicalSideIds.awayId : canonicalSideIds.homeId;
  }, [canonicalSideIds.awayId, canonicalSideIds.homeId, setupNames.myTeamId, setupNames.vcSide, state?.activeLineupsByTeam]);

  /** Lineup unit +/- — null when not enough data to compute (no starting lineup and no subs). */
  const lineupUnitStats = useMemo((): LineupUnitStats[] | null => {
    if (!coachedTeamId || !state?.events?.length) return null;
    const oppId = state?.opponentTeamId
      ?? (coachedTeamId === canonicalSideIds.homeId ? canonicalSideIds.awayId : canonicalSideIds.homeId);
    let startingLineup: string[] = state?.startingLineupByTeam?.[coachedTeamId] ?? [];
    if (startingLineup.length === 0) {
      const rawKey = Object.keys(state?.startingLineupByTeam ?? {}).find(k => canonicalTeamId(k) === coachedTeamId);
      if (rawKey) startingLineup = state.startingLineupByTeam![rawKey] ?? [];
    }
    const hasSubs = state.events.some(e => e.type === 'substitution' && canonicalTeamId(e.teamId) === coachedTeamId);
    if (startingLineup.length === 0 && !hasSubs) return null;
    const segments = computeLineupSegments(state.events, coachedTeamId, oppId, startingLineup);
    return aggregateLineupStats(segments);
  }, [coachedTeamId, canonicalSideIds.awayId, canonicalSideIds.homeId, state?.events, state?.opponentTeamId, state?.startingLineupByTeam]);

  const rotationContext = useMemo((): RotationContext | null => {
    if (!coachedTeamId) {
      return null;
    }

    const teamId = coachedTeamId;
    const liveOnCourt = [...new Set(aggregatedTeams[teamId]?.activeLineup ?? [])].filter(Boolean);
    const playerStats = aggregatedTeams[teamId]?.playerStats ?? {};
    const rosterTeam = rosterTeams.find((team) => team.id === canonicalTeamId(teamId) || team.id === teamId);

    const activeByStats = Object.values(playerStats)
      .map((player) => ({
        playerId: player.playerId,
        activityScore: (
          player.points
          + player.fgAttempts
          + player.ftAttempts
          + player.reboundsOff
          + player.reboundsDef
          + player.assists
          + player.steals
          + player.blocks
          + player.turnovers
          + player.fouls
        )
      }))
      .filter((player) => player.activityScore > 0)
      .sort((left, right) => right.activityScore - left.activityScore)
      .map((player) => player.playerId);

    const rosterOrder = rosterTeam?.players.map((player) => player.id) ?? [];

    // Build team-level alias set so we never show a team ID as a player chip.
    const teamAliasSet = new Set<string>([
      ...Array.from(canonicalSideIds.homeAliases).map((s) => s.toLowerCase()),
      ...Array.from(canonicalSideIds.awayAliases).map((s) => s.toLowerCase()),
    ]);
    const isValidPlayerId = (id: string) => id && !teamAliasSet.has(id.toLowerCase());

    const onCourt = [...new Set([...liveOnCourt, ...activeByStats, ...rosterOrder])]
      .filter(isValidPlayerId)
      .slice(0, 5);
    const isEstimatedLineup = liveOnCourt.length < 5 && onCourt.length > liveOnCourt.length;

    const knownPlayerIds = new Set<string>([
      ...onCourt,
      ...Object.keys(playerStats).filter(isValidPlayerId),
      ...rosterOrder.filter(isValidPlayerId),
    ]);

    const bench = [...knownPlayerIds].filter((playerId) => !onCourt.includes(playerId));

    const watchNotes: RotationWatchNote[] = onCourt.flatMap((playerId) => {
      const stats = playerStats[playerId];
      if (!stats) return [];

      const notes: RotationWatchNote[] = [];
      if (stats.fouls >= 4) {
        notes.push({ playerId, level: "high", reason: `Foul-out risk (${stats.fouls} fouls)` });
      } else if (stats.fouls === 3) {
        notes.push({ playerId, level: "medium", reason: "Foul pressure (3 fouls)" });
      }
      if (stats.turnovers >= 3) {
        notes.push({ playerId, level: "medium", reason: `${stats.turnovers} turnovers in current sample` });
      }
      return notes;
    });

    return {
      teamId,
      onCourt,
      bench,
      watchNotes,
      isEstimatedLineup,
      liveCount: liveOnCourt.length,
    };
  }, [aggregatedTeams, canonicalTeamId, coachedTeamId, rosterTeams]);

  return { leadersByTeam, coachedTeamId, lineupUnitStats, rotationContext };
}
