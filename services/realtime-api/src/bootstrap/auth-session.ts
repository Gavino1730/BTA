import { randomBytes } from "node:crypto";
import type { Request } from "express";
import type { EmailDeliveryResult } from "../email.js";
import type {
  LocalAuthAccount,
  OnboardingAccountState,
  OrganizationMember,
  OrganizationProfile,
} from "../store.js";

interface PasswordResetTokenRecord {
  token: string;
  schoolId: string;
  accountId: string;
  email: string;
  expiresAt: number;
  createdAt: number;
}

interface InvitationTokenRecord {
  token: string;
  schoolId: string;
  memberId: string;
  email: string;
  fullName: string;
  role: OrganizationMember["role"];
  organizationName: string;
  expiresAt: number;
  createdAt: number;
}

interface AuthSessionDependencies {
  resolveCoachRedirectOrigin: (req: Request) => string;
  sendTransactionalEmail: (input: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<EmailDeliveryResult>;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  getOnboardingAccountStateByScope: (scope: { schoolId: string }) => OnboardingAccountState | null;
  getOrganizationProfileByScope: (scope: { schoolId: string }) => OrganizationProfile | null;
}

export function createAuthSessionBootstrap(deps: AuthSessionDependencies): {
  passwordResetTokens: Map<string, PasswordResetTokenRecord>;
  invitationTokens: Map<string, InvitationTokenRecord>;
  passwordResetTokenTtlMs: number;
  buildResetPath: (schoolId: string, token: string) => string;
  buildInvitePath: (schoolId: string, token: string, email?: string, fullName?: string) => string;
  pruneExpiredPasswordResetTokens: (now?: number) => void;
  pruneExpiredInvitationTokens: (now?: number) => void;
  deliverPasswordResetEmail: (req: Request, schoolId: string, account: LocalAuthAccount, token: string) => Promise<EmailDeliveryResult>;
  issueMemberInvitation: (req: Request, schoolId: string, member: OrganizationMember) => Promise<{
    inviteToken?: string;
    invitePath: string;
    emailDelivery: EmailDeliveryResult;
    warning?: string;
  }>;
} {
  const passwordResetTokenTtlMs = 30 * 60 * 1000;
  const invitationTokenTtlMs = 7 * 24 * 60 * 60 * 1000;
  const exposePasswordResetToken = process.env.BTA_EXPOSE_PASSWORD_RESET_TOKEN === "1" || (process.env.NODE_ENV ?? "development") !== "production";
  const exposeInvitationToken = process.env.BTA_EXPOSE_INVITATION_TOKEN === "1" || (process.env.NODE_ENV ?? "development") !== "production";

  const passwordResetTokens = new Map<string, PasswordResetTokenRecord>();
  const invitationTokens = new Map<string, InvitationTokenRecord>();

  function pruneExpiredPasswordResetTokens(now = Date.now()): void {
    for (const [token, record] of passwordResetTokens.entries()) {
      if (record.expiresAt <= now) {
        passwordResetTokens.delete(token);
      }
    }
  }

  function pruneExpiredInvitationTokens(now = Date.now()): void {
    for (const [token, record] of invitationTokens.entries()) {
      if (record.expiresAt <= now) {
        invitationTokens.delete(token);
      }
    }
  }

  function buildResetPath(schoolId: string, token: string): string {
    return `/reset-password?token=${encodeURIComponent(token)}&schoolId=${encodeURIComponent(schoolId)}`;
  }

  function buildInvitePath(schoolId: string, token: string, email?: string, fullName?: string): string {
    const params = new URLSearchParams();
    params.set("invite", token);
    params.set("schoolId", schoolId);
    const normalizedEmail = deps.sanitizeTextField(email, 160).toLowerCase();
    const normalizedFullName = deps.sanitizeTextField(fullName, 120);
    if (normalizedEmail) {
      params.set("email", normalizedEmail);
    }
    if (normalizedFullName) {
      params.set("name", normalizedFullName);
    }
    return `/setup?${params.toString()}`;
  }

  function buildAbsoluteCoachUrl(req: Request, pathname: string): string {
    return new URL(pathname, `${deps.resolveCoachRedirectOrigin(req)}/`).toString();
  }

  async function deliverPasswordResetEmail(
    req: Request,
    schoolId: string,
    account: LocalAuthAccount,
    token: string,
  ): Promise<EmailDeliveryResult> {
    const resetPath = buildResetPath(schoolId, token);
    const resetUrl = buildAbsoluteCoachUrl(req, resetPath);
    return deps.sendTransactionalEmail({
      to: account.email,
      subject: "Reset your BTA coach password",
      text: [
        `Hi ${account.fullName || "Coach"},`,
        "",
        "We received a request to reset your BTA password.",
        `Use this link within 30 minutes: ${resetUrl}`,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
      html: [
        `<p>Hi ${account.fullName || "Coach"},</p>`,
        "<p>We received a request to reset your BTA password.</p>",
        `<p><a href=\"${resetUrl}\">Reset your password</a></p>`,
        "<p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>",
      ].join(""),
    });
  }

  async function deliverInvitationEmail(
    req: Request,
    invitation: InvitationTokenRecord,
  ): Promise<EmailDeliveryResult> {
    const invitePath = buildInvitePath(invitation.schoolId, invitation.token, invitation.email, invitation.fullName);
    const inviteUrl = buildAbsoluteCoachUrl(req, invitePath);
    return deps.sendTransactionalEmail({
      to: invitation.email,
      subject: `You're invited to ${invitation.organizationName} on BTA`,
      text: [
        `Hi ${invitation.fullName || "Coach"},`,
        "",
        `You've been invited to join ${invitation.organizationName} on BTA as a ${invitation.role}.`,
        `Accept your invite here: ${inviteUrl}`,
        "",
        "If you already have a BTA login for this email, sign in from the same link and your membership will be activated.",
      ].join("\n"),
      html: [
        `<p>Hi ${invitation.fullName || "Coach"},</p>`,
        `<p>You've been invited to join <strong>${invitation.organizationName}</strong> on BTA as a ${invitation.role}.</p>`,
        `<p><a href=\"${inviteUrl}\">Accept your invite</a></p>`,
        "<p>If you already have a BTA login for this email, sign in from the same link and your membership will be activated.</p>",
      ].join(""),
    });
  }

  async function issueMemberInvitation(req: Request, schoolId: string, member: OrganizationMember) {
    pruneExpiredInvitationTokens();

    for (const [token, invitation] of invitationTokens.entries()) {
      if (invitation.schoolId === schoolId && invitation.memberId === member.memberId) {
        invitationTokens.delete(token);
      }
    }

    const now = Date.now();
    const inviteToken = randomBytes(24).toString("hex");
    const organizationName = deps.sanitizeTextField(
      deps.getOnboardingAccountStateByScope({ schoolId })?.organization.organizationName
        || deps.getOrganizationProfileByScope({ schoolId })?.organizationName
        || "your organization",
      160,
    );

    const invitation: InvitationTokenRecord = {
      token: inviteToken,
      schoolId,
      memberId: member.memberId,
      email: member.email,
      fullName: member.fullName,
      role: member.role,
      organizationName,
      createdAt: now,
      expiresAt: now + invitationTokenTtlMs,
    };

    invitationTokens.set(inviteToken, invitation);
    const invitePath = buildInvitePath(schoolId, inviteToken, member.email, member.fullName);
    const emailDelivery = await deliverInvitationEmail(req, invitation);

    return {
      inviteToken: exposeInvitationToken ? inviteToken : undefined,
      invitePath,
      emailDelivery,
      warning: emailDelivery.delivered ? undefined : "Invitation email was not delivered. Share the invite link manually.",
    };
  }

  return {
    passwordResetTokens,
    invitationTokens,
    passwordResetTokenTtlMs,
    buildResetPath,
    buildInvitePath,
    pruneExpiredPasswordResetTokens,
    pruneExpiredInvitationTokens,
    deliverPasswordResetEmail: async (req, schoolId, account, token) => {
      return deliverPasswordResetEmail(req, schoolId, account, token);
    },
    issueMemberInvitation,
  };
}
