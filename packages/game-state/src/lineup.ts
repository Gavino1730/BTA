import type { GameEvent } from "@bta/shared-schema";

/**
 * A contiguous stint where the same 5-man unit was on the floor together.
 * Segments are created for myTeam only; a new segment starts on every substitution.
 */
export interface LineupSegment {
  playerIds: string[];   // sorted player IDs in this unit
  lineupKey: string;     // playerIds.join('+')
  pointsFor: number;     // points scored by myTeam during this stint
  pointsAgainst: number; // points scored by opponent during this stint
  plusMinus: number;     // pointsFor - pointsAgainst
}

/** Aggregated stats per unique 5-man lineup unit across all their stints. */
export interface LineupUnitStats {
  lineupKey: string;
  playerIds: string[];
  pointsFor: number;
  pointsAgainst: number;
  plusMinus: number;
  segments: number; // number of stints this unit appeared in
}

/**
 * Splits events into lineup stints for myTeam and tallies +/- per stint.
 * @param events         All game events in any order.
 * @param myTeamId       The team whose lineup is being tracked.
 * @param opponentTeamId The opposing team ID (for pointsAgainst).
 * @param startingLineup Player IDs on the floor at tip-off.
 */
export function computeLineupSegments(
  events: GameEvent[],
  myTeamId: string,
  opponentTeamId: string,
  startingLineup: string[] = []
): LineupSegment[] {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const segments: LineupSegment[] = [];
  let currentLineup = [...startingLineup];

  function makeKey(ids: string[]): string {
    return [...ids].sort().join('+');
  }

  let current: LineupSegment = {
    playerIds: [...currentLineup].sort(),
    lineupKey: makeKey(currentLineup),
    pointsFor: 0,
    pointsAgainst: 0,
    plusMinus: 0,
  };

  for (const event of sorted) {
    if (event.type === 'substitution' && event.teamId === myTeamId) {
      if (current.playerIds.length > 0) segments.push(current);
      currentLineup = currentLineup.filter(id => id !== event.playerOutId);
      if (!currentLineup.includes(event.playerInId)) currentLineup.push(event.playerInId);
      current = {
        playerIds: [...currentLineup].sort(),
        lineupKey: makeKey(currentLineup),
        pointsFor: 0,
        pointsAgainst: 0,
        plusMinus: 0,
      };
    } else if (
      (event.type === 'shot_attempt' && event.made) ||
      (event.type === 'free_throw_attempt' && event.made)
    ) {
      const pts = event.type === 'shot_attempt' ? event.points : 1;
      if (event.teamId === myTeamId) {
        current.pointsFor += pts;
      } else if (event.teamId === opponentTeamId) {
        current.pointsAgainst += pts;
      }
      current.plusMinus = current.pointsFor - current.pointsAgainst;
    }
  }

  segments.push(current);

  return segments.filter(s => s.playerIds.length > 0);
}

/**
 * Aggregates lineup segments into per-unit totals, sorted by +/- descending.
 */
export function aggregateLineupStats(segments: LineupSegment[]): LineupUnitStats[] {
  const map = new Map<string, LineupUnitStats>();
  for (const seg of segments) {
    const existing = map.get(seg.lineupKey);
    if (existing) {
      existing.pointsFor += seg.pointsFor;
      existing.pointsAgainst += seg.pointsAgainst;
      existing.plusMinus = existing.pointsFor - existing.pointsAgainst;
      existing.segments++;
    } else {
      map.set(seg.lineupKey, {
        lineupKey: seg.lineupKey,
        playerIds: seg.playerIds,
        pointsFor: seg.pointsFor,
        pointsAgainst: seg.pointsAgainst,
        plusMinus: seg.plusMinus,
        segments: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.plusMinus - a.plusMinus);
}
