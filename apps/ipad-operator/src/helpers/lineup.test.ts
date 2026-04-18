import { describe, expect, it } from "vitest";
import { sanitizeLineup, lineupsEqual } from "./lineup.js";

describe("sanitizeLineup", () => {
  it("returns empty array for non-array input", () => {
    expect(sanitizeLineup(null)).toEqual([]);
    expect(sanitizeLineup(undefined)).toEqual([]);
    expect(sanitizeLineup("p1")).toEqual([]);
    expect(sanitizeLineup(42)).toEqual([]);
  });

  it("deduplicates player IDs", () => {
    expect(sanitizeLineup(["p1", "p2", "p1"])).toEqual(["p1", "p2"]);
  });

  it("trims whitespace from IDs", () => {
    expect(sanitizeLineup(["  p1  ", "p2 "])).toEqual(["p1", "p2"]);
  });

  it("filters out empty strings", () => {
    expect(sanitizeLineup(["p1", "", "  ", "p2"])).toEqual(["p1", "p2"]);
  });

  it("caps result at 5 players", () => {
    const input = ["p1", "p2", "p3", "p4", "p5", "p6"];
    expect(sanitizeLineup(input)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("converts non-string entries to strings", () => {
    expect(sanitizeLineup([1, 2, 3])).toEqual(["1", "2", "3"]);
  });
});

describe("lineupsEqual", () => {
  it("returns true for identical lineups", () => {
    expect(lineupsEqual(["p1", "p2", "p3"], ["p1", "p2", "p3"])).toBe(true);
  });

  it("returns false for different lengths", () => {
    expect(lineupsEqual(["p1", "p2"], ["p1", "p2", "p3"])).toBe(false);
  });

  it("returns false for same players in different order", () => {
    expect(lineupsEqual(["p1", "p2", "p3"], ["p1", "p3", "p2"])).toBe(false);
  });

  it("returns false when one player differs", () => {
    expect(lineupsEqual(["p1", "p2", "p3"], ["p1", "p2", "p4"])).toBe(false);
  });

  it("returns true for two empty arrays", () => {
    expect(lineupsEqual([], [])).toBe(true);
  });
});
