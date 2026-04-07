export interface RuntimeConfig {
  nodeEnv: string;
  requireTenant: boolean;
  jwtWriteRequired: boolean;
  jwtEnabled: boolean;
  apiKeyPresent: boolean;
  allowedOriginsConfigured: boolean;
  databaseUrlConfigured: boolean;
  localAuthSecretConfigured: boolean;
}

export interface RuntimeValidationResult {
  errors: string[];
  warnings: string[];
}

export function readRuntimeConfig(jwtEnabled: boolean): RuntimeConfig {
  const nodeEnv = (process.env.NODE_ENV ?? "development").trim().toLowerCase();
  return {
    nodeEnv,
    requireTenant: process.env.BTA_REQUIRE_TENANT !== "0",
    jwtWriteRequired: process.env.BTA_JWT_WRITE_REQUIRED !== "0",
    jwtEnabled,
    apiKeyPresent: Boolean(process.env.BTA_API_KEY?.trim()),
    allowedOriginsConfigured: Boolean(process.env.ALLOWED_ORIGINS?.trim()),
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    localAuthSecretConfigured: Boolean(
      process.env.BTA_LOCAL_AUTH_SECRET?.trim() || process.env.BTA_AUTH_SECRET?.trim()
    ),
  };
}

export function validateRuntimeConfig(config: RuntimeConfig): RuntimeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.requireTenant) {
    warnings.push("Tenant strict mode is disabled (set BTA_REQUIRE_TENANT=1 to enforce explicit tenant scope).");
  }

  if (config.nodeEnv !== "production") {
    return { errors, warnings };
  }

  if (!config.requireTenant) {
    errors.push("Production requires strict tenant scoping. Set BTA_REQUIRE_TENANT=1.");
  }

  if (config.jwtWriteRequired && !config.jwtEnabled) {
    errors.push("BTA_JWT_WRITE_REQUIRED=1 requires JWT auth to be configured (issuer/audience/jwks).");
  }

  if (!config.jwtEnabled && !config.apiKeyPresent) {
    errors.push("Production requires authentication. Configure JWT or set BTA_API_KEY.");
  }

  if (!config.allowedOriginsConfigured) {
    errors.push("Production requires explicit CORS origins. Set ALLOWED_ORIGINS.");
  }

  if (!config.databaseUrlConfigured) {
    errors.push("Production requires DATABASE_URL so persistence does not fall back to local file storage.");
  }

  if (!config.localAuthSecretConfigured) {
    warnings.push(
      "BTA_LOCAL_AUTH_SECRET is not set; built-in email/password auth cannot issue signed local tokens. " +
      "Set a dedicated BTA_LOCAL_AUTH_SECRET to enable local auth safely in production."
    );
  }

  return { errors, warnings };
}

export function formatValidationReport(result: RuntimeValidationResult): string {
  const lines: string[] = [];
  for (const error of result.errors) {
    lines.push(`[ERROR] ${error}`);
  }
  for (const warning of result.warnings) {
    lines.push(`[WARN] ${warning}`);
  }
  return lines.join("\n");
}

export function assertRuntimeConfig(config: RuntimeConfig): void {
  const result = validateRuntimeConfig(config);
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.warn(`[realtime-api] ${warning}`);
    }
  }
  if (result.errors.length > 0) {
    throw new Error(formatValidationReport(result));
  }
}
