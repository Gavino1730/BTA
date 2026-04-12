import { describe, expect, it } from "vitest";
import { apiBase, generateConnectionCode, normalizeConnectionCode, resolveDefaultApiBase, resolveDefaultAppBase, resolveDefaultSchoolId, resolveRuntimeBase } from "./platform.js";
import { canonicalizeCoachPath, resolveCoachRoute } from "./routes.js";

describe("coach route helpers", () => {
  it("canonicalizes legacy stats URLs into unified coach workspace routes", () => {
    expect(canonicalizeCoachPath("/games")).toBe("/stats/games");
    expect(canonicalizeCoachPath("/ai-insights")).toBe("/stats/insights");
    expect(canonicalizeCoachPath("/activity")).toBe("/notifications");
    expect(canonicalizeCoachPath("/onboarding")).toBe("/setup");
    expect(canonicalizeCoachPath("/dashboard")).toBe("/live");
  });

  it("resolves public, canonical, and aliased routes to the same coach views", () => {
    expect(resolveCoachRoute("/")).toBe("marketing");
    expect(resolveCoachRoute("/product")).toBe("product");
    expect(resolveCoachRoute("/how-it-works")).toBe("how-it-works");
    expect(resolveCoachRoute("/pricing")).toBe("pricing");
    expect(resolveCoachRoute("/compare")).toBe("compare");
    expect(resolveCoachRoute("/features")).toBe("features");
    expect(resolveCoachRoute("/about")).toBe("about");
    expect(resolveCoachRoute("/status")).toBe("status");
    expect(resolveCoachRoute("/testimonials")).toBe("testimonials");
    expect(resolveCoachRoute("/book-demo")).toBe("demo-booking");
    expect(resolveCoachRoute("/demo-booking")).toBe("demo-booking");
    expect(resolveCoachRoute("/onboarding-wizard")).toBe("onboarding-wizard");
    expect(resolveCoachRoute("/invite/accept")).toBe("invite-accept");
    expect(resolveCoachRoute("/verify-email")).toBe("email-verify");
    expect(resolveCoachRoute("/changelog")).toBe("changelog");
    expect(resolveCoachRoute("/unauthorized")).toBe("unauthorized");
    expect(resolveCoachRoute("/roadmap")).toBe("roadmap");
    expect(resolveCoachRoute("/docs")).toBe("docs");
    expect(resolveCoachRoute("/checkout/success")).toBe("checkout-success");
    expect(resolveCoachRoute("/checkout/cancel")).toBe("checkout-cancel");
    expect(resolveCoachRoute("/notifications")).toBe("stats-notifications");
    expect(resolveCoachRoute("/activity")).toBe("stats-notifications");
    expect(resolveCoachRoute("/signin")).toBe("login");
    expect(resolveCoachRoute("/stats/players")).toBe("stats-players");
    expect(resolveCoachRoute("/players")).toBe("stats-players");
    expect(resolveCoachRoute("/settings")).toBe("settings");
    expect(resolveCoachRoute("/admin")).toBe("admin");
    expect(resolveCoachRoute("/live")).toBe("live");
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

  it("upgrades misconfigured public http bases on secure pages to avoid mixed-content", () => {
    expect(resolveRuntimeBase("http://api.btaintel.com", "www.btaintel.com", "https:")).toBe("https://api.btaintel.com");
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