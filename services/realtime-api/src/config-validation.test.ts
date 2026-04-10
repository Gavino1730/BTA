import { describe, expect, it } from "vitest";
import { type RuntimeConfig, validateRuntimeConfig } from "./config-validation.js";

function baseConfig(): RuntimeConfig {
  return {
    nodeEnv: "development",
    requireTenant: true,
    jwtWriteRequired: true,
    jwtEnabled: true,
    apiKeyPresent: false,
    allowedOriginsConfigured: true,
    databaseUrlConfigured: true,
    localAuthSecretConfigured: true
  };
}

describe("runtime config validation", () => {
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
});
