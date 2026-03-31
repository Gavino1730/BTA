export interface TenantResolutionInput {
  authSchoolId?: unknown;
  headerSchoolId?: unknown;
  querySchoolId?: unknown;
  requireTenant: boolean;
  defaultSchoolId: string;
}

export interface TenantResolutionResult {
  schoolId?: string;
  error?: string;
  status?: number;
}

const WRITE_ROLES = new Set(["admin", "coach", "operator"]);

export function normalizeSchoolId(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.replace(/[^a-z0-9_-]/g, "").slice(0, 64);
  return normalized || undefined;
}

export function readHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

export function resolveRequestTenant(input: TenantResolutionInput): TenantResolutionResult {
  const authSchoolId = normalizeSchoolId(input.authSchoolId);
  const headerSchoolId = normalizeSchoolId(input.headerSchoolId);
  const querySchoolId = normalizeSchoolId(input.querySchoolId);
  const requestedSchoolId = headerSchoolId ?? querySchoolId;

  if (authSchoolId && requestedSchoolId && authSchoolId !== requestedSchoolId) {
    return { status: 403, error: "Tenant scope mismatch between token and request" };
  }

  const schoolId = authSchoolId ?? requestedSchoolId ?? (input.requireTenant ? undefined : input.defaultSchoolId);
  if (!schoolId) {
    return { status: 400, error: "schoolId is required" };
  }

  return { schoolId };
}

export function resolveSocketTenant(input: {
  authSchoolId?: unknown;
  handshakeSchoolId?: unknown;
  requireTenant: boolean;
  defaultSchoolId: string;
}): TenantResolutionResult {
  const authSchoolId = normalizeSchoolId(input.authSchoolId);
  const requestedSchoolId = normalizeSchoolId(input.handshakeSchoolId);

  if (authSchoolId && requestedSchoolId && authSchoolId !== requestedSchoolId) {
    return { error: "Tenant scope mismatch between token and socket handshake" };
  }

  const schoolId = authSchoolId ?? requestedSchoolId ?? (input.requireTenant ? undefined : input.defaultSchoolId);
  if (!schoolId) {
    return { error: "schoolId is required" };
  }

  return { schoolId };
}

export function hasWriteRole(role: string | undefined): boolean {
  if (!role) {
    return false;
  }

  return WRITE_ROLES.has(role.trim().toLowerCase());
}
