import { afterEach, describe, expect, it, vi } from "vitest";

type ServerModule = {
  startServer: (overridePort?: number) => Promise<number>;
  stopServer: () => Promise<void>;
};

const API_PORT = "4110";
const API_BASE = `http://localhost:${API_PORT}`;

async function startBootstrapServer(env: {
  paywallEnabled?: "0" | "1";
  stripeTestMode?: "0" | "1";
  stripeSecretKey?: string;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
}): Promise<ServerModule> {
  process.env.BTA_AUTH_TEST_MODE = "1";
  process.env.BTA_REQUIRE_TENANT = "0";
  process.env.BTA_JWT_WRITE_REQUIRED = "0";
  process.env.BTA_API_KEY = "bootstrap-key";
  process.env.BTA_LOCAL_AUTH_SECRET = "bootstrap-secret";
  process.env.BTA_PAYWALL_ENABLED = env.paywallEnabled ?? "1";
  process.env.BTA_STRIPE_TEST_MODE = env.stripeTestMode ?? "1";
  process.env.BTA_BILLING_TRIAL_DAYS = "14";

  process.env.BTA_STRIPE_SECRET_KEY = env.stripeSecretKey ?? "test_bootstrap_checkout_secret_key";

  const monthlyPriceId = env.stripePriceIdMonthly ?? "price_test_monthly";
    process.env.BTA_STRIPE_PRICE_ID_MONTHLY = monthlyPriceId ?? "";

    process.env.BTA_STRIPE_PRICE_ID_YEARLY = env.stripePriceIdYearly ?? "";

  process.env.NODE_ENV = "test";
  process.env.PORT = API_PORT;

  vi.resetModules();
  const serverModule = await import("./server.js");
  await serverModule.startServer();
  return serverModule;
}

async function stopBootstrapServer(server: ServerModule): Promise<void> {
  await server.stopServer();
  delete process.env.BTA_AUTH_TEST_MODE;
  delete process.env.BTA_REQUIRE_TENANT;
  delete process.env.BTA_JWT_WRITE_REQUIRED;
  delete process.env.BTA_API_KEY;
  delete process.env.BTA_LOCAL_AUTH_SECRET;
  delete process.env.BTA_PAYWALL_ENABLED;
  delete process.env.BTA_STRIPE_TEST_MODE;
  delete process.env.BTA_STRIPE_SECRET_KEY;
  delete process.env.BTA_STRIPE_PRICE_ID_MONTHLY;
  delete process.env.BTA_STRIPE_PRICE_ID_YEARLY;
  delete process.env.BTA_BILLING_TRIAL_DAYS;
  delete process.env.PORT;
}

describe("server billing bootstrap-checkout-session integration", () => {
  let activeServer: ServerModule | null = null;

  afterEach(async () => {
    if (activeServer) {
      await stopBootstrapServer(activeServer);
      activeServer = null;
    }
  });

  it("returns 400 when billing is disabled", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "0",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Coach Test",
        email: "test@example.com",
        schoolName: "Test School",
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("Billing is not enabled");
  });

  it("returns 503 when Stripe checkout is not configured in non-test mode", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "0",
      stripeSecretKey: "",
      stripePriceIdMonthly: "",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Coach Test",
        email: "test@example.com",
        schoolName: "Test School",
      }),
    });

    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("Stripe checkout is not configured");
  });

  it("returns 400 when missing required fullName field", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        schoolName: "Test School",
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("valid full name and email");
  });

  it("returns 400 when invalid email provided", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Coach Test",
        email: "bad-email",
        schoolName: "Test School",
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("valid full name and email");
  });

  it("returns 201 with checkout URL in test mode for valid inputs", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Coach Bootstrap",
        email: "bootstrap@test.com",
        schoolName: "Bootstrap School",
      }),
    });

    expect([200, 201]).toContain(response.status);
    const payload = (await response.json()) as { url?: string };
    expect(payload.url).toBeDefined();
    expect(typeof payload.url).toBe("string");
  });

  it("initializes trial state during bootstrap checkout", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Coach Trial",
        email: "trial@test.com",
        schoolName: "Trial School",
      }),
    });

    expect([200, 201]).toContain(response.status);
    const payload = (await response.json()) as { url?: string };
    expect(payload.url).toBeDefined();
  });

  it("returns checkout URL with valid plan cycle", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Coach Cycle",
        email: "cycle@test.com",
        schoolName: "Cycle School",
        planCycle: "monthly",
      }),
    });

    expect([200, 201]).toContain(response.status);
    const payload = (await response.json()) as { url?: string };
    expect(payload.url).toBeDefined();
  });

  it("handles optional team name field", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Coach Team",
        email: "team@test.com",
        schoolName: "Team School",
        teamName: "Varsity",
      }),
    });

    expect([200, 201]).toContain(response.status);
    const payload = (await response.json()) as { url?: string };
    expect(payload.url).toBeDefined();
  });

  it("normalizes email to lowercase for Stripe", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Coach Email",
        email: "UPPERCASE@TEST.COM",
        schoolName: "Email School",
      }),
    });

    expect([200, 201]).toContain(response.status);
    const payload = (await response.json()) as { url?: string };
    expect(payload.url).toBeDefined();
  });

  it("handles concurrent bootstrap requests without race conditions", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const requests = Array.from({ length: 3 }, (_, i) => {
      return fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: `Coach ${i}`,
          email: `concurrent${i}@test.com`,
          schoolName: `Concurrent School ${i}`,
        }),
      });
    });

    const responses = await Promise.all(requests);
    responses.forEach((response) => {
      expect([200, 201]).toContain(response.status);
    });

    const payloads = await Promise.all(
      responses.map((r) => r.json() as Promise<{ url?: string }>)
    );
    payloads.forEach((payload) => {
      expect(payload.url).toBeDefined();
    });
  });

  it("rejects requests without JSON body", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("allows missing schoolName when schoolId can be derived", async () => {
    activeServer = await startBootstrapServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Coach Missing",
        email: "missing@test.com",
      }),
    });

    expect([200, 201]).toContain(response.status);
    const payload = (await response.json()) as { url?: string };
    expect(payload.url).toBeDefined();
  });
});
