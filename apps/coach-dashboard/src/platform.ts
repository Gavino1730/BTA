const defaultHost = typeof window !== "undefined" ? (window.location.hostname || "localhost") : "localhost";
const defaultOrigin = typeof window !== "undefined" ? (window.location.origin || `http://${defaultHost}`) : `http://${defaultHost}`;

function isLocalNetworkHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "0.0.0.0"
    || normalized === "::1"
    || normalized === "[::1]"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
    || /^10(?:\.\d{1,3}){3}$/.test(normalized)
    || /^192\.168(?:\.\d{1,3}){2}$/.test(normalized)
    || /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(normalized)
    || normalized.endsWith(".local")
    || !normalized.includes(".");
}

export function resolveDefaultAppBase(hostname: string, origin: string, port: number): string {
  if (isLocalNetworkHost(hostname)) {
    return `http://${hostname}:${port}`;
  }

  return origin.replace(/\/+$/, "") || `https://${hostname}`;
}

export function resolveDefaultApiBase(hostname: string, origin: string): string {
  return resolveDefaultAppBase(hostname, origin, 4000);
}

export function resolveDefaultSchoolId(hostname: string): string {
  return isLocalNetworkHost(hostname) ? "default" : "";
}

function normalizeSchoolId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

export function resolveActiveSchoolId(locationSearch?: string): string {
  const params = typeof locationSearch === "string"
    ? new URLSearchParams(locationSearch)
    : typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;

  return normalizeSchoolId(
    params?.get("schoolId")
      ?? readStoredAuthSession()?.schoolId
      ?? import.meta.env.VITE_SCHOOL_ID
      ?? resolveDefaultSchoolId(defaultHost)
  );
}

export const apiBase = (import.meta.env.VITE_API ?? resolveDefaultApiBase(defaultHost, defaultOrigin)).replace(/\/+$/, "");
export const operatorBase = (import.meta.env.VITE_OPERATOR_CONSOLE ?? resolveDefaultAppBase(defaultHost, defaultOrigin, 5174)).replace(/\/+$/, "");
export const API_KEY: string = import.meta.env.VITE_API_KEY ?? "";
export const AUTH_SESSION_KEY = "bta.coach.authSession";
export const SCHOOL_ID: string = resolveActiveSchoolId();

const AUTH_COOKIE_NAME = "bta_coach_auth";
const AUTH_COOKIE_DAYS = 90;

function writeAuthCookie(value: string): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + AUTH_COOKIE_DAYS);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Strict${secure}`;
}

function readAuthCookieRaw(): string | null {
  const prefix = `${AUTH_COOKIE_NAME}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function clearAuthCookie(): void {
  document.cookie = `${AUTH_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
}

export interface StoredAuthSession {
  token: string;
  email?: string;
  fullName?: string;
  role?: string;
  schoolId?: string;
  lastLoginAtIso?: string | null;
}

export function generateConnectionCode(): string {
  return String(Math.floor(100000 + (Math.random() * 900000)));
}

export function normalizeConnectionCode(value: string | null | undefined): string {
  const digitsOnly = (value ?? "").replace(/\D/g, "").slice(0, 6);
  return /^\d{6}$/.test(digitsOnly) ? digitsOnly : "";
}

export function readStoredAuthSession(): StoredAuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  // Primary: try localStorage first
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredAuthSession;
      if (typeof parsed?.token === "string" && parsed.token.trim()) {
        return {
          ...parsed,
          token: parsed.token.trim(),
          schoolId: normalizeSchoolId(parsed.schoolId) || undefined,
        };
      }
    }
  } catch {
    // fall through to cookie fallback
  }

  // Fallback: try cookie. iOS WebKit can clear localStorage for home screen
  // web apps during suspend/eviction; cookies with explicit expiry survive longer.
  try {
    const raw = readAuthCookieRaw();
    if (raw) {
      const parsed = JSON.parse(raw) as StoredAuthSession;
      if (typeof parsed?.token === "string" && parsed.token.trim()) {
        // Restore localStorage from the cookie so subsequent reads are fast.
        try { window.localStorage.setItem(AUTH_SESSION_KEY, raw); } catch { /* ignore */ }
        return {
          ...parsed,
          token: parsed.token.trim(),
          schoolId: normalizeSchoolId(parsed.schoolId) || undefined,
        };
      }
    }
  } catch {
    // cookie unreadable
  }

  return null;
}

export function storeAuthSession(session: StoredAuthSession | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!session?.token?.trim()) {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    clearAuthCookie();
    return;
  }

  const serialized = JSON.stringify({
    ...session,
    token: session.token.trim(),
    schoolId: normalizeSchoolId(session.schoolId) || undefined,
  });

  window.localStorage.setItem(AUTH_SESSION_KEY, serialized);
  writeAuthCookie(serialized);
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_SESSION_KEY);
  clearAuthCookie();
}

export function apiKeyHeader(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const schoolId = resolveActiveSchoolId();
  if (schoolId) {
    headers["x-school-id"] = schoolId;
  }
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  }
  const session = readStoredAuthSession();
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  return headers;
}
