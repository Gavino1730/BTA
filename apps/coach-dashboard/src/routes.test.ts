import { describe, expect, it } from "vitest";
import { apiBase, generateConnectionCode, normalizeConnectionCode, resolveDefaultApiBase, resolveDefaultAppBase, resolveDefaultSchoolId } from "./platform.js";
import { canonicalizeCoachPath, resolveCoachRoute } from "./routes.js";

describe("coach route helpers", () => {
  it("canonicalizes legacy stats URLs into unified coach workspace routes", () => {
    expect(canonicalizeCoachPath("/games")).toBe("/stats/games");
    expect(canonicalizeCoachPath("/ai-insights")).toBe("/stats/insights");
    expect(canonicalizeCoachPath("/onboarding")).toBe("/setup");
    expect(canonicalizeCoachPath("/dashboard")).toBe("/live");
  });

  it("resolves public, canonical, and aliased routes to the same coach views", () => {
    expect(resolveCoachRoute("/")).toBe("marketing");
    expect(resolveCoachRoute("/signin")).toBe("login");
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

  it("avoids pinning public deployments to the shared default school", () => {
    expect(resolveDefaultSchoolId("localhost")).toBe("default");
    expect(resolveDefaultSchoolId("192.168.1.25")).toBe("default");
    expect(resolveDefaultSchoolId("bta-demo.up.railway.app")).toBe("");
  });

  it("generates a simple six-digit connection code", () => {
    expect(generateConnectionCode()).toMatch(/^\d{6}$/);
  });

  it("keeps only six-digit pairing codes and drops legacy random ids", () => {
    expect(normalizeConnectionCode(" 482 913 ")).toBe("482913");
    expect(normalizeConnectionCode("conn-mnf7rz6u-u1")).toBe("");
  });
});