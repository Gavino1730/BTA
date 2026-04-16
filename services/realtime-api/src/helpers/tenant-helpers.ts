import { randomBytes } from "node:crypto";
import type { Request } from "express";
import {
  getLocalAuthAccountsByEmailAcrossSchools,
  getLocalAuthAccountsByScope,
  getOnboardingAccountStateByScope,
  getOrganizationMembersByScope,
  getOrganizationProfileByScope,
  getRosterTeamsByScope,
} from "../store.js";
import {
  normalizeSchoolId,
  readHeaderValue,
  resolveRequestTenant,
  resolveSocketTenant,
} from "../tenant-guards.js";
import type { AuthContext } from "../auth.js";
import { trackSecurityEvent } from "./metrics-helpers.js";
import { buildOrganizationSlug, sanitizeTextField } from "./string-helpers.js";

const DEFAULT_SCHOOL_ID = String(process.env.BTA_DEFAULT_SCHOOL_ID ?? "default").trim().toLowerCase() || "default";
const REQUIRE_TENANT = process.env.BTA_REQUIRE_TENANT !== "0";

// ---------------------------------------------------------------------------
// Request augmentation types
// ---------------------------------------------------------------------------

export type AuthedRequest = Request & { authContext?: AuthContext };
export type ScopedRequest = AuthedRequest & { tenantSchoolId?: string };

// ---------------------------------------------------------------------------
// Room name helpers
// ---------------------------------------------------------------------------

export function schoolRoom(schoolId: string): string {
  return `school:${schoolId}`;
}

export function gameRoom(schoolId: string, gameId: string): string {
  return `school:${schoolId}:game:${gameId}`;
}

export function deviceRoom(schoolId: string, deviceId: string): string {
  return `school:${schoolId}:device:${deviceId}`;
}

export function connectionRoom(schoolId: string, connectionId: string): string {
  return `school:${schoolId}:connection:${connectionId}`;
}

// ---------------------------------------------------------------------------
// Request type guards
// ---------------------------------------------------------------------------

export function isPublicAuthBootstrapRequest(req: Request): boolean {
  return (
    req.method === "POST" &&
    (req.path.endsWith("/auth/register") || req.path.endsWith("/auth/login"))
  );
}

export function isOperatorBootstrapRequest(req: Request): boolean {
  return req.method === "GET" && /^\/operator-links\/[a-z0-9_-]+$/i.test(req.path);
}

export function isOptionalTenantScopeRequest(req: Request): boolean {
  if (isPublicAuthBootstrapRequest(req) || isOperatorBootstrapRequest(req)) {
    return true;
  }
  if (req.path === "/me/context" || req.path === "/schools/bootstrap") {
    return true;
  }
  if (/^\/schools\/[^/]+(?:\/overview|\/teams)?$/i.test(req.path)) {
    return true;
  }
  if (/^\/teams\/[^/]+(?:\/live-sessions)?$/i.test(req.path)) {
    return true;
  }
  if (/^\/live-sessions\/[^/]+\/operator-pairing$/i.test(req.path)) {
    return true;
  }
  if (req.method === "GET" && (req.path === "/auth/session" || req.path === "/onboarding/state")) {
    return true;
  }
  if (
    req.method === "POST" &&
    (req.path === "/billing/webhook" || req.path === "/billing/bootstrap-checkout-session")
  ) {
    return true;
  }
  return false;
}

export function shouldSuppressMissingTenantTelemetry(req: Request): boolean {
  if (req.method === "GET" && req.path === "/roster-teams") {
    return true;
  }
  if (req.path === "/billing/entitlement") {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// School ID resolution
// ---------------------------------------------------------------------------

export function resolveRequestSchoolId(
  req: Request,
  options?: { suppressMissingScopeTelemetry?: boolean },
): { schoolId?: string; error?: string; status?: number } {
  const scopedReq = req as ScopedRequest;
  if (scopedReq.tenantSchoolId) {
    return { schoolId: scopedReq.tenantSchoolId };
  }

  const result = resolveRequestTenant({
    authSchoolId: scopedReq.authContext?.schoolId,
    headerSchoolId: readHeaderValue(req.headers["x-school-id"]),
    querySchoolId: req.query.schoolId,
    requireTenant: REQUIRE_TENANT,
    defaultSchoolId: DEFAULT_SCHOOL_ID,
  });

  if (result.error?.includes("mismatch")) {
    trackSecurityEvent("requestTenantMismatch", {
      authSchoolId: normalizeSchoolId(scopedReq.authContext?.schoolId),
      requestedSchoolId: normalizeSchoolId(
        readHeaderValue(req.headers["x-school-id"]) ?? req.query.schoolId,
      ),
      path: req.path,
      method: req.method,
    });
  }

  if (result.error === "schoolId is required" && !options?.suppressMissingScopeTelemetry) {
    trackSecurityEvent("missingTenantScope", { path: req.path, method: req.method });
  }

  return result;
}

export function resolveSocketSchoolId(socket: {
  handshake: { auth?: unknown; headers?: Record<string, unknown> };
  data?: { authContext?: AuthContext };
}): { schoolId?: string; error?: string } {
  const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
  const result = resolveSocketTenant({
    authSchoolId: socket.data?.authContext?.schoolId,
    handshakeSchoolId:
      auth.schoolId ?? readHeaderValue(socket.handshake.headers?.["x-school-id"]),
    requireTenant: REQUIRE_TENANT,
    defaultSchoolId: DEFAULT_SCHOOL_ID,
  });

  if (result.error?.includes("mismatch")) {
    trackSecurityEvent("socketTenantMismatch", {
      authSchoolId: normalizeSchoolId(socket.data?.authContext?.schoolId),
      requestedSchoolId: normalizeSchoolId(
        auth.schoolId ?? readHeaderValue(socket.handshake.headers?.["x-school-id"]),
      ),
    });
  }

  if (result.error === "schoolId is required") {
    trackSecurityEvent("missingTenantScope", { transport: "socket" });
  }

  return result;
}

export function getSchoolIdFromRequest(req: Request): string {
  const resolved = resolveRequestSchoolId(req);
  if (!resolved.schoolId) {
    throw new Error(resolved.error ?? "schoolId is required");
  }
  return resolved.schoolId;
}

export function getSchoolIdFromSocket(socket: {
  handshake: { auth?: unknown; headers?: Record<string, unknown> };
  data?: { authContext?: AuthContext };
}): string | null {
  const resolved = resolveSocketSchoolId(socket);
  return resolved.schoolId ?? null;
}

// ---------------------------------------------------------------------------
// Auth school ID bootstrap
// ---------------------------------------------------------------------------

function schoolScopeHasData(schoolId: string): boolean {
  return Boolean(
    getLocalAuthAccountsByScope({ schoolId }).length ||
      getOnboardingAccountStateByScope({ schoolId }) ||
      getOrganizationProfileByScope({ schoolId }) ||
      getOrganizationMembersByScope({ schoolId }).length ||
      getRosterTeamsByScope({ schoolId }).length,
  );
}

export function allocateBootstrapSchoolId(seed: string): string {
  const base = normalizeSchoolId(seed) || `school-${randomBytes(3).toString("hex")}`;
  let candidate = base;
  let attempt = 1;
  while (schoolScopeHasData(candidate)) {
    const suffix = String(attempt);
    candidate = `${base.slice(0, Math.max(1, 64 - suffix.length - 1))}-${suffix}`;
    attempt += 1;
  }
  return candidate;
}

export function buildBootstrapSchoolSeed(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const raw = sanitizeTextField(candidate, 120);
    if (!raw) {
      continue;
    }
    const source = raw.includes("@") ? (raw.split("@")[0] ?? raw) : raw;
    const seed = normalizeSchoolId(buildOrganizationSlug(source));
    if (seed && seed !== DEFAULT_SCHOOL_ID) {
      return seed;
    }
  }
  return "";
}

export function resolveAuthSchoolId(
  req: Request,
  payload: Record<string, unknown>,
  email: string,
): { schoolId?: string; error?: string; status?: number } {
  const resolved = resolveRequestSchoolId(req, { suppressMissingScopeTelemetry: true });
  if (resolved.schoolId) {
    return { schoolId: resolved.schoolId };
  }

  if (!isPublicAuthBootstrapRequest(req)) {
    return resolved;
  }

  const matches = getLocalAuthAccountsByEmailAcrossSchools(email);
  if (req.path.endsWith("/auth/login")) {
    if (matches.length === 1) {
      return { schoolId: matches[0]?.schoolId };
    }
    if (matches.length > 1) {
      return {
        status: 409,
        error:
          "Multiple workspaces match this email. Reopen your school link or include schoolId.",
      };
    }
    return { status: 401, error: "Invalid email or password" };
  }

  if (matches.length > 0) {
    return {
      status: 409,
      error: "An account with that email already exists. Sign in instead.",
    };
  }

  return {
    schoolId: allocateBootstrapSchoolId(
      buildBootstrapSchoolSeed(
        payload.schoolId,
        payload.schoolName,
        payload.organizationName,
        payload.teamName,
        email,
      ),
    ),
  };
}
