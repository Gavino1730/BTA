import { logger } from "./logger.js";

export interface RuntimeConfig {
  nodeEnv: string;
  requireTenant: boolean;
  jwtWriteRequired: boolean;
  jwtEnabled: boolean;
  apiKeyPresent: boolean;
  allowedOriginsConfigured: boolean;
  databaseUrlConfigured: boolean;
  localAuthSecretConfigured: boolean;
  paywallEnabled: boolean;
  stripeConfigured: boolean;
  stripeWebhookSecretConfigured: boolean;
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
    paywallEnabled: process.env.BTA_PAYWALL_ENABLED === "1",
    stripeConfigured: Boolean(
      process.env.BTA_STRIPE_SECRET_KEY?.trim()
      && process.env.BTA_STRIPE_PRICE_ID_MONTHLY?.trim()
      && process.env.BTA_STRIPE_PRICE_ID_YEARLY?.trim()
    ),
    stripeWebhookSecretConfigured: Boolean(process.env.BTA_STRIPE_WEBHOOK_SECRET?.trim()),
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
    errors.push(
      "Production requires a dedicated local auth signing secret. " +
      "Set BTA_LOCAL_AUTH_SECRET (or legacy BTA_AUTH_SECRET) and do not reuse BTA_API_KEY for token signing."
    );
  }

  if (config.paywallEnabled && !config.stripeConfigured) {
    errors.push(
      "Paywall is enabled but Stripe is not fully configured. " +
      "Set BTA_STRIPE_SECRET_KEY, BTA_STRIPE_PRICE_ID_MONTHLY, and BTA_STRIPE_PRICE_ID_YEARLY."
    );
  }

  if (config.paywallEnabled && !config.stripeWebhookSecretConfigured) {
    errors.push("Paywall is enabled but BTA_STRIPE_WEBHOOK_SECRET is missing.");
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
      logger.warn("runtime.config_warning", {
        warning,
      });
    }
  }
  if (result.errors.length > 0) {
    throw new Error(formatValidationReport(result));
  }
}
