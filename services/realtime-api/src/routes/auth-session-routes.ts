import type { Express, Request, Response } from "express";
import { registerAuthMeRoutes, type RegisterAuthMeRoutesOptions } from "./auth-me-routes.js";

type RejectLegacyFn = (res: Response, action: "register" | "login" | "password reset") => boolean;

export interface RegisterAuthSessionRoutesOptions extends RegisterAuthMeRoutesOptions {
  authRateLimiter: (req: Request, res: Response, next: () => void) => void;
  resolveRequestSchoolId: (req: Request, options?: { suppressMissingScopeTelemetry?: boolean }) => { schoolId?: string; error?: string; status?: number };
  getSchoolIdFromRequest: (req: Request) => string;
  getAuthContextFromRequest: (req: Request) => unknown;
  buildOnboardingCompletionSummary: (schoolId: string) => unknown;
  buildSuggestedCoachIdentity: (authContext: any) => { coachName?: string; coachEmail?: string } | null;
  resolveCurrentOrganizationMember: (req: Request, schoolId: string) => unknown;
  getLocalAuthAccountByEmail: (email: string, scope: { schoolId: string }) => any;
  buildAuthSessionResponse: (schoolId: string, account: any, currentMember: any, token?: string | null) => unknown;
  getUserWorkspaceProfile: (userId: string) => { lastSchoolId?: string } | null;
  listSchoolMembershipsForUser: (input: { userId?: string; email?: string }) => Array<{ schoolId: string; role: string }>;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  resolveAuthSchoolId: (req: Request, payload: Record<string, unknown>, email: string) => { schoolId?: string; error?: string; status?: number };
  verifyPassword: (password: string, passwordSalt: string, passwordHash: string) => boolean;
  recordLocalAuthLogin: (accountId: string, scope: { schoolId: string }) => any;
  activateKnownMemberForAccount: (schoolId: string, account: any) => any;
  shouldSyncPrimaryCoachIdentity: (role: any) => boolean;
  saveOnboardingAccountState: (input: any, scope: { schoolId: string }) => unknown;
  issueLocalAuthToken: (input: { subject: string; email: string; name: string; schoolId: string; role: string }) => string | null;
  pruneExpiredInvitationTokens: (now?: number) => void;
  invitationTokens: Map<string, { token: string; schoolId: string; email: string; fullName: string; role: string; organizationName: string; expiresAt: number }>;
  buildInvitePath: (schoolId: string, token: string, email?: string, fullName?: string) => string;
}

export function registerAuthSessionRoutes(
  app: Express,
  options: RegisterAuthSessionRoutesOptions,
  rejectLegacyLocalAuth: RejectLegacyFn,
): void {
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

    if (!authContext) {
      const resolvedSchoolId = schoolId ?? "";
      res.json({
        authenticated: false,
        token: null,
        user: null,
        currentMember: null,
        onboarding: options.buildOnboardingCompletionSummary(resolvedSchoolId),
      });
      return;
    }

    const suggested = options.buildSuggestedCoachIdentity(authContext);
    const email = options.sanitizeTextField(suggested?.coachEmail, 160).toLowerCase();
    const workspaceMemberships = options.listSchoolMembershipsForUser({
      userId: options.sanitizeTextField((authContext as { subject?: string } | undefined)?.subject, 120) || undefined,
      email: email || undefined,
    });
    const profile = options.getUserWorkspaceProfile(options.sanitizeTextField((authContext as { subject?: string } | undefined)?.subject, 120));
    const resolvedSchoolId = schoolId
      || (profile?.lastSchoolId && workspaceMemberships.some((membership) => membership.schoolId === profile.lastSchoolId)
        ? profile.lastSchoolId
        : workspaceMemberships[0]?.schoolId);

    if (!resolvedSchoolId) {
      res.json({
        authenticated: true,
        token: null,
        user: {
          accountId: options.sanitizeTextField((authContext as { subject?: string } | undefined)?.subject, 120) || email || "authenticated-user",
          email: email || undefined,
          fullName: options.sanitizeTextField(suggested?.coachName, 120) || undefined,
          role: options.sanitizeTextField((authContext as { role?: string } | undefined)?.role, 40) || "coach",
          status: "active",
          schoolId: undefined,
          lastLoginAtIso: null,
        },
        currentMember: null,
        onboarding: {
          completed: false,
          hasAccount: true,
          hasProfile: false,
          hasTeam: false,
          teamCount: 0,
        },
      });
      return;
    }

    const currentMember = options.resolveCurrentOrganizationMember(req, resolvedSchoolId);
    const localAccount = email ? options.getLocalAuthAccountByEmail(email, { schoolId: resolvedSchoolId }) : null;

    if (localAccount) {
      res.json(options.buildAuthSessionResponse(resolvedSchoolId, localAccount, currentMember));
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
        schoolId: resolvedSchoolId,
        organizationId: (currentMember as { organizationId?: string } | null)?.organizationId,
        lastLoginAtIso: null,
      },
      currentMember,
      onboarding: options.buildOnboardingCompletionSummary(resolvedSchoolId),
    });
  });

  app.post("/api/auth/login", options.authRateLimiter, (req, res) => {
    if (rejectLegacyLocalAuth(res, "login")) {
      return;
    }

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
        invitePath: options.buildInvitePath(schoolId, invitation.token, invitation.email, invitation.fullName),
      },
    });
  });

  registerAuthMeRoutes(app, options);
}
