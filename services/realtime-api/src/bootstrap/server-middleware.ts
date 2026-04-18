/**
 * Factory for Express middleware functions used in server.ts.
 * Extracted to keep server.ts under 300 lines.
 */
import type { NextFunction, Request, Response } from "express";
import { isJwtAuthEnabled, verifyBearerToken, extractBearerToken, type AuthContext } from "../auth.js";
import { hasWriteRole } from "../tenant-guards.js";
import { trackSecurityEvent } from "../helpers/metrics-helpers.js";
import { sanitizeTextField } from "../helpers/string-helpers.js";
import {
  type ScopedRequest,
  isOptionalTenantScopeRequest,
  shouldSuppressMissingTenantTelemetry,
  resolveRequestSchoolId,
} from "../helpers/tenant-helpers.js";
import { getSchoolMembershipsByScope, getTeamMembershipsByScope } from "../store.js";

export interface ServerMiddlewareOptions {
  API_KEY: string | undefined;
  WRITE_API_KEY: string | undefined;
  JWT_WRITE_REQUIRED: boolean;
  ALLOW_UNCONFIGURED_AUTH_IN_TESTS: boolean;
  resolveCoachRedirectOrigin: (req: Request) => string;
}

export interface ServerMiddleware {
  requireApiKey: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  requireWriteRole: (req: Request, res: Response, next: NextFunction) => void;
  attachAuthContext: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  requireTenantScope: (req: Request, res: Response, next: NextFunction) => void;
  getAuthUserFromContext: (authContext: AuthContext | undefined) => { userId?: string; email?: string; fullName?: string };
  resolvePasswordResetRedirect: (req: Request, requestedRedirectTo: string | undefined) => string;
}

export function createServerMiddleware(opts: ServerMiddlewareOptions): ServerMiddleware {
  const { API_KEY, WRITE_API_KEY, JWT_WRITE_REQUIRED, ALLOW_UNCONFIGURED_AUTH_IN_TESTS, resolveCoachRedirectOrigin } = opts;

  function hasValidApiKeyRequest(req: Request): boolean {
    const provided = req.headers["x-api-key"] ?? req.query.apiKey;
    const candidate = Array.isArray(provided) ? provided[0] : provided;
    return Boolean(API_KEY && candidate === API_KEY);
  }

  function hasValidWriteApiKeyRequest(req: Request): boolean {
    const provided = req.headers["x-api-key"] ?? req.query.apiKey;
    const candidate = Array.isArray(provided) ? provided[0] : provided;
    return Boolean(WRITE_API_KEY && candidate === WRITE_API_KEY);
  }

  function hasConfiguredHttpAuthPath(): boolean {
    return Boolean(API_KEY || WRITE_API_KEY || isJwtAuthEnabled());
  }

  function hasConfiguredWriteAuthPath(): boolean {
    return Boolean(WRITE_API_KEY || isJwtAuthEnabled());
  }

  function isReadOnlyRequest(req: Request): boolean {
    return req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  }

  function readAuthClaimValue(authContext: AuthContext | undefined, path: string): unknown {
    const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
    let current: unknown = authContext?.claims;
    for (const part of parts) {
      if (!current || typeof current !== "object" || !(part in current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  function getAuthUserFromContext(authContext: AuthContext | undefined): { userId?: string; email?: string; fullName?: string } {
    const email = sanitizeTextField(
      readAuthClaimValue(authContext, "email")
        ?? readAuthClaimValue(authContext, "user.email")
        ?? readAuthClaimValue(authContext, "preferred_username"),
      160,
    ).toLowerCase();
    const fullName = sanitizeTextField(
      readAuthClaimValue(authContext, "name")
        ?? [
          sanitizeTextField(readAuthClaimValue(authContext, "given_name"), 80),
          sanitizeTextField(readAuthClaimValue(authContext, "family_name"), 80),
        ].filter(Boolean).join(" "),
      120,
    );
    return {
      userId: sanitizeTextField(authContext?.subject, 120) || undefined,
      email: email || undefined,
      fullName: fullName || undefined,
    };
  }

  function resolvePasswordResetRedirect(req: Request, requestedRedirectTo: string | undefined): string {
    const baseUrl = new URL(resolveCoachRedirectOrigin(req));
    const fallback = new URL("/reset-password", `${baseUrl.toString().replace(/\/+$/, "")}/`);
    const candidate = (requestedRedirectTo ?? "").trim();
    if (!candidate) {
      return fallback.toString();
    }
    try {
      const parsed = new URL(candidate, `${baseUrl.toString().replace(/\/+$/, "")}/`);
      if (parsed.origin !== fallback.origin) {
        return fallback.toString();
      }
      return parsed.toString();
    } catch {
      return fallback.toString();
    }
  }

  async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    const scopedReq = req as ScopedRequest;
    if (scopedReq.authContext) {
      next();
      return;
    }
    if (isJwtAuthEnabled() && JWT_WRITE_REQUIRED && isReadOnlyRequest(req)) {
      next();
      return;
    }
    if (!hasConfiguredHttpAuthPath()) {
      if (ALLOW_UNCONFIGURED_AUTH_IN_TESTS) {
        next();
        return;
      }
      trackSecurityEvent("unauthorizedHttp", { reason: "auth-misconfigured", path: req.path, method: req.method });
      res.status(503).json({ error: "Authentication is not configured for this protected route" });
      return;
    }
    if (hasValidApiKeyRequest(req) || hasValidWriteApiKeyRequest(req)) {
      next();
      return;
    }
    const reason = isJwtAuthEnabled() && JWT_WRITE_REQUIRED && !isReadOnlyRequest(req)
      ? "jwt-write-required"
      : "missing-valid-credentials";
    trackSecurityEvent("unauthorizedHttp", { reason, path: req.path, method: req.method });
    res.status(401).json({ error: "Unauthorized — provide a valid bearer token or x-api-key" });
  }

  async function attachAuthContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const scopedReq = req as ScopedRequest;
    if (scopedReq.authContext) {
      next();
      return;
    }
    const token = extractBearerToken(req.headers, undefined);
    if (!token) {
      next();
      return;
    }
    const authContext = await verifyBearerToken(token);
    if (authContext) {
      scopedReq.authContext = authContext;
    }
    next();
  }

  function requireTenantScope(req: Request, res: Response, next: NextFunction): void {
    const scopedReq = req as ScopedRequest;
    const optionalTenantScope = isOptionalTenantScopeRequest(req);
    const suppressMissingScopeTelemetry = optionalTenantScope || shouldSuppressMissingTenantTelemetry(req);
    const resolved = resolveRequestSchoolId(req, { suppressMissingScopeTelemetry });
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

  function requireWriteRole(req: Request, res: Response, next: NextFunction): void {
    if (hasValidWriteApiKeyRequest(req)) {
      next();
      return;
    }
    if (!WRITE_API_KEY && hasValidApiKeyRequest(req)) {
      next();
      return;
    }
    if (!hasConfiguredWriteAuthPath()) {
      if (ALLOW_UNCONFIGURED_AUTH_IN_TESTS) {
        next();
        return;
      }
      trackSecurityEvent("forbiddenWriteRole", { path: req.path, method: req.method, role: null, reason: "write-auth-misconfigured" });
      res.status(503).json({ error: "Write authorization is not configured for this protected route" });
      return;
    }
    if (!isJwtAuthEnabled()) {
      trackSecurityEvent("forbiddenWriteRole", { path: req.path, method: req.method, role: null, reason: "missing-write-credential" });
      res.status(403).json({ error: "Insufficient role for write access" });
      return;
    }
    const scopedReq = req as ScopedRequest;
    const claimRole = scopedReq.authContext?.role?.trim().toLowerCase();
    if (hasWriteRole(claimRole)) {
      next();
      return;
    }
    const schoolId = scopedReq.tenantSchoolId ?? resolveRequestSchoolId(req, {
      suppressMissingScopeTelemetry: isOptionalTenantScopeRequest(req) || shouldSuppressMissingTenantTelemetry(req),
    }).schoolId;
    const authUser = getAuthUserFromContext(scopedReq.authContext);
    const schoolMembership = schoolId
      ? getSchoolMembershipsByScope({ schoolId }).find((membership) =>
          (authUser.userId && membership.userId === authUser.userId)
          || (authUser.email && membership.email === authUser.email)
        )
      : null;
    const canWriteFromSchoolMembership = schoolMembership?.role === "owner" || schoolMembership?.role === "school_admin";
    const canWriteFromTeamMembership = schoolId
      ? getTeamMembershipsByScope({ schoolId }).some((membership) =>
          membership.role !== "viewer"
            && (
              (authUser.userId && membership.userId === authUser.userId)
              || (authUser.email && membership.email === authUser.email)
            )
        )
      : false;
    if (!canWriteFromSchoolMembership && !canWriteFromTeamMembership) {
      trackSecurityEvent("forbiddenWriteRole", { path: req.path, method: req.method, role: claimRole ?? null, schoolId: schoolId ?? null });
      res.status(403).json({ error: "Insufficient role for write access" });
      return;
    }
    next();
  }

  return {
    requireApiKey,
    requireWriteRole,
    attachAuthContext,
    requireTenantScope,
    getAuthUserFromContext,
    resolvePasswordResetRedirect,
  };
}
