const defaultHost = typeof window !== "undefined" ? (window.location.hostname || "localhost") : "localhost";

export const apiBase = (import.meta.env.VITE_API ?? "").replace(/\/+$/, "");
export const operatorBase = import.meta.env.VITE_OPERATOR_CONSOLE ?? `http://${defaultHost}:5174`;
export const API_KEY: string = import.meta.env.VITE_API_KEY ?? "";
export const SCHOOL_ID: string = (import.meta.env.VITE_SCHOOL_ID ?? "default").toString().trim() || "default";

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
