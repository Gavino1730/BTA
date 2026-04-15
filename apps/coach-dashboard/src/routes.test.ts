import { describe, expect, it } from "vitest";
import { apiBase, generateConnectionCode, marketingBase, normalizeConnectionCode, resolveDefaultApiBase, resolveDefaultAppBase, resolveDefaultMarketingBase, resolveDefaultSchoolId, resolveRuntimeBase } from "./platform.js";
import { canonicalizeCoachPath, resolveCoachRoute } from "./routes.js";

describe("coach route helpers", () => {
  it("normalizes trailing slashes and upgrades supported legacy aliases", () => {
    expect(canonicalizeCoachPath("/stats/players/")).toBe("/stats/players");
    expect(canonicalizeCoachPath("/players")).toBe("/stats/players");
    expect(canonicalizeCoachPath("/")).toBe("/");
  });

  it("resolves the active canonical route set for the current dashboard app", () => {
    expect(resolveCoachRoute("/")).toBe("marketing");
    expect(resolveCoachRoute("/login")).toBe("login");
    expect(resolveCoachRoute("/forgot-password")).toBe("forgot-password");
    expect(resolveCoachRoute("/reset-password")).toBe("reset-password");
    expect(resolveCoachRoute("/billing")).toBe("billing");
    expect(resolveCoachRoute("/setup")).toBe("setup");
    expect(resolveCoachRoute("/stats")).toBe("stats-overview");
    expect(resolveCoachRoute("/stats/players")).toBe("stats-players");
    expect(resolveCoachRoute("/settings")).toBe("stats-settings");
    expect(resolveCoachRoute("/demo")).toBe("demo");
    expect(resolveCoachRoute("/live")).toBe("live");
    expect(resolveCoachRoute("/players")).toBe("stats-players");
    expect(resolveCoachRoute("/activity")).toBe("live");
  });

  it("defaults the coach API base to the realtime API port for local development", () => {
    expect(apiBase.length).toBeGreaterThan(0);
    expect(resolveDefaultApiBase("192.168.1.25", "http://192.168.1.25:5173")).toBe("http://192.168.1.25:4000");
    expect(resolveDefaultApiBase("scorekeeper", "http://scorekeeper:5173")).toBe("http://scorekeeper:4000");
  });

  it("keeps deployed dashboard links on the current secure origin when env vars are unset", () => {
    expect(resolveDefaultApiBase("bta-demo.up.railway.app", "https://bta-demo.up.railway.app")).toBe("https://bta-demo.up.railway.app");
    expect(resolveDefaultAppBase("bta-demo.up.railway.app", "https://bta-demo.up.railway.app", 5174)).toBe("https://bta-demo.up.railway.app");
  });

  it("keeps public auth navigation pointed at the marketing site", () => {
    expect(marketingBase.length).toBeGreaterThan(0);
    expect(resolveDefaultMarketingBase("localhost")).toBe("http://localhost:3000");
    expect(resolveDefaultMarketingBase("192.168.1.25")).toBe("http://localhost:3000");
    expect(resolveDefaultMarketingBase("dashboard.btaintel.com")).toBe("https://btaintel.com");
  });

  it("upgrades misconfigured public http bases on secure pages to avoid mixed-content", () => {
    expect(resolveRuntimeBase("http://api.btaintel.com", "www.btaintel.com", "https:")).toBe("https://api.btaintel.com");
  });

  it("corrects known typoed api hostnames", () => {
    expect(resolveRuntimeBase("https://api.btainte1.com", "dashboard.btaintel.com", "https:")).toBe("https://api.btaintel.com");
  });

  it("keeps local-network http bases unchanged", () => {
    expect(resolveRuntimeBase("http://192.168.1.50:4000", "192.168.1.50", "https:")).toBe("http://192.168.1.50:4000");
  });

  it("avoids pinning public deployments to the shared default school", () => {
    expect(resolveDefaultSchoolId("localhost")).toBe("");
    expect(resolveDefaultSchoolId("192.168.1.25")).toBe("");
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
