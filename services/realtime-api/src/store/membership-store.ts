import type {
  OnboardingAccountInput,
  OnboardingAccountState,
  OrganizationMember,
  OrganizationMemberInput,
  OrganizationProfile,
  SchoolMembership,
  SchoolRecord,
  TeamMembership,
  TenantScope,
  UserWorkspaceProfile,
} from "./core-store.js";

interface MembershipStoreDependencies {
  resolveSchoolId: (scope?: TenantScope) => string;
  normalizeSchoolId: (schoolId?: string) => string;
  trimProfileField: (value: unknown, maxLength: number) => string;
  buildWorkspaceMembershipId: (seed: string, prefix: string) => string;
  organizationProfilesBySchool: Map<string, OrganizationProfile>;
  onboardingAccountsBySchool: Map<string, OnboardingAccountState>;
  organizationMembersBySchool: Map<string, OrganizationMember[]>;
  userWorkspaceProfilesById: Map<string, UserWorkspaceProfile>;
  schoolsById: Map<string, SchoolRecord>;
  schoolMembershipsBySchool: Map<string, SchoolMembership[]>;
  teamMembershipsBySchool: Map<string, TeamMembership[]>;
  setOrganizationProfileForSchool: (schoolId: string, profile: Partial<OrganizationProfile> | null | undefined) => OrganizationProfile;
  persistOrgProfileForSchool: (schoolId: string, profile: OrganizationProfile) => void | Promise<void>;
  setOnboardingAccountStateForSchool: (
    schoolId: string,
    accountState: OnboardingAccountInput | null | undefined,
  ) => OnboardingAccountState;
  upsertOrganizationMemberForSchool: (
    schoolId: string,
    input: OrganizationMemberInput,
    organizationId: string,
  ) => OrganizationMember;
  setOrganizationMembersForSchool: (schoolId: string, members: OrganizationMember[]) => OrganizationMember[];
  persistOrgMembersForSchool: (schoolId: string, members: OrganizationMember[]) => void | Promise<void>;
  setUserWorkspaceProfile: (
    profile: Partial<UserWorkspaceProfile> & Pick<UserWorkspaceProfile, "userId" | "email">
  ) => UserWorkspaceProfile;
  setSchoolRecord: (record: Partial<SchoolRecord> & Pick<SchoolRecord, "schoolId" | "name">) => SchoolRecord;
  setSchoolMembershipsForSchool: (schoolId: string, memberships: SchoolMembership[]) => SchoolMembership[];
  setTeamMembershipsForSchool: (schoolId: string, memberships: TeamMembership[]) => TeamMembership[];
  persistSessions: () => void;
  persistUserWorkspaceProfile: (profile: UserWorkspaceProfile) => void | Promise<void>;
  persistSchoolRecord: (schoolId: string, record: SchoolRecord | null) => void | Promise<void>;
  persistSchoolMembershipsForSchool: (schoolId: string, memberships: SchoolMembership[]) => void | Promise<void>;
  persistTeamMembershipsForSchool: (schoolId: string, memberships: TeamMembership[]) => void | Promise<void>;
}

export function createMembershipStore(deps: MembershipStoreDependencies) {
  const getOrganizationProfileByScope = (scope?: TenantScope): OrganizationProfile | null => {
    return deps.organizationProfilesBySchool.get(deps.resolveSchoolId(scope)) ?? null;
  };

  const saveOrganizationProfile = (profile: Partial<OrganizationProfile>, scope?: TenantScope): OrganizationProfile => {
    const schoolId = deps.resolveSchoolId(scope);
    const saved = deps.setOrganizationProfileForSchool(schoolId, profile);
    deps.persistSessions();
    void deps.persistOrgProfileForSchool(schoolId, saved);
    return saved;
  };

  const getOnboardingAccountStateByScope = (scope?: TenantScope): OnboardingAccountState | null => {
    return deps.onboardingAccountsBySchool.get(deps.resolveSchoolId(scope)) ?? null;
  };

  const saveOnboardingAccountState = (accountState: OnboardingAccountInput, scope?: TenantScope): OnboardingAccountState => {
    const schoolId = deps.resolveSchoolId(scope);
    const saved = deps.setOnboardingAccountStateForSchool(schoolId, accountState);
    deps.persistSessions();
    return saved;
  };

  const getOrganizationMembersByScope = (scope?: TenantScope): OrganizationMember[] => {
    return deps.organizationMembersBySchool.get(deps.resolveSchoolId(scope)) ?? [];
  };

  const saveOrganizationMember = (member: OrganizationMemberInput, scope?: TenantScope): OrganizationMember => {
    const schoolId = deps.resolveSchoolId(scope);
    const organizationId = deps.trimProfileField(member.organizationId, 80)
      || deps.onboardingAccountsBySchool.get(schoolId)?.organization.organizationId
      || `org-${schoolId}`;
    const saved = deps.upsertOrganizationMemberForSchool(schoolId, member, organizationId);
    deps.persistSessions();
    void deps.persistOrgMembersForSchool(schoolId, deps.organizationMembersBySchool.get(schoolId) ?? []);
    return saved;
  };

  const deleteOrganizationMember = (memberId: string, scope?: TenantScope): boolean => {
    const schoolId = deps.resolveSchoolId(scope);
    const members = deps.organizationMembersBySchool.get(schoolId) ?? [];
    const next = members.filter((member) => member.memberId !== memberId);
    if (next.length === members.length) {
      return false;
    }

    deps.setOrganizationMembersForSchool(schoolId, next);
    deps.persistSessions();
    void deps.persistOrgMembersForSchool(schoolId, next);
    return true;
  };

  const getUserWorkspaceProfile = (userId: string): UserWorkspaceProfile | null => {
    const normalizedUserId = deps.trimProfileField(userId, 120);
    return normalizedUserId ? deps.userWorkspaceProfilesById.get(normalizedUserId) ?? null : null;
  };

  const saveUserWorkspaceProfile = (
    profile: Partial<UserWorkspaceProfile> & Pick<UserWorkspaceProfile, "userId" | "email">
  ): UserWorkspaceProfile => {
    const saved = deps.setUserWorkspaceProfile(profile);
    deps.persistSessions();
    void deps.persistUserWorkspaceProfile(saved);
    return saved;
  };

  const getSchoolRecord = (schoolId: string): SchoolRecord | null => {
    return deps.schoolsById.get(deps.normalizeSchoolId(schoolId)) ?? null;
  };

  const saveSchoolRecord = (record: Partial<SchoolRecord> & Pick<SchoolRecord, "schoolId" | "name">): SchoolRecord => {
    const saved = deps.setSchoolRecord(record);
    deps.persistSessions();
    void deps.persistSchoolRecord(saved.schoolId, saved);
    return saved;
  };

  const getSchoolMembershipsByScope = (scope?: TenantScope): SchoolMembership[] => {
    return deps.schoolMembershipsBySchool.get(deps.resolveSchoolId(scope)) ?? [];
  };

  const saveSchoolMembership = (
    membership: Partial<SchoolMembership> & Pick<SchoolMembership, "schoolId" | "email" | "fullName" | "role">
  ): SchoolMembership => {
    const schoolId = deps.normalizeSchoolId(membership.schoolId);
    const current = deps.schoolMembershipsBySchool.get(schoolId) ?? [];
    const normalizedEmail = deps.trimProfileField(membership.email, 160).toLowerCase();
    const existing = current.find((entry) =>
      (membership.userId && entry.userId === membership.userId)
      || entry.email === normalizedEmail
      || (membership.membershipId && entry.membershipId === membership.membershipId)
    );
    const createdMembership: SchoolMembership = {
      membershipId: deps.trimProfileField(membership.membershipId, 120)
        || deps.buildWorkspaceMembershipId(`${schoolId}:${membership.userId ?? membership.email}:${membership.role}`, "school-member"),
      schoolId,
      userId: deps.trimProfileField(membership.userId, 120) || undefined,
      email: normalizedEmail,
      fullName: deps.trimProfileField(membership.fullName, 120),
      role: membership.role,
      status: membership.status === "invited" ? "invited" : "active",
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    };
    const merged = existing
      ? current.map((entry) => (entry.membershipId === existing.membershipId
        ? {
            ...entry,
            ...membership,
            schoolId,
            email: normalizedEmail,
            fullName: deps.trimProfileField(membership.fullName, 120),
            updatedAtIso: new Date().toISOString(),
          }
        : entry))
      : [...current, createdMembership];
    const saved = deps.setSchoolMembershipsForSchool(schoolId, merged).find((entry) =>
      (membership.userId && entry.userId === membership.userId) || entry.email === normalizedEmail
    );
    deps.persistSessions();
    void deps.persistSchoolMembershipsForSchool(schoolId, deps.schoolMembershipsBySchool.get(schoolId) ?? []);
    return saved!;
  };

  const deleteSchoolMembership = (membershipId: string, scope?: TenantScope): boolean => {
    const schoolId = deps.resolveSchoolId(scope);
    const current = deps.schoolMembershipsBySchool.get(schoolId) ?? [];
    const normalizedMembershipId = deps.trimProfileField(membershipId, 120);
    const next = current.filter((entry) => entry.membershipId !== normalizedMembershipId);
    if (next.length === current.length) {
      return false;
    }

    deps.schoolMembershipsBySchool.set(schoolId, next);
    deps.persistSessions();
    void deps.persistSchoolMembershipsForSchool(schoolId, next);
    return true;
  };

  const getTeamMembershipsByScope = (scope?: TenantScope): TeamMembership[] => {
    return deps.teamMembershipsBySchool.get(deps.resolveSchoolId(scope)) ?? [];
  };

  const saveTeamMembership = (
    membership: Partial<TeamMembership> & Pick<TeamMembership, "schoolId" | "teamId" | "email" | "fullName" | "role">
  ): TeamMembership => {
    const schoolId = deps.normalizeSchoolId(membership.schoolId);
    const current = deps.teamMembershipsBySchool.get(schoolId) ?? [];
    const normalizedTeamId = deps.trimProfileField(membership.teamId, 120);
    const normalizedEmail = deps.trimProfileField(membership.email, 160).toLowerCase();
    const existing = current.find((entry) =>
      (membership.membershipId && entry.membershipId === membership.membershipId)
      || (
        entry.teamId === normalizedTeamId
        && (
          (membership.userId && entry.userId === membership.userId)
          || entry.email === normalizedEmail
        )
      )
    );
    const createdMembership: TeamMembership = {
      membershipId: deps.trimProfileField(membership.membershipId, 120)
        || deps.buildWorkspaceMembershipId(`${schoolId}:${membership.teamId}:${membership.userId ?? membership.email}:${membership.role}`, "team-member"),
      schoolId,
      teamId: normalizedTeamId,
      userId: deps.trimProfileField(membership.userId, 120) || undefined,
      email: normalizedEmail,
      fullName: deps.trimProfileField(membership.fullName, 120),
      role: membership.role,
      status: membership.status === "invited" ? "invited" : "active",
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    };
    const merged = existing
      ? current.map((entry) => (entry.membershipId === existing.membershipId
        ? {
            ...entry,
            ...membership,
            schoolId,
            teamId: normalizedTeamId,
            email: normalizedEmail,
            fullName: deps.trimProfileField(membership.fullName, 120),
            updatedAtIso: new Date().toISOString(),
          }
        : entry))
      : [...current, createdMembership];
    const saved = deps.setTeamMembershipsForSchool(schoolId, merged).find((entry) =>
      (membership.membershipId && entry.membershipId === membership.membershipId)
      || (
        entry.teamId === normalizedTeamId
        && ((membership.userId && entry.userId === membership.userId) || entry.email === normalizedEmail)
      )
    );
    deps.persistSessions();
    void deps.persistTeamMembershipsForSchool(schoolId, deps.teamMembershipsBySchool.get(schoolId) ?? []);
    return saved!;
  };

  const deleteTeamMembership = (membershipId: string, scope?: TenantScope): boolean => {
    const schoolId = deps.resolveSchoolId(scope);
    const current = deps.teamMembershipsBySchool.get(schoolId) ?? [];
    const normalizedMembershipId = deps.trimProfileField(membershipId, 120);
    const next = current.filter((entry) => entry.membershipId !== normalizedMembershipId);
    if (next.length === current.length) {
      return false;
    }

    deps.teamMembershipsBySchool.set(schoolId, next);
    deps.persistSessions();
    void deps.persistTeamMembershipsForSchool(schoolId, next);
    return true;
  };

  const listSchoolMembershipsForUser = (input: { userId?: string; email?: string }): SchoolMembership[] => {
    const normalizedUserId = deps.trimProfileField(input.userId, 120);
    const normalizedEmail = deps.trimProfileField(input.email, 160).toLowerCase();
    return [...deps.schoolMembershipsBySchool.values()]
      .flat()
      .filter((membership) => (normalizedUserId && membership.userId === normalizedUserId) || (normalizedEmail && membership.email === normalizedEmail));
  };

  const listTeamMembershipsForUser = (input: { schoolId?: string; userId?: string; email?: string }): TeamMembership[] => {
    const normalizedSchoolId = deps.trimProfileField(input.schoolId, 80);
    const normalizedUserId = deps.trimProfileField(input.userId, 120);
    const normalizedEmail = deps.trimProfileField(input.email, 160).toLowerCase();
    const source = normalizedSchoolId
      ? [deps.teamMembershipsBySchool.get(deps.normalizeSchoolId(normalizedSchoolId)) ?? []]
      : [...deps.teamMembershipsBySchool.values()];
    return source
      .flat()
      .filter((membership) => (normalizedUserId && membership.userId === normalizedUserId) || (normalizedEmail && membership.email === normalizedEmail));
  };

  return {
    getOrganizationProfileByScope,
    saveOrganizationProfile,
    getOnboardingAccountStateByScope,
    saveOnboardingAccountState,
    getOrganizationMembersByScope,
    saveOrganizationMember,
    deleteOrganizationMember,
    getUserWorkspaceProfile,
    saveUserWorkspaceProfile,
    getSchoolRecord,
    saveSchoolRecord,
    getSchoolMembershipsByScope,
    saveSchoolMembership,
    deleteSchoolMembership,
    getTeamMembershipsByScope,
    saveTeamMembership,
    deleteTeamMembership,
    listSchoolMembershipsForUser,
    listTeamMembershipsForUser,
  };
}
