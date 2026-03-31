import type { IncomingHttpHeaders } from "node:http";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface AuthContext {
  subject: string;
  schoolId?: string;
  role?: string;
  claims: JWTPayload;
}

const JWT_ISSUER = process.env.BTA_JWT_ISSUER?.trim();
const JWT_AUDIENCE = process.env.BTA_JWT_AUDIENCE?.trim();
const JWT_JWKS_URI = process.env.BTA_JWT_JWKS_URI?.trim();
const JWT_SCHOOL_CLAIM = process.env.BTA_JWT_SCHOOL_CLAIM?.trim();
const JWT_ROLE_CLAIM = process.env.BTA_JWT_ROLE_CLAIM?.trim();
const AUTH_TEST_MODE = process.env.BTA_AUTH_TEST_MODE === "1";

const jwtEnabled = AUTH_TEST_MODE || Boolean(JWT_ISSUER && JWT_AUDIENCE && JWT_JWKS_URI);
const jwks = AUTH_TEST_MODE
  ? null
  : jwtEnabled && JWT_JWKS_URI
    ? createRemoteJWKSet(new URL(JWT_JWKS_URI))
    : null;

export function isJwtAuthEnabled(): boolean {
  return jwtEnabled;
}

export async function verifyBearerToken(token: string): Promise<AuthContext | null> {
  if (!jwtEnabled || !token.trim()) {
    return null;
  }

  if (AUTH_TEST_MODE) {
    return parseTestToken(token);
  }

  if (!jwks) {
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
      role: resolveRoleFromClaims(verified.payload),
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

function resolveRoleFromClaims(payload: JWTPayload): string | undefined {
  const configuredValue = JWT_ROLE_CLAIM ? readClaim(payload, JWT_ROLE_CLAIM) : undefined;
  const fallbackValue = configuredValue
    ?? readClaim(payload, "role")
    ?? readClaim(payload, "roles")
    ?? readClaim(payload, "app_metadata.role");

  if (typeof fallbackValue === "string") {
    const trimmed = fallbackValue.trim().toLowerCase();
    return trimmed || undefined;
  }

  if (Array.isArray(fallbackValue)) {
    const firstRole = fallbackValue.find((value) => typeof value === "string" && value.trim());
    if (typeof firstRole === "string") {
      return firstRole.trim().toLowerCase();
    }
  }

  return undefined;
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

function parseTestToken(token: string): AuthContext | null {
  if (!token.startsWith("test.")) {
    return null;
  }

  const encodedPayload = token.slice(5).trim();
  if (!encodedPayload) {
    return null;
  }

  try {
    const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as JWTPayload;
    const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!subject) {
      return null;
    }

    return {
      subject,
      schoolId: resolveSchoolIdFromClaims(payload),
      role: resolveRoleFromClaims(payload),
      claims: payload
    };
  } catch {
    return null;
  }
}