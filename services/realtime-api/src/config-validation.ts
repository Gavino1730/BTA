export interface RuntimeConfig {
  nodeEnv: string;
  requireTenant: boolean;
  jwtWriteRequired: boolean;
  jwtEnabled: boolean;
  apiKeyPresent: boolean;
  writeApiKeyPresent: boolean;
  allowedOriginsConfigured: boolean;
  databaseUrlConfigured: boolean;
  databaseUrlUsesPooler: boolean;
  strictPersistenceStartupConfigured: boolean;
  localAuthSecretConfigured: boolean;
  emailProvider: string;
  emailFromConfigured: boolean;
  resendApiKeyConfigured: boolean;
  supabaseUrlConfigured: boolean;
  supabasePublishableKeyConfigured: boolean;
  supabaseServiceRoleKeyConfigured: boolean;
}

export interface RuntimeValidationResult {
  errors: string[];
  warnings: string[];
}

export function readRuntimeConfig(jwtEnabled: boolean): RuntimeConfig {
  const nodeEnv = (process.env.NODE_ENV ?? "development").trim().toLowerCase();
  const emailProvider = (process.env.BTA_EMAIL_PROVIDER ?? "").trim().toLowerCase();
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  return {
    nodeEnv,
    requireTenant: process.env.BTA_REQUIRE_TENANT !== "0",
    jwtWriteRequired: process.env.BTA_JWT_WRITE_REQUIRED !== "0",
    jwtEnabled,
    apiKeyPresent: Boolean(process.env.BTA_API_KEY?.trim()),
    writeApiKeyPresent: Boolean(process.env.BTA_WRITE_API_KEY?.trim()),
    allowedOriginsConfigured: Boolean(process.env.ALLOWED_ORIGINS?.trim()),
    databaseUrlConfigured: Boolean(databaseUrl),
    databaseUrlUsesPooler: /\.pooler\.supabase\.com(?::\d+)?(?:\/|$)/i.test(databaseUrl),
    strictPersistenceStartupConfigured: process.env.BTA_PERSISTENCE_STARTUP_STRICT === "1",
    localAuthSecretConfigured: Boolean(
      process.env.BTA_LOCAL_AUTH_SECRET?.trim() || process.env.BTA_AUTH_SECRET?.trim()
    ),
    emailProvider,
    emailFromConfigured: Boolean(process.env.BTA_EMAIL_FROM?.trim()),
    resendApiKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    supabaseUrlConfigured: Boolean(
      process.env.SUPABASE_URL?.trim()
      || process.env.VITE_SUPABASE_URL?.trim()
      || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    ),
    supabasePublishableKeyConfigured: Boolean(
      process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
      || process.env.SUPABASE_ANON_KEY?.trim()
      || process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
      || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim()
      || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
      || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    ),
    supabaseServiceRoleKeyConfigured: Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
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

  if (!config.jwtEnabled && !config.writeApiKeyPresent) {
    warnings.push(
      "No write-capable auth path is configured. Protected write/admin routes will fail closed " +
      "unless JWT auth is enabled or BTA_WRITE_API_KEY is set."
    );
  }

  if (!config.allowedOriginsConfigured) {
    errors.push("Production requires explicit CORS origins. Set ALLOWED_ORIGINS.");
  }

  if (!config.databaseUrlConfigured) {
    errors.push("Production requires DATABASE_URL so persistence does not fall back to local file storage.");
  }

  if (config.databaseUrlConfigured && !config.databaseUrlUsesPooler) {
    errors.push(
      "Production requires the Supabase Session/Connection Pooler DATABASE_URL " +
      "(.pooler.supabase.com) so hosted startup does not depend on direct IPv6 database access."
    );
  }

  if (!config.strictPersistenceStartupConfigured) {
    errors.push("Production requires BTA_PERSISTENCE_STARTUP_STRICT=1 so startup fails closed on persistence restore/init errors.");
  }

  if (!config.localAuthSecretConfigured) {
    warnings.push(
      "BTA_LOCAL_AUTH_SECRET is not set; built-in email/password auth cannot issue signed local tokens. " +
      "Set a dedicated BTA_LOCAL_AUTH_SECRET to enable local auth safely in production."
    );
  }

  if (config.emailProvider) {
    if (!config.emailFromConfigured) {
      warnings.push("BTA_EMAIL_FROM is not set; transactional emails cannot be delivered.");
    }
    if (config.emailProvider === "resend" && !config.resendApiKeyConfigured) {
      warnings.push("RESEND_API_KEY is not set; Resend email delivery is disabled.");
    }
  }

  if (!config.supabaseUrlConfigured || !config.supabasePublishableKeyConfigured) {
    warnings.push(
      "Supabase auth email proxy is not fully configured on the API service. " +
      "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or their public equivalents) so password reset emails can be sent."
    );
  }
  if (!config.supabaseServiceRoleKeyConfigured) {
    warnings.push(
      "SUPABASE_SERVICE_ROLE_KEY is not set on the API service. Password reset emails can fall back to Supabase's " +
      "built-in recover endpoint, but missing-user cases remain intentionally silent. Set the service role key to " +
      "generate reset links server-side and send them through your transactional email provider."
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
      logger.warn("startup.runtime_config_warning", { warning });
    }
  }
  if (result.errors.length > 0) {
    throw new Error(formatValidationReport(result));
  }
}
import { logger } from "./logger.js";
