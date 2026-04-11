import { Resend } from "resend";
import { logger } from "./logger.js";

type EmailSendStatus = "sent" | "disabled" | "failed";

interface EmailSendResult {
  status: EmailSendStatus;
  providerId?: string;
}

interface PasswordResetEmailInput {
  to: string;
  fullName: string;
  organizationName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

interface OrganizationInviteEmailInput {
  to: string;
  fullName: string;
  organizationName: string;
  inviterName: string;
  roleLabel: string;
  inviteUrl: string;
}

interface AccountNoticeEmailInput {
  to: string;
  fullName: string;
  organizationName: string;
  actionLabel: string;
  loginUrl: string;
}

const RESEND_API_KEY = String(process.env.RESEND_API_KEY ?? "").trim();
const EMAIL_FROM = String(process.env.BTA_EMAIL_FROM ?? "BTA Courtside <onboarding@resend.dev>").trim();
const EMAIL_REPLY_TO = String(process.env.BTA_EMAIL_REPLY_TO ?? "").trim();

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
let hasLoggedDisabledState = false;

function isEmailConfigured(): boolean {
  return Boolean(resendClient && EMAIL_FROM);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderButtonLink(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<p style=\"margin: 24px 0 20px;\"><a href=\"${safeUrl}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;\">${safeLabel}</a></p>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<EmailSendResult> {
  if (!isEmailConfigured()) {
    if (!hasLoggedDisabledState) {
      logger.warn("email.disabled", {
        reason: "missing_resend_configuration",
        hasApiKey: Boolean(RESEND_API_KEY),
        hasFromAddress: Boolean(EMAIL_FROM),
      });
      hasLoggedDisabledState = true;
    }
    return { status: "disabled" };
  }

  try {
    const response = await resendClient!.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html,
      ...(EMAIL_REPLY_TO ? { replyTo: EMAIL_REPLY_TO } : {}),
    });

    if (response.error) {
      logger.error("email.send_failed", {
        to,
        subject,
        provider: "resend",
        error: response.error,
      });
      return { status: "failed" };
    }

    logger.info("email.sent", {
      to,
      subject,
      provider: "resend",
      emailId: response.data?.id,
    });

    return {
      status: "sent",
      providerId: response.data?.id,
    };
  } catch (error) {
    logger.error("email.send_exception", {
      to,
      subject,
      provider: "resend",
      error,
    });
    return { status: "failed" };
  }
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<EmailSendResult> {
  const fullName = escapeHtml(input.fullName || "Coach");
  const organizationName = escapeHtml(input.organizationName || "your organization");
  const resetUrl = input.resetUrl;
  const expiresInMinutes = Math.max(1, Math.floor(input.expiresInMinutes));

  const html = [
    `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;\">`,
    `<h2 style=\"margin-bottom:8px;\">Reset your BTA password</h2>`,
    `<p>Hi ${fullName},</p>`,
    `<p>We received a request to reset your password for ${organizationName}.</p>`,
    renderButtonLink(resetUrl, "Reset Password"),
    `<p>This link expires in ${expiresInMinutes} minutes.</p>`,
    `<p>If you did not request this, you can safely ignore this email.</p>`,
    `</div>`,
  ].join("");

  return sendEmail(input.to, "Reset your BTA password", html);
}

export async function sendOrganizationInviteEmail(input: OrganizationInviteEmailInput): Promise<EmailSendResult> {
  const fullName = escapeHtml(input.fullName || "Coach");
  const organizationName = escapeHtml(input.organizationName || "your organization");
  const inviterName = escapeHtml(input.inviterName || "Your team admin");
  const roleLabel = escapeHtml(input.roleLabel);

  const html = [
    `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;\">`,
    `<h2 style=\"margin-bottom:8px;\">You are invited to BTA Courtside</h2>`,
    `<p>Hi ${fullName},</p>`,
    `<p>${inviterName} invited you to join ${organizationName} as ${roleLabel}.</p>`,
    renderButtonLink(input.inviteUrl, "Open Invite"),
    `<p>Use this same email address to sign in and access your organization.</p>`,
    `</div>`,
  ].join("");

  return sendEmail(input.to, `You are invited to ${input.organizationName} on BTA`, html);
}

export async function sendAccountNoticeEmail(input: AccountNoticeEmailInput): Promise<EmailSendResult> {
  const fullName = escapeHtml(input.fullName || "Team member");
  const organizationName = escapeHtml(input.organizationName || "your organization");
  const actionLabel = escapeHtml(input.actionLabel);

  const html = [
    `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;\">`,
    `<h2 style=\"margin-bottom:8px;\">BTA account update</h2>`,
    `<p>Hi ${fullName},</p>`,
    `<p>${actionLabel} for your ${organizationName} account.</p>`,
    renderButtonLink(input.loginUrl, "Go to Login"),
    `<p>If this was unexpected, contact your organization manager.</p>`,
    `</div>`,
  ].join("");

  return sendEmail(input.to, "Your BTA account was updated", html);
}
