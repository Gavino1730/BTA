import type { Request } from "express";
import type { RosterTeam, SchoolMembership, BillingState } from "../store.js";
import { buildBillingEntitlement } from "./billing-routes.js";

export type AuthUser = {
  userId?: string;
  email?: string;
  fullName?: string;
};

export type WorkspaceRosterTeam = RosterTeam & {
  sport?: "basketball";
  gender?: "boys" | "girls" | "custom";
  level?: "varsity" | "jv" | "freshman" | "custom";
  customLabel?: string;
  displayName?: string;
  status?: "active" | "archived" | "read_only";
};

export interface WorkspaceSharedOptions {
  getAuthUser: (req: Request) => AuthUser;
  paywallEnabled: boolean;
  getBillingStateByScope: (scope: { schoolId: string }) => BillingState | null;
  getRosterTeamsByScope: (scope: { schoolId: string }) => RosterTeam[];
  saveRosterTeams: (teams: RosterTeam[], scope: { schoolId: string }) => RosterTeam[];
  getSchoolMembershipsByScope: (scope: { schoolId: string }) => SchoolMembership[];
}

export function isSchoolAdmin(role: SchoolMembership["role"] | undefined): boolean {
  return role === "owner" || role === "school_admin";
}

export function applyTeamBillingStatuses(
  options: WorkspaceSharedOptions,
  schoolId: string,
): {
  teams: WorkspaceRosterTeam[];
  entitlement: ReturnType<typeof buildBillingEntitlement>;
  activeTeamCount: number;
  overLimitTeamCount: number;
} {
  const teams = options.getRosterTeamsByScope({ schoolId }) as WorkspaceRosterTeam[];
  const entitlement = buildBillingEntitlement(options.paywallEnabled, options.getBillingStateByScope({ schoolId }));
  const activeTeamLimit = entitlement.activeTeamLimit;

  if (activeTeamLimit === null) {
    const normalizedTeams: WorkspaceRosterTeam[] = teams.map((team) => ({
      ...team,
      status: team.status === "archived" ? "archived" : "active",
    }));
    const changed = normalizedTeams.some((team, index) => team.status !== teams[index]?.status);
    const savedTeams = changed ? options.saveRosterTeams(normalizedTeams, { schoolId }) as WorkspaceRosterTeam[] : normalizedTeams;
    return {
      teams: savedTeams,
      entitlement,
      activeTeamCount: savedTeams.filter((team) => team.status === "active").length,
      overLimitTeamCount: 0,
    };
  }

  let remainingActiveSlots = Math.max(0, activeTeamLimit);
  const normalizedTeams: WorkspaceRosterTeam[] = teams.map((team) => {
    if (team.status === "archived") {
      return { ...team, status: "archived" as const };
    }
    if (remainingActiveSlots > 0) {
      remainingActiveSlots -= 1;
      return { ...team, status: "active" as const };
    }
    return { ...team, status: "read_only" as const };
  });
  const changed = normalizedTeams.some((team, index) => team.status !== teams[index]?.status);
  const savedTeams = changed ? options.saveRosterTeams(normalizedTeams, { schoolId }) as WorkspaceRosterTeam[] : normalizedTeams;
  return {
    teams: savedTeams,
    entitlement,
    activeTeamCount: savedTeams.filter((team) => team.status === "active").length,
    overLimitTeamCount: savedTeams.filter((team) => team.status === "read_only").length,
  };
}

export function resolveActingSchoolMembership(
  options: Pick<WorkspaceSharedOptions, "getSchoolMembershipsByScope" | "getAuthUser">,
  req: Request,
  schoolId: string,
): SchoolMembership | undefined {
  const authUser = options.getAuthUser(req);
  return options.getSchoolMembershipsByScope({ schoolId }).find((membership) =>
    (authUser.userId && membership.userId === authUser.userId)
    || (authUser.email && membership.email === authUser.email),
  );
}

export function buildPairingCode(): string {
  return String(Math.floor(100000 + (Math.random() * 900000)));
}

export function normalizePairingCode(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 6);
  return /^\d{6}$/.test(digits) ? digits : "";
}

export function slugifyOpponentName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "opponent";
}
