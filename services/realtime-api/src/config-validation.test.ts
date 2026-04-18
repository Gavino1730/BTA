import { describe, expect, it, vi } from "vitest";
import { assertRuntimeConfig, type RuntimeConfig, validateRuntimeConfig } from "./config-validation.js";

function baseConfig(): RuntimeConfig {
  return {
    nodeEnv: "development",
    requireTenant: true,
    jwtWriteRequired: true,
    jwtEnabled: true,
    apiKeyPresent: false,
    writeApiKeyPresent: false,
    allowedOriginsConfigured: true,
    databaseUrlConfigured: true,
    databaseUrlUsesPooler: true,
    strictPersistenceStartupConfigured: true,
    localAuthSecretConfigured: true,
    emailProvider: "",
    emailFromConfigured: false,
    resendApiKeyConfigured: false,
    supabaseUrlConfigured: true,
    supabasePublishableKeyConfigured: true,
    supabaseServiceRoleKeyConfigured: true,
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
      expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toContain("Tenant strict mode is disabled");
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
      apiKeyPresent: false,
      writeApiKeyPresent: false
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
      writeApiKeyPresent: false,
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
      writeApiKeyPresent: false,
      allowedOriginsConfigured: true,
      databaseUrlConfigured: false
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("DATABASE_URL"))).toBe(true);
  });

  it("rejects production when DATABASE_URL is not using the Supabase pooler", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      databaseUrlUsesPooler: false,
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("pooler"))).toBe(true);
  });

  it("rejects production when strict persistence startup is not explicitly enabled", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      strictPersistenceStartupConfigured: false,
    };

    const result = validateRuntimeConfig(config);
    expect(result.errors.some((error) => error.includes("BTA_PERSISTENCE_STARTUP_STRICT=1"))).toBe(true);
  });

  it("warns in production when local auth signing is not configured", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtWriteRequired: false,
      apiKeyPresent: true,
      writeApiKeyPresent: false,
      localAuthSecretConfigured: false
    };

    const result = validateRuntimeConfig(config);
    expect(result.warnings.some((warning) => warning.includes("BTA_LOCAL_AUTH_SECRET") || warning.includes("BTA_AUTH_SECRET"))).toBe(true);
  });

  it("warns when email provider is configured but sender is missing", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtWriteRequired: false,
      apiKeyPresent: true,
      writeApiKeyPresent: false,
      emailProvider: "resend",
      emailFromConfigured: false,
      resendApiKeyConfigured: true,
    };

    const result = validateRuntimeConfig(config);
    expect(result.warnings.some((warning) => warning.includes("BTA_EMAIL_FROM"))).toBe(true);
  });

  it("warns when resend provider is configured but api key is missing", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtWriteRequired: false,
      apiKeyPresent: true,
      writeApiKeyPresent: false,
      emailProvider: "resend",
      emailFromConfigured: true,
      resendApiKeyConfigured: false,
    };

    const result = validateRuntimeConfig(config);
    expect(result.warnings.some((warning) => warning.includes("RESEND_API_KEY"))).toBe(true);
  });

  it("warns when no write-capable auth path is configured", () => {
    const config: RuntimeConfig = {
      ...baseConfig(),
      nodeEnv: "production",
      jwtEnabled: false,
      apiKeyPresent: true,
      writeApiKeyPresent: false,
    };

    const result = validateRuntimeConfig(config);
    expect(result.warnings.some((warning) => warning.includes("BTA_WRITE_API_KEY"))).toBe(true);
  });
});
