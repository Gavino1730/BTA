import { useEffect } from "react";
import type { GameEvent } from "@bta/shared-schema";
import { getPeriodDefaultClock, isOvertimePeriod } from "@bta/shared-schema";
import { apiKeyHeader } from "../helpers/network.js";

export interface UsePeriodControlInput {
  period: string;
  setPeriod: React.Dispatch<React.SetStateAction<string>>;
  sequence: number;
  base: (seq: number) => Record<string, unknown>;
  homeTeamId: string;
  postEvent: (event: GameEvent) => void;
  setClockRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setClockInput: React.Dispatch<React.SetStateAction<string>>;
  showInlineNotice: (msg: string, tone: "success" | "warning" | "error" | "info", ms?: number) => void;
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
  }) => Promise<boolean>;
  overtimeCount: number;
  setOvertimeCount: React.Dispatch<React.SetStateAction<number>>;
  maxOtInEvents: number;
  furthestReachedPeriodOrder: number;
  pendingEvents: GameEvent[];
  setPendingEvents: React.Dispatch<React.SetStateAction<GameEvent[]>>;
  submittedEvents: GameEvent[];
  setSubmittedEvents: React.Dispatch<React.SetStateAction<GameEvent[]>>;
  apiUrl: string | undefined;
  apiSetup: { apiKey?: string; schoolId?: string };
  gameId: string;
  setSubmitMessage: React.Dispatch<React.SetStateAction<string>>;
}

export function getPeriodOrder(label: string): number {
  const qMatch = /^Q([1-4])$/.exec(label);
  if (qMatch) return Number.parseInt(qMatch[1], 10);
  const otMatch = /^OT(\d+)$/.exec(label);
  if (otMatch) return 100 + Number.parseInt(otMatch[1], 10);
  return 0;
}

export function usePeriodControl({
  period, setPeriod, sequence, base, homeTeamId, postEvent,
  setClockRunning, setClockInput, showInlineNotice, requestConfirm,
  overtimeCount, setOvertimeCount, maxOtInEvents, furthestReachedPeriodOrder,
  pendingEvents, setPendingEvents, submittedEvents, setSubmittedEvents,
  apiUrl, apiSetup, gameId, setSubmitMessage,
}: UsePeriodControlInput) {

  useEffect(() => {
    const currentOt = isOvertimePeriod(period) ? Number.parseInt(period.slice(2), 10) : 0;
    setOvertimeCount((current) => Math.max(current, maxOtInEvents, Number.isFinite(currentOt) ? currentOt : 0));
  }, [maxOtInEvents, period, setOvertimeCount]);

  async function changePeriod(nextPeriod: string) {
    if (nextPeriod === period) return;

    const currentOrder = getPeriodOrder(period);
    const nextOrder = getPeriodOrder(nextPeriod);
    if (nextOrder > currentOrder + 1) {
      showInlineNotice(`You must complete ${period} before jumping to ${nextPeriod}. Periods must advance one at a time.`, "warning", 3200);
      return;
    }

    if (nextOrder < furthestReachedPeriodOrder) {
      const ok = await requestConfirm({
        title: `Move back to ${nextPeriod}?`,
        message: "You already advanced to a later period. Going backward can make the game flow confusing and should only be used for corrections.",
        confirmLabel: `Move to ${nextPeriod}`,
      });
      if (!ok) {
        showInlineNotice("Period change canceled to keep game flow clear.", "warning", 2800);
        return;
      }
    }

    const endSeq = sequence;
    void postEvent({
      ...base(endSeq),
      teamId: homeTeamId,
      type: "period_transition",
      newPeriod: nextPeriod,
    } as GameEvent);
    setClockRunning(false);
    setPeriod(nextPeriod);
    setClockInput(getPeriodDefaultClock(nextPeriod));
  }

  async function deleteOvertimePeriod(periodLabel: string) {
    if (!isOvertimePeriod(periodLabel)) return;

    const pendingToRemove = pendingEvents.filter((event) => event.period === periodLabel);
    const submittedToRemove = submittedEvents.filter((event) => event.period === periodLabel);

    if (submittedToRemove.length > 0 && !navigator.onLine) {
      showInlineNotice("Cannot delete overtime while offline because submitted events must be removed from the API first.", "warning");
      return;
    }

    setPendingEvents((current) => current.filter((event) => event.period !== periodLabel));

    const failedDeletes: string[] = [];
    for (const event of submittedToRemove) {
      try {
        const res = await fetch(`${apiUrl}/api/games/${gameId}/events/${event.id}`, {
          method: "DELETE",
          headers: apiKeyHeader(apiSetup),
        });
        if (!res.ok) {
          failedDeletes.push(event.id);
        }
      } catch {
        failedDeletes.push(event.id);
      }
    }

    if (failedDeletes.length > 0) {
      const failed = new Set(failedDeletes);
      setSubmittedEvents((current) => current.filter((event) => event.period !== periodLabel || failed.has(event.id)));
      showInlineNotice(`Could not delete ${failedDeletes.length} submitted OT events from the server. Remaining OT events were kept.`, "error");
      return;
    }

    setSubmittedEvents((current) => current.filter((event) => event.period !== periodLabel));
    const nextCount = Number.parseInt(periodLabel.slice(2), 10) - 1;
    setOvertimeCount(Math.max(0, nextCount));

    if (period === periodLabel) {
      setPeriod("Q4");
      setClockInput(getPeriodDefaultClock("Q4"));
    }

    if (pendingToRemove.length + submittedToRemove.length > 0) {
      setSubmitMessage(`Deleted ${periodLabel} and removed ${pendingToRemove.length + submittedToRemove.length} events.`);
    } else {
      setSubmitMessage(`Deleted ${periodLabel}.`);
    }
  }

  function addOvertimePeriod() {
    const next = overtimeCount + 1;
    const label = `OT${next}`;
    setOvertimeCount(next);
    void changePeriod(label);
  }

  return { changePeriod, deleteOvertimePeriod, addOvertimePeriod };
}
