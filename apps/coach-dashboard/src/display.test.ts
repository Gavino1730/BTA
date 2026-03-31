import { describe, expect, it } from "vitest";
import {
  formatBonusIndicator,
  formatDashboardClock,
  formatDashboardEventMeta,
  formatFoulTroubleLabel,
} from "./display.js";

describe("coach dashboard NFHS display helpers", () => {
  it("formats regulation and overtime clocks for display", () => {
    expect(formatDashboardClock(480)).toBe("08:00");
    expect(formatDashboardClock(240)).toBe("04:00");
    expect(formatDashboardClock(9)).toBe("00:09");
  });

  it("formats recent event metadata with NFHS period labels", () => {
    expect(formatDashboardEventMeta({ teamId: "home", period: "Q4", clockSecondsRemaining: 125 })).toBe("home · Q4 · clock 02:05");
    expect(formatDashboardEventMeta({ teamId: "away", period: "OT1", clockSecondsRemaining: 17 })).toBe("away · OT1 · clock 00:17");
  });

  it("shows bonus state, foul-out risk, and fouled-out status using NFHS thresholds", () => {
    expect(formatBonusIndicator(true)).toBe("ON");
    expect(formatBonusIndicator(false)).toBe("OFF");
    expect(formatFoulTroubleLabel("p4", 4)).toBe("p4 (4) foul-out risk");
    expect(formatFoulTroubleLabel("p5", 5)).toBe("p5 (5) FOULED OUT");
    expect(formatFoulTroubleLabel("p2", 2)).toBe("p2 (2)");
  });
});