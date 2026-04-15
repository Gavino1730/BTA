import { afterEach, describe, expect, it, vi } from "vitest";

type ServerModule = {
  startServer: (overridePort?: number) => Promise<number>;
  stopServer: () => Promise<void>;
};

const API_PORT = "4106";
const API_BASE = `http://localhost:${API_PORT}`;

function makeTestToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `test.${encoded}`;
}

async function startApplyCouponServer(env: {
  paywallEnabled?: "0" | "1";
  requireTenant?: "0" | "1";
  jwtWriteRequired?: "0" | "1";
}): Promise<ServerModule> {
  process.env.BTA_AUTH_TEST_MODE = "1";
  process.env.BTA_REQUIRE_TENANT = env.requireTenant ?? "0";
  process.env.BTA_JWT_WRITE_REQUIRED = env.jwtWriteRequired ?? "1";
  process.env.BTA_API_KEY = "apply-coupon-test-api-key";
  process.env.BTA_LOCAL_AUTH_SECRET = "apply-coupon-test-secret";
  process.env.BTA_PAYWALL_ENABLED = env.paywallEnabled ?? "1";
  process.env.BTA_STRIPE_TEST_MODE = "1";
  process.env.NODE_ENV = "test";
  process.env.PORT = API_PORT;

  vi.resetModules();
  const serverModule = await import("./server.js");
  await serverModule.startServer();
  return serverModule;
}

async function stopApplyCouponServer(server: ServerModule): Promise<void> {
  await server.stopServer();
  delete process.env.BTA_AUTH_TEST_MODE;
  delete process.env.BTA_REQUIRE_TENANT;
  delete process.env.BTA_JWT_WRITE_REQUIRED;
  delete process.env.BTA_API_KEY;
  delete process.env.BTA_LOCAL_AUTH_SECRET;
  delete process.env.BTA_PAYWALL_ENABLED;
  delete process.env.BTA_STRIPE_TEST_MODE;
  delete process.env.PORT;
}

describe("server billing apply-coupon integration", () => {
  let activeServer: ServerModule | null = null;

  afterEach(async () => {
    if (activeServer) {
      await stopApplyCouponServer(activeServer);
      activeServer = null;
    }
  });

  it("returns 400 when billing is disabled", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "0",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-disabled", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "SAVE10" }),
    });

    expect(response.status).toBe(400);
  });

  it("returns deprecation guidance for coupon application", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-valid", schoolId: "school-apply-coupon", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "school-apply-coupon",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "SAVE10" }),
    });

    expect(response.status).toBe(410);
    const payload = await response.json() as {
      code?: string;
      checkoutHandlesPromotionCodes?: boolean;
      error?: string;
    };

    expect(payload.code).toBe("stripe_checkout_promotion_codes_only");
    expect(payload.checkoutHandlesPromotionCodes).toBe(true);
    expect(payload.error).toContain("Stripe-hosted checkout page");
  });

  it("still enforces write-role authorization before returning deprecation guidance", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "0",
      jwtWriteRequired: "1",
    });

    const token = makeTestToken({ sub: "viewer-user", schoolId: "default", role: "viewer" });
    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "SAVE10" }),
    });

    expect(response.status).toBe(403);
  });
});
