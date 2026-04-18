const SECURITY_METRICS_PUSH_URL = process.env.BTA_SECURITY_METRICS_PUSH_URL?.trim();
const METRICS_PUSH_MIN_INTERVAL_MS = Number(process.env.BTA_SECURITY_METRICS_PUSH_INTERVAL_MS ?? 10000);

// ---------------------------------------------------------------------------
// Security telemetry
// ---------------------------------------------------------------------------

export type SecurityMetricKey =
  | "requestTenantMismatch"
  | "socketTenantMismatch"
  | "missingTenantScope"
  | "unauthorizedHttp"
  | "unauthorizedSocket"
  | "forbiddenWriteRole";

export const securityTelemetry: Record<SecurityMetricKey, number> = {
  requestTenantMismatch: 0,
  socketTenantMismatch: 0,
  missingTenantScope: 0,
  unauthorizedHttp: 0,
  unauthorizedSocket: 0,
  forbiddenWriteRole: 0,
};

// ---------------------------------------------------------------------------
// AI budget telemetry
// ---------------------------------------------------------------------------

export type AiMetricKey =
  | "budgetExceeded"
  | "budgetWarning"
  | "chatSafetyFilter"
  | "statusDegraded";

export const aiTelemetry: Record<AiMetricKey, number> = {
  budgetExceeded: 0,
  budgetWarning: 0,
  chatSafetyFilter: 0,
  statusDegraded: 0,
};

export function trackAiEvent(event: AiMetricKey): void {
  aiTelemetry[event] += 1;
  scheduleMetricsPush();
}

let metricsPushTimer: ReturnType<typeof setTimeout> | null = null;

export function renderPrometheusSecurityMetrics(): string {
  return [
    "# HELP bta_security_request_tenant_mismatch_total Request tenant mismatch denials.",
    "# TYPE bta_security_request_tenant_mismatch_total counter",
    `bta_security_request_tenant_mismatch_total ${securityTelemetry.requestTenantMismatch}`,
    "# HELP bta_security_socket_tenant_mismatch_total Socket tenant mismatch denials.",
    "# TYPE bta_security_socket_tenant_mismatch_total counter",
    `bta_security_socket_tenant_mismatch_total ${securityTelemetry.socketTenantMismatch}`,
    "# HELP bta_security_missing_tenant_scope_total Missing tenant scope denials.",
    "# TYPE bta_security_missing_tenant_scope_total counter",
    `bta_security_missing_tenant_scope_total ${securityTelemetry.missingTenantScope}`,
    "# HELP bta_security_unauthorized_http_total Unauthorized HTTP attempts.",
    "# TYPE bta_security_unauthorized_http_total counter",
    `bta_security_unauthorized_http_total ${securityTelemetry.unauthorizedHttp}`,
    "# HELP bta_security_unauthorized_socket_total Unauthorized socket attempts.",
    "# TYPE bta_security_unauthorized_socket_total counter",
    `bta_security_unauthorized_socket_total ${securityTelemetry.unauthorizedSocket}`,
    "# HELP bta_security_forbidden_write_role_total Forbidden write role attempts.",
    "# TYPE bta_security_forbidden_write_role_total counter",
    `bta_security_forbidden_write_role_total ${securityTelemetry.forbiddenWriteRole}`,
    "",
    "# HELP bta_ai_budget_exceeded_total Number of times AI generation was blocked by a per-game budget cap.",
    "# TYPE bta_ai_budget_exceeded_total counter",
    `bta_ai_budget_exceeded_total ${aiTelemetry.budgetExceeded}`,
    "# HELP bta_ai_budget_warning_total Number of times AI budget crossed the 80% soft-warning threshold.",
    "# TYPE bta_ai_budget_warning_total counter",
    `bta_ai_budget_warning_total ${aiTelemetry.budgetWarning}`,
    "# HELP bta_ai_chat_safety_filter_total Number of AI chat responses rejected by the safety filter.",
    "# TYPE bta_ai_chat_safety_filter_total counter",
    `bta_ai_chat_safety_filter_total ${aiTelemetry.chatSafetyFilter}`,
    "# HELP bta_ai_status_degraded_total Number of times the AI status transitioned to degraded.",
    "# TYPE bta_ai_status_degraded_total counter",
    `bta_ai_status_degraded_total ${aiTelemetry.statusDegraded}`,
    "",
  ].join("\n");
}

async function pushSecurityMetrics(): Promise<void> {
  if (!SECURITY_METRICS_PUSH_URL) {
    return;
  }
  try {
    await fetch(SECURITY_METRICS_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain; version=0.0.4" },
      body: renderPrometheusSecurityMetrics(),
    });
  } catch (error) {
    console.warn("[realtime-api] Failed to push security metrics", error);
  }
}

export function scheduleMetricsPush(): void {
  if (!SECURITY_METRICS_PUSH_URL || metricsPushTimer) {
    return;
  }
  const interval = Number.isFinite(METRICS_PUSH_MIN_INTERVAL_MS)
    ? Math.max(Math.floor(METRICS_PUSH_MIN_INTERVAL_MS), 1000)
    : 10000;
  metricsPushTimer = setTimeout(() => {
    metricsPushTimer = null;
    void pushSecurityMetrics();
  }, interval);
}

export function trackSecurityEvent(event: SecurityMetricKey, details: Record<string, unknown>): void {
  securityTelemetry[event] += 1;
  scheduleMetricsPush();
  console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", service: "realtime-api", message: "security.event", context: { event, ...details } }));
}
