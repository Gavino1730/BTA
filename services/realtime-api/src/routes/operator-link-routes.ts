import type { Express, NextFunction, Request, Response } from "express";
import type { RosterTeam } from "../store.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

type OperatorLinkSetup = {
  gameId?: string;
  myTeamId?: string;
  myTeamName?: string;
  opponentName?: string;
  vcSide: "home" | "away";
  homeTeamColor?: string;
  awayTeamColor?: string;
  dashboardUrl?: string;
  startingLineup?: string[];
  updatedAtIso: string;
  operatorToken?: string;
};

interface RegisterOperatorLinkRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  normalizeConnectionKey: (value: unknown) => string;
  resolveRequestSchoolId: (req: Request, options?: { suppressMissingScopeTelemetry?: boolean }) => {
    schoolId?: string;
    error?: string;
    status?: number;
  };
  listSchoolIdsForConnection: (connectionId: string) => string[];
  getOperatorLinkSetup: (schoolId: string, connectionId: string) => OperatorLinkSetup | null;
  setOperatorLinkSetup: (schoolId: string, connectionId: string, setup: OperatorLinkSetup) => void;
  issueLocalAuthToken: (payload: {
    subject: string;
    email: string;
    schoolId: string;
    role: "operator";
    expiresInHours: number;
  }) => string | null;
  getRosterTeamsByScope: (scope: { schoolId: string }) => RosterTeam[];
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  normalizeTeamColor: (value: unknown) => string | undefined;
  emitOperatorLinkUpdated: (schoolId: string, connectionId: string, response: {
    connectionId: string;
    setup: Omit<OperatorLinkSetup, "operatorToken">;
    teams: RosterTeam[];
  }) => void;
}

export function registerOperatorLinkRoutes(app: Express, options: RegisterOperatorLinkRoutesOptions): void {
  app.get("/api/operator-links/:connectionId", (req, res) => {
    const connectionId = options.normalizeConnectionKey(req.params.connectionId);
    if (!connectionId) {
      res.status(400).json({ error: "connectionId is required" });
      return;
    }

    const tenantResolution = options.resolveRequestSchoolId(req, { suppressMissingScopeTelemetry: true });
    let schoolId = tenantResolution.schoolId;
    if (!schoolId) {
      if (tenantResolution.error && tenantResolution.error !== "schoolId is required") {
        res.status(tenantResolution.status ?? 400).json({ error: tenantResolution.error });
        return;
      }

      const matchingSchoolIds = options.listSchoolIdsForConnection(connectionId);
      if (matchingSchoolIds.length === 0) {
        res.status(404).json({ error: "Connection code not found" });
        return;
      }

      if (matchingSchoolIds.length > 1) {
        res.status(409).json({ error: "Connection code is ambiguous; provide schoolId" });
        return;
      }

      schoolId = matchingSchoolIds[0]!;
    }

    let setup = options.getOperatorLinkSetup(schoolId, connectionId);
    if (!setup) {
      res.status(404).json({ error: "Connection code not found" });
      return;
    }

    const operatorToken = options.issueLocalAuthToken({
      subject: `operator:${connectionId}`,
      email: `operator-${connectionId.toLowerCase()}@system.bta`,
      schoolId,
      role: "operator",
      expiresInHours: 24 * 90,
    }) ?? undefined;

    if (operatorToken) {
      setup = {
        ...setup,
        operatorToken,
        updatedAtIso: new Date().toISOString(),
      };
      options.setOperatorLinkSetup(schoolId, connectionId, setup);
    }

    const { operatorToken: setupOperatorToken, ...publicSetup } = setup;
    res.json({
      connectionId,
      schoolId,
      setup: publicSetup,
      teams: options.getRosterTeamsByScope({ schoolId }),
      operatorToken: setupOperatorToken,
    });
  });

  app.put("/api/operator-links/:connectionId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const connectionId = options.normalizeConnectionKey(req.params.connectionId);
    if (!connectionId) {
      res.status(400).json({ error: "connectionId is required" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const existing = options.getOperatorLinkSetup(schoolId, connectionId);
    const operatorToken = existing?.operatorToken
      ?? options.issueLocalAuthToken({
        subject: `operator:${connectionId}`,
        email: `operator-${connectionId.toLowerCase()}@system.bta`,
        schoolId,
        role: "operator",
        expiresInHours: 24 * 90,
      })
      ?? undefined;

    const hasField = (field: string): boolean => Object.prototype.hasOwnProperty.call(payload, field);
    const mergeSanitizedTextField = (field: string, maxLength: number, fallback?: string): string | undefined => {
      if (!hasField(field)) {
        return fallback;
      }
      return options.sanitizeTextField(payload[field], maxLength) || undefined;
    };

    const setup: OperatorLinkSetup = {
      gameId: mergeSanitizedTextField("gameId", 120, existing?.gameId),
      myTeamId: mergeSanitizedTextField("myTeamId", 120, existing?.myTeamId),
      myTeamName: mergeSanitizedTextField("myTeamName", 120, existing?.myTeamName),
      opponentName: mergeSanitizedTextField("opponentName", 120, existing?.opponentName),
      vcSide:
        payload.vcSide === "away" || payload.vcSide === "home"
          ? payload.vcSide
          : (existing?.vcSide ?? "home"),
      homeTeamColor: hasField("homeTeamColor")
        ? options.normalizeTeamColor(payload.homeTeamColor)
        : existing?.homeTeamColor,
      awayTeamColor: hasField("awayTeamColor")
        ? options.normalizeTeamColor(payload.awayTeamColor)
        : existing?.awayTeamColor,
      dashboardUrl: mergeSanitizedTextField("dashboardUrl", 320, existing?.dashboardUrl),
      startingLineup: hasField("startingLineup") && Array.isArray(payload.startingLineup)
        ? (payload.startingLineup as unknown[]).filter((id): id is string => typeof id === "string" && id.trim().length > 0).slice(0, 10)
        : existing?.startingLineup,
      updatedAtIso: new Date().toISOString(),
      operatorToken,
    };

    options.setOperatorLinkSetup(schoolId, connectionId, setup);

    const { operatorToken: _tok, ...publicSetup } = setup;
    const response = {
      connectionId,
      setup: publicSetup,
      teams: options.getRosterTeamsByScope({ schoolId }),
    };

    options.emitOperatorLinkUpdated(schoolId, connectionId, response);
    res.json({ ...response, operatorToken });
  });
}
