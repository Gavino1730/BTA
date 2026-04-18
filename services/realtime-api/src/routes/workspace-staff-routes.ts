import type { Express, Request, Response } from "express";
import type {
  SchoolRecord,
  ActivityEvent,
  RosterTeam,
  SchoolMembership,
  TeamMembership,
} from "../store.js";
import type { WorkspaceRosterTeam } from "./workspace-helpers.js";
import { resolveActingSchoolMembership, isSchoolAdmin } from "./workspace-helpers.js";

export interface RegisterStaffRoutesOptions {
  getAuthUser: (req: Request) => { userId?: string; email?: string; fullName?: string };
  requireApiKey: (req: Request, res: Response, next: () => void) => void;
  requireWriteRole: (req: Request, res: Response, next: () => void) => void;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  getSchoolRecord: (schoolId: string) => SchoolRecord | null;
  getSchoolMembershipsByScope: (scope: { schoolId: string }) => SchoolMembership[];
  saveSchoolMembership: (membership: Partial<SchoolMembership> & Pick<SchoolMembership, "schoolId" | "email" | "fullName" | "role">) => SchoolMembership;
  deleteSchoolMembership: (membershipId: string, scope?: { schoolId: string }) => boolean;
  getTeamMembershipsByScope: (scope: { schoolId: string }) => TeamMembership[];
  saveTeamMembership: (membership: Partial<TeamMembership> & Pick<TeamMembership, "schoolId" | "teamId" | "email" | "fullName" | "role">) => TeamMembership;
  deleteTeamMembership: (membershipId: string, scope?: { schoolId: string }) => boolean;
  getTeamById: (teamId: string, scope?: { schoolId?: string }) => RosterTeam | null;
  saveActivityEvent: (event: Omit<ActivityEvent, "id" | "createdAtIso"> & { id?: string; createdAtIso?: string }) => ActivityEvent;
  issueWorkspaceInvitation: (req: Request, input: {
    schoolId: string;
    membershipId: string;
    email: string;
    fullName: string;
    roleLabel: string;
  }) => Promise<{
    inviteToken?: string;
    invitePath: string;
    emailDelivery: unknown;
    warning?: string;
  }>;
}

export function registerStaffRoutes(app: Express, options: RegisterStaffRoutesOptions): void {
  app.post("/api/schools/:schoolId/staff/invitations", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const actingMembership = resolveActingSchoolMembership(options as any, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const school = options.getSchoolRecord(schoolId);
    if (!school) {
      res.status(404).json({ error: "School not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const fullName = options.sanitizeTextField(payload.fullName, 120);
    const email = options.sanitizeTextField(payload.email, 160).toLowerCase();
    const schoolRole = payload.schoolRole === "school_admin" ? "school_admin" : null;
    const teamRole = payload.teamRole === "head_coach" || payload.teamRole === "assistant_coach" || payload.teamRole === "operator" || payload.teamRole === "viewer"
      ? payload.teamRole
      : null;
    const teamId = options.sanitizeTextField(payload.teamId, 120) || undefined;

    if (!fullName || !email) {
      res.status(400).json({ error: "fullName and email are required" });
      return;
    }

    if (schoolRole) {
      const membership = options.saveSchoolMembership({ schoolId, email, fullName, role: schoolRole, status: "invited" });
      const invite = await options.issueWorkspaceInvitation(req, {
        schoolId,
        membershipId: membership.membershipId,
        email,
        fullName,
        roleLabel: "school admin",
      });
      options.saveActivityEvent({
        schoolId,
        type: "member_invited",
        actorUserId: options.getAuthUser(req).userId,
        message: `${fullName} was invited as a school admin.`,
        metadata: { membershipId: membership.membershipId, email, role: schoolRole },
      });
      res.status(201).json({
        membershipType: "school",
        membership,
        staff: {
          schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
          teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
        },
        inviteToken: invite.inviteToken,
        invitePath: invite.invitePath,
        emailDelivery: invite.emailDelivery,
        warning: invite.warning,
      });
      return;
    }

    if (!teamRole || !teamId) {
      res.status(400).json({ error: "teamRole and teamId are required for team staff invites" });
      return;
    }

    const team = options.getTeamById(teamId, { schoolId });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const membership = options.saveTeamMembership({ schoolId, teamId, email, fullName, role: teamRole, status: "invited" });
    const invite = await options.issueWorkspaceInvitation(req, {
      schoolId,
      membershipId: membership.membershipId,
      email,
      fullName,
      roleLabel: `${(team as WorkspaceRosterTeam).displayName ?? team.name} ${teamRole.replace(/_/g, " ")}`,
    });
    options.saveActivityEvent({
      schoolId,
      teamId,
      type: "member_invited",
      actorUserId: options.getAuthUser(req).userId,
      message: `${fullName} was invited to ${(team as WorkspaceRosterTeam).displayName ?? team.name} as ${teamRole.replace(/_/g, " ")}.`,
      metadata: { membershipId: membership.membershipId, email, role: teamRole },
    });
    res.status(201).json({
      membershipType: "team",
      membership,
      staff: {
        schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
        teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
      },
      inviteToken: invite.inviteToken,
      invitePath: invite.invitePath,
      emailDelivery: invite.emailDelivery,
      warning: invite.warning,
    });
  });

  app.post("/api/schools/:schoolId/staff/school-memberships/:membershipId/resend-invite", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options as any, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const membership = options.getSchoolMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!membership) {
      res.status(404).json({ error: "School membership not found" });
      return;
    }

    const invite = await options.issueWorkspaceInvitation(req, {
      schoolId,
      membershipId,
      email: membership.email,
      fullName: membership.fullName,
      roleLabel: membership.role === "school_admin" ? "school admin" : "owner",
    });
    res.json({
      membership,
      inviteToken: invite.inviteToken,
      invitePath: invite.invitePath,
      emailDelivery: invite.emailDelivery,
      warning: invite.warning,
    });
  });

  app.post("/api/schools/:schoolId/staff/team-memberships/:membershipId/resend-invite", options.requireApiKey, options.requireWriteRole, async (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options as any, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const membership = options.getTeamMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!membership) {
      res.status(404).json({ error: "Team membership not found" });
      return;
    }

    const team = options.getTeamById(membership.teamId, { schoolId });
    const invite = await options.issueWorkspaceInvitation(req, {
      schoolId,
      membershipId,
      email: membership.email,
      fullName: membership.fullName,
      roleLabel: `${(team as WorkspaceRosterTeam | null)?.displayName ?? team?.name ?? "team"} ${membership.role.replace(/_/g, " ")}`,
    });
    res.json({
      membership,
      inviteToken: invite.inviteToken,
      invitePath: invite.invitePath,
      emailDelivery: invite.emailDelivery,
      warning: invite.warning,
    });
  });

  app.put("/api/schools/:schoolId/staff/school-memberships/:membershipId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options as any, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const existing = options.getSchoolMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!existing) {
      res.status(404).json({ error: "School membership not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const fullName = options.sanitizeTextField(payload.fullName ?? existing.fullName, 120) || existing.fullName;
    const email = options.sanitizeTextField(payload.email ?? existing.email, 160).toLowerCase() || existing.email;
    const role = payload.role === "school_admin" ? "school_admin" : existing.role;
    const status = payload.status === "active" || payload.status === "invited" ? payload.status : existing.status;

    if (existing.role === "owner" && role !== "owner") {
      res.status(400).json({ error: "Owner membership role cannot be changed here" });
      return;
    }

    const membership = options.saveSchoolMembership({ membershipId, schoolId, userId: existing.userId, fullName, email, role, status });
    options.saveActivityEvent({
      schoolId,
      type: "membership_updated",
      actorUserId: options.getAuthUser(req).userId,
      message: `${membership.fullName}'s school access was updated.`,
      metadata: { membershipId, email: membership.email, role: membership.role, status: membership.status },
    });
    res.json({
      membership,
      staff: {
        schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
        teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
      },
    });
  });

  app.put("/api/schools/:schoolId/staff/team-memberships/:membershipId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options as any, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const existing = options.getTeamMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!existing) {
      res.status(404).json({ error: "Team membership not found" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const fullName = options.sanitizeTextField(payload.fullName ?? existing.fullName, 120) || existing.fullName;
    const email = options.sanitizeTextField(payload.email ?? existing.email, 160).toLowerCase() || existing.email;
    const nextTeamId = options.sanitizeTextField(payload.teamId ?? existing.teamId, 120) || existing.teamId;
    const nextTeam = options.getTeamById(nextTeamId, { schoolId });
    if (!nextTeam) {
      res.status(404).json({ error: "Target team not found" });
      return;
    }

    const role = payload.role === "head_coach" || payload.role === "assistant_coach" || payload.role === "operator" || payload.role === "viewer"
      ? payload.role
      : existing.role;
    const status = payload.status === "active" || payload.status === "invited" ? payload.status : existing.status;

    const membership = options.saveTeamMembership({ membershipId, schoolId, teamId: nextTeamId, userId: existing.userId, fullName, email, role, status });
    options.saveActivityEvent({
      schoolId,
      teamId: membership.teamId,
      type: "membership_updated",
      actorUserId: options.getAuthUser(req).userId,
      message: `${membership.fullName}'s team access was updated.`,
      metadata: { membershipId, email: membership.email, teamId: membership.teamId, role: membership.role, status: membership.status },
    });
    res.json({
      membership,
      staff: {
        schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
        teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
      },
    });
  });

  app.delete("/api/schools/:schoolId/staff/school-memberships/:membershipId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options as any, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const target = options.getSchoolMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!target) {
      res.status(404).json({ error: "School membership not found" });
      return;
    }
    if (target.role === "owner") {
      res.status(400).json({ error: "Owner membership cannot be removed here" });
      return;
    }

    options.deleteSchoolMembership(membershipId, { schoolId });
    options.saveActivityEvent({
      schoolId,
      type: "membership_updated",
      actorUserId: options.getAuthUser(req).userId,
      message: `${target.fullName} was removed from school staff.`,
      metadata: { membershipId, email: target.email },
    });
    res.json({
      success: true,
      staff: {
        schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
        teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
      },
    });
  });

  app.delete("/api/schools/:schoolId/staff/team-memberships/:membershipId", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.sanitizeTextField(req.params.schoolId, 80);
    const membershipId = options.sanitizeTextField(req.params.membershipId, 120);
    const actingMembership = resolveActingSchoolMembership(options as any, req, schoolId);
    if (!isSchoolAdmin(actingMembership?.role)) {
      res.status(403).json({ error: "School admin access required" });
      return;
    }

    const target = options.getTeamMembershipsByScope({ schoolId }).find((entry) => entry.membershipId === membershipId);
    if (!target) {
      res.status(404).json({ error: "Team membership not found" });
      return;
    }

    options.deleteTeamMembership(membershipId, { schoolId });
    options.saveActivityEvent({
      schoolId,
      teamId: target.teamId,
      type: "membership_updated",
      actorUserId: options.getAuthUser(req).userId,
      message: `${target.fullName} was removed from team staff.`,
      metadata: { membershipId, email: target.email, teamId: target.teamId },
    });
    res.json({
      success: true,
      staff: {
        schoolMemberships: options.getSchoolMembershipsByScope({ schoolId }),
        teamMemberships: options.getTeamMembershipsByScope({ schoolId }),
      },
    });
  });
}
