import { describe, expect, it, vi } from "vitest";
import { assertRuntimeConfig, type RuntimeConfig, validateRuntimeConfig } from "./config-validation.js";

function baseConfig(): RuntimeConfig {
  return {
    nodeEnv: "development",
    requireTenant: true,
    jwtWriteRequired: true,
    jwtEnabled: true,
    apiKeyPresent: false,
    allowedOriginsConfigured: true,
    databaseUrlConfigured: true,
    localAuthSecretConfigured: true,
    paywallEnabled: false,
    stripeConfigured: false,
    stripeWebhookSecretConfigured: false
  };
}

describe("runtime config validation", () => {
  it("emits structured warning logs for non-strict tenant mode", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const config: RuntimeConfig = {
        ...baseConfig(),
        nodeEnv: "development",
        requireTenant: false,
      };

      expect(() => assertRuntimeConfig(config)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);

      const raw = String(warnSpy.mock.calls[0]?.[0] ?? "");
      const payload = JSON.parse(raw) as {
        level?: string;
        message?: string;
        context?: { warning?: string };
      };

      expect(payload.level).toBe("warn");
      expect(payload.message).toBe("runtime.config_warning");
      expect(payload.context?.warning).toContain("Tenant strict mode is disabled");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("rejects production when tenant strict mode is disabled", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      requireTenant: false,
      apiKeyPresent: true
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("BTA_REQUIRE_TENANT=1"))).toBe(true);
  });

  it("rejects production when write JWT is required but JWT is not configured", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtWriteRequired: true,
      jwtEnabled: false,
      apiKeyPresent: true
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("BTA_JWT_WRITE_REQUIRED=1"))).toBe(true);
  });

  it("rejects production when no authentication path is configured", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtWriteRequired: false,
      jwtEnabled: false,
      apiKeyPresent: false
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("requires authentication"))).toBe(true);
  });

  it("rejects production when explicit CORS origins are missing", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtWriteRequired: false,
      apiKeyPresent: true,
      allowedOriginsConfigured: false,
      databaseUrlConfigured: true
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("ALLOWED_ORIGINS"))).toBe(true);
  });

  it("rejects production when DATABASE_URL is missing", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtWriteRequired: false,
      apiKeyPresent: true,
      allowedOriginsConfigured: true,
      databaseUrlConfigured: false
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("DATABASE_URL"))).toBe(true);
  });

  it("rejects production when local auth signing is not configured", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtWriteRequired: false,
      apiKeyPresent: true,
      localAuthSecretConfigured: false
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("BTA_LOCAL_AUTH_SECRET") || error.includes("BTA_AUTH_SECRET"))).toBe(true);
  });

  it("rejects production when paywall is enabled but Stripe checkout settings are missing", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtWriteRequired: false,
      apiKeyPresent: true,
      paywallEnabled: true,
      stripeConfigured: false,
      stripeWebhookSecretConfigured: true,
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("BTA_STRIPE_SECRET_KEY"))).toBe(true);
  });

  it("rejects production when paywall is enabled but Stripe webhook secret is missing", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtWriteRequired: false,
      apiKeyPresent: true,
      paywallEnabled: true,
      stripeConfigured: true,
      stripeWebhookSecretConfigured: false,
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("BTA_STRIPE_WEBHOOK_SECRET"))).toBe(true);
  });
});
