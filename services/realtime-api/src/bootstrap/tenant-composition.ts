import type { Request, Response } from "express";
import type { AuthContext } from "../auth.js";
import type {
  CoachAiSettings,
  LocalAuthAccount,
  OnboardingAccountState,
  OrganizationMember,
  OrganizationProfile,
  RosterTeam,
} from "../store.js";

type ScopedRequest = Request & {
  authContext?: AuthContext;
};

interface TenantCompositionDependencies {
  ioEmitRosterTeams: (schoolId: string, teams: RosterTeam[]) => void;
  getRosterTeamsByScope: (scope: { schoolId: string }) => RosterTeam[];
  saveRosterTeams: (teams: RosterTeam[], scope: { schoolId: string }) => RosterTeam[];
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  buildOrganizationSlug: (value: string) => string;
  buildTeamAbbreviation: (value: string) => string;
  normalizeTeamColor: (value: unknown) => string | undefined;
  sanitizeFocusInsights: (value: unknown) => CoachAiSettings["focusInsights"] | undefined;
  getOrganizationProfileByScope: (scope: { schoolId: string }) => OrganizationProfile | null;
  getOnboardingAccountStateByScope: (scope: { schoolId: string }) => OnboardingAccountState | null;
  getOrganizationMembersByScope: (scope: { schoolId: string }) => OrganizationMember[];
  saveOrganizationMember: (member: Partial<OrganizationMember> & Pick<OrganizationMember, "organizationId" | "role" | "status">, scope: { schoolId: string }) => OrganizationMember;
  getSchoolIdFromRequest: (req: Request) => string;
}

export function createTenantCompositionHelpers(deps: TenantCompositionDependencies): {
  getPrimaryTeam: (schoolId: string) => { teams: RosterTeam[]; team: RosterTeam | null };
  persistSchoolTeams: (schoolId: string, teams: RosterTeam[]) => RosterTeam[];
  upsertPrimaryTeam: (schoolId: string, payload: Record<string, unknown>) => RosterTeam[];
  buildOnboardingProfileView: (schoolId: string) => OrganizationProfile | null;
  buildOnboardingCompletionSummary: (schoolId: string) => {
    completed: boolean;
    hasAccount: boolean;
    hasProfile: boolean;
    hasTeam: boolean;
    teamCount: number;
  };
  buildAuthSessionResponse: (
    schoolId: string,
    account: LocalAuthAccount,
    currentMember: OrganizationMember | null,
    token?: string | null,
  ) => {
    authenticated: true;
    token: string | null;
    user: Record<string, unknown>;
    currentMember: OrganizationMember | null;
    onboarding: {
      completed: boolean;
      hasAccount: boolean;
      hasProfile: boolean;
      hasTeam: boolean;
      teamCount: number;
    };
  };
  buildSuggestedCoachIdentity: (authContext: AuthContext | undefined) => { coachName?: string; coachEmail?: string } | null;
  resolveCurrentOrganizationMember: (req: Request, schoolId: string) => OrganizationMember | null;
  ensureAuthenticatedOrganizationMember: (req: Request, schoolId: string) => OrganizationMember | null;
  ensureOwnerMembership: (req: Request, schoolId: string, account: OnboardingAccountState) => OrganizationMember;
  requireOrganizationOwner: (req: Request, res: Response) => OrganizationMember | null;
  requireOrganizationManager: (req: Request, res: Response) => OrganizationMember | null;
  normalizeMemberRole: (value: unknown, fallback?: OrganizationMember["role"]) => OrganizationMember["role"];
  withSuggestedOnboardingIdentity: (req: Request, payload: Record<string, unknown>) => Record<string, unknown>;
  activateKnownMemberForAccount: (schoolId: string, account: LocalAuthAccount) => OrganizationMember | null;
} {
  function getPrimaryTeam(schoolId: string): { teams: RosterTeam[]; team: RosterTeam | null } {
    const teams = deps.getRosterTeamsByScope({ schoolId });
    return { teams, team: teams[0] ?? null };
  }

  function persistSchoolTeams(schoolId: string, teams: RosterTeam[]): RosterTeam[] {
    const saved = deps.saveRosterTeams(teams, { schoolId });
    deps.ioEmitRosterTeams(schoolId, saved);
    return saved;
  }

  function upsertPrimaryTeam(schoolId: string, payload: Record<string, unknown>): RosterTeam[] {
    const { teams, team } = getPrimaryTeam(schoolId);
    const name = deps.sanitizeTextField(payload.name ?? team?.name ?? "Team", 120) || "Team";
    const seededTeamId = deps.sanitizeTextField(payload.teamId ?? payload.id, 80)
      || (deps.buildOrganizationSlug(name) ? `team-${deps.buildOrganizationSlug(name)}` : "");
    const nextTeam: RosterTeam = {
      id: team?.id ?? (seededTeamId || "primary-team"),
      schoolId,
      name,
      abbreviation: deps.sanitizeTextField(payload.abbreviation ?? team?.abbreviation ?? deps.buildTeamAbbreviation(name), 12) || deps.buildTeamAbbreviation(name),
      season: deps.sanitizeTextField(payload.season ?? team?.season, 40) || undefined,
      teamColor: deps.normalizeTeamColor(payload.teamColor ?? team?.teamColor),
      coachStyle: deps.sanitizeTextField(payload.coachStyle ?? team?.coachStyle, 500) || undefined,
      playingStyle: deps.sanitizeTextField(payload.playingStyle ?? team?.playingStyle, 500) || undefined,
      teamContext: deps.sanitizeTextField(payload.teamContext ?? team?.teamContext, 1200) || undefined,
      customPrompt: deps.sanitizeTextField(payload.customPrompt ?? team?.customPrompt, 1200) || undefined,
      focusInsights: payload.focusInsights !== undefined ? deps.sanitizeFocusInsights(payload.focusInsights) : team?.focusInsights,
      players: team?.players ?? [],
    };
    return persistSchoolTeams(schoolId, [nextTeam, ...teams.slice(1)]);
  }

  function buildAuthUserView(account: LocalAuthAccount, currentMember: OrganizationMember | null): Record<string, unknown> {
    return {
      accountId: account.accountId,
      email: account.email,
      fullName: account.fullName,
      role: currentMember?.role ?? account.role,
      status: currentMember?.status ?? account.status,
      schoolId: account.schoolId,
      organizationId: currentMember?.organizationId ?? account.organizationId,
      lastLoginAtIso: account.lastLoginAtIso,
    };
  }

  function buildOnboardingProfileView(schoolId: string): OrganizationProfile | null {
    const profile = deps.getOrganizationProfileByScope({ schoolId });
    if (profile) {
      return profile;
    }

    const account = deps.getOnboardingAccountStateByScope({ schoolId });
    if (!account) {
      return null;
    }

    return {
      schoolId,
      organizationName: account.organization.organizationName,
      organizationSlug: account.organization.organizationSlug,
      coachName: account.primaryCoach.fullName,
      coachEmail: account.primaryCoach.email,
      teamName: account.organization.teamName,
      season: account.organization.season,
      completedAtIso: account.organization.onboardingCompletedAtIso,
      createdAtIso: account.organization.createdAtIso,
      updatedAtIso: account.organization.updatedAtIso,
    };
  }

  function buildOnboardingCompletionSummary(schoolId: string) {
    const profile = buildOnboardingProfileView(schoolId);
    const account = deps.getOnboardingAccountStateByScope({ schoolId });
    const { teams, team } = getPrimaryTeam(schoolId);
    return {
      completed: Boolean((account?.organization.onboardingCompletedAtIso || profile?.completedAtIso) && team?.name?.trim()),
      hasAccount: Boolean(account?.organization.organizationName && account?.primaryCoach.email),
      hasProfile: Boolean(profile),
      hasTeam: Boolean(team?.name?.trim()),
      teamCount: teams.length,
    };
  }

  function buildAuthSessionResponse(
    schoolId: string,
    account: LocalAuthAccount,
    currentMember: OrganizationMember | null,
    token?: string | null,
  ) {
    return {
      authenticated: true as const,
      token: token ?? null,
      user: buildAuthUserView(account, currentMember),
      currentMember,
      onboarding: buildOnboardingCompletionSummary(schoolId),
    };
  }

  function readAuthClaim(authContext: AuthContext | undefined, path: string): unknown {
    const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
    let current: unknown = authContext?.claims;
    for (const part of parts) {
      if (!current || typeof current !== "object" || !(part in current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  function buildSuggestedCoachIdentity(authContext: AuthContext | undefined): { coachName?: string; coachEmail?: string } | null {
    const coachEmail = deps.sanitizeTextField(
      readAuthClaim(authContext, "email")
        ?? readAuthClaim(authContext, "user.email")
        ?? readAuthClaim(authContext, "preferred_username"),
      160,
    ).toLowerCase();

    const fullName = deps.sanitizeTextField(
      readAuthClaim(authContext, "name")
        ?? [
          deps.sanitizeTextField(readAuthClaim(authContext, "given_name"), 80),
          deps.sanitizeTextField(readAuthClaim(authContext, "family_name"), 80),
        ].filter(Boolean).join(" ")
        ?? readAuthClaim(authContext, "user.name"),
      120,
    );

    if (!coachEmail && !fullName) {
      return null;
    }

    return {
      coachName: fullName || undefined,
      coachEmail: coachEmail || undefined,
    };
  }

  function resolveAuthSubject(authContext: AuthContext | undefined): string | undefined {
    const subject = deps.sanitizeTextField(authContext?.subject, 120);
    return subject || undefined;
  }

  function resolveCurrentOrganizationMember(req: Request, schoolId: string): OrganizationMember | null {
    const authContext = (req as ScopedRequest).authContext;
    const subject = resolveAuthSubject(authContext);
    const email = deps.sanitizeTextField(
      readAuthClaim(authContext, "email")
        ?? readAuthClaim(authContext, "user.email")
        ?? readAuthClaim(authContext, "preferred_username"),
      160,
    ).toLowerCase();
    const members = deps.getOrganizationMembersByScope({ schoolId });
    return members.find((member) =>
      (subject && member.authSubject === subject) || (email && member.email === email)
    ) ?? null;
  }

  function activateKnownMemberForAccount(schoolId: string, account: LocalAuthAccount): OrganizationMember | null {
    const existing = deps.getOrganizationMembersByScope({ schoolId }).find((member) =>
      member.authSubject === account.accountId || member.email === account.email,
    ) ?? null;

    if (!existing) {
      return null;
    }

    return deps.saveOrganizationMember({
      memberId: existing.memberId,
      organizationId: existing.organizationId,
      authSubject: account.accountId,
      fullName: account.fullName || existing.fullName,
      email: account.email,
      role: existing.role,
      status: "active",
      invitedAtIso: existing.invitedAtIso,
      joinedAtIso: existing.joinedAtIso || new Date().toISOString(),
    }, { schoolId });
  }

  function ensureAuthenticatedOrganizationMember(req: Request, schoolId: string): OrganizationMember | null {
    const authContext = (req as ScopedRequest).authContext;
    const subject = resolveAuthSubject(authContext);
    const suggested = buildSuggestedCoachIdentity(authContext);
    const email = deps.sanitizeTextField(suggested?.coachEmail, 160).toLowerCase();
    if (!subject && !email) {
      return null;
    }

    const account = deps.getOnboardingAccountStateByScope({ schoolId });
    if (!account) {
      return resolveCurrentOrganizationMember(req, schoolId);
    }

    const existing = resolveCurrentOrganizationMember(req, schoolId);
    if (existing?.status === "active" && existing.authSubject === subject) {
      return existing;
    }

    if (!existing) {
      return null;
    }

    return deps.saveOrganizationMember({
      memberId: existing.memberId,
      organizationId: account.organization.organizationId,
      authSubject: subject,
      fullName: deps.sanitizeTextField(suggested?.coachName ?? existing.fullName, 120),
      email: email || existing.email,
      role: existing.role,
      status: "active",
      invitedAtIso: existing.invitedAtIso,
      joinedAtIso: existing.joinedAtIso || new Date().toISOString(),
    }, { schoolId });
  }

  function withSuggestedOnboardingIdentity(req: Request, payload: Record<string, unknown>): Record<string, unknown> {
    const authContext = (req as ScopedRequest).authContext;
    const suggested = buildSuggestedCoachIdentity(authContext);
    if (!suggested) {
      return payload;
    }

    return {
      ...payload,
      coachName: deps.sanitizeTextField(payload.coachName, 120) || suggested.coachName,
      coachEmail: deps.sanitizeTextField(payload.coachEmail, 160) || suggested.coachEmail,
    };
  }

  function ensureOwnerMembership(req: Request, schoolId: string, account: OnboardingAccountState): OrganizationMember {
    const payload = withSuggestedOnboardingIdentity(req, {});
    const existingMember = ensureAuthenticatedOrganizationMember(req, schoolId);
    const role = existingMember?.role ?? "owner";
    return deps.saveOrganizationMember({
      organizationId: account.organization.organizationId,
      authSubject: resolveAuthSubject((req as ScopedRequest).authContext),
      fullName: deps.sanitizeTextField(payload.coachName ?? account.primaryCoach.fullName, 120),
      email: deps.sanitizeTextField(payload.coachEmail ?? account.primaryCoach.email, 160).toLowerCase(),
      role,
      status: "active",
      joinedAtIso: new Date().toISOString(),
    }, { schoolId });
  }

  function requireOrganizationOwner(req: Request, res: Response): OrganizationMember | null {
    const schoolId = deps.getSchoolIdFromRequest(req);
    const currentMember = ensureAuthenticatedOrganizationMember(req, schoolId);
    if (!currentMember) {
      res.status(403).json({ error: "Organization membership required" });
      return null;
    }
    if (currentMember.role !== "owner") {
      res.status(403).json({ error: "Organization owner role required" });
      return null;
    }
    return currentMember;
  }

  function requireOrganizationManager(req: Request, res: Response): OrganizationMember | null {
    const schoolId = deps.getSchoolIdFromRequest(req);
    const currentMember = ensureAuthenticatedOrganizationMember(req, schoolId);
    if (!currentMember) {
      res.status(403).json({ error: "Organization membership required" });
      return null;
    }
    if (currentMember.role === "player") {
      res.status(403).json({ error: "Organization manager role required" });
      return null;
    }
    return currentMember;
  }

  function normalizeMemberRole(value: unknown, fallback: OrganizationMember["role"] = "coach"): OrganizationMember["role"] {
    return value === "owner" || value === "coach" || value === "analyst" || value === "player"
      ? value
      : fallback;
  }

  return {
    getPrimaryTeam,
    persistSchoolTeams,
    upsertPrimaryTeam,
    buildOnboardingProfileView,
    buildOnboardingCompletionSummary,
    buildAuthSessionResponse,
    buildSuggestedCoachIdentity,
    resolveCurrentOrganizationMember,
    ensureAuthenticatedOrganizationMember,
    ensureOwnerMembership,
    requireOrganizationOwner,
    requireOrganizationManager,
    normalizeMemberRole,
    withSuggestedOnboardingIdentity,
    activateKnownMemberForAccount,
  };
}
