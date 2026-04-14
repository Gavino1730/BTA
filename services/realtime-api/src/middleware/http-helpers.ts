import type { NextFunction, Request, Response } from "express";

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

// Simple rate limiter: scoped per route family and IP.
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

export function withAsyncRoute(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res, next).catch(next);
  };
}

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
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = resolveClientIp(req);
    const now = Date.now();
    const key = `${bucket}:${ip}`;
    const limit = rateLimitState.get(key) ?? { count: 0, resetAt: now + windowMs };

    // Opportunistic cleanup so map size stays bounded under high IP churn.
    if (rateLimitState.size > 5000) {
      for (const [entryKey, value] of rateLimitState.entries()) {
        if (value.resetAt <= now) {
          rateLimitState.delete(entryKey);
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
    rateLimitState.set(key, limit);
    next();
  };
}
