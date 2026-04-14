import { isLocalNetworkHost } from "@bta/shared-schema";

const defaultHost = typeof window !== "undefined" ? (window.location.hostname || "localhost") : "localhost";
const defaultOrigin = typeof window !== "undefined" ? (window.location.origin || `http://${defaultHost}`) : `http://${defaultHost}`;

export function resolveDefaultAppBase(hostname: string, origin: string, port: number): string {
  if (isLocalNetworkHost(hostname)) {
    return `http://${hostname}:${port}`;
  }

  return origin.replace(/\/+$/, "") || `https://${hostname}`;
}

export function resolveDefaultApiBase(hostname: string, origin: string): string {
  return resolveDefaultAppBase(hostname, origin, 4000);
}

export function resolveDefaultMarketingBase(hostname: string): string {
  if (isLocalNetworkHost(hostname) || hostname === "localhost") {
    return "http://localhost:3000";
  }

  return "https://btaintel.com";
}

export function resolveDefaultSchoolId(hostname: string): string {
  void hostname;
  return "";
}

export function resolveRuntimeBase(base: string, pageHostname: string, pageProtocol: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  const normalizedHost = trimmed.replace(/api\.btainte1\.com/gi, "api.btaintel.com");
  if (!normalizedHost) {
    return "";
  }

  try {
    const parsed = new URL(normalizedHost);
    if (pageProtocol === "https:" && parsed.protocol === "http:" && !isLocalNetworkHost(parsed.hostname)) {
      parsed.protocol = "https:";
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    if (pageProtocol === "https:" && normalizedHost.startsWith("http://") && !isLocalNetworkHost(pageHostname)) {
      return normalizedHost.replace(/^http:\/\//, "https://");
    }
    return normalizedHost;
  }
}

function normalizeSchoolId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

export function formatSchoolNameFromId(schoolId: string): string {
  const clean = normalizeSchoolId(schoolId);
  if (!clean) {
    return "Our Team";
  }

  return clean
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseJsonSafely(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

function readClaimPath(payload: Record<string, unknown>, path: string): unknown {
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

function decodeSchoolIdFromToken(token: string | undefined): string {
  if (!token) {
    return "";
  }

  const normalized = token.trim();
  if (!normalized) {
    return "";
  }

  // Local tokens use bta.<base64url-payload>.<signature>
  if (normalized.startsWith("bta.")) {
    const [, encodedPayload] = normalized.split(".");
    if (!encodedPayload) {
      return "";
    }
    const payload = parseJsonSafely(decodeBase64Url(encodedPayload));
    return normalizeSchoolId(payload?.schoolId);
  }

  // JWT tokens use header.payload.signature
  const jwtParts = normalized.split(".");
  if (jwtParts.length < 2) {
    return "";
  }
  const payload = parseJsonSafely(decodeBase64Url(jwtParts[1]!));
  if (!payload) {
    return "";
  }

  return normalizeSchoolId(
    readClaimPath(payload, "app_metadata.schoolId")
    ?? payload.schoolId
    ?? payload.school_id
    ?? payload.tenantId
    ?? payload.tenant_id
  );
}

function decodeTokenPayload(token: string | undefined): Record<string, unknown> | null {
  if (!token) {
    return null;
  }

  const normalized = token.trim();
  if (!normalized) {
    return null;
  }

  try {
    if (normalized.startsWith("bta.")) {
      const [, encodedPayload] = normalized.split(".");
      if (!encodedPayload) {
        return null;
      }
      return parseJsonSafely(decodeBase64Url(encodedPayload));
    }

    const jwtParts = normalized.split(".");
    if (jwtParts.length < 2) {
      return null;
    }
    return parseJsonSafely(decodeBase64Url(jwtParts[1]!));
  } catch {
    return null;
  }
}

export function decodeTokenExpiryMs(token: string | undefined): number | null {
  const payload = decodeTokenPayload(token);
  const exp = Number(payload?.exp ?? 0);
  if (!Number.isFinite(exp) || exp <= 0) {
    return null;
  }
  return exp * 1000;
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
      ?? decodeSchoolIdFromToken(readStoredAuthSession()?.token)
      ?? import.meta.env.VITE_SCHOOL_ID
      ?? resolveDefaultSchoolId(defaultHost)
  );
}

const pageProtocol = typeof window !== "undefined" ? window.location.protocol : "http:";

export const apiBase = resolveRuntimeBase(
  import.meta.env.VITE_API ?? resolveDefaultApiBase(defaultHost, defaultOrigin),
  defaultHost,
  pageProtocol,
);
export const operatorBase = resolveRuntimeBase(
  import.meta.env.VITE_OPERATOR_CONSOLE ?? resolveDefaultAppBase(defaultHost, defaultOrigin, 5174),
  defaultHost,
  pageProtocol,
);
export const marketingBase = resolveRuntimeBase(
  import.meta.env.VITE_MARKETING_SITE ?? resolveDefaultMarketingBase(defaultHost),
  defaultHost,
  pageProtocol,
);
export const API_KEY: string = import.meta.env.VITE_API_KEY ?? "";
export const AUTH_SESSION_KEY = "bta.coach.authSession";

export type AuthSessionPersistence = "local" | "session";

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

interface StoreAuthSessionOptions {
  persistence?: AuthSessionPersistence;
}

function getLocalStorageHandle(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorageHandle(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseStoredAuthSession(raw: string | null): StoredAuthSession | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredAuthSession;
    if (typeof parsed?.token !== "string" || !parsed.token.trim()) {
      return null;
    }

    return {
      ...parsed,
      token: parsed.token.trim(),
      schoolId: normalizeSchoolId(parsed.schoolId) || undefined,
    };
  } catch {
    return null;
  }
}

function readStoredAuthSessionFromStorage(storage: Storage | null): StoredAuthSession | null {
  if (!storage) {
    return null;
  }

  try {
    return parseStoredAuthSession(storage.getItem(AUTH_SESSION_KEY));
  } catch {
    return null;
  }
}

function detectStoredAuthSessionPersistence(): AuthSessionPersistence | null {
  if (readStoredAuthSessionFromStorage(getSessionStorageHandle())) {
    return "session";
  }

  if (readStoredAuthSessionFromStorage(getLocalStorageHandle())) {
    return "local";
  }

  return null;
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

  const sessionScoped = readStoredAuthSessionFromStorage(getSessionStorageHandle());
  if (sessionScoped) {
    return sessionScoped;
  }

  const remembered = readStoredAuthSessionFromStorage(getLocalStorageHandle());
  if (remembered) {
    return remembered;
  }

  const cookieSession = parseStoredAuthSession(readAuthCookieRaw());
  if (cookieSession) {
    const localStorageHandle = getLocalStorageHandle();
    if (localStorageHandle) {
      try {
        localStorageHandle.setItem(AUTH_SESSION_KEY, JSON.stringify(cookieSession));
      } catch {
        // ignore storage write failures and still return the recovered session
      }
    }

    return cookieSession;
  }

  return null;
}

export function storeAuthSession(session: StoredAuthSession | null, options: StoreAuthSessionOptions = {}): void {
  if (typeof window === "undefined") {
    return;
  }

  const persistence = options.persistence ?? detectStoredAuthSessionPersistence() ?? "local";
  const localStorageHandle = getLocalStorageHandle();
  const sessionStorageHandle = getSessionStorageHandle();

  try {
    localStorageHandle?.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore storage clear failures
  }

  try {
    sessionStorageHandle?.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore storage clear failures
  }

  clearAuthCookie();

  if (!session?.token?.trim()) {
    return;
  }

  const serialized = JSON.stringify({
    ...session,
    token: session.token.trim(),
    schoolId: normalizeSchoolId(session.schoolId) || undefined,
  });

  if (persistence === "session") {
    try {
      sessionStorageHandle?.setItem(AUTH_SESSION_KEY, serialized);
    } catch {
      // fall back to remembered storage if sessionStorage is unavailable
      try {
        localStorageHandle?.setItem(AUTH_SESSION_KEY, serialized);
        writeAuthCookie(serialized);
      } catch {
        // ignore hard storage failures
      }
    }
    return;
  }

  try {
    localStorageHandle?.setItem(AUTH_SESSION_KEY, serialized);
  } catch {
    // ignore storage write failures and still attempt cookie fallback
  }
  writeAuthCookie(serialized);
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore storage clear failures
  }

  try {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore storage clear failures
  }

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

export async function redirectToBillingIfRequired(response: Response): Promise<boolean> {
  if (response.status !== 402) {
    return false;
  }

  let code = "";
  try {
    const payload = await response.clone().json() as { code?: unknown };
    code = typeof payload.code === "string" ? payload.code : "";
  } catch {
    return false;
  }

  if (code !== "billing_required") {
    return false;
  }

  if (typeof window !== "undefined") {
    window.history.replaceState({}, "", "/billing");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return true;
}

export interface BillingEntitlement {
  paywallEnabled: boolean;
  accessActive: boolean;
  status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete";
  planId: string;
  trialEndsAtIso: string | null;
  currentPeriodEndsAtIso: string | null;
  reason: "paywall_disabled" | "trial_active" | "subscription_active" | "trial_expired" | "inactive_subscription";
}

export async function fetchBillingEntitlement(): Promise<BillingEntitlement | null> {
  const response = await fetch(`${apiBase}/api/billing/entitlement`, {
    headers: apiKeyHeader(),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json() as { entitlement?: BillingEntitlement };
  return payload.entitlement ?? null;
}

export async function fetchBillingPortalUrl(): Promise<string> {
  const response = await fetch(`${apiBase}/api/billing/portal-session`, {
    headers: apiKeyHeader(),
  });

  if (!response.ok) {
    let message = "Could not open portal right now. Please try again.";
    try {
      const payload = await response.json() as { error?: unknown };
      if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      // Keep generic message when API does not return JSON.
    }
    throw new Error(message);
  }

  let payload: { url?: unknown; error?: unknown };
  try {
    payload = await response.json() as { url?: unknown; error?: unknown };
  } catch {
    throw new Error("Billing portal returned an unexpected response. Check API base URL configuration.");
  }

  if (typeof payload.url !== "string" || !payload.url.trim()) {
    if (typeof payload.error === "string" && payload.error.trim()) {
      throw new Error(payload.error);
    }
    throw new Error("Could not open portal right now. Please try again.");
  }

  return payload.url;
}

export interface CouponValidationResult {
  valid: boolean;
  couponId?: string;
  percentOff?: number | null;
  amountOff?: number | null;
  currency?: string | null;
  duration?: string | null;
  durationInMonths?: number | null;
  error?: string;
}

export async function validateCoupon(couponCode: string): Promise<CouponValidationResult | null> {
  const response = await fetch(`${apiBase}/api/billing/validate-coupon`, {
    method: "POST",
    headers: apiKeyHeader(true),
    body: JSON.stringify({ couponCode }),
  });

  if (!response.ok) {
    const error = await response.json() as { error?: string };
    return { valid: false, error: error.error };
  }

  const payload = await response.json() as CouponValidationResult;
  return payload;
}

export async function applyCoupon(couponCode: string): Promise<{ applied: boolean; error?: string }> {
  const response = await fetch(`${apiBase}/api/billing/apply-coupon`, {
    method: "POST",
    headers: apiKeyHeader(true),
    body: JSON.stringify({ couponCode }),
  });

  if (!response.ok) {
    const error = await response.json() as { error?: string };
    return { applied: false, error: error.error };
  }

  return { applied: true };
}

