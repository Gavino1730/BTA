import { randomBytes } from "node:crypto";
import type { Express } from "express";

import { readHeaderValue } from "../tenant-guards.js";

export function applySecurityMiddleware(app: Express): void {
  app.disable("x-powered-by");
  app.use((req, res, next) => {
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
  });

  app.use((req, res, next) => {
    const inboundRequestId = readHeaderValue(req.headers["x-request-id"]);
    const requestId = inboundRequestId && inboundRequestId.trim().length > 0
      ? inboundRequestId.trim()
      : randomBytes(8).toString("hex");
    res.setHeader("x-request-id", requestId);
    next();
  });
}
