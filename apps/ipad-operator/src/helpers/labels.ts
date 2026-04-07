import type { FoulType, ShotZone, TurnoverType } from "@bta/shared-schema";
import type { OperatorAlert } from "../types.js";
import { OPERATOR_ALERT_AUTOCLEAR_MS, OPERATOR_ALERT_AUTOCLEAR_URGENT_MS } from "../constants.js";

export function defaultZoneForPoints(points: 2 | 3): ShotZone {
  return points === 3 ? "above_break_three" : "paint";
}

export function zoneLabel(zone: ShotZone): string {
  switch (zone) {
    case "rim": return "Rim";
    case "paint": return "Paint";
    case "midrange": return "Mid";
    case "corner_three": return "Corner 3";
    case "above_break_three": return "AB 3";
    default: return zone;
  }
}

export function foulTypeLabel(foulType: FoulType): string {
  switch (foulType) {
    case "personal": return "Personal";
    case "shooting": return "Shooting";
    case "offensive": return "Offensive";
    case "technical": return "Technical";
    case "flagrant": return "Flagrant";
    default: return foulType;
  }
}

export function turnoverTypeLabel(turnoverType: TurnoverType): string {
  switch (turnoverType) {
    case "bad_pass": return "Bad Pass";
    case "traveling": return "Travel";
    case "double_dribble": return "Double Dribble";
    case "out_of_bounds": return "Out of Bounds";
    case "offensive_foul": return "Offensive Foul";
    case "steal": return "Steal";
    case "other": return "Other";
    default: return turnoverType;
  }
}

export function getOperatorAlertAutoClearMs(alerts: OperatorAlert[]): number {
  return alerts.some((alert) => alert.priority === "urgent")
    ? OPERATOR_ALERT_AUTOCLEAR_URGENT_MS
    : OPERATOR_ALERT_AUTOCLEAR_MS;
}

export function getAudioContextCtor(): (new () => AudioContext) | undefined {
  return window.AudioContext
    ?? (window as Window & { webkitAudioContext?: new () => AudioContext }).webkitAudioContext;
}
