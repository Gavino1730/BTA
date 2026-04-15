import type { NextFunction, Request, Response } from "express";

interface ScopedRequest extends Request {
  authContext?: {
    role?: string;
  };
}

interface CreateAuthzMiddlewareOptions {
  apiKey?: string;
  writeApiKey?: string;
  isJwtAuthEnabled: () => boolean;
  jwtWriteRequired: boolean;
  hasWriteRole: (role?: string) => boolean;
  trackSecurityEvent: (event: "unauthorizedHttp" | "forbiddenWriteRole", details: Record<string, unknown>) => void;
}

function hasValidApiKeyRequest(req: Request, apiKey?: string): boolean {
  const provided = req.headers["x-api-key"] ?? req.query.apiKey;
  const candidate = Array.isArray(provided) ? provided[0] : provided;
  return Boolean(apiKey && candidate === apiKey);
}

function hasAnyConfiguredAuthPath(options: CreateAuthzMiddlewareOptions): boolean {
  return Boolean(options.apiKey || options.writeApiKey || options.isJwtAuthEnabled());
}

function isReadOnlyRequest(req: Request): boolean {
  return req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
}

export function createAuthzMiddleware(options: CreateAuthzMiddlewareOptions): {
  requireApiKey: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  requireWriteRole: (req: Request, res: Response, next: NextFunction) => void;
} {
  async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    const scopedReq = req as ScopedRequest;
    if (scopedReq.authContext) {
      next();
      return;
    }

    if (options.isJwtAuthEnabled() && options.jwtWriteRequired && isReadOnlyRequest(req)) {
      next();
      return;
    }

    if (!hasAnyConfiguredAuthPath(options)) {
      options.trackSecurityEvent("unauthorizedHttp", { reason: "auth-misconfigured", path: req.path, method: req.method });
      res.status(503).json({ error: "Authentication is not configured for this protected route" });
      return;
    }

    if (hasValidApiKeyRequest(req, options.apiKey) || hasValidApiKeyRequest(req, options.writeApiKey)) {
      next();
      return;
    }

    const reason = options.isJwtAuthEnabled() && options.jwtWriteRequired && !isReadOnlyRequest(req)
      ? "jwt-write-required"
      : "missing-valid-credentials";
    options.trackSecurityEvent("unauthorizedHttp", { reason, path: req.path, method: req.method });
    res.status(401).json({ error: "Unauthorized — provide a valid bearer token or x-api-key" });
  }

  function requireWriteRole(req: Request, res: Response, next: NextFunction): void {
    if (hasValidApiKeyRequest(req, options.writeApiKey)) {
      next();
      return;
    }

    if (!options.isJwtAuthEnabled()) {
      options.trackSecurityEvent("forbiddenWriteRole", { path: req.path, method: req.method, role: null, reason: "write-auth-misconfigured" });
      res.status(503).json({ error: "Write authorization is not configured for this protected route" });
      return;
    }

    const scopedReq = req as ScopedRequest;
    const role = scopedReq.authContext?.role?.trim().toLowerCase();
    if (!options.hasWriteRole(role ?? undefined)) {
      options.trackSecurityEvent("forbiddenWriteRole", { path: req.path, method: req.method, role: role ?? null });
      res.status(403).json({ error: "Insufficient role for write access" });
      return;
    }

    next();
  }

  return { requireApiKey, requireWriteRole };
}
