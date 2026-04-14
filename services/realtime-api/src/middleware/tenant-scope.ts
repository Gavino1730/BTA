import type { NextFunction, Request, Response } from "express";

interface ScopedRequest extends Request {
  tenantSchoolId?: string;
}

interface ResolveTenantResult {
  schoolId?: string;
  error?: string;
  status?: number;
}

interface CreateTenantScopeMiddlewareOptions {
  isOptionalTenantScopeRequest: (req: Request) => boolean;
  shouldSuppressMissingTenantTelemetry: (req: Request) => boolean;
  resolveRequestSchoolId: (
    req: Request,
    options?: { suppressMissingScopeTelemetry?: boolean }
  ) => ResolveTenantResult;
}

export function createTenantScopeMiddleware(options: CreateTenantScopeMiddlewareOptions): {
  requireTenantScope: (req: Request, res: Response, next: NextFunction) => void;
} {
  function requireTenantScope(req: Request, res: Response, next: NextFunction): void {
    const scopedReq = req as ScopedRequest;
    const optionalTenantScope = options.isOptionalTenantScopeRequest(req);
    const suppressMissingScopeTelemetry = optionalTenantScope || options.shouldSuppressMissingTenantTelemetry(req);
    const resolved = options.resolveRequestSchoolId(req, {
      suppressMissingScopeTelemetry,
    });

    if (optionalTenantScope && resolved.error === "schoolId is required") {
      next();
      return;
    }

    if (!resolved.schoolId) {
      res.status(resolved.status ?? 400).json({ error: resolved.error ?? "schoolId is required" });
      return;
    }

    scopedReq.tenantSchoolId = resolved.schoolId;
    next();
  }

  return { requireTenantScope };
}
