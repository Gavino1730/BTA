import type { Server } from "socket.io";

interface RegisterSocketAuthOptions {
  extractBearerToken: (headers: any, auth?: Record<string, unknown>) => string | null;
  verifyBearerToken: (token: string) => Promise<unknown | null>;
  resolveSocketSchoolId: (socket: any) => { schoolId?: string; error?: string };
  apiKey?: string;
  writeApiKey?: string;
  isJwtAuthEnabled: () => boolean;
  allowAnonymousWhenUnconfigured?: boolean;
  trackSecurityEvent: (event: "unauthorizedSocket", details: Record<string, unknown>) => void;
  loggerWarn?: (message: string, context?: Record<string, unknown>) => void;
}

function hasConfiguredSocketAuthPath(options: RegisterSocketAuthOptions): boolean {
  return Boolean(options.apiKey || options.writeApiKey || options.isJwtAuthEnabled());
}

export function registerSocketAuth(io: Server, options: RegisterSocketAuthOptions): void {
  io.use(async (socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const token = options.extractBearerToken(socket.handshake.headers as Record<string, unknown> | undefined, auth);
    const origin = typeof socket.handshake.headers.origin === "string"
      ? socket.handshake.headers.origin
      : undefined;
    const requestedSchoolId = typeof auth.schoolId === "string"
      ? auth.schoolId
      : typeof socket.handshake.headers["x-school-id"] === "string"
        ? socket.handshake.headers["x-school-id"]
        : undefined;

    function reject(message: string, reason: string): void {
      options.loggerWarn?.("socket.auth_rejected", {
        reason,
        message,
        origin,
        requestedSchoolId,
        hasBearerToken: Boolean(token),
        hasApiKey: typeof auth.apiKey === "string" || typeof socket.handshake.headers["x-api-key"] === "string",
      });
      next(new Error(message));
    }

    if (token) {
      const authContext = await options.verifyBearerToken(token);
      if (authContext) {
        socket.data.authContext = authContext;
        const resolved = options.resolveSocketSchoolId(socket);
        if (!resolved.schoolId) {
          reject(resolved.error ?? "schoolId is required", "missing-school-scope-after-jwt");
          return;
        }
        next();
        return;
      }
    }

    const provided = typeof auth.apiKey === "string"
      ? auth.apiKey
      : typeof socket.handshake.headers["x-api-key"] === "string"
        ? socket.handshake.headers["x-api-key"]
        : undefined;

    if (!hasConfiguredSocketAuthPath(options)) {
      if (options.allowAnonymousWhenUnconfigured) {
        const resolved = options.resolveSocketSchoolId(socket);
        if (!resolved.schoolId) {
          reject(resolved.error ?? "schoolId is required", "missing-school-scope-anonymous");
          return;
        }
        next();
        return;
      }
      reject("Authentication is not configured for this protected socket", "auth-misconfigured");
      options.trackSecurityEvent("unauthorizedSocket", { reason: "auth-misconfigured" });
      return;
    }

    if ((options.apiKey && provided === options.apiKey) || (options.writeApiKey && provided === options.writeApiKey)) {
      const resolved = options.resolveSocketSchoolId(socket);
      if (!resolved.schoolId) {
        reject(resolved.error ?? "schoolId is required", "missing-school-scope-after-api-key");
        return;
      }
      next();
      return;
    }

    reject("Unauthorized - provide a valid bearer token or apiKey", "missing-valid-credentials");
    options.trackSecurityEvent("unauthorizedSocket", { reason: "missing-valid-credentials" });
  });
}
