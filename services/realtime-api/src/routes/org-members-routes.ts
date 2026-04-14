import type { Express, NextFunction, Request, Response } from "express";
import type { EmailDeliveryResult } from "../email.js";
import type { OrganizationMember } from "../store.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

type OrganizationState = {
  organization: {
    organizationId: string;
  };
};

interface InvitationIssueResult {
  inviteToken?: string;
  invitePath: string;
  emailDelivery: EmailDeliveryResult;
  warning?: string;
}

interface RegisterOrgMembersRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  getSchoolIdFromRequest: (req: Request) => string;
  getOnboardingAccountStateByScope: (scope: { schoolId: string }) => OrganizationState | null;
  ensureAuthenticatedOrganizationMember: (req: Request, schoolId: string) => OrganizationMember | null;
  requireOrganizationManager: (req: Request, res: Response) => OrganizationMember | null;
  getOrganizationMembersByScope: (scope: { schoolId: string }) => OrganizationMember[];
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  isValidEmail: (value: string) => boolean;
  normalizeMemberRole: (value: unknown, fallback?: OrganizationMember["role"]) => OrganizationMember["role"];
  saveOrganizationMember: (member: Partial<OrganizationMember>, scope: { schoolId: string }) => OrganizationMember;
  deleteOrganizationMember: (memberId: string, scope: { schoolId: string }) => boolean;
  issueMemberInvitation: (req: Request, schoolId: string, member: OrganizationMember) => Promise<InvitationIssueResult>;
}

export function registerOrgMembersRoutes(app: Express, options: RegisterOrgMembersRoutesOptions): void {
  app.get("/api/org/members", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const account = options.getOnboardingAccountStateByScope({ schoolId });
    const currentMember = options.ensureAuthenticatedOrganizationMember(req, schoolId);
    res.json({
      organization: account?.organization ?? null,
      currentMember,
      members: options.getOrganizationMembersByScope({ schoolId }),
    });
  });

  app.post("/api/org/members", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const actingMember = options.requireOrganizationManager(req, res);
    if (!actingMember) {
      return;
    }

    const account = options.getOnboardingAccountStateByScope({ schoolId });
    if (!account) {
      res.status(400).json({ error: "Complete onboarding before adding organization members" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const email = options.sanitizeTextField(payload.email, 160).toLowerCase();
    const fullName = options.sanitizeTextField(payload.fullName, 120);
    const role = options.normalizeMemberRole(payload.role, "coach");
    if (!email || !fullName) {
      res.status(400).json({ error: "fullName and email are required" });
      return;
    }

    if (!options.isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }

    const member = options.saveOrganizationMember({
      organizationId: actingMember.organizationId || account.organization.organizationId,
      fullName,
      email,
      role,
      status: "invited",
      invitedAtIso: new Date().toISOString(),
    }, { schoolId });

    const invite = await options.issueMemberInvitation(req, schoolId, member);

    res.status(201).json({
      member,
      members: options.getOrganizationMembersByScope({ schoolId }),
      inviteToken: invite.inviteToken,
      invitePath: invite.invitePath,
      emailDelivery: invite.emailDelivery,
      warning: invite.warning,
    });
  });

  app.put("/api/org/members/:memberId", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const actingMember = options.requireOrganizationManager(req, res);
    if (!actingMember) {
      return;
    }

    const account = options.getOnboardingAccountStateByScope({ schoolId });
    if (!account) {
      res.status(400).json({ error: "Complete onboarding before updating organization members" });
      return;
    }

    const memberId = options.sanitizeTextField(req.params.memberId, 80);
    const existing = options.getOrganizationMembersByScope({ schoolId }).find((member) => member.memberId === memberId);
    if (!existing) {
      res.status(404).json({ error: "Organization member not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const fullName = options.sanitizeTextField(payload.fullName ?? existing.fullName, 120);
    const email = options.sanitizeTextField(payload.email ?? existing.email, 160).toLowerCase();
    const role = options.normalizeMemberRole(payload.role, existing.role);
    const status = payload.status === "active" || payload.status === "invited"
      ? payload.status
      : existing.status;

    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    if (!options.isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }

    const emailChanged = email !== existing.email;

    const ownerCount = options.getOrganizationMembersByScope({ schoolId }).filter((member) => member.role === "owner").length;
    if (existing.role === "owner" && role !== "owner" && ownerCount <= 1) {
      res.status(400).json({ error: "At least one organization owner is required" });
      return;
    }

    const member = options.saveOrganizationMember({
      memberId,
      organizationId: actingMember.organizationId || account.organization.organizationId,
      authSubject: existing.authSubject,
      email,
      invitedAtIso: existing.invitedAtIso,
      joinedAtIso: existing.joinedAtIso,
      fullName,
      role,
      status,
    }, { schoolId });

    if (!emailChanged) {
      res.json({ member, members: options.getOrganizationMembersByScope({ schoolId }), actingMember });
      return;
    }

    const invite = await options.issueMemberInvitation(req, schoolId, member);
    res.json({
      member,
      members: options.getOrganizationMembersByScope({ schoolId }),
      actingMember,
      inviteToken: invite.inviteToken,
      invitePath: invite.invitePath,
      emailDelivery: invite.emailDelivery,
      warning: invite.warning,
    });
  });

  app.post("/api/org/members/:memberId/resend-invite", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const actingMember = options.requireOrganizationManager(req, res);
    if (!actingMember) {
      return;
    }

    const memberId = options.sanitizeTextField(req.params.memberId, 80);
    const member = options.getOrganizationMembersByScope({ schoolId }).find((entry) => entry.memberId === memberId);
    if (!member) {
      res.status(404).json({ error: "Organization member not found" });
      return;
    }

    if (!member.email || !options.isValidEmail(member.email)) {
      res.status(400).json({ error: "Organization member email is missing or invalid" });
      return;
    }

    const invite = await options.issueMemberInvitation(req, schoolId, member);
    res.status(200).json({
      member,
      members: options.getOrganizationMembersByScope({ schoolId }),
      inviteToken: invite.inviteToken,
      invitePath: invite.invitePath,
      emailDelivery: invite.emailDelivery,
      warning: invite.warning,
    });
  });

  app.delete("/api/org/members/:memberId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const actingMember = options.requireOrganizationManager(req, res);
    if (!actingMember) {
      return;
    }

    const memberId = options.sanitizeTextField(req.params.memberId, 80);
    const members = options.getOrganizationMembersByScope({ schoolId });
    const target = members.find((member) => member.memberId === memberId);
    if (!target) {
      res.status(404).json({ error: "Organization member not found" });
      return;
    }

    const ownerCount = members.filter((member) => member.role === "owner").length;
    if (target.role === "owner" && ownerCount <= 1) {
      res.status(400).json({ error: "At least one organization owner is required" });
      return;
    }

    if (target.memberId === actingMember.memberId) {
      res.status(400).json({ error: "Members cannot remove themselves" });
      return;
    }

    options.deleteOrganizationMember(memberId, { schoolId });
    res.json({ message: "Organization member removed", members: options.getOrganizationMembersByScope({ schoolId }) });
  });
}
