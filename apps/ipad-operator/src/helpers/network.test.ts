import { describe, expect, it } from "vitest";
import { generateFreshGameId, generateGameId } from "./network.js";

describe("generateFreshGameId", () => {
  it("keeps the readable base game id", () => {
    const fresh = generateFreshGameId("Wolves", "2026-04-08", "discard", 1712531730123);
    expect(fresh.startsWith(`${generateGameId("Wolves", "2026-04-08")}-discard-`)).toBe(true);
  });

  it("produces a different id than the plain generated id", () => {
    const base = generateGameId("Wolves", "2026-04-08");
    const fresh = generateFreshGameId("Wolves", "2026-04-08", "discard", 1712531730123);
    expect(fresh).not.toBe(base);
  });

  it("separates reset and discard id reasons", () => {
    const reset = generateFreshGameId("Wolves", "2026-04-08", "reset", 1712531730123);
    const discard = generateFreshGameId("Wolves", "2026-04-08", "discard", 1712531730123);
    expect(reset).not.toBe(discard);
    expect(reset.includes("-reset-")).toBe(true);
    expect(discard.includes("-discard-")).toBe(true);
  });
});
