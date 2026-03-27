import type { Period } from "./types.js";

export const REGULATION_PERIOD_SECONDS = 8 * 60;
export const OVERTIME_PERIOD_SECONDS = 4 * 60;

export function isOvertimePeriod(period: string): period is `OT${number}` {
  return /^OT\d+$/.test(period);
}

export function getPeriodDurationSeconds(period: string): number {
  return isOvertimePeriod(period) ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
}

export function formatClockSeconds(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainingSeconds = String(Math.max(0, seconds) % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

export function getPeriodDefaultClock(period: string): string {
  return formatClockSeconds(getPeriodDurationSeconds(period));
}