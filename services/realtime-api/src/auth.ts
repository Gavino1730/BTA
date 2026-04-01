import type { IncomingHttpHeaders } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
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
const LOCAL_AUTH_SECRET = process.env.BTA_LOCAL_AUTH_SECRET?.trim()
  || process.env.BTA_AUTH_SECRET?.trim()
  || process.env.BTA_API_KEY?.trim()
  || ((process.env.NODE_ENV ?? "development") !== "production" ? "bta-local-auth-dev-secret" : "");

const jwtEnabled = AUTH_TEST_MODE || Boolean(JWT_ISSUER && JWT_AUDIENCE && JWT_JWKS_URI);
const localTokenEnabled = Boolean(LOCAL_AUTH_SECRET);
const jwks = AUTH_TEST_MODE
  ? null
  : jwtEnabled && JWT_JWKS_URI
    ? createRemoteJWKSet(new URL(JWT_JWKS_URI))
    : null;

export function isJwtAuthEnabled(): boolean {
  return jwtEnabled;
}

export async function verifyBearerToken(token: string): Promise<AuthContext | null> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return null;
  }

  const localAuthContext = verifyLocalToken(normalizedToken);
  if (localAuthContext) {
    return localAuthContext;
  }

  if (!jwtEnabled) {
    return null;
  }

  if (AUTH_TEST_MODE) {
    return parseTestToken(normalizedToken);
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

export function issueLocalAuthToken(input: {
  subject: string;
  email: string;
  name?: string;
  schoolId?: string;
  role?: string;
  expiresInHours?: number;
}): string | null {
  const subject = input.subject.trim();
  const email = input.email.trim().toLowerCase();
  if (!LOCAL_AUTH_SECRET || !subject || !email) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const durationHours = Math.max(1, Math.floor(input.expiresInHours ?? (24 * 30)));
  const payload: JWTPayload = {
    sub: subject,
    email,
    name: input.name?.trim() || undefined,
    schoolId: input.schoolId?.trim().toLowerCase() || undefined,
    role: input.role?.trim().toLowerCase() || "owner",
    authType: "local",
    iat: nowSeconds,
    exp: nowSeconds + (durationHours * 60 * 60),
    iss: "bta-local-auth",
    aud: "bta-local-client",
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `bta.${encodedPayload}.${signLocalPayload(encodedPayload)}`;
}

function verifyLocalToken(token: string): AuthContext | null {
  if (!LOCAL_AUTH_SECRET || !token.startsWith("bta.")) {
    return null;
  }

  const [, encodedPayload, providedSignature, ...rest] = token.split(".");
  if (!encodedPayload || !providedSignature || rest.length > 0) {
    return null;
  }

  const expectedSignature = signLocalPayload(encodedPayload);
  if (!safeCompare(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as JWTPayload;
    const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
    const expiresAt = typeof payload.exp === "number" ? payload.exp : 0;
    if (!subject || (expiresAt > 0 && expiresAt * 1000 <= Date.now())) {
      return null;
    }

    return {
      subject,
      schoolId: resolveSchoolIdFromClaims(payload),
      role: resolveRoleFromClaims(payload),
      claims: payload,
    };
  } catch {
    return null;
  }
}

function signLocalPayload(encodedPayload: string): string {
  return createHmac("sha256", LOCAL_AUTH_SECRET).update(encodedPayload).digest("base64url");
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
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