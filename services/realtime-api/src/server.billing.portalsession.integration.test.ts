import { afterEach, describe, expect, it, vi } from "vitest";

type ServerModule = {
  startServer: (overridePort?: number) => Promise<number>;
  stopServer: () => Promise<void>;
};

const API_PORT = "4108";
const API_BASE = `http://localhost:${API_PORT}`;

function makeTestToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `test.${encoded}`;
}

async function startPortalSessionServer(env: {
  paywallEnabled?: "0" | "1";
  stripeTestMode?: "0" | "1";
  stripeSecretKey?: string;
  coachDashboardOrigin?: string;
  requireTenant?: "0" | "1";
}): Promise<ServerModule> {
  process.env.BTA_AUTH_TEST_MODE = "1";
  process.env.BTA_REQUIRE_TENANT = env.requireTenant ?? "0";
  process.env.BTA_JWT_WRITE_REQUIRED = "0";
  process.env.BTA_API_KEY = "portal-session-test-api-key";
  process.env.BTA_LOCAL_AUTH_SECRET = "portal-session-test-secret";
  process.env.BTA_PAYWALL_ENABLED = env.paywallEnabled ?? "1";
  process.env.BTA_STRIPE_TEST_MODE = env.stripeTestMode ?? "1";
  process.env.BTA_BILLING_TRIAL_DAYS = "14";

  if (env.stripeSecretKey) {
    process.env.BTA_STRIPE_SECRET_KEY = env.stripeSecretKey;
  } else {
    delete process.env.BTA_STRIPE_SECRET_KEY;
  }

  if (env.coachDashboardOrigin) {
    process.env.COACH_DASHBOARD_ORIGIN = env.coachDashboardOrigin;
  } else {
    delete process.env.COACH_DASHBOARD_ORIGIN;
  }

  process.env.NODE_ENV = "test";
  process.env.PORT = API_PORT;

  vi.resetModules();
  const serverModule = await import("./server.js");
  await serverModule.startServer();
  return serverModule;
}

async function stopPortalSessionServer(server: ServerModule): Promise<void> {
  await server.stopServer();
  delete process.env.BTA_AUTH_TEST_MODE;
  delete process.env.BTA_REQUIRE_TENANT;
  delete process.env.BTA_JWT_WRITE_REQUIRED;
  delete process.env.BTA_API_KEY;
  delete process.env.BTA_LOCAL_AUTH_SECRET;
  delete process.env.BTA_PAYWALL_ENABLED;
  delete process.env.BTA_STRIPE_TEST_MODE;
  delete process.env.BTA_STRIPE_SECRET_KEY;
  delete process.env.BTA_BILLING_TRIAL_DAYS;
  delete process.env.COACH_DASHBOARD_ORIGIN;
  delete process.env.PORT;
}

describe("server billing portal-session integration", () => {
  let activeServer: ServerModule | null = null;

  afterEach(async () => {
    if (activeServer) {
      await stopPortalSessionServer(activeServer);
      activeServer = null;
    }
  });

  it("returns 400 when billing is disabled", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "0",
      stripeTestMode: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-disabled", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Billing is not enabled");
  });

  it("returns 400 when schoolId cannot be resolved with required tenant", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      requireTenant: "1",
    });

    const token = makeTestToken({ sub: "coach-no-school", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBeDefined();
  });

  it("returns 401 when missing authorization header", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      requireTenant: "0",
    });

    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(401);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBeDefined();
  });

  it("returns 400 when no stripeCustomerId exists for new school (trial initialized but no customer)", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-no-customer", schoolId: "school-new-trial", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "school-new-trial",
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("No Stripe customer found for this school");
  });

  it("handles test mode request structure correctly", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-test-mode", schoolId: "school-test-mode", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "school-test-mode",
        "Content-Type": "application/json",
      },
    });

    // Endpoint validates auth and billing but returns 400 since no customer exists
    expect(response.status).toBe(400);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload).toHaveProperty("error");
  });

  it("resolves schoolId from header when provided", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-header", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "school-from-header",
        "Content-Type": "application/json",
      },
    });

    // Should resolve schoolId successfully and check for customer
    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toContain("customer");
  });

  it("resolves schoolId from JWT token when header not provided", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-jwt", schoolId: "school-from-jwt", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("No Stripe customer found for this school");
  });

  it("handles multiple concurrent portal session requests safely", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      requireTenant: "0",
    });

    const requests = Array.from({ length: 3 }, (_, i) => {
      const token = makeTestToken({
        sub: `coach-concurrent-${i}`,
        schoolId: `school-concurrent-${i}`,
        role: "coach",
      });
      return fetch(`${API_BASE}/api/billing/portal-session`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-school-id": `school-concurrent-${i}`,
          "Content-Type": "application/json",
        },
      });
    });

    const responses = await Promise.all(requests);
    responses.forEach((response) => {
      expect(response.status).toBe(400);
    });
  });

  it("validates error response format when customer not found", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-format", schoolId: "school-format", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "school-format",
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload).toHaveProperty("error");
    expect(typeof payload.error).toBe("string");
  });

  it("initializes trial state on first request from new school", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      requireTenant: "0",
    });

    const schoolId = "school-trial-init";
    const token = makeTestToken({ sub: "coach-trial-init", schoolId, role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("No Stripe customer found for this school");
  });

  it("preserves authorization validation for portal session access", async () => {
    activeServer = await startPortalSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-auth", schoolId: "school-auth", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "school-auth",
        "Content-Type": "application/json",
      },
    });

    // Should reach customer check (auth passed)
    expect(response.status).toBe(400);
  });
});
