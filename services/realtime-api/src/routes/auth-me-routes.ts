import type { Express, Request, Response } from "express";

export interface RegisterAuthMeRoutesOptions {
  getSchoolIdFromRequest: (req: Request) => string;
  getAuthContextFromRequest: (req: Request) => unknown;
  getLocalAuthAccountsByScope: (scope: { schoolId: string }) => any[];
  saveLocalAuthAccount: (account: any, scope: { schoolId: string }) => any;
  hashPassword: (password: string, salt?: string) => { passwordHash: string; passwordSalt: string };
  verifyPassword: (password: string, passwordSalt: string, passwordHash: string) => boolean;
  deleteLocalAuthAccount: (accountId: string, scope: { schoolId: string }) => boolean;
}

export function registerAuthMeRoutes(app: Express, options: RegisterAuthMeRoutesOptions): void {
  app.get("/api/auth/me", (req, res) => {
    const authContext = options.getAuthContextFromRequest(req) as { subject?: string; claims?: { iat?: number } } | null;
    if (!authContext?.subject) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const schoolId = options.getSchoolIdFromRequest(req);
    const account = options.getLocalAuthAccountsByScope({ schoolId }).find((a: any) => a.accountId === authContext.subject) ?? null;
    if (!account) {
      res.status(401).json({ error: "Account not found" });
      return;
    }

    if (account.sessionInvalidBeforeIso) {
      const iat = authContext.claims?.iat;
      if (typeof iat === "number" && iat * 1000 < Date.parse(account.sessionInvalidBeforeIso)) {
        res.status(401).json({ error: "Session has been revoked" });
        return;
      }
    }

    res.json({
      user: {
        accountId: account.accountId,
        email: account.email,
        fullName: account.fullName,
        profilePhotoDataUrl: account.profilePhotoDataUrl ?? null,
        role: account.role,
      },
    });
  });

  app.put("/api/auth/me", (req, res) => {
    const authContext = options.getAuthContextFromRequest(req) as { subject?: string } | null;
    if (!authContext?.subject) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const schoolId = options.getSchoolIdFromRequest(req);
    const account = options.getLocalAuthAccountsByScope({ schoolId }).find((a: any) => a.accountId === authContext.subject) ?? null;
    if (!account) {
      res.status(401).json({ error: "Account not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const currentPassword = String(payload.currentPassword ?? "").trim();
    const newPassword = String(payload.newPassword ?? "").trim();
    const profilePhotoDataUrl = payload.profilePhotoDataUrl as string | undefined;

    if (currentPassword || newPassword) {
      if (!currentPassword) {
        res.status(400).json({ error: "currentPassword is required to change password" });
        return;
      }
      if (!options.verifyPassword(currentPassword, account.passwordSalt, account.passwordHash)) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
    }

    const updates: Record<string, unknown> = {
      accountId: account.accountId,
      email: account.email,
      fullName: account.fullName,
      organizationId: account.organizationId,
      role: account.role,
      status: account.status,
      lastLoginAtIso: account.lastLoginAtIso,
      sessionInvalidBeforeIso: account.sessionInvalidBeforeIso,
    };

    if (newPassword) {
      if (newPassword.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }
      const credentials = options.hashPassword(newPassword);
      updates.passwordHash = credentials.passwordHash;
      updates.passwordSalt = credentials.passwordSalt;
    }

    if (profilePhotoDataUrl !== undefined) {
      updates.profilePhotoDataUrl = profilePhotoDataUrl;
    }

    const saved = options.saveLocalAuthAccount(updates, { schoolId });
    res.json({
      user: {
        accountId: saved.accountId,
        email: saved.email,
        fullName: saved.fullName,
        profilePhotoDataUrl: saved.profilePhotoDataUrl ?? null,
        role: saved.role,
      },
    });
  });

  app.post("/api/auth/logout-all", (req, res) => {
    const authContext = options.getAuthContextFromRequest(req) as { subject?: string } | null;
    if (!authContext?.subject) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const schoolId = options.getSchoolIdFromRequest(req);
    const account = options.getLocalAuthAccountsByScope({ schoolId }).find((a: any) => a.accountId === authContext.subject) ?? null;
    if (!account) {
      res.status(401).json({ error: "Account not found" });
      return;
    }

    options.saveLocalAuthAccount({
      accountId: account.accountId,
      email: account.email,
      fullName: account.fullName,
      organizationId: account.organizationId,
      role: account.role,
      status: account.status,
      lastLoginAtIso: account.lastLoginAtIso,
      sessionInvalidBeforeIso: new Date().toISOString(),
    }, { schoolId });

    res.status(204).send();
  });

  app.delete("/api/auth/me", (req, res) => {
    const authContext = options.getAuthContextFromRequest(req) as { subject?: string } | null;
    if (!authContext?.subject) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const schoolId = options.getSchoolIdFromRequest(req);
    const account = options.getLocalAuthAccountsByScope({ schoolId }).find((a: any) => a.accountId === authContext.subject) ?? null;
    if (!account) {
      res.status(401).json({ error: "Account not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const currentPassword = String(payload.currentPassword ?? "").trim();
    const confirmation = String(payload.confirmation ?? "").trim();

    if (confirmation !== "DELETE") {
      res.status(400).json({ error: "confirmation must be 'DELETE'" });
      return;
    }

    if (!options.verifyPassword(currentPassword, account.passwordSalt, account.passwordHash)) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    options.deleteLocalAuthAccount(account.accountId, { schoolId });
    res.status(204).send();
  });
}
