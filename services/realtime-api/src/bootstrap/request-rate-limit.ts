import type { NextFunction, Request, Response } from "express";

function resolveClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0]
      : undefined;

  const rawIp = (firstForwarded?.trim() || req.ip || req.socket.remoteAddress || "unknown").trim();
  if (!rawIp) {
    return "unknown";
  }

  return rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp;
}

export function createRateLimitMiddleware(bucket: string, maxRequests: number, windowMs: number) {
  const state = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = resolveClientIp(req);
    const now = Date.now();
    const key = `${bucket}:${ip}`;
    const limit = state.get(key) ?? { count: 0, resetAt: now + windowMs };

    if (state.size > 5000) {
      for (const [entryKey, value] of state.entries()) {
        if (value.resetAt <= now) {
          state.delete(entryKey);
        }
      }
    }

    if (now > limit.resetAt) {
      limit.count = 0;
      limit.resetAt = now + windowMs;
    }

    if (limit.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((limit.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    limit.count++;
    state.set(key, limit);
    next();
  };
}

export function createRealtimeApiRateLimiters(options?: { disableRateLimit?: boolean }): {
  eventRateLimiter: ReturnType<typeof createRateLimitMiddleware>;
  authRateLimiter: ReturnType<typeof createRateLimitMiddleware>;
} {
  if (options?.disableRateLimit) {
    const noopLimiter = (_req: Request, _res: Response, next: NextFunction) => next();
    return { eventRateLimiter: noopLimiter as any, authRateLimiter: noopLimiter as any };
  }
  return {
    eventRateLimiter: createRateLimitMiddleware("events", 100, 60000),
    authRateLimiter: createRateLimitMiddleware("auth", 20, 15 * 60 * 1000),
  };
}
