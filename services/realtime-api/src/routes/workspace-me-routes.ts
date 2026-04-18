import type { Express, Request, Response } from "express";
import type {
  SchoolRecord,
  RosterTeam,
  SchoolMembership,
  TeamMembership,
  UserWorkspaceProfile,
} from "../store.js";
import { applyTeamBillingStatuses, isSchoolAdmin } from "./workspace-helpers.js";
import type { WorkspaceSharedOptions } from "./workspace-helpers.js";

export interface RegisterMeRoutesOptions extends WorkspaceSharedOptions {
  getAuthUser: (req: Request) => { userId?: string; email?: string; fullName?: string };
  requireApiKey: (req: Request, res: Response, next: () => void) => void;
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  listSchoolMembershipsForUser: (input: { userId?: string; email?: string }) => SchoolMembership[];
  listTeamMembershipsForUser: (input: { schoolId?: string; userId?: string; email?: string }) => TeamMembership[];
  saveSchoolMembership: (membership: Partial<SchoolMembership> & Pick<SchoolMembership, "schoolId" | "email" | "fullName" | "role">) => SchoolMembership;
  saveTeamMembership: (membership: Partial<TeamMembership> & Pick<TeamMembership, "schoolId" | "teamId" | "email" | "fullName" | "role">) => TeamMembership;
  getSchoolRecord: (schoolId: string) => SchoolRecord | null;
  getUserWorkspaceProfile: (userId: string) => UserWorkspaceProfile | null;
  saveUserWorkspaceProfile: (profile: Partial<UserWorkspaceProfile> & Pick<UserWorkspaceProfile, "userId" | "email">) => UserWorkspaceProfile;
}

export function registerMeRoutes(app: Express, options: RegisterMeRoutesOptions): void {
  app.get("/api/me/context", options.requireApiKey, (req, res) => {
    const authUser = options.getAuthUser(req);
    if (!authUser.email && !authUser.userId) {
      res.status(401).json({ error: "Authenticated user required" });
      return;
    }

    const initialSchoolMemberships = options.listSchoolMembershipsForUser({
      userId: authUser.userId,
      email: authUser.email,
    });
    const normalizedSchoolMemberships = authUser.userId
      ? initialSchoolMemberships.map((membership) =>
          membership.userId === authUser.userId
            ? membership
            : options.saveSchoolMembership({
                membershipId: membership.membershipId,
                schoolId: membership.schoolId,
                userId: authUser.userId,
                email: membership.email,
                fullName: authUser.fullName ?? membership.fullName,
                role: membership.role,
                status: membership.status,
              }),
        )
      : initialSchoolMemberships;
    const schoolMemberships = normalizedSchoolMemberships;

    const initialTeamMemberships = schoolMemberships.flatMap((membership) =>
      options.listTeamMembershipsForUser({
        schoolId: membership.schoolId,
        userId: authUser.userId,
        email: authUser.email,
      }),
    );
    const teamMemberships = authUser.userId
      ? initialTeamMemberships.map((membership) =>
          membership.userId === authUser.userId
            ? membership
            : options.saveTeamMembership({
                membershipId: membership.membershipId,
                schoolId: membership.schoolId,
                teamId: membership.teamId,
                userId: authUser.userId,
                email: membership.email,
                fullName: authUser.fullName ?? membership.fullName,
                role: membership.role,
                status: membership.status,
              }),
        )
      : initialTeamMemberships;

    const schools = schoolMemberships
      .map((membership) => options.getSchoolRecord(membership.schoolId))
      .filter((school): school is SchoolRecord => Boolean(school));

    if (authUser.userId && authUser.email) {
      options.saveUserWorkspaceProfile({
        userId: authUser.userId,
        email: authUser.email,
        fullName: authUser.fullName ?? "",
      });
    }

    const teams = schoolMemberships.flatMap((membership) => {
      const schoolTeams = applyTeamBillingStatuses(options, membership.schoolId).teams;
      if (isSchoolAdmin(membership.role)) {
        return schoolTeams;
      }
      const allowedTeamIds = new Set(
        options.listTeamMembershipsForUser({
          schoolId: membership.schoolId,
          userId: authUser.userId,
          email: authUser.email,
        }).map((teamMembership) => teamMembership.teamId),
      );
      return schoolTeams.filter((team) => allowedTeamIds.has((team as RosterTeam).id));
    });

    const profile = authUser.userId ? options.getUserWorkspaceProfile(authUser.userId) : null;
    const preferredSchoolId = profile?.lastSchoolId && schools.some((school) => school.schoolId === profile.lastSchoolId)
      ? profile.lastSchoolId
      : schools[0]?.schoolId;
    const preferredSchoolMembership = schoolMemberships.find((membership) => membership.schoolId === preferredSchoolId) ?? schoolMemberships[0];
    const preferredTeams = (teams as RosterTeam[]).filter((team) => team.schoolId === preferredSchoolId);
    const defaultContext = isSchoolAdmin(preferredSchoolMembership?.role)
      ? { type: "school" as const, schoolId: preferredSchoolId ?? "" }
      : { type: "team" as const, schoolId: preferredSchoolId ?? "", teamId: profile?.lastTeamId && preferredTeams.some((team) => team.id === profile.lastTeamId) ? profile.lastTeamId : preferredTeams[0]?.id ?? "" };

    res.json({
      user: authUser,
      profile,
      schools,
      schoolMemberships,
      teamMemberships,
      teams,
      defaultContext,
    });
  });

  app.put("/api/me/context", options.requireApiKey, (req, res) => {
    const authUser = options.getAuthUser(req);
    if (!authUser.userId || !authUser.email) {
      res.status(400).json({ error: "userId and email are required to persist context" });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const saved = options.saveUserWorkspaceProfile({
      userId: authUser.userId,
      email: authUser.email,
      fullName: authUser.fullName ?? "",
      lastSchoolId: options.sanitizeTextField(payload.schoolId, 80) || undefined,
      lastTeamId: options.sanitizeTextField(payload.teamId, 120) || undefined,
      lastContextType: payload.contextType === "team" ? "team" : "school",
    });
    res.json({ profile: saved });
  });
}
