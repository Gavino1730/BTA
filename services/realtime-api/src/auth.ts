import type { IncomingHttpHeaders } from "node:http";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface AuthContext {
  subject: string;
  schoolId?: string;
  claims: JWTPayload;
}

const JWT_ISSUER = process.env.BTA_JWT_ISSUER?.trim();
const JWT_AUDIENCE = process.env.BTA_JWT_AUDIENCE?.trim();
const JWT_JWKS_URI = process.env.BTA_JWT_JWKS_URI?.trim();
const JWT_SCHOOL_CLAIM = process.env.BTA_JWT_SCHOOL_CLAIM?.trim();

const jwtEnabled = Boolean(JWT_ISSUER && JWT_AUDIENCE && JWT_JWKS_URI);
const jwks = jwtEnabled ? createRemoteJWKSet(new URL(JWT_JWKS_URI!)) : null;

export function isJwtAuthEnabled(): boolean {
  return jwtEnabled;
}

export async function verifyBearerToken(token: string): Promise<AuthContext | null> {
  if (!jwtEnabled || !jwks || !token.trim()) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, jwks, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
    const subject = verified.payload.sub?.trim();
    if (!subject) {
      return null;
    }

    return {
      subject,
      schoolId: resolveSchoolIdFromClaims(verified.payload),
      claims: verified.payload
    };
  } catch {
    return null;
  }
}

export function extractBearerToken(headers: IncomingHttpHeaders, auth?: Record<string, unknown>): string | null {
  const authHeader = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const token = auth?.token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

function resolveSchoolIdFromClaims(payload: JWTPayload): string | undefined {
  const configuredValue = JWT_SCHOOL_CLAIM ? readClaim(payload, JWT_SCHOOL_CLAIM) : undefined;
  const fallbackValue = configuredValue
    ?? readClaim(payload, "schoolId")
    ?? readClaim(payload, "school_id")
    ?? readClaim(payload, "tenantId")
    ?? readClaim(payload, "tenant_id");

  if (typeof fallbackValue !== "string") {
    return undefined;
  }

  const trimmed = fallbackValue.trim().toLowerCase();
  return trimmed || undefined;
}

function readClaim(payload: JWTPayload, path: string): unknown {
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
  let current: unknown = payload;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}