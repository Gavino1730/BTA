import { describe, expect, it } from "vitest";
import { computeAverageMargin, computeCurrentStreak, formatRecord } from "./stats-page-utils.js";

describe("stats page helpers", () => {
  it("computes the current streak from the most recent games", () => {
    expect(computeCurrentStreak([
      { result: "W", vc_score: 62, opp_score: 50 },
      { result: "W", vc_score: 70, opp_score: 64 },
      { result: "L", vc_score: 54, opp_score: 59 },
    ])).toBe("W2");

    expect(computeCurrentStreak([
      { result: "L", vc_score: 51, opp_score: 65 },
      { result: "L", vc_score: 49, opp_score: 53 },
      { result: "W", vc_score: 60, opp_score: 55 },
    ])).toBe("L2");
  });

  it("formats record and average margin safely", () => {
    expect(formatRecord(12, 4)).toBe("12-4");
    expect(computeAverageMargin([
      { vc_score: 60, opp_score: 50 },
      { vc_score: 58, opp_score: 61 },
      { vc_score: 70, opp_score: 62 },
    ])).toBeCloseTo(5, 5);
  });
});
