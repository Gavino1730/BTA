import { describe, expect, it } from "vitest";
import { formatFoulTroubleLabel } from "./display.js";

describe("coach dashboard NFHS display helpers", () => {
  it("shows foul-out risk and fouled-out status using NFHS thresholds", () => {
    expect(formatFoulTroubleLabel("p4", 4)).toBe("p4 (4) foul-out risk");
    expect(formatFoulTroubleLabel("p5", 5)).toBe("p5 (5) FOULED OUT");
    expect(formatFoulTroubleLabel("p2", 2)).toBe("p2 (2)");
  });
});