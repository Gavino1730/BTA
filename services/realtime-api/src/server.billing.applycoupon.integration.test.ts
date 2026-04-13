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
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Billing is not enabled");
  });

  it("returns 400 when couponCode is missing from request body", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-no-code", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("couponCode is required");
  });

  it("returns 400 when couponCode is invalid", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-invalid-code", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "INVALID999" }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Coupon is not valid");
  });

  it("returns 403 when user has insufficient write role", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "0",
      jwtWriteRequired: "1",
    });

    // Create token with viewer role instead of coach
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
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBeDefined();
  });

  it("returns 400 when schoolId cannot be resolved with required tenant", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "1",
    });

    // No schoolId in token or headers when required tenant is enabled
    const token = makeTestToken({ sub: "coach-no-school", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "SAVE10" }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBeDefined();
  });

  it("returns 401 when missing authorization with JWT write required", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "0",
      jwtWriteRequired: "1",
    });

    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
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

  it("successfully applies valid coupon for coach with write role", async () => {
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

    expect(response.status).toBe(200);
    const payload = await response.json() as { applied?: boolean };
    expect(payload.applied).toBe(true);
  });

  it("normalizes coupon code to uppercase before applying", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-lowercase", schoolId: "school-lowercase-coupon", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "school-lowercase-coupon",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "save10" }), // lowercase input
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as { applied?: boolean };
    expect(payload.applied).toBe(true);
  });

  it("applies coupon when schoolId comes from header and JWT matches", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "0",
    });

    const schoolId = "school-header-match";
    const token = makeTestToken({ sub: "coach-header", schoolId, role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "SAVE10" }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as { applied?: boolean };
    expect(payload.applied).toBe(true);
  });

  it("rejects empty couponCode string", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-empty", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "" }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("couponCode is required");
  });

  it("rejects whitespace-only couponCode", async () => {
    activeServer = await startApplyCouponServer({
      paywallEnabled: "1",
      requireTenant: "0",
    });

    const token = makeTestToken({ sub: "coach-whitespace", schoolId: "default", role: "coach" });
    const response = await fetch(`${API_BASE}/api/billing/apply-coupon`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode: "   " }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("couponCode is required");
  });
});
