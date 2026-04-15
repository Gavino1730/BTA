import type { Express, NextFunction, Request, Response } from "express";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

type InvitationTokenRecord = {
  token: string;
  schoolId: string;
  email: string;
  fullName: string;
  role: string;
  organizationName: string;
  expiresAt: number;
};

type PasswordResetTokenRecord = {
  token: string;
  schoolId: string;
  accountId: string;
  email: string;
  expiresAt: number;
  createdAt: number;
};

interface RegisterAuthCoreRoutesOptions {
  authRateLimiter: Middleware;
  resolveRequestSchoolId: (req: Request, options?: { suppressMissingScopeTelemetry?: boolean }) => { schoolId?: string; error?: string; status?: number };
  getSchoolIdFromRequest: (req: Request) => string;
  getAuthContextFromRequest: (req: Request) => unknown;
  buildOnboardingCompletionSummary: (schoolId: string) => unknown;
  buildSuggestedCoachIdentity: (authContext: any) => { coachName?: string; coachEmail?: string } | null;
  resolveCurrentOrganizationMember: (req: Request, schoolId: string) => unknown;
  getLocalAuthAccountByEmail: (email: string, scope: { schoolId: string }) => any;
  buildAuthSessionResponse: (schoolId: string, account: any, currentMember: any, token?: string | null) => unknown;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  resolveAuthSchoolId: (req: Request, payload: Record<string, unknown>, email: string) => { schoolId?: string; error?: string; status?: number };
  pruneExpiredInvitationTokens: (now?: number) => void;
  invitationTokens: Map<string, InvitationTokenRecord>;
  isValidEmail: (value: string) => boolean;
  hashPassword: (password: string, salt?: string) => { passwordHash: string; passwordSalt: string };
  getOrganizationMembersByScope: (scope: { schoolId: string }) => Array<{ email: string; organizationId?: string; role: string; status: string }>;
  saveLocalAuthAccount: (account: any, scope: { schoolId: string }) => any;
  activateKnownMemberForAccount: (schoolId: string, account: any) => any;
  shouldSyncPrimaryCoachIdentity: (role: any) => boolean;
  saveOnboardingAccountState: (input: any, scope: { schoolId: string }) => unknown;
  issueLocalAuthToken: (input: { subject: string; email: string; name: string; schoolId: string; role: string }) => string | null;
  buildInvitePath: (schoolId: string, token: string) => string;
  verifyPassword: (password: string, passwordSalt: string, passwordHash: string) => boolean;
  recordLocalAuthLogin: (accountId: string, scope: { schoolId: string }) => any;
  pruneExpiredPasswordResetTokens: (now?: number) => void;
  passwordResetTokens: Map<string, PasswordResetTokenRecord>;
  generatePasswordResetToken: () => string;
  passwordResetTokenTtlMs: number;
  deliverPasswordResetEmail: (req: Request, schoolId: string, account: any, token: string) => Promise<unknown>;
  buildResetPath: (schoolId: string, token: string) => string;
  exposePasswordResetToken: boolean;
  getLocalAuthAccountsByScope: (scope: { schoolId: string }) => any[];
  billingGuardBeforeRegister?: (schoolId: string) => { allowed: boolean; error?: string; status?: number };
}

export function registerAuthCoreRoutes(app: Express, options: RegisterAuthCoreRoutesOptions): void {
  app.get("/api/auth/session", (req, res) => {
    const schoolResolution = options.resolveRequestSchoolId(req, { suppressMissingScopeTelemetry: true });
    const schoolId = schoolResolution.schoolId;
    const authContext = options.getAuthContextFromRequest(req);

    if (!schoolId && !authContext) {
      res.json({
        authenticated: false,
        token: null,
        user: null,
        currentMember: null,
        onboarding: {
          completed: false,
          hasAccount: false,
          hasProfile: false,
          hasTeam: false,
          teamCount: 0,
        },
      });
      return;
    }

    if (!schoolId) {
      res.status(schoolResolution.status ?? 400).json({ error: schoolResolution.error ?? "schoolId is required" });
      return;
    }

    if (!authContext) {
      res.json({
        authenticated: false,
        token: null,
        user: null,
        currentMember: null,
        onboarding: options.buildOnboardingCompletionSummary(schoolId),
      });
      return;
    }

    const suggested = options.buildSuggestedCoachIdentity(authContext);
    const email = options.sanitizeTextField(suggested?.coachEmail, 160).toLowerCase();
    const currentMember = options.resolveCurrentOrganizationMember(req, schoolId);
    const localAccount = email ? options.getLocalAuthAccountByEmail(email, { schoolId }) : null;

    if (localAccount) {
      res.json(options.buildAuthSessionResponse(schoolId, localAccount, currentMember));
      return;
    }

    res.json({
      authenticated: true,
      token: null,
      user: {
        accountId: options.sanitizeTextField((authContext as { subject?: string } | undefined)?.subject, 120) || email || "authenticated-user",
        email: email || undefined,
        fullName: options.sanitizeTextField(suggested?.coachName, 120) || undefined,
        role: (currentMember as { role?: string } | null)?.role ?? (options.sanitizeTextField((authContext as { role?: string } | undefined)?.role, 40) || "coach"),
        status: (currentMember as { status?: string } | null)?.status ?? "active",
        schoolId,
        organizationId: (currentMember as { organizationId?: string } | null)?.organizationId,
        lastLoginAtIso: null,
      },
      currentMember,
      onboarding: options.buildOnboardingCompletionSummary(schoolId),
    });
  });

  app.post("/api/auth/register", options.authRateLimiter, (req, res) => {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const inviteToken = String(payload.inviteToken ?? "").trim();
    const fullName = options.sanitizeTextField(payload.fullName ?? payload.coachName, 120);
    const email = options.sanitizeTextField(payload.email ?? payload.coachEmail, 160).toLowerCase();
    const password = String(payload.password ?? "").trim();

    if (!fullName || !email || !password) {
      res.status(400).json({ error: "fullName, email, and password are required" });
      return;
    }

    const schoolResolution = options.resolveAuthSchoolId(req, payload, email);
    if (!schoolResolution.schoolId) {
      res.status(schoolResolution.status ?? 400).json({ error: schoolResolution.error ?? "schoolId is required" });
      return;
    }

    const schoolId = schoolResolution.schoolId;

    let invitation: InvitationTokenRecord | null = null;
    if (inviteToken) {
      options.pruneExpiredInvitationTokens();
      invitation = options.invitationTokens.get(inviteToken) ?? null;
      if (!invitation || invitation.schoolId !== schoolId) {
        res.status(400).json({ error: "Invalid or expired invite token" });
        return;
      }
      if (invitation.email !== email) {
        res.status(400).json({ error: "Invite token does not match this email address" });
        return;
      }
    }

    if (!options.isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    if (options.billingGuardBeforeRegister) {
      const billingCheck = options.billingGuardBeforeRegister(schoolId);
      if (!billingCheck.allowed) {
        res.status(billingCheck.status ?? 402).json({ error: billingCheck.error ?? "Complete checkout before creating your account" });
        return;
      }
    }

    if (options.getLocalAuthAccountByEmail(email, { schoolId })) {
      res.status(409).json({ error: "An account with that email already exists" });
      return;
    }

    const existingMember = options.getOrganizationMembersByScope({ schoolId }).find((member) => member.email === email) ?? null;
    const { passwordHash, passwordSalt } = options.hashPassword(password);
    const account = options.saveLocalAuthAccount({
      email,
      fullName,
      passwordHash,
      passwordSalt,
      organizationId: existingMember?.organizationId,
      role: existingMember?.role ?? "owner",
      status: existingMember?.status === "invited" ? "invited" : "active",
    }, { schoolId });
    const currentMember = options.activateKnownMemberForAccount(schoolId, account);
    const resolvedRole = currentMember?.role ?? account.role;
    if (options.shouldSyncPrimaryCoachIdentity(resolvedRole)) {
      options.saveOnboardingAccountState({
        organization: { schoolId },
        primaryCoach: {
          schoolId,
          fullName,
          email,
          role: "owner",
          organizationId: existingMember?.organizationId ?? "",
          accountId: account.accountId,
          createdAtIso: "",
          updatedAtIso: "",
        },
      }, { schoolId });
    }

    const token = options.issueLocalAuthToken({
      subject: account.accountId,
      email: account.email,
      name: account.fullName,
      schoolId,
      role: resolvedRole,
    });

    if (!token) {
      res.status(500).json({ error: "Local auth token signing is not configured" });
      return;
    }

    if (invitation) {
      options.invitationTokens.delete(invitation.token);
    }

    res.status(201).json(options.buildAuthSessionResponse(schoolId, account, currentMember, token));
  });

  app.post("/api/auth/login", options.authRateLimiter, (req, res) => {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const email = options.sanitizeTextField(payload.email, 160).toLowerCase();
    const password = String(payload.password ?? "").trim();

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    const schoolResolution = options.resolveAuthSchoolId(req, payload, email);
    if (!schoolResolution.schoolId) {
      res.status(schoolResolution.status ?? 400).json({ error: schoolResolution.error ?? "schoolId is required" });
      return;
    }

    const schoolId = schoolResolution.schoolId;

    const account = options.getLocalAuthAccountByEmail(email, { schoolId });
    if (!account || !options.verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const refreshedAccount = options.recordLocalAuthLogin(account.accountId, { schoolId }) ?? account;
    const currentMember = options.activateKnownMemberForAccount(schoolId, refreshedAccount);
    const resolvedRole = currentMember?.role ?? refreshedAccount.role;
    if (options.shouldSyncPrimaryCoachIdentity(resolvedRole)) {
      options.saveOnboardingAccountState({
        organization: { schoolId },
        primaryCoach: {
          schoolId,
          fullName: refreshedAccount.fullName,
          email: refreshedAccount.email,
          role: "owner",
          organizationId: refreshedAccount.organizationId ?? "",
          accountId: refreshedAccount.accountId,
          createdAtIso: "",
          updatedAtIso: "",
        },
      }, { schoolId });
    }

    const token = options.issueLocalAuthToken({
      subject: refreshedAccount.accountId,
      email: refreshedAccount.email,
      name: refreshedAccount.fullName,
      schoolId,
      role: resolvedRole,
    });

    if (!token) {
      res.status(500).json({ error: "Local auth token signing is not configured" });
      return;
    }

    res.json(options.buildAuthSessionResponse(schoolId, refreshedAccount, currentMember, token));
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.status(204).send();
  });

  app.get("/api/auth/invitations/:token", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const token = options.sanitizeTextField(req.params.token, 120);

    options.pruneExpiredInvitationTokens();
    const invitation = options.invitationTokens.get(token);
    if (!invitation || invitation.schoolId !== schoolId) {
      res.status(404).json({ error: "Invitation not found or expired" });
      return;
    }

    res.json({
      invitation: {
        email: invitation.email,
        fullName: invitation.fullName,
        role: invitation.role,
        organizationName: invitation.organizationName,
        expiresAtIso: new Date(invitation.expiresAt).toISOString(),
        invitePath: options.buildInvitePath(schoolId, invitation.token),
      },
    });
  });

  app.post("/api/auth/password-reset/request", options.authRateLimiter, async (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const email = options.sanitizeTextField(payload.email, 160).toLowerCase();

    if (!email || !options.isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }

    options.pruneExpiredPasswordResetTokens();
    const account = options.getLocalAuthAccountByEmail(email, { schoolId });
    if (!account) {
      res.json({ message: "If this email exists for your organization, reset instructions have been sent." });
      return;
    }

    for (const [token, record] of options.passwordResetTokens.entries()) {
      if (record.schoolId === schoolId && record.accountId === account.accountId) {
        options.passwordResetTokens.delete(token);
      }
    }

    const token = options.generatePasswordResetToken();
    const now = Date.now();
    options.passwordResetTokens.set(token, {
      token,
      schoolId,
      accountId: account.accountId,
      email: account.email,
      createdAt: now,
      expiresAt: now + options.passwordResetTokenTtlMs,
    });

    try {
      await options.deliverPasswordResetEmail(req, schoolId, account, token);
    } catch (error) {
      console.warn("[realtime-api] Failed to deliver password reset email", error);
    }

    res.json({
      message: "If this email exists for your organization, reset instructions have been sent.",
      expiresInMinutes: Math.floor(options.passwordResetTokenTtlMs / 60000),
      resetPath: options.buildResetPath(schoolId, token),
      ...(options.exposePasswordResetToken ? { resetToken: token } : {}),
    });
  });

  app.post("/api/auth/password-reset/confirm", options.authRateLimiter, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const token = String(payload.token ?? "").trim();
    const nextPassword = String(payload.password ?? "").trim();

    if (!token || !nextPassword) {
      res.status(400).json({ error: "token and password are required" });
      return;
    }

    if (nextPassword.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    options.pruneExpiredPasswordResetTokens();
    const resetRecord = options.passwordResetTokens.get(token);
    if (!resetRecord || resetRecord.schoolId !== schoolId) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    const account = options.getLocalAuthAccountsByScope({ schoolId }).find((entry) => entry.accountId === resetRecord.accountId) ?? null;
    if (!account) {
      options.passwordResetTokens.delete(token);
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    const credentials = options.hashPassword(nextPassword);
    options.saveLocalAuthAccount({
      accountId: account.accountId,
      organizationId: account.organizationId,
      email: account.email,
      fullName: account.fullName,
      passwordHash: credentials.passwordHash,
      passwordSalt: credentials.passwordSalt,
      role: account.role,
      status: account.status,
      lastLoginAtIso: account.lastLoginAtIso,
    }, { schoolId });

    options.passwordResetTokens.delete(token);
    res.json({ message: "Password reset successful" });
  });
}
