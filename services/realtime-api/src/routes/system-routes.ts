import type { Express, NextFunction, Request, Response } from "express";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

interface RegisterHealthRouteOptions {
  getPersistenceStatus: () => {
    backend: string;
    durable: boolean;
    connected: boolean;
    lastRestoreAtIso: string | null;
    lastSuccessfulWriteAtIso: string | null;
    warning?: string;
    dataFile?: string;
  };
  strictPersistenceInit: boolean;
  buildCommitSha: string;
  apiKey?: string;
  writeApiKey?: string;
  isJwtAuthEnabled: () => boolean;
}

interface SecurityTelemetrySnapshot {
  requestTenantMismatch: number;
  socketTenantMismatch: number;
  missingTenantScope: number;
  unauthorizedHttp: number;
  unauthorizedSocket: number;
  forbiddenWriteRole: number;
}

interface RegisterAdminRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSecurityTelemetry: () => SecurityTelemetrySnapshot;
  renderPrometheusSecurityMetrics: () => string;
  getSchoolIdFromRequest: (req: Request) => string;
  resetAllData: (options: { schoolId: string }) => void;
  clearOperatorLinksForSchool: (schoolId: string) => void;
}

export function registerHealthRoute(app: Express, options: RegisterHealthRouteOptions): void {
  app.get("/health", (_req, res) => {
    const persistenceStatus = options.getPersistenceStatus();
    res.json({
      status: "ok",
      uptime: Math.round(process.uptime()),
      persistence: {
        backend: persistenceStatus.backend,
        durable: persistenceStatus.durable,
        connected: persistenceStatus.connected,
        lastRestoreAtIso: persistenceStatus.lastRestoreAtIso,
        lastSuccessfulWriteAtIso: persistenceStatus.lastSuccessfulWriteAtIso,
        warning: persistenceStatus.warning,
        dataFile: persistenceStatus.dataFile,
      },
      auth: {
        apiKey: Boolean(options.apiKey),
        writeApiKey: Boolean(options.writeApiKey),
        jwt: options.isJwtAuthEnabled(),
      },
      runtime: {
        strictPersistenceInit: options.strictPersistenceInit,
      },
      build: {
        commitSha: options.buildCommitSha,
      },
    });
  });
}

export function registerAdminRoutes(app: Express, options: RegisterAdminRoutesOptions): void {
  app.get("/admin/security-metrics", options.requireApiKey, options.requireWriteRole, (_req, res) => {
    res.json({ ...options.getSecurityTelemetry() });
  });

  app.get("/admin/security-metrics/prometheus", options.requireApiKey, options.requireWriteRole, (_req, res) => {
    res.type("text/plain; version=0.0.4").send(options.renderPrometheusSecurityMetrics());
  });

  app.delete("/admin/reset", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    options.resetAllData({ schoolId });
    options.clearOperatorLinksForSchool(schoolId);
    res.json({ ok: true, message: `All game sessions and roster data cleared for school ${schoolId}.` });
  });
}
