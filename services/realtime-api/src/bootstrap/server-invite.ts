/**
 * Factory for issueWorkspaceInvitation and password reset email route used in server.ts.
 * Extracted to keep server.ts under 300 lines.
 */
import { randomBytes } from "node:crypto";
import type { Express, Request, RequestHandler } from "express";
import { sanitizeTextField, isValidEmail } from "../helpers/string-helpers.js";
import { getSchoolRecord, getOnboardingAccountStateByScope, getOrganizationProfileByScope } from "../store.js";
import type { sendTransactionalEmail as SendEmailFn } from "../email.js";
import { sendSupabasePasswordResetEmail } from "../supabase-auth-email.js";
import { logger } from "../logger.js";

export interface WorkspaceInvitationOptions {
  invitationTokens: Map<string, {
    token: string;
    schoolId: string;
    memberId: string;
    email: string;
    fullName: string;
    role: string;
    organizationName: string;
    createdAt: number;
    expiresAt: number;
  }>;
  pruneExpiredInvitationTokens: () => void;
  buildInvitePath: (schoolId: string, token: string) => string;
  resolveCoachRedirectOrigin: (req: Request) => string;
  sendTransactionalEmail: typeof SendEmailFn;
}

export function createWorkspaceInvitationHandler(opts: WorkspaceInvitationOptions) {
  const {
    invitationTokens,
    pruneExpiredInvitationTokens,
    buildInvitePath,
    resolveCoachRedirectOrigin,
    sendTransactionalEmail,
  } = opts;

  return async function issueWorkspaceInvitation(req: Request, input: {
    schoolId: string;
    membershipId: string;
    email: string;
    fullName: string;
    roleLabel: string;
  }) {
    pruneExpiredInvitationTokens();

    for (const [token, invitation] of invitationTokens.entries()) {
      if (invitation.schoolId === input.schoolId && invitation.memberId === input.membershipId) {
        invitationTokens.delete(token);
      }
    }

    const inviteToken = randomBytes(24).toString("hex");
    const now = Date.now();
    const schoolName = sanitizeTextField(
      getSchoolRecord(input.schoolId)?.name
        || getOnboardingAccountStateByScope({ schoolId: input.schoolId })?.organization.organizationName
        || getOrganizationProfileByScope({ schoolId: input.schoolId })?.organizationName
        || "your school",
      160,
    );
    const invitePath = buildInvitePath(input.schoolId, inviteToken);
    const inviteUrl = new URL(invitePath, `${resolveCoachRedirectOrigin(req)}/`).toString();

    invitationTokens.set(inviteToken, {
      token: inviteToken,
      schoolId: input.schoolId,
      memberId: input.membershipId,
      email: input.email,
      fullName: input.fullName,
      role: "coach",
      organizationName: schoolName,
      createdAt: now,
      expiresAt: now + (7 * 24 * 60 * 60 * 1000),
    });

    const emailDelivery = await sendTransactionalEmail({
      to: input.email,
      subject: `You're invited to ${schoolName} on BTA`,
      text: [
        `Hi ${input.fullName || "Coach"},`,
        "",
        `You've been invited to join ${schoolName} on BTA as ${input.roleLabel}.`,
        `Accept your invite here: ${inviteUrl}`,
        "",
        "If you already have a BTA login for this email, sign in from the same link and your workspace access will be activated.",
      ].join("\n"),
      html: [
        `<p>Hi ${input.fullName || "Coach"},</p>`,
        `<p>You've been invited to join <strong>${schoolName}</strong> on BTA as ${input.roleLabel}.</p>`,
        `<p><a href="${inviteUrl}">Accept your invite</a></p>`,
        "<p>If you already have a BTA login for this email, sign in from the same link and your workspace access will be activated.</p>",
      ].join(""),
    });

    return {
      inviteToken: (process.env.BTA_EXPOSE_INVITATION_TOKEN === "1" || (process.env.NODE_ENV ?? "development") !== "production") ? inviteToken : undefined,
      invitePath,
      emailDelivery,
      warning: emailDelivery.delivered ? undefined : "Invitation email was not delivered. Share the invite link manually.",
    };
  };
}

export interface PasswordResetEmailRouteOptions {
  authRateLimiter: RequestHandler;
  resolvePasswordResetRedirect: (req: Request, redirectTo: string | undefined) => string;
  sendTransactionalEmail: typeof SendEmailFn;
}

export function registerPasswordResetEmailRoute(app: Express, opts: PasswordResetEmailRouteOptions): void {
  const { authRateLimiter, resolvePasswordResetRedirect, sendTransactionalEmail } = opts;
  app.post("/api/auth/password-reset/email", authRateLimiter, async (req, res) => {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const email = sanitizeTextField(payload.email, 160).toLowerCase();
    if (!isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }
    const redirectTo = resolvePasswordResetRedirect(
      req,
      typeof payload.redirectTo === "string" ? payload.redirectTo : undefined,
    );
    const emailDelivery = await sendSupabasePasswordResetEmail({
      email,
      redirectTo,
      sendEmail: sendTransactionalEmail,
    });
    if (emailDelivery.delivered) {
      res.json({ message: "If this email exists, a password reset link has been sent.", emailDelivery });
      return;
    }
    if (emailDelivery.skipped) {
      logger.warn("auth.password_reset_email_unavailable", { email, reason: emailDelivery.reason, redirectTo });
      res.status(503).json({ error: emailDelivery.reason || "Password reset email is not configured.", emailDelivery });
      return;
    }
    logger.warn("auth.password_reset_email_failed", { email, reason: emailDelivery.reason, redirectTo });
    res.status(502).json({ error: emailDelivery.reason || "Could not send password reset email.", emailDelivery });
  });
}
