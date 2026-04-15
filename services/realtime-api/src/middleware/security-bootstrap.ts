import type { NextFunction, Request, Response } from "express";

export function applySecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  const forwardedProto = readHeaderValue(req.headers["x-forwarded-proto"]);
  const isHttps = req.secure || forwardedProto === "https";
  if (isHttps) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
}

export function buildAllowedOrigins(rawConfiguredOrigins: string | undefined): string[] {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
  ];

  const configuredOrigins = String(rawConfiguredOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length > 0) {
    allowedOrigins.push(...configuredOrigins);
  }

  return allowedOrigins;
}

export function createOriginAllowChecker(allowedOrigins: string[]): (origin: string) => boolean {
  return (origin: string): boolean => {
    for (const pattern of allowedOrigins) {
      if (!pattern.includes("*")) {
        if (origin === pattern) {
          return true;
        }
        continue;
      }

      const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".+")}$`);
      if (re.test(origin)) {
        return true;
      }
    }

    return false;
  };
}

export function createCorsOriginHandler(options: {
  nodeEnv: string | undefined;
  isOriginAllowed: (origin: string) => boolean;
  loggerWarn: (message: string, context: Record<string, unknown>) => void;
}): (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void {
  return (origin, callback): void => {
    if (options.nodeEnv !== "production") {
      callback(null, true);
      return;
    }

    if (!origin || options.isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    options.loggerWarn("http.cors_blocked_origin", { origin });
    callback(new Error("CORS not allowed"));
  };
}

function readHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }

  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  return undefined;
}
