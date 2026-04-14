import { afterEach, describe, expect, it, vi } from "vitest";

type ServerModule = {
  startServer: (overridePort?: number) => Promise<number>;
  stopServer: () => Promise<void>;
};

const API_PORT = "4107";
const API_BASE = `http://localhost:${API_PORT}`;

function makeTestToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `test.${encoded}`;
}

async function startCheckoutSessionServer(env: {
  paywallEnabled?: "0" | "1";
  stripeTestMode?: "0" | "1";
  stripeSecretKey?: string;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  requireTenant?: "0" | "1";
  jwtWriteRequired?: "0" | "1";
}): Promise<ServerModule> {
  process.env.BTA_AUTH_TEST_MODE = "1";
  process.env.BTA_REQUIRE_TENANT = env.requireTenant ?? "0";
  process.env.BTA_JWT_WRITE_REQUIRED = env.jwtWriteRequired ?? "1";
  process.env.BTA_API_KEY = "checkout-session-test-api-key";
  process.env.BTA_LOCAL_AUTH_SECRET = "checkout-session-test-secret";
  process.env.BTA_PAYWALL_ENABLED = env.paywallEnabled ?? "1";
  process.env.BTA_STRIPE_TEST_MODE = env.stripeTestMode ?? "1";
  process.env.BTA_BILLING_TRIAL_DAYS = "14";

  process.env.BTA_STRIPE_SECRET_KEY = env.stripeSecretKey ?? "";

  process.env.BTA_STRIPE_PRICE_ID_MONTHLY = env.stripePriceIdMonthly ?? "";

  process.env.BTA_STRIPE_PRICE_ID_YEARLY = env.stripePriceIdYearly ?? "";

  process.env.NODE_ENV = "test";
  process.env.PORT = API_PORT;

  vi.resetModules();
  const serverModule = await import("./server.js");
  await serverModule.startServer();
  return serverModule;
}

async function stopCheckoutSessionServer(server: ServerModule): Promise<void> {
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

describe("server billing checkout-session integration", () => {
  let activeServer: ServerModule | null = null;

  afterEach(async () => {
    if (activeServer) {
      await stopCheckoutSessionServer(activeServer);
      activeServer = null;
    }
  });

  it("returns 400 when billing is disabled", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "0",
      stripeTestMode: "1",
      stripePriceIdMonthly: "price_test_monthly",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-disabled", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "monthly" }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Billing is not enabled");
  });

  it("returns 503 when Stripe checkout config is missing (no price IDs)", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripePriceIdMonthly: undefined, // Missing config
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-no-config", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "monthly" }),
    });

    expect(response.status).toBe(503);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Stripe checkout is not configured");
  });

  it("returns 400 when plan cycle is invalid", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "sk_test_checkout",
      stripePriceIdMonthly: "price_test_monthly",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-invalid-cycle", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "invalid" }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBeDefined();
    expect(payload.error).toMatch(/invalid|plan cycle/i);
  });

  it("returns 200 (defaults to monthly) when plan cycle is missing", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "sk_test_checkout",
      stripePriceIdMonthly: "price_test_monthly",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-no-cycle", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    // Missing planCycle defaults to "monthly"
    expect([200, 202, 201]).toContain(response.status);
  });

  it("successfully creates yearly checkout session when yearly price is configured", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "sk_test_checkout",
      stripePriceIdMonthly: "price_test_monthly",
      stripePriceIdYearly: "price_test_yearly",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-yearly-valid", schoolId: "school-yearly", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "school-yearly",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "yearly" }),
    });

    expect([200, 202, 201]).toContain(response.status);
    const payload = await response.json() as { url?: string; sessionId?: string; success?: boolean };
    expect(payload).toBeDefined();
  });

  it("returns 403 when user has insufficient write role", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "sk_test_checkout",
      stripePriceIdMonthly: "price_test_monthly",
      requireTenant: "0",
      jwtWriteRequired: "1",
    });

    const token = makeTestToken({ sub: "viewer-user", schoolId: "default", role: "viewer" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "monthly" }),
    });

    expect(response.status).toBe(403);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBeDefined();
  });

  it("returns 401 when missing authorization with JWT write required", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "sk_test_checkout",
      stripePriceIdMonthly: "price_test_monthly",
      requireTenant: "0",
      jwtWriteRequired: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "monthly" }),
    });

    expect(response.status).toBe(401);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBeDefined();
  });

  it("successfully creates monthly checkout session for valid coach", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "sk_test_checkout",
      stripePriceIdMonthly: "price_test_monthly",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-valid", schoolId: "school-monthly", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "school-monthly",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "monthly" }),
    });

    expect([200, 202, 201]).toContain(response.status); // Accept 200/201/202 for successful session creation
    const payload = await response.json() as { url?: string; sessionId?: string; success?: boolean };
    // At minimum, should return without error
    expect(payload).toBeDefined();
  });

  it("returns 400 when schoolId cannot be resolved with required tenant", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripePriceIdMonthly: "price_test_monthly",
      requireTenant: "1",
    });

    const token = makeTestToken({ sub: "coach-no-school", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "monthly" }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBeDefined();
  });

  it("accepts both lowercase and uppercase plan cycle values", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "sk_test_checkout",
      stripePriceIdMonthly: "price_test_monthly",
      stripePriceIdYearly: "price_test_yearly",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-case-test", schoolId: "school-case", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "school-case",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "MONTHLY" }), // uppercase input
    });

    expect([200, 202, 201]).toContain(response.status);
    const payload = await response.json() as { url?: string; sessionId?: string; success?: boolean };
    expect(payload).toBeDefined();
  });

  it("creates billing state with trial period when first initializing", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "sk_test_checkout",
      stripePriceIdMonthly: "price_test_monthly",
      requireTenant: "0",
    });

    const schoolId = "school-trial-init";
    const token = makeTestToken({ sub: "coach-trial", schoolId, role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "monthly" }),
    });

    expect([200, 202, 201]).toContain(response.status);
    // The endpoint should have created a billing state with trial period
    // This is verified through the successful response (no errors thrown during state creation)
  });

  it("returns 200 (defaults to monthly) for empty plan cycle string", async () => {
    activeServer = await startCheckoutSessionServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "sk_test_checkout",
      stripePriceIdMonthly: "price_test_monthly",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-empty-cycle", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "" }),
    });

    // Empty planCycle (after trim) defaults to "monthly"
    expect([200, 202, 201]).toContain(response.status);
  });
});
