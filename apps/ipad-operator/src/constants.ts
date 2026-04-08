import { isLocalNetworkHost } from "@bta/shared-schema";

const defaultHost = window.location.hostname || "localhost";
const defaultOrigin = window.location.origin || `http://${defaultHost}`;

function resolveDefaultAppBase(hostname: string, origin: string, port: number): string {
  if (isLocalNetworkHost(hostname)) {
    return `http://${hostname}:${port}`;
  }
  return origin.replace(/\/+$/, "") || `https://${hostname}`;
}

export const DEFAULT_API = import.meta.env.VITE_API ?? resolveDefaultAppBase(defaultHost, defaultOrigin, 4000);
export const DEFAULT_COACH_DASHBOARD = import.meta.env.VITE_COACH_DASHBOARD ?? resolveDefaultAppBase(defaultHost, defaultOrigin, 5173);
export const DEFAULT_STATS_DASHBOARD = import.meta.env.VITE_STATS_DASHBOARD
  ?? (isLocalNetworkHost(defaultHost) ? resolveDefaultAppBase(defaultHost, defaultOrigin, 4000) : "");
export const DEFAULT_SCHOOL_ID = (import.meta.env.VITE_SCHOOL_ID || "").toString().trim();

export const STORE = "operator-console";
export const OPERATOR_ID_KEY = "operator-console:operator-id";
export const DEVICE_NAME_KEY = "operator-console:device-name";
export const APP_DATA_KEY = "shared-app-data-v3";

export const DEFAULT_HOME_TEAM_COLOR = "#4f8cff";
export const DEFAULT_AWAY_TEAM_COLOR = "#f87171";

export const OPERATOR_ALERT_AUTOCLEAR_MS = 12000;
export const OPERATOR_ALERT_AUTOCLEAR_URGENT_MS = 20000;
