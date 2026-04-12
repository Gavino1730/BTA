import { describe, expect, it } from "vitest";
import { apiBase, generateConnectionCode, marketingBase, normalizeConnectionCode, resolveDefaultApiBase, resolveDefaultAppBase, resolveDefaultMarketingBase, resolveDefaultSchoolId, resolveRuntimeBase } from "./platform.js";
import { canonicalizeCoachPath, resolveCoachRoute } from "./routes.js";

describe("coach route helpers", () => {
  it("normalizes trailing slashes without preserving legacy aliases", () => {
    expect(canonicalizeCoachPath("/stats/players/")).toBe("/stats/players");
    expect(canonicalizeCoachPath("/players")).toBe("/players");
    expect(canonicalizeCoachPath("/")).toBe("/");
  });

  it("resolves canonical routes and rejects removed legacy aliases", () => {
    expect(resolveCoachRoute("/")).toBe("login");
    expect(resolveCoachRoute("/invite/accept")).toBe("invite-accept");
    expect(resolveCoachRoute("/verify-email")).toBe("email-verify");
    expect(resolveCoachRoute("/unauthorized")).toBe("unauthorized");
    expect(resolveCoachRoute("/checkout/success")).toBe("checkout-success");
    expect(resolveCoachRoute("/checkout/cancel")).toBe("checkout-cancel");
    expect(resolveCoachRoute("/notifications")).toBe("stats-notifications");
    expect(resolveCoachRoute("/stats/players")).toBe("stats-players");
    expect(resolveCoachRoute("/settings")).toBe("stats-settings");
    expect(resolveCoachRoute("/admin")).toBe("admin");
    expect(resolveCoachRoute("/live")).toBe("live");
    expect(resolveCoachRoute("/support")).toBe("support");
    expect(resolveCoachRoute("/contact")).toBe("contact");
    expect(resolveCoachRoute("/book-demo")).toBe("book-demo");
    expect(resolveCoachRoute("/data-deletion")).toBe("data-deletion");
    expect(resolveCoachRoute("/product")).toBe("not-found");
    expect(resolveCoachRoute("/pricing")).toBe("not-found");
    expect(resolveCoachRoute("/players")).toBe("not-found");
    expect(resolveCoachRoute("/activity")).toBe("not-found");
    expect(resolveCoachRoute("/signin")).toBe("not-found");
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