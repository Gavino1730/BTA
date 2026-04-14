import { afterEach, describe, expect, it, vi } from "vitest";

type ServerModule = {
  startServer: (overridePort?: number) => Promise<number>;
  stopServer: () => Promise<void>;
};

const API_PORT = "4102";
const API_BASE = `http://localhost:${API_PORT}`;

async function startBillingServer(env: {
  paywallEnabled?: "0" | "1";
  stripeTestMode: "0" | "1";
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
}): Promise<ServerModule> {
  process.env.BTA_AUTH_TEST_MODE = "1";
  process.env.BTA_REQUIRE_TENANT = "1";
  process.env.BTA_JWT_WRITE_REQUIRED = "1";
  process.env.BTA_API_KEY = "billing-webhook-test-api-key";
  process.env.BTA_LOCAL_AUTH_SECRET = "billing-webhook-local-auth-secret";
  process.env.BTA_PAYWALL_ENABLED = env.paywallEnabled ?? "1";
  process.env.BTA_STRIPE_TEST_MODE = env.stripeTestMode;
  process.env.BTA_STRIPE_SECRET_KEY = env.stripeSecretKey ?? "stripe_test_secret_key";

  if (env.stripeWebhookSecret) {
    process.env.BTA_STRIPE_WEBHOOK_SECRET = env.stripeWebhookSecret;
  } else {
    delete process.env.BTA_STRIPE_WEBHOOK_SECRET;
  }

  process.env.BTA_STRIPE_PRICE_ID_MONTHLY = "price_monthly_test";
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
  delete process.env.PORT;
}

describe("server billing webhook integration", () => {
  let activeServer: ServerModule | null = null;

  afterEach(async () => {
    if (activeServer) {
      await stopBillingServer(activeServer);
      activeServer = null;
    }
  });

  it("returns 400 when Stripe signature is missing in non-test mode", async () => {
    activeServer = await startBillingServer({
      stripeTestMode: "0",
      stripeSecretKey: "stripe_test_secret_key",
      stripeWebhookSecret: "whsec_test_bta",
    });

    const response = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_missing_signature",
        type: "checkout.session.completed",
        data: { object: {} },
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Missing Stripe signature");
  });

  it("returns 503 when Stripe webhook config is missing in non-test mode", async () => {
    activeServer = await startBillingServer({
      stripeTestMode: "0",
      stripeSecretKey: "stripe_test_secret_key",
      stripeWebhookSecret: undefined,
    });

    const response = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_missing_config",
        type: "checkout.session.completed",
        data: { object: {} },
      }),
    });

    expect(response.status).toBe(503);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Stripe webhook is not configured");
  });

  it("returns 400 when Stripe signature is invalid in non-test mode", async () => {
    activeServer = await startBillingServer({
      stripeTestMode: "0",
      stripeSecretKey: "stripe_test_secret_key",
      stripeWebhookSecret: "whsec_test_bta",
    });

    const response = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=123456789,v1=invalid",
      },
      body: JSON.stringify({
        id: "evt_invalid_signature",
        type: "checkout.session.completed",
        data: { object: {} },
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: string };
    expect(payload.error?.toLowerCase()).toContain("signature");
  });

  it("returns 202 ignored when paywall is disabled", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "0",
      stripeTestMode: "0",
      stripeSecretKey: "stripe_test_secret_key",
      stripeWebhookSecret: "whsec_test_bta",
    });

    const response = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_paywall_disabled",
        type: "checkout.session.completed",
        data: { object: {} },
      }),
    });

    expect(response.status).toBe(202);
    const payload = await response.json() as { received?: boolean; ignored?: boolean; reason?: string };
    expect(payload.received).toBe(true);
    expect(payload.ignored).toBe(true);
    expect(payload.reason).toBe("paywall_disabled");
  });

  it("deduplicates replayed webhook event IDs and prevents second mutation", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const schoolId = "school-webhook-replay-idempotency";
    const firstCustomerId = "cus_replay_first";
    const firstSubscriptionId = "sub_replay_first";

    const firstResponse = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_replay_idempotent_1",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { schoolId },
            customer: firstCustomerId,
            subscription: firstSubscriptionId,
          },
        },
      }),
    });

    expect(firstResponse.status).toBe(200);
    const firstPayload = (await firstResponse.json()) as { received?: boolean; duplicate?: boolean };
    expect(firstPayload.received).toBe(true);
    expect(firstPayload.duplicate).toBeUndefined();

    const storeModule = await import("./store.js");
    const stateAfterFirst = storeModule.getBillingStateByScope({ schoolId });
    expect(stateAfterFirst?.status).toBe("active");
    expect(stateAfterFirst?.stripeCustomerId).toBe(firstCustomerId);
    expect(stateAfterFirst?.stripeSubscriptionId).toBe(firstSubscriptionId);

    const secondResponse = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_replay_idempotent_1",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { schoolId },
            customer: "cus_replay_second",
            subscription: "sub_replay_second",
          },
        },
      }),
    });

    expect(secondResponse.status).toBe(200);
    const secondPayload = (await secondResponse.json()) as { received?: boolean; duplicate?: boolean };
    expect(secondPayload.received).toBe(true);
    expect(secondPayload.duplicate).toBe(true);

    const stateAfterSecond = storeModule.getBillingStateByScope({ schoolId });
    expect(stateAfterSecond?.stripeCustomerId).toBe(firstCustomerId);
    expect(stateAfterSecond?.stripeSubscriptionId).toBe(firstSubscriptionId);
  });

  it("recovers billing status from past_due to active on invoice.payment_succeeded", async () => {
    activeServer = await startBillingServer({
      paywallEnabled: "1",
      stripeTestMode: "1",
    });

    const schoolId = "school-webhook-recovery";
    const customerId = "cus_recovery_1";
    const subscriptionId = "sub_recovery_1";

    const checkoutResponse = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_recovery_checkout_1",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { schoolId },
            customer: customerId,
            subscription: subscriptionId,
          },
        },
      }),
    });
    expect(checkoutResponse.status).toBe(200);

    const paymentFailedResponse = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_recovery_failed_1",
        type: "invoice.payment_failed",
        data: {
          object: {
            customer: customerId,
            subscription: subscriptionId,
          },
        },
      }),
    });
    expect(paymentFailedResponse.status).toBe(200);

    const storeModule = await import("./store.js");
    const stateAfterFailure = storeModule.getBillingStateByScope({ schoolId });
    expect(stateAfterFailure?.status).toBe("past_due");

    const paymentSucceededResponse = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_recovery_succeeded_1",
        type: "invoice.payment_succeeded",
        data: {
          object: {
            customer: customerId,
            subscription: subscriptionId,
          },
        },
      }),
    });
    expect(paymentSucceededResponse.status).toBe(200);

    const stateAfterRecovery = storeModule.getBillingStateByScope({ schoolId });
    expect(stateAfterRecovery?.status).toBe("active");
    expect(stateAfterRecovery?.stripeCustomerId).toBe(customerId);
    expect(stateAfterRecovery?.stripeSubscriptionId).toBe(subscriptionId);
  });
});
