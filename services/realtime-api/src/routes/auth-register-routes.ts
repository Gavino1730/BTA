import type { Express, Request, Response } from "express";

type RejectLegacyFn = (res: Response, action: "register" | "login" | "password reset") => boolean;

interface InvitationTokenRecord {
  token: string;
  schoolId: string;
  email: string;
  fullName: string;
  role: string;
  organizationName: string;
  expiresAt: number;
}

interface PasswordResetTokenRecord {
  token: string;
  schoolId: string;
  accountId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

export interface RegisterAuthRegisterRoutesOptions {
  authRateLimiter: (req: Request, res: Response, next: () => void) => void;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  isValidEmail: (email: string) => boolean;
  resolveAuthSchoolId: (req: Request, payload: Record<string, unknown>, email: string) => { schoolId?: string; error?: string; status?: number };
  getSchoolIdFromRequest: (req: Request) => string;
  getLocalAuthAccountByEmail: (email: string, scope: { schoolId: string }) => any;
  getLocalAuthAccountsByEmailAcrossSchools: (email: string) => any[];
  getLocalAuthAccountsByScope: (scope: { schoolId: string }) => any[];
  getOrganizationMembersByScope: (scope: { schoolId: string }) => any[];
  hashPassword: (password: string, salt?: string) => { passwordHash: string; passwordSalt: string };
  saveLocalAuthAccount: (account: any, scope: { schoolId: string }) => any;
  activateKnownMemberForAccount: (schoolId: string, account: any) => any;
  saveOrganizationMember: (member: any, scope: { schoolId: string }) => any;
  shouldSyncPrimaryCoachIdentity: (role: any) => boolean;
  saveOnboardingAccountState: (input: any, scope: { schoolId: string }) => unknown;
  issueLocalAuthToken: (input: { subject: string; email: string; name: string; schoolId: string; role: string }) => string | null;
  buildAuthSessionResponse: (schoolId: string, account: any, currentMember: any, token?: string | null) => unknown;
  invitationTokens: Map<string, InvitationTokenRecord>;
  pruneExpiredInvitationTokens: (now?: number) => void;
  billingGuardBeforeRegister?: (schoolId: string) => { allowed: boolean; status?: number; error?: string };
  pruneExpiredPasswordResetTokens: (now?: number) => void;
  passwordResetTokens: Map<string, PasswordResetTokenRecord>;
  generatePasswordResetToken: () => string;
  passwordResetTokenTtlMs: number;
  deliverPasswordResetEmail: (req: Request, schoolId: string, account: any, token: string) => Promise<unknown>;
  buildResetPath: (schoolId: string, token: string) => string;
  exposePasswordResetToken?: boolean;
}

export function registerAuthRegisterRoutes(
  app: Express,
  options: RegisterAuthRegisterRoutesOptions,
  rejectLegacyLocalAuth: RejectLegacyFn,
): void {
  app.post("/api/auth/register", options.authRateLimiter, (req, res) => {
    if (rejectLegacyLocalAuth(res, "register")) {
      return;
    }

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

    const crossSchoolAccounts = options.getLocalAuthAccountsByEmailAcrossSchools(email);
    if (crossSchoolAccounts.length > 0) {
      res.status(409).json({ error: "An account with that email already exists. Sign in instead." });
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
    let currentMember = options.activateKnownMemberForAccount(schoolId, account);
    if (!currentMember && account.role === "owner") {
      currentMember = options.saveOrganizationMember({
        organizationId: account.organizationId ?? "",
        authSubject: account.accountId,
        fullName: account.fullName,
        email: account.email,
        role: "owner",
        status: "active",
        joinedAtIso: new Date().toISOString(),
      }, { schoolId });
    }
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

  app.post("/api/auth/password-reset/request", options.authRateLimiter, async (req, res) => {
    if (rejectLegacyLocalAuth(res, "password reset")) {
      return;
    }

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
    if (rejectLegacyLocalAuth(res, "password reset")) {
      return;
    }

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
