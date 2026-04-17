import type { Express, NextFunction, Request, Response } from "express";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

interface RegisterAuthAccountRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  requireOrganizationManager: (req: Request, res: Response) => { organizationId?: string; role?: string } | null;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  normalizePersonName: (value: unknown) => string;
  isValidEmail: (value: string) => boolean;
  hashPassword: (password: string, salt?: string) => { passwordHash: string; passwordSalt: string };
  getLocalAuthAccountByEmail: (email: string, scope: { schoolId: string }) => any;
  saveLocalAuthAccount: (account: any, scope: { schoolId: string }) => any;
  getRosterTeamsByScope: (scope: { schoolId: string }) => any[];
  findPlayerRecord: (teams: any[], playerName: string) => { player: any; playerIndex: number; teamIndex: number } | null;
  saveOrganizationMember: (member: any, scope: { schoolId: string }) => any;
  persistSchoolTeams: (schoolId: string, teams: any[]) => any[];
  enableLegacyLocalAuth?: boolean;
}

export function registerAuthAccountRoutes(app: Express, options: RegisterAuthAccountRoutesOptions): void {
  function rejectLegacyLocalAuth(res: Response, action: "coach password reset" | "player account" | "player password reset"): boolean {
    if (options.enableLegacyLocalAuth !== false) {
      return false;
    }

    res.status(410).json({
      error: `Legacy local ${action} is disabled. Use Supabase auth flows instead.`,
      code: "legacy_local_auth_disabled",
    });
    return true;
  }

  app.post("/api/auth/coach-account/reset-password", options.requireApiKey, options.requireWriteRole, (req, res) => {
    if (rejectLegacyLocalAuth(res, "coach password reset")) {
      return;
    }

    const schoolId = options.getSchoolIdFromRequest(req);
    const actingMember = options.requireOrganizationManager(req, res);
    if (!actingMember) {
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const email = options.sanitizeTextField(payload.email, 160).toLowerCase();
    const password = String(payload.password ?? "").trim();

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const account = options.getLocalAuthAccountByEmail(email, { schoolId });
    if (!account || account.role === "player") {
      res.status(404).json({ error: "Coach account not found" });
      return;
    }

    if (account.role === "owner" && actingMember.role !== "owner") {
      res.status(403).json({ error: "Only organization owners can reset owner passwords" });
      return;
    }

    const nextCredentials = options.hashPassword(password);
    const savedAccount = options.saveLocalAuthAccount({
      accountId: account.accountId,
      organizationId: account.organizationId,
      email: account.email,
      fullName: account.fullName,
      passwordHash: nextCredentials.passwordHash,
      passwordSalt: nextCredentials.passwordSalt,
      role: account.role,
      status: account.status,
      lastLoginAtIso: account.lastLoginAtIso,
    }, { schoolId });

    res.json({
      message: "Coach password reset",
      account: {
        accountId: savedAccount.accountId,
        email: savedAccount.email,
        fullName: savedAccount.fullName,
        role: savedAccount.role,
        status: savedAccount.status,
      },
    });
  });

  app.post("/api/auth/player-account", options.requireApiKey, options.requireWriteRole, (req, res) => {
    if (rejectLegacyLocalAuth(res, "player account")) {
      return;
    }

    const schoolId = options.getSchoolIdFromRequest(req);
    const actingMember = options.requireOrganizationManager(req, res);
    if (!actingMember) {
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const playerName = options.normalizePersonName(payload.playerName);
    const email = options.sanitizeTextField(payload.email, 160).toLowerCase();
    const password = String(payload.password ?? "").trim();

    if (!playerName || !email || !password) {
      res.status(400).json({ error: "playerName, email, and password are required" });
      return;
    }

    if (!options.isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    if (options.getLocalAuthAccountByEmail(email, { schoolId })) {
      res.status(409).json({ error: "An account with that email already exists" });
      return;
    }

    const teams = options.getRosterTeamsByScope({ schoolId });
    const record = options.findPlayerRecord(teams, playerName);
    if (!record) {
      res.status(404).json({ error: "Player not found on roster" });
      return;
    }

    const { passwordHash, passwordSalt } = options.hashPassword(password);
    const account = options.saveLocalAuthAccount({
      email,
      fullName: options.sanitizeTextField(payload.fullName, 120) || record.player.name,
      passwordHash,
      passwordSalt,
      organizationId: actingMember.organizationId,
      role: "player",
      status: "active",
    }, { schoolId });

    const member = options.saveOrganizationMember({
      organizationId: actingMember.organizationId,
      authSubject: account.accountId,
      fullName: account.fullName,
      email: account.email,
      role: "player",
      status: "active",
      joinedAtIso: new Date().toISOString(),
    }, { schoolId });

    if (record.player.email !== account.email) {
      const nextTeams = teams.map((team, teamIndex) => teamIndex === record.teamIndex
        ? {
          ...team,
          players: team.players.map((player: any, playerIndex: number) => playerIndex === record.playerIndex
            ? { ...player, email: account.email }
            : player),
        }
        : team);
      options.persistSchoolTeams(schoolId, nextTeams);
    }

    res.status(201).json({
      message: "Player account created",
      account: {
        accountId: account.accountId,
        email: account.email,
        fullName: account.fullName,
        role: account.role,
        status: account.status,
      },
      member,
    });
  });

  app.post("/api/auth/player-account/reset-password", options.requireApiKey, options.requireWriteRole, (req, res) => {
    if (rejectLegacyLocalAuth(res, "player password reset")) {
      return;
    }

    const schoolId = options.getSchoolIdFromRequest(req);
    const actingMember = options.requireOrganizationManager(req, res);
    if (!actingMember) {
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const email = options.sanitizeTextField(payload.email, 160).toLowerCase();
    const password = String(payload.password ?? "").trim();

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const account = options.getLocalAuthAccountByEmail(email, { schoolId });
    if (!account || account.role !== "player") {
      res.status(404).json({ error: "Player account not found" });
      return;
    }

    const nextCredentials = options.hashPassword(password);
    const savedAccount = options.saveLocalAuthAccount({
      accountId: account.accountId,
      organizationId: account.organizationId,
      email: account.email,
      fullName: account.fullName,
      passwordHash: nextCredentials.passwordHash,
      passwordSalt: nextCredentials.passwordSalt,
      role: account.role,
      status: account.status,
      lastLoginAtIso: account.lastLoginAtIso,
    }, { schoolId });

    res.json({
      message: "Player password reset",
      account: {
        accountId: savedAccount.accountId,
        email: savedAccount.email,
        fullName: savedAccount.fullName,
        role: savedAccount.role,
        status: savedAccount.status,
      },
    });
  });
}
