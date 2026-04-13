import { afterEach, describe, expect, it, vi } from "vitest";

type ServerModule = {
  startServer: (overridePort?: number) => Promise<number>;
  stopServer: () => Promise<void>;
};

const API_PORT = "4105";
const API_BASE = `http://localhost:${API_PORT}`;

function makeTestToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `test.${encoded}`;
}

async function startCouponServer(env: {
  paywallEnabled?: "0" | "1";
  stripeTestMode?: "0" | "1";
  stripePriceIdMonthly?: string;
}): Promise<ServerModule> {
  process.env.BTA_AUTH_TEST_MODE = "1";
  process.env.BTA_REQUIRE_TENANT = "0"; // Allow default schoolId
  process.env.BTA_JWT_WRITE_REQUIRED = "0";
  process.env.BTA_API_KEY = "coupon-test-api-key";
  process.env.BTA_LOCAL_AUTH_SECRET = "coupon-test-secret";
  process.env.BTA_PAYWALL_ENABLED = env.paywallEnabled ?? "1";
  process.env.BTA_STRIPE_TEST_MODE = env.stripeTestMode ?? "1";

  if (env.stripePriceIdMonthly) {
    process.env.BTA_STRIPE_PRICE_ID_MONTHLY = env.stripePriceIdMonthly;
  } else {
    delete process.env.BTA_STRIPE_PRICE_ID_MONTHLY;
  }

  process.env.NODE_ENV = "test";
  process.env.PORT = API_PORT;

  vi.resetModules();
  const serverModule = await import("./server.js");
  await serverModule.startServer();
  return serverModule;
}

async function stopCouponServer(server: ServerModule): Promise<void> {
  await server.stopServer();
  delete process.env.BTA_AUTH_TEST_MODE;
  delete process.env.BTA_REQUIRE_TENANT;
  delete process.env.BTA_JWT_WRITE_REQUIRED;
  delete process.env.BTA_API_KEY;
  delete process.env.BTA_LOCAL_AUTH_SECRET;
  delete process.env.BTA_PAYWALL_ENABLED;
  delete process.env.BTA_STRIPE_TEST_MODE;
  delete process.env.BTA_STRIPE_PRICE_ID_MONTHLY;
  delete process.env.PORT;
}

describe("server billing coupon validation integration", () => {
  let activeServer: ServerModule | null = null;

  afterEach(async () => {
    if (activeServer) {
      await stopCouponServer(activeServer);
      activeServer = null;
    }
  });

  it("returns 400 when billing is disabled", async () => {
    activeServer = await startCouponServer({
      paywallEnabled: "0",
      stripeTestMode: "1",
    });

    const token = makeTestToken({ sub: "coach-disabled", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/validate-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "SAVE10" }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { valid?: boolean; error?: string };
    expect(payload.valid).toBe(false);
    expect(payload.error).toBe("Billing is not enabled");
  });

  it("returns 400 when couponCode is missing from request body", async () => {
    activeServer = await startCouponServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const token = makeTestToken({ sub: "coach-no-code", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/validate-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { valid?: boolean; error?: string };
    expect(payload.valid).toBe(false);
    expect(payload.error).toBe("couponCode is required");
  });

  it("returns 400 when couponCode is empty string", async () => {
    activeServer = await startCouponServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const token = makeTestToken({ sub: "coach-empty-code", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/validate-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "" }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { valid?: boolean; error?: string };
    expect(payload.valid).toBe(false);
    expect(payload.error).toBe("couponCode is required");
  });

  it("returns 200 with valid=false when coupon code is invalid in test mode", async () => {
    activeServer = await startCouponServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const token = makeTestToken({ sub: "coach-invalid-code", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/validate-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "INVALID123" }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as { valid?: boolean; error?: string };
    expect(payload.valid).toBe(false);
    expect(payload.error).toBe("Coupon is not valid");
  });

  it("returns 200 with valid=true for valid test coupon SAVE10", async () => {
    activeServer = await startCouponServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const token = makeTestToken({ sub: "coach-valid-code", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/validate-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "SAVE10" }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      valid?: boolean;
      couponId?: string;
      percentOff?: number;
    };
    expect(payload.valid).toBe(true);
    expect(payload.couponId).toBe("coupon_test_save10");
    expect(payload.percentOff).toBe(10);
  });

  it("returns 200 with valid=false when coupon code is invalid (case-insensitive test)", async () => {
    activeServer = await startCouponServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const token = makeTestToken({ sub: "coach-case-test", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/validate-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "save10modified" }), // Not exactly SAVE10
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as { valid?: boolean };
    expect(payload.valid).toBe(false);
  });

  it("returns 401 when API authentication is missing", async () => {
    activeServer = await startCouponServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/validate-coupon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "SAVE10" }),
    });

    expect(response.status).toBe(401);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBeDefined();
  });

  it("normalizes coupon code to uppercase for validation", async () => {
    activeServer = await startCouponServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const token = makeTestToken({ sub: "coach-lowercase", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/validate-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "save10" }), // lowercase input
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as { valid?: boolean; percentOff?: number };
    expect(payload.valid).toBe(true);
    expect(payload.percentOff).toBe(10);
  });
});
