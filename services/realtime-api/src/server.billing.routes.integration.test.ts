import { afterEach, describe, expect, it, vi } from "vitest";

type ServerModule = {
  startServer: (overridePort?: number) => Promise<number>;
  stopServer: () => Promise<void>;
};

const API_PORT = "4103";
const API_BASE = `http://localhost:${API_PORT}`;

function makeTestToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `test.${encoded}`;
}

async function startBillingServer(env: {
  paywallEnabled?: "0" | "1";
  stripeTestMode?: "0" | "1";
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
}): Promise<ServerModule> {
  process.env.BTA_AUTH_TEST_MODE = "1";
  process.env.BTA_REQUIRE_TENANT = "1";
  process.env.BTA_JWT_WRITE_REQUIRED = "1";
  process.env.BTA_API_KEY = "billing-routes-test-api-key";
  process.env.BTA_LOCAL_AUTH_SECRET = "billing-routes-local-auth-secret";
  process.env.BTA_PAYWALL_ENABLED = env.paywallEnabled ?? "1";
  process.env.BTA_STRIPE_TEST_MODE = env.stripeTestMode ?? "1";

  process.env.BTA_STRIPE_SECRET_KEY = env.stripeSecretKey ?? "";

  process.env.BTA_STRIPE_WEBHOOK_SECRET = env.stripeWebhookSecret ?? "";

  process.env.BTA_STRIPE_PRICE_ID_MONTHLY = env.stripePriceIdMonthly ?? "";

  process.env.BTA_STRIPE_PRICE_ID_YEARLY = env.stripePriceIdYearly ?? "";

  process.env.NODE_ENV = "test";
  process.env.PORT = API_PORT;

  vi.resetModules();
  const serverModule = await import("./server.js");
  await serverModule.startServer();
  return serverModule;
}

async function stopBillingServer(server: ServerModule): Promise<void> {
  await server.stopServer();
  delete process.env.BTA_AUTH_TEST_MODE;
  delete process.env.BTA_REQUIRE_TENANT;
  delete process.env.BTA_JWT_WRITE_REQUIRED;
  delete process.env.BTA_API_KEY;
  delete process.env.BTA_LOCAL_AUTH_SECRET;
  delete process.env.BTA_PAYWALL_ENABLED;
  delete process.env.BTA_STRIPE_TEST_MODE;
  delete process.env.BTA_STRIPE_SECRET_KEY;
  delete process.env.BTA_STRIPE_WEBHOOK_SECRET;
  delete process.env.BTA_STRIPE_PRICE_ID_MONTHLY;
  delete process.env.BTA_STRIPE_PRICE_ID_YEARLY;
  delete process.env.PORT;
}

describe("server billing routes integration", () => {
  let activeServer: ServerModule | null = null;

  afterEach(async () => {
    if (activeServer) {
      await stopBillingServer(activeServer);
      activeServer = null;
    }
  });

  it("returns 400 for checkout when billing is disabled", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "0",
      stripeTestMode: "1",
      stripeSecretKey: "stripe_test_secret_key",
      stripeWebhookSecret: "whsec_test_bta",
      stripePriceIdMonthly: "price_monthly_test",
    });

    const token = makeTestToken({ sub: "coach-disabled", schoolId: "billing-disabled", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "billing-disabled",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "monthly" }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Billing is not enabled");
  });

  it("returns 503 for checkout when Stripe checkout config is missing", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: undefined,
      stripeWebhookSecret: "whsec_test_bta",
      stripePriceIdMonthly: undefined,
    });

    const token = makeTestToken({ sub: "coach-no-config", schoolId: "billing-no-config", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "billing-no-config",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "monthly" }),
    });

    expect(response.status).toBe(503);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Stripe checkout is not configured");
  });

  it("accepts yearly checkout when yearly price is configured", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "stripe_test_secret_key",
      stripeWebhookSecret: "whsec_test_bta",
      stripePriceIdMonthly: "price_monthly_test",
      stripePriceIdYearly: "price_yearly_test",
    });

    const token = makeTestToken({ sub: "coach-yearly-ok", schoolId: "billing-yearly-ok", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "billing-yearly-ok",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planCycle: "yearly" }),
    });

    expect([200, 201]).toContain(response.status);
    const payload = await response.json() as { url?: string };
    expect(payload.url).toBeDefined();
  });

  it("returns 400 for portal when no Stripe customer exists", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "stripe_test_secret_key",
      stripeWebhookSecret: "whsec_test_bta",
      stripePriceIdMonthly: "price_monthly_test",
    });

    const token = makeTestToken({ sub: "coach-no-customer", schoolId: "billing-no-customer", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "billing-no-customer",
      },
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("No Stripe customer found for this school");
  });

  it("returns 400 for bootstrap checkout when billing is disabled", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "0",
      stripeTestMode: "1",
      stripeSecretKey: "stripe_test_secret_key",
      stripeWebhookSecret: "whsec_test_bta",
      stripePriceIdMonthly: "price_monthly_test",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Bootstrap Coach",
        email: "bootstrap-disabled@school.org",
        schoolName: "Bootstrap High",
        teamName: "Bootstrap Varsity",
        planCycle: "monthly",
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Billing is not enabled");
  });

  it("returns 503 for bootstrap checkout when Stripe checkout config is missing", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: undefined,
      stripeWebhookSecret: "whsec_test_bta",
      stripePriceIdMonthly: undefined,
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Bootstrap Coach",
        email: "bootstrap-no-config@school.org",
        schoolName: "Bootstrap High",
        teamName: "Bootstrap Varsity",
        planCycle: "monthly",
      }),
    });

    expect(response.status).toBe(503);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Stripe checkout is not configured");
  });

  it("returns 400 for bootstrap checkout when full name or email is invalid", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "stripe_test_secret_key",
      stripeWebhookSecret: "whsec_test_bta",
      stripePriceIdMonthly: "price_monthly_test",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "",
        email: "not-an-email",
        schoolName: "Bootstrap High",
        teamName: "Bootstrap Varsity",
        planCycle: "monthly",
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("A valid full name and email are required");
  });

  it("accepts yearly bootstrap checkout when yearly price is configured", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
      stripeSecretKey: "stripe_test_secret_key",
      stripeWebhookSecret: "whsec_test_bta",
      stripePriceIdMonthly: "price_monthly_test",
      stripePriceIdYearly: "price_yearly_test",
    });

    const response = await fetch(`${API_BASE}/api/billing/bootstrap-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Bootstrap Yearly",
        email: "bootstrap-yearly-ok@school.org",
        schoolName: "Bootstrap High",
        teamName: "Bootstrap Varsity",
        planCycle: "yearly",
      }),
    });

    expect([200, 201]).toContain(response.status);
    const payload = await response.json() as { url?: string };
    expect(payload.url).toBeDefined();
  });
});
