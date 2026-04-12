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

interface EmailVerificationEmailInput {
  to: string;
  fullName: string;
  organizationName: string;
  verifyUrl: string;
  expiresInHours: number;
}

interface OnboardingWelcomeEmailInput {
  to: string;
  fullName: string;
  organizationName: string;
  teamName: string;
  loginUrl: string;
}

interface SecurityAlertEmailInput {
  to: string;
  fullName: string;
  organizationName: string;
  title: string;
  detail: string;
  loginUrl: string;
}

interface AccountDeletionScheduledEmailInput {
  to: string;
  fullName: string;
  organizationName: string;
  scheduledAtIso: string;
  cancelUrl: string;
}

interface AccountDeletionCanceledEmailInput {
  to: string;
  fullName: string;
  organizationName: string;
  loginUrl: string;
}

interface IntakeConfirmationEmailInput {
  to: string;
  fullName: string;
  title: string;
  summary: string;
  nextStep: string;
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

export async function sendEmailVerificationEmail(input: EmailVerificationEmailInput): Promise<EmailSendResult> {
  const fullName = escapeHtml(input.fullName || "Coach");
  const organizationName = escapeHtml(input.organizationName || "your organization");
  const expiresInHours = Math.max(1, Math.floor(input.expiresInHours));

  const html = [
    `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;\">`,
    `<h2 style=\"margin-bottom:8px;\">Verify your BTA email</h2>`,
    `<p>Hi ${fullName},</p>`,
    `<p>Confirm your email for ${organizationName} to complete account setup.</p>`,
    renderButtonLink(input.verifyUrl, "Verify Email"),
    `<p>This verification link expires in ${expiresInHours} hour${expiresInHours === 1 ? "" : "s"}.</p>`,
    `<p>If you did not create this account, you can ignore this message.</p>`,
    `</div>`,
  ].join("");

  return sendEmail(input.to, "Verify your BTA email", html);
}

export async function sendOnboardingWelcomeEmail(input: OnboardingWelcomeEmailInput): Promise<EmailSendResult> {
  const fullName = escapeHtml(input.fullName || "Coach");
  const organizationName = escapeHtml(input.organizationName || "your organization");
  const teamName = escapeHtml(input.teamName || "your team");

  const html = [
    `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;\">`,
    `<h2 style=\"margin-bottom:8px;\">Welcome to BTA Courtside</h2>`,
    `<p>Hi ${fullName},</p>`,
    `<p>Your onboarding for ${organizationName} is complete and ${teamName} is ready.</p>`,
    `<p>Next steps:</p>`,
    `<ul><li>Invite staff from team settings</li><li>Pair the iPad operator</li><li>Run a short pregame rehearsal</li></ul>`,
    renderButtonLink(input.loginUrl, "Open BTA"),
    `</div>`,
  ].join("");

  return sendEmail(input.to, "Welcome to BTA Courtside", html);
}

export async function sendSecurityAlertEmail(input: SecurityAlertEmailInput): Promise<EmailSendResult> {
  const fullName = escapeHtml(input.fullName || "Team member");
  const organizationName = escapeHtml(input.organizationName || "your organization");
  const title = escapeHtml(input.title);
  const detail = escapeHtml(input.detail);

  const html = [
    `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;\">`,
    `<h2 style=\"margin-bottom:8px;\">${title}</h2>`,
    `<p>Hi ${fullName},</p>`,
    `<p>${detail} for your ${organizationName} account.</p>`,
    renderButtonLink(input.loginUrl, "Review Account"),
    `<p>If this was not expected, reset your password and contact your organization manager.</p>`,
    `</div>`,
  ].join("");

  return sendEmail(input.to, title, html);
}

export async function sendAccountDeletionScheduledEmail(input: AccountDeletionScheduledEmailInput): Promise<EmailSendResult> {
  const fullName = escapeHtml(input.fullName || "Team member");
  const organizationName = escapeHtml(input.organizationName || "your organization");
  const whenText = escapeHtml(new Date(input.scheduledAtIso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }));

  const html = [
    `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;\">`,
    `<h2 style=\"margin-bottom:8px;\">Account deletion scheduled</h2>`,
    `<p>Hi ${fullName},</p>`,
    `<p>Your BTA account for ${organizationName} is scheduled for deletion on ${whenText}.</p>`,
    `<p>You can cancel deletion any time before that deadline:</p>`,
    renderButtonLink(input.cancelUrl, "Open Account Settings"),
    `<p>If you did not request this, sign in now and cancel the deletion.</p>`,
    `</div>`,
  ].join("");

  return sendEmail(input.to, "Your BTA account deletion was scheduled", html);
}

export async function sendAccountDeletionCanceledEmail(input: AccountDeletionCanceledEmailInput): Promise<EmailSendResult> {
  const fullName = escapeHtml(input.fullName || "Team member");
  const organizationName = escapeHtml(input.organizationName || "your organization");

  const html = [
    `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;\">`,
    `<h2 style=\"margin-bottom:8px;\">Account deletion canceled</h2>`,
    `<p>Hi ${fullName},</p>`,
    `<p>Your scheduled account deletion for ${organizationName} has been canceled.</p>`,
    renderButtonLink(input.loginUrl, "Open BTA"),
    `</div>`,
  ].join("");

  return sendEmail(input.to, "Your BTA account deletion was canceled", html);
}

function buildIntakeConfirmationHtml(input: IntakeConfirmationEmailInput): string {
  const fullName = escapeHtml(input.fullName || "there");
  const summary = escapeHtml(input.summary);
  const nextStep = escapeHtml(input.nextStep);

  return [
    `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;\">`,
    `<h2 style=\"margin-bottom:8px;\">${escapeHtml(input.title)}</h2>`,
    `<p>Hi ${fullName},</p>`,
    `<p>${summary}</p>`,
    `<p>${nextStep}</p>`,
    `</div>`,
  ].join("");
}

export async function sendSupportIntakeConfirmationEmail(input: IntakeConfirmationEmailInput): Promise<EmailSendResult> {
  return sendEmail(input.to, input.title, buildIntakeConfirmationHtml(input));
}

export async function sendContactIntakeConfirmationEmail(input: IntakeConfirmationEmailInput): Promise<EmailSendResult> {
  return sendEmail(input.to, input.title, buildIntakeConfirmationHtml(input));
}

export async function sendDemoRequestConfirmationEmail(input: IntakeConfirmationEmailInput): Promise<EmailSendResult> {
  return sendEmail(input.to, input.title, buildIntakeConfirmationHtml(input));
}

export async function sendDataDeletionRequestConfirmationEmail(input: IntakeConfirmationEmailInput): Promise<EmailSendResult> {
  return sendEmail(input.to, input.title, buildIntakeConfirmationHtml(input));
}
