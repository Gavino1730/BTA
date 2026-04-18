import type { Express, NextFunction, Request, Response } from "express";
import { registerAuthSessionRoutes, type RegisterAuthSessionRoutesOptions } from "./auth-session-routes.js";
import { registerAuthRegisterRoutes, type RegisterAuthRegisterRoutesOptions } from "./auth-register-routes.js";
type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

interface RegisterAuthCoreRoutesOptions extends RegisterAuthSessionRoutesOptions, RegisterAuthRegisterRoutesOptions {
  enableLegacyLocalAuth?: boolean;
}

export function registerAuthCoreRoutes(app: Express, options: RegisterAuthCoreRoutesOptions): void {
  function rejectLegacyLocalAuth(res: Response, action: "register" | "login" | "password reset"): boolean {
    if (options.enableLegacyLocalAuth !== false) {
      return false;
    }
    res.status(410).json({
      error: `Legacy local ${action} is disabled. Use Supabase auth flows instead.`,
      code: "legacy_local_auth_disabled",
    });
    return true;
  }

  registerAuthSessionRoutes(app, options, rejectLegacyLocalAuth);
  registerAuthRegisterRoutes(app, options, rejectLegacyLocalAuth);
}