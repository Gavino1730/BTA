import { formatClockSeconds, type Period } from "@bta/shared-schema";

export interface DashboardEventMetaInput {
  teamId: string;
  period: Period;
  clockSecondsRemaining: number;
}

export interface DashboardAnchorSummaryInput {
  period: Period;
  gameClockSeconds: number;
  videoSecond: number;
}

export function formatDashboardClock(seconds: number): string {
  return formatClockSeconds(seconds).padStart(5, "0");
}

export function formatDashboardEventMeta(input: DashboardEventMetaInput): string {
  return `${input.teamId} · ${input.period} · clock ${formatDashboardClock(input.clockSecondsRemaining)}`;
}

export function formatDashboardAnchorSummary(input: DashboardAnchorSummaryInput): string {
  return `${input.period} · game ${formatDashboardClock(input.gameClockSeconds)} · video ${formatDashboardClock(input.videoSecond)}`;
}

export function formatBonusIndicator(inBonus: boolean): string {
  return inBonus ? "ON" : "OFF";
}

export function formatFoulTroubleLabel(playerId: string, fouls: number): string {
  if (fouls >= 5) {
    return `${playerId} (${fouls}) FOULED OUT`;
  }

  if (fouls >= 4) {
    return `${playerId} (${fouls}) foul-out risk`;
  }

  return `${playerId} (${fouls})`;
}