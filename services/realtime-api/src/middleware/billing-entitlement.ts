import type { NextFunction, Request, Response } from "express";

interface BillingEntitlement {
  accessActive: boolean;
  status?: string;
  reason?: string;
}

interface CreateBillingEntitlementMiddlewareOptions {
  paywallEnabled: boolean;
  getSchoolIdFromRequest: (req: Request) => string;
  buildBillingEntitlement: (schoolId: string) => BillingEntitlement;
  loggerWarn: (message: string, context: Record<string, unknown>) => void;
}

export function createBillingEntitlementMiddleware(options: CreateBillingEntitlementMiddlewareOptions): {
  requireActiveBillingEntitlement: (req: Request, res: Response, next: NextFunction) => void;
} {
  function requireActiveBillingEntitlement(req: Request, res: Response, next: NextFunction): void {
    if (!options.paywallEnabled) {
      next();
      return;
    }

    const schoolId = options.getSchoolIdFromRequest(req);
    const entitlement = options.buildBillingEntitlement(schoolId);
    if (entitlement.accessActive) {
      next();
      return;
    }

    options.loggerWarn("billing.paywall_denied", {
      schoolId,
      path: req.path,
      method: req.method,
      entitlementStatus: entitlement.status,
      entitlementReason: entitlement.reason,
    });

    res.status(402).json({
      error: "Active subscription required",
      code: "billing_required",
      entitlement,
    });
  }

  return { requireActiveBillingEntitlement };
}
