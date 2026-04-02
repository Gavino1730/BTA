import { formatClockSeconds, type Period } from "@bta/shared-schema";

export interface DashboardEventMetaInput {
  teamId: string;
  period: Period;
  clockSecondsRemaining: number;
}

export function formatDashboardClock(seconds: number): string {
  return formatClockSeconds(seconds).padStart(5, "0");
}

export function formatDashboardEventMeta(input: DashboardEventMetaInput): string {
  return `${input.teamId} · ${input.period} · clock ${formatDashboardClock(input.clockSecondsRemaining)}`;
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