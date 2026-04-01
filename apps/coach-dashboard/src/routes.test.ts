import { describe, expect, it } from "vitest";
import { apiBase, generateConnectionCode, resolveDefaultApiBase, resolveDefaultAppBase } from "./platform.js";
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
    expect(resolveDefaultApiBase("192.168.1.25", "http://192.168.1.25:5173")).toBe("http://192.168.1.25:4000");
    expect(resolveDefaultApiBase("scorekeeper", "http://scorekeeper:5173")).toBe("http://scorekeeper:4000");
  });

  it("keeps deployed dashboard links on the current secure origin when env vars are unset", () => {
    expect(resolveDefaultApiBase("bta-demo.up.railway.app", "https://bta-demo.up.railway.app")).toBe("https://bta-demo.up.railway.app");
    expect(resolveDefaultAppBase("bta-demo.up.railway.app", "https://bta-demo.up.railway.app", 5174)).toBe("https://bta-demo.up.railway.app");
  });

  it("generates a simple six-digit connection code", () => {
    expect(generateConnectionCode()).toMatch(/^\d{6}$/);
  });
});