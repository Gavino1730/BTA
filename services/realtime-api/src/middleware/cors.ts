import cors from "cors";
import type { Express } from "express";

import { logger } from "../logger.js";

// CORS whitelist: allow only known app origins and explicitly configured deployments.
// Entries in ALLOWED_ORIGINS may use a single '*' wildcard (e.g. https://bta-coach-*.vercel.app).
function normalizeOriginInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.includes("*")) {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.origin.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

function expandOriginAliases(origin: string): string[] {
  if (origin.includes("*")) {
    return [origin];
  }

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return [origin];
    }

    if (hostname.startsWith("www.")) {
      const apexHostname = hostname.slice(4);
      if (apexHostname.split(".").length === 2) {
        const apexUrl = new URL(parsed.toString());
        apexUrl.hostname = apexHostname;
        return [origin, apexUrl.toString()];
      }
      return [origin];
    }

    if (hostname.split(".").length === 2) {
      const wwwUrl = new URL(parsed.toString());
      wwwUrl.hostname = `www.${hostname}`;
      return [origin, wwwUrl.toString()];
    }
  } catch {
    return [origin];
  }

  return [origin];
}

const BASE_ALLOWED_ORIGINS = [
  "http://localhost:5173",      // iPad operator dev
  "http://localhost:5174",      // Coach dashboard dev
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];
const PROD_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);

export const ALLOWED_ORIGINS = Array.from(
  new Set([...BASE_ALLOWED_ORIGINS, ...PROD_ORIGINS].flatMap((origin) => expandOriginAliases(origin)))
).map(normalizeOriginInput).filter(Boolean);

export class CorsNotAllowedError extends Error {
  readonly statusCode = 403;
  readonly code = "cors_not_allowed";

  constructor(readonly origin?: string) {
    super("CORS not allowed");
    this.name = "CorsNotAllowedError";
  }
}

export function isCorsOriginAllowed(origin: string, allowedOrigins: readonly string[] = ALLOWED_ORIGINS): boolean {
  const normalizedOrigin = normalizeOriginInput(origin);
  if (!normalizedOrigin) {
    return false;
  }

  for (const rawPattern of allowedOrigins) {
    const pattern = normalizeOriginInput(rawPattern);
    if (!pattern) {
      continue;
    }

    if (!pattern.includes("*")) {
      if (normalizedOrigin === pattern) {
        return true;
      }
    } else {
      // Convert glob-style pattern (single * = any chars) to regex
      const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".+") + "$");
      if (re.test(normalizedOrigin)) {
        return true;
      }
    }
  }

  return false;
}

export function applyCors(app: Express): void {
  app.use(cors({
    origin: (origin, callback) => {
      // In development, allow localhost variants; in production use whitelist.
      if (process.env.NODE_ENV !== "production") {
        callback(null, true);
      } else if (!origin || isCorsOriginAllowed(origin)) {
        callback(null, true);
      } else {
        logger.warn("cors.blocked_origin", { origin });
        callback(new CorsNotAllowedError(origin));
      }
    },
    credentials: true
  }));
}

export function getSocketCorsConfig(): { origin: true | string[]; credentials: true } {
  return process.env.NODE_ENV !== "production"
    ? { origin: true, credentials: true }
    : { origin: ALLOWED_ORIGINS, credentials: true };
}
