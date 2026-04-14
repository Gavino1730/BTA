import type { NextFunction, Request, Response } from "express";

import type { AuthContext } from "../auth.js";

interface ScopedRequest extends Request {
  authContext?: AuthContext;
}

interface CreateAuthContextMiddlewareOptions {
  extractBearerToken: (headers: Request["headers"], auth?: Record<string, unknown>) => string | null;
  verifyBearerToken: (token: string) => Promise<AuthContext | null>;
  isLocalAuthContextRevoked: (authContext: AuthContext) => boolean;
  trackSecurityEvent: (event: "unauthorizedHttp", details: Record<string, unknown>) => void;
}

export function createAuthContextMiddleware(options: CreateAuthContextMiddlewareOptions): {
  attachAuthContext: (req: Request, res: Response, next: NextFunction) => Promise<void>;
} {
  async function attachAuthContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const scopedReq = req as ScopedRequest;
    if (scopedReq.authContext) {
      next();
      return;
    }

    const token = options.extractBearerToken(req.headers, undefined);
    if (!token) {
      next();
      return;
    }

    const authContext = await options.verifyBearerToken(token);
    if (authContext) {
      if (options.isLocalAuthContextRevoked(authContext)) {
        if (req.path !== "/api/auth/session") {
          options.trackSecurityEvent("unauthorizedHttp", {
            reason: "revoked-local-session",
            path: req.path,
            method: req.method,
          });
        }
        next();
        return;
      }
      scopedReq.authContext = authContext;
    }

    next();
  }

  return { attachAuthContext };
}
