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

export const apiBase = (import.meta.env.VITE_API ?? resolveDefaultApiBase(defaultHost, defaultOrigin)).replace(/\/+$/, "");
export const operatorBase = (import.meta.env.VITE_OPERATOR_CONSOLE ?? resolveDefaultAppBase(defaultHost, defaultOrigin, 5174)).replace(/\/+$/, "");
export const API_KEY: string = import.meta.env.VITE_API_KEY ?? "";
export const SCHOOL_ID: string = (import.meta.env.VITE_SCHOOL_ID ?? "default").toString().trim() || "default";

export function generateConnectionCode(): string {
  return String(Math.floor(100000 + (Math.random() * 900000)));
}

export function apiKeyHeader(json = false): Record<string, string> {
  const headers: Record<string, string> = { "x-school-id": SCHOOL_ID };
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  }
  return headers;
}
