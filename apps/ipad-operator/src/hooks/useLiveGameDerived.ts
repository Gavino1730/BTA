import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { isOvertimePeriod } from "@bta/shared-schema";
import type { GameEvent } from "@bta/shared-schema";
import {
  computePlayerTotals,
  computeScores,
} from "../helpers/events.js";
import { computeTeamStats } from "../helpers/players.js";
import type { Player, RunningTotals } from "../types.js";
import type { TeamSide } from "../types.js";
import { getPeriodOrder } from "./usePeriodControl.js";
import { clockToSec } from "../helpers/clock.js";

type FeedItem = { event: GameEvent; pending: boolean };
type Scores = { home: number; away: number };
type PeriodFouls = { home: number; away: number };
type TimeoutCount = { full: number; short: number };
type TeamTimeoutUsage = { regulation: { home: TimeoutCount; away: TimeoutCount }; overtime: { home: { full: number }; away: { full: number } } };
type TimeoutRemaining = { home: { full: number; short: number }; away: { full: number; short: number } };
type GameStateDisplay = { label: string; tone: "live" | "idle" | "break" | "alert" | "done" };

interface Params {
  submittedEvents: GameEvent[];
  pendingEvents: GameEvent[];
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homePlayers: Player[];
  awayPlayers: Player[];
  vcSideSetup: TeamSide;
  period: string;
  gamePhase: string;
  clockInput: string;
  clockRunning: boolean;
  trackClock: boolean;
  trackTimeouts: boolean;
  clockEnabled: boolean;
  dismissedTimeoutId: string | null;
  setDismissedTimeoutId: Dispatch<SetStateAction<string | null>>;
  possessionOverrideTeamId: string | null | undefined;
}

interface Result {
  allEvents: FeedItem[];
  allEventObjs: GameEvent[];
  scores: Scores;
  pTotals: Record<string, RunningTotals>;
  homeTeamStats: ReturnType<typeof computeTeamStats>;
  awayTeamStats: ReturnType<typeof computeTeamStats>;
  periodTeamFouls: PeriodFouls;
  homeInBonus: boolean;
  awayInBonus: boolean;
  timeoutUsage: TeamTimeoutUsage;
  inOvertimeNow: boolean;
  timeoutRemaining: TimeoutRemaining;
  totalTimeoutsLeft: { home: number; away: number };
  latestEvent: GameEvent | undefined;
  currentGameState: GameStateDisplay;
  eventPossessionTeamId: string | null;
  possessionTeamId: string | null | undefined;
  possessionLabel: string;
  foulAlerts: Player[];
  trackedPlayers: Player[];
  trackedTopScorer: { name: string; points: number } | undefined;
  maxOtInEvents: number;
  furthestReachedPeriodOrder: number;
}

export function useLiveGameDerived({
  submittedEvents,
  pendingEvents,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  homePlayers,
  awayPlayers,
  vcSideSetup,
  period,
  gamePhase,
  clockInput,
  clockRunning,
  trackClock,
  trackTimeouts,
  clockEnabled,
  dismissedTimeoutId,
  setDismissedTimeoutId,
  possessionOverrideTeamId,
}: Params): Result {
  const allEvents = useMemo(() => [
    ...submittedEvents.map(e => ({ event: e, pending: false })),
    ...pendingEvents.filter(e => !submittedEvents.some(s => s.id === e.id)).map(e => ({ event: e, pending: true })),
  ].sort((a, b) => b.event.sequence - a.event.sequence), [submittedEvents, pendingEvents]);

  const allEventObjs = useMemo(() => allEvents.map(x => x.event), [allEvents]);
  const scores = useMemo(() => computeScores(allEventObjs, homeTeamId, awayTeamId), [allEventObjs, homeTeamId, awayTeamId]);
  const pTotals = useMemo(() => computePlayerTotals(allEventObjs), [allEventObjs]);
  const homeTeamStats = useMemo(() => computeTeamStats(allEventObjs, homeTeamId), [allEventObjs, homeTeamId]);
  const awayTeamStats = useMemo(() => computeTeamStats(allEventObjs, awayTeamId), [allEventObjs, awayTeamId]);

  const periodTeamFouls = useMemo(() => {
    const totals = { home: 0, away: 0 };
    const inOT = isOvertimePeriod(period);
    for (const event of allEventObjs) {
      if (event.type !== "foul") continue;
      // NFHS OT rule: Q4 fouls carry into OT and all OT-period fouls accumulate.
      const counts = inOT
        ? event.period === "Q4" || isOvertimePeriod(event.period)
        : event.period === period;
      if (!counts) continue;
      if (event.teamId === homeTeamId) totals.home += 1;
      if (event.teamId === awayTeamId) totals.away += 1;
    }
    return totals;
  }, [allEventObjs, period, homeTeamId, awayTeamId]);

  const homeInBonus = periodTeamFouls.away >= 5;
  const awayInBonus = periodTeamFouls.home >= 5;

  const timeoutUsage = useMemo((): TeamTimeoutUsage => {
    const regulation = {
      home: { full: 0, short: 0 },
      away: { full: 0, short: 0 },
    };
    const overtime = {
      home: { full: 0 },
      away: { full: 0 },
    };
    for (const event of allEventObjs) {
      if (event.type !== "timeout") continue;
      const side = event.teamId === homeTeamId ? "home" : event.teamId === awayTeamId ? "away" : null;
      if (!side) continue;
      if (isOvertimePeriod(event.period)) {
        if (event.timeoutType === "full") overtime[side].full += 1;
      } else {
        regulation[side][event.timeoutType] += 1;
      }
    }
    return { regulation, overtime };
  }, [allEventObjs, homeTeamId, awayTeamId]);

  const inOvertimeNow = isOvertimePeriod(period);

  const timeoutRemaining = useMemo((): TimeoutRemaining => {
    if (inOvertimeNow) {
      return {
        home: { full: Math.max(0, 1 - timeoutUsage.overtime.home.full), short: 0 },
        away: { full: Math.max(0, 1 - timeoutUsage.overtime.away.full), short: 0 },
      };
    }
    return {
      home: {
        full: Math.max(0, 3 - timeoutUsage.regulation.home.full),
        short: Math.max(0, 2 - timeoutUsage.regulation.home.short),
      },
      away: {
        full: Math.max(0, 3 - timeoutUsage.regulation.away.full),
        short: Math.max(0, 2 - timeoutUsage.regulation.away.short),
      },
    };
  }, [inOvertimeNow, timeoutUsage]);

  const totalTimeoutsLeft = {
    home: timeoutRemaining.home.full + timeoutRemaining.home.short,
    away: timeoutRemaining.away.full + timeoutRemaining.away.short,
  };

  const latestEvent = allEvents[0]?.event;

  useEffect(() => {
    if (clockRunning && latestEvent?.type === "timeout") {
      setDismissedTimeoutId(latestEvent.id);
    }
  }, [clockRunning, latestEvent, setDismissedTimeoutId]);

  const currentGameState = useMemo((): GameStateDisplay => {
    if (gamePhase === "post-game") {
      return { label: "End of Game", tone: "done" };
    }
    if (gamePhase === "pre-game") {
      return { label: "Pre-Game", tone: "idle" };
    }

    const clockDisabled = !clockEnabled || !trackClock;
    if (clockDisabled) {
      return { label: "Clock Disabled", tone: "idle" };
    }

    const clockAtZero = clockToSec(clockInput) <= 0;
    if (clockAtZero) {
      if (period === "Q2") return { label: "Halftime", tone: "break" };
      if (period === "Q4") return { label: "End of Q4", tone: "break" };
      return { label: `End of ${period}`, tone: "break" };
    }

    if (!clockRunning && trackTimeouts && latestEvent?.type === "timeout" && latestEvent.id !== dismissedTimeoutId) {
      const teamName = latestEvent.teamId === homeTeamId
        ? homeTeamName
        : latestEvent.teamId === awayTeamId
          ? awayTeamName
          : "Team";
      const timeoutLen = latestEvent.timeoutType === "full" ? "60" : "30";
      return { label: `${teamName} Timeout (${timeoutLen}s)`, tone: "alert" };
    }

    if (clockRunning) {
      return { label: "Live", tone: "live" };
    }

    return { label: "Clock Stopped", tone: "idle" };
  }, [
    allEvents,
    clockEnabled,
    awayTeamId,
    awayTeamName,
    clockInput,
    clockRunning,
    dismissedTimeoutId,
    gamePhase,
    homeTeamId,
    homeTeamName,
    latestEvent,
    period,
    trackClock,
    trackTimeouts,
  ]);

  const eventPossessionTeamId = useMemo(() => {
    const possessionEvent = allEventObjs.find((event) => event.type === "possession_start");
    return possessionEvent?.possessedByTeamId ?? null;
  }, [allEventObjs]);

  const possessionTeamId = possessionOverrideTeamId !== undefined
    ? possessionOverrideTeamId
    : eventPossessionTeamId;

  const possessionLabel = possessionTeamId === homeTeamId
    ? homeTeamName
    : possessionTeamId === awayTeamId
      ? awayTeamName
      : "Not set";

  const foulAlerts = useMemo(() => {
    const vcPl = vcSideSetup === "home" ? homePlayers : awayPlayers;
    return vcPl.filter(p => (pTotals[p.id]?.fouls ?? 0) >= 4);
  }, [vcSideSetup, homePlayers, awayPlayers, pTotals]);

  const trackedPlayers = useMemo(
    () => (vcSideSetup === "home" ? homePlayers : awayPlayers),
    [vcSideSetup, homePlayers, awayPlayers],
  );

  const trackedTopScorer = useMemo(() => {
    let current: { name: string; points: number } | undefined;
    for (const player of trackedPlayers) {
      const points = pTotals[player.id]?.points ?? 0;
      if (!current || points > current.points) {
        current = { name: player.name, points };
      }
    }
    return current;
  }, [trackedPlayers, pTotals]);

  const maxOtInEvents = useMemo(() => {
    return allEventObjs.reduce((maxOt, event) => {
      if (!isOvertimePeriod(event.period)) return maxOt;
      const otNumber = Number.parseInt(event.period.slice(2), 10);
      return Number.isFinite(otNumber) ? Math.max(maxOt, otNumber) : maxOt;
    }, 0);
  }, [allEventObjs]);

  const furthestReachedPeriodOrder = useMemo(() => {
    let maxOrder = getPeriodOrder(period);
    for (const event of allEventObjs) {
      maxOrder = Math.max(maxOrder, getPeriodOrder(event.period));
      if (event.type === "period_transition") {
        maxOrder = Math.max(maxOrder, getPeriodOrder(event.newPeriod));
      }
    }
    return maxOrder;
  }, [allEventObjs, period]);

  return {
    allEvents,
    allEventObjs,
    scores,
    pTotals,
    homeTeamStats,
    awayTeamStats,
    periodTeamFouls,
    homeInBonus,
    awayInBonus,
    timeoutUsage,
    inOvertimeNow,
    timeoutRemaining,
    totalTimeoutsLeft,
    latestEvent,
    currentGameState,
    eventPossessionTeamId,
    possessionTeamId,
    possessionLabel,
    foulAlerts,
    trackedPlayers,
    trackedTopScorer,
    maxOtInEvents,
    furthestReachedPeriodOrder,
  };
}
