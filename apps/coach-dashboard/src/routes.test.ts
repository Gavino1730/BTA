import { describe, expect, it } from "vitest";
import { apiBase } from "./platform.js";
import { canonicalizeCoachPath, resolveCoachRoute } from "./routes.js";

describe("coach route helpers", () => {
  it("canonicalizes legacy stats URLs into unified coach workspace routes", () => {
    expect(canonicalizeCoachPath("/games")).toBe("/stats/games");
    expect(canonicalizeCoachPath("/ai-insights")).toBe("/stats/insights");
    expect(canonicalizeCoachPath("/onboarding")).toBe("/setup");
    expect(canonicalizeCoachPath("/")).toBe("/live");
  });

  it("resolves canonical and aliased routes to the same coach views", () => {
    expect(resolveCoachRoute("/stats/players")).toBe("stats-players");
    expect(resolveCoachRoute("/players")).toBe("stats-players");
    expect(resolveCoachRoute("/settings")).toBe("stats-settings");
    expect(resolveCoachRoute("/live")).toBe("live");
  });

  it("defaults the coach API base to the realtime API port for local development", () => {
    expect(apiBase).toBe("http://localhost:4000");
  });
});