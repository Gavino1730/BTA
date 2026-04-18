import type { Express } from "express";
import {
  getBillingStateByScope,
  saveBillingState,
  findBillingStateByStripeCustomerId,
  findBillingStateByStripeSubscriptionId,
  hasProcessedStripeWebhookEvent,
  markProcessedStripeWebhookEvent,
  trimProcessedStripeWebhookEvents,
  getOrganizationProfileByScope,
  saveOrganizationProfile,
  resetAllData,
} from "../store.js";
import {
  sanitizeTextField,
  isValidEmail,
} from "../helpers/string-helpers.js";
import {
  getSchoolIdFromRequest,
  allocateBootstrapSchoolId,
  buildBootstrapSchoolSeed,
} from "../helpers/tenant-helpers.js";
import { normalizeSchoolId } from "../tenant-guards.js";
import {
  securityTelemetry,
  renderPrometheusSecurityMetrics,
} from "../helpers/metrics-helpers.js";
import { logger } from "../logger.js";
import { registerAdminRoutes } from "../routes/system-routes.js";
import { registerBillingRoutes } from "../routes/billing-routes.js";
import type { RegisterRoutesOptions } from "./register-routes.js";
import type { createOperatorPresenceManager } from "../sockets/operator-presence-manager.js";

export interface RegisterBillingAdminRoutesExtra {
  requireApiKey: RegisterRoutesOptions["requireApiKey"];
  requireWriteRole: RegisterRoutesOptions["requireWriteRole"];
  BILLING_PAYWALL_ENABLED: boolean;
  BILLING_STRIPE_TEST_MODE: boolean;
  BILLING_STRIPE_SECRET_KEY: string | undefined;
  BILLING_STRIPE_WEBHOOK_SECRET: string | undefined;
  BILLING_STRIPE_PRICE_ID_MONTHLY: string | undefined;
  BILLING_STRIPE_PRICE_ID_YEARLY: string | undefined;
  resolveCoachRedirectOrigin: RegisterRoutesOptions["resolveCoachRedirectOrigin"];
  clearOperatorLinksForSchool: ReturnType<typeof createOperatorPresenceManager>["clearOperatorLinksForSchool"];
}

export function registerBillingAndAdminRoutes(
  app: Express,
  _opts: RegisterRoutesOptions,
  extra: RegisterBillingAdminRoutesExtra,
): void {
  const {
    requireApiKey, requireWriteRole,
    BILLING_PAYWALL_ENABLED, BILLING_STRIPE_TEST_MODE,
    BILLING_STRIPE_SECRET_KEY, BILLING_STRIPE_WEBHOOK_SECRET,
    BILLING_STRIPE_PRICE_ID_MONTHLY, BILLING_STRIPE_PRICE_ID_YEARLY,
    resolveCoachRedirectOrigin, clearOperatorLinksForSchool,
  } = extra;

  registerAdminRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSecurityTelemetry: () => securityTelemetry,
    renderPrometheusSecurityMetrics,
    getSchoolIdFromRequest,
    resetAllData,
    clearOperatorLinksForSchool,
  });

  registerBillingRoutes(app, {
    paywallEnabled: BILLING_PAYWALL_ENABLED,
    stripeTestMode: BILLING_STRIPE_TEST_MODE,
    stripeSecretKey: BILLING_STRIPE_SECRET_KEY,
    stripeWebhookSecret: BILLING_STRIPE_WEBHOOK_SECRET,
    stripePriceIdMonthly: BILLING_STRIPE_PRICE_ID_MONTHLY,
    stripePriceIdYearly: BILLING_STRIPE_PRICE_ID_YEARLY,
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    sanitizeTextField,
    isValidEmail,
    allocateBootstrapSchoolId,
    buildBootstrapSchoolSeed,
    normalizeSchoolId,
    resolveCoachRedirectOrigin,
    getBillingStateByScope,
    saveBillingState,
    findBillingStateByStripeCustomerId,
    findBillingStateByStripeSubscriptionId,
    hasProcessedStripeWebhookEvent,
    markProcessedStripeWebhookEvent,
    trimProcessedStripeWebhookEvents,
    getOrganizationProfileByScope,
    saveOrganizationProfile,
    loggerInfo: (message, context) => logger.info(message, context),
    loggerWarn: (message, context) => logger.warn(message, context),
    loggerError: (message, context) => logger.error(message, context),
  });
}
