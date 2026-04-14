import type { Server } from "socket.io";

interface RegisterSocketAuthOptions {
  extractBearerToken: (headers: any, auth?: Record<string, unknown>) => string | null;
  verifyBearerToken: (token: string) => Promise<unknown | null>;
  resolveSocketSchoolId: (socket: any) => { schoolId?: string; error?: string };
  apiKey?: string;
  isJwtAuthEnabled: () => boolean;
  trackSecurityEvent: (event: "unauthorizedSocket", details: Record<string, unknown>) => void;
}

export function registerSocketAuth(io: Server, options: RegisterSocketAuthOptions): void {
  io.use(async (socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;

    const token = options.extractBearerToken(socket.handshake.headers as Record<string, unknown> | undefined, auth);
    if (token) {
      const authContext = await options.verifyBearerToken(token);
      if (authContext) {
        socket.data.authContext = authContext;
        const resolved = options.resolveSocketSchoolId(socket);
        if (!resolved.schoolId) {
          next(new Error(resolved.error ?? "schoolId is required"));
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

    if (!options.apiKey && !options.isJwtAuthEnabled()) {
      const resolved = options.resolveSocketSchoolId(socket);
      if (!resolved.schoolId) {
        next(new Error(resolved.error ?? "schoolId is required"));
        return;
      }
      next();
      return;
    }

    if (options.apiKey && provided === options.apiKey) {
      const resolved = options.resolveSocketSchoolId(socket);
      if (!resolved.schoolId) {
        next(new Error(resolved.error ?? "schoolId is required"));
        return;
      }
      next();
      return;
    }

    next(new Error("Unauthorized — provide a valid bearer token or apiKey"));
    options.trackSecurityEvent("unauthorizedSocket", { reason: "missing-valid-credentials" });
  });
}
