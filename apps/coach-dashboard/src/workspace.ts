import { apiBase, apiKeyHeader } from "./platform.js";

export interface WorkspaceSchool {
  schoolId: string;
  name: string;
  slug: string;
  sport: "basketball";
  status: "draft" | "active";
}

export interface WorkspaceSchoolMembership {
  membershipId: string;
  schoolId: string;
  userId?: string;
  email: string;
  fullName: string;
  role: "owner" | "school_admin";
  status: "active" | "invited";
}

export interface WorkspaceTeamMembership {
  membershipId: string;
  schoolId: string;
  teamId: string;
  userId?: string;
  email: string;
  fullName: string;
  role: "head_coach" | "assistant_coach" | "operator" | "viewer";
  status: "active" | "invited";
}

export interface WorkspaceTeam {
  id: string;
  schoolId?: string;
  sport?: "basketball";
  gender?: "boys" | "girls" | "custom";
  level?: "varsity" | "jv" | "freshman" | "custom";
  customLabel?: string;
  displayName?: string;
  name: string;
  abbreviation: string;
  teamColor?: string;
  status?: "active" | "archived" | "read_only";
  players: Array<{
    id: string;
    number: string;
    name: string;
    position: string;
    grade?: string;
  }>;
  staffCount?: number;
  rosterCount?: number;
  liveSession?: {
    liveSessionId: string;
    gameId: string;
    pairingCode: string;
  } | null;
}

export interface WorkspaceContext {
  user?: {
    userId?: string;
    email?: string;
    fullName?: string;
  };
  profile?: {
    lastSchoolId?: string;
    lastTeamId?: string;
    lastContextType?: "school" | "team";
  } | null;
  schools: WorkspaceSchool[];
  schoolMemberships: WorkspaceSchoolMembership[];
  teamMemberships: WorkspaceTeamMembership[];
  teams: WorkspaceTeam[];
  defaultContext: {
    type: "school" | "team";
    schoolId: string;
    teamId?: string;
  };
}

export interface SchoolOverviewPayload {
  school: WorkspaceSchool;
  summary: {
    activeTeamsCount: number;
    activeLiveGamesCount: number;
    staffCount: number;
    billingStatus: string;
    planId: string;
    activeTeamLimit?: number | null;
    overLimitTeamCount?: number;
  };
  teams: WorkspaceTeam[];
  staff: {
    schoolMemberships: WorkspaceSchoolMembership[];
    teamMemberships: WorkspaceTeamMembership[];
  };
  activity: Array<{
    id: string;
    teamId?: string;
    type: string;
    message: string;
    createdAtIso: string;
  }>;
  billing?: {
    status?: string;
    trialEndsAtIso?: string;
  } | null;
}

export interface StaffMutationResult {
  staff: {
    schoolMemberships: WorkspaceSchoolMembership[];
    teamMemberships: WorkspaceTeamMembership[];
  };
  invitePath?: string;
  warning?: string;
}

export async function fetchWorkspaceContext(): Promise<WorkspaceContext> {
  const response = await fetch(`${apiBase}/api/me/context`, { headers: apiKeyHeader() });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not load workspace context.");
  }
  return response.json() as Promise<WorkspaceContext>;
}

export async function saveWorkspaceContextPreference(input: { schoolId: string; teamId?: string; contextType: "school" | "team" }): Promise<void> {
  const response = await fetch(`${apiBase}/api/me/context`, {
    method: "PUT",
    headers: apiKeyHeader(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not save workspace preference.");
  }
}

export async function bootstrapSchoolWorkspace(input: { schoolId: string; schoolName: string }): Promise<{ school: WorkspaceSchool }> {
  const response = await fetch(`${apiBase}/api/schools/bootstrap`, {
    method: "POST",
    headers: apiKeyHeader(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not create school workspace.");
  }
  return response.json() as Promise<{ school: WorkspaceSchool }>;
}

export async function fetchSchoolOverview(schoolId: string): Promise<SchoolOverviewPayload> {
  const response = await fetch(`${apiBase}/api/schools/${encodeURIComponent(schoolId)}/overview`, {
    headers: apiKeyHeader(),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not load school overview.");
  }
  return response.json() as Promise<SchoolOverviewPayload>;
}

export async function createSchoolTeam(schoolId: string, input: {
  gender: "boys" | "girls" | "custom";
  level: "varsity" | "jv" | "freshman" | "custom";
  displayName: string;
  customLabel?: string;
  abbreviation?: string;
  teamColor?: string;
}): Promise<{ team: WorkspaceTeam; billingNotice?: string }> {
  const response = await fetch(`${apiBase}/api/schools/${encodeURIComponent(schoolId)}/teams`, {
    method: "POST",
    headers: apiKeyHeader(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not create team.");
  }
  return response.json() as Promise<{ team: WorkspaceTeam; billingNotice?: string }>;
}

export async function deleteSchoolTeam(schoolId: string, teamId: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/schools/${encodeURIComponent(schoolId)}/teams/${encodeURIComponent(teamId)}`, {
    method: "DELETE",
    headers: apiKeyHeader(),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not delete team.");
  }
}

export async function createTeamLiveSession(teamId: string, input: {
  opponentName: string;
  gameId?: string;
  pairingCode?: string;
  vcSide?: "home" | "away";
  homeTeamColor?: string;
  awayTeamColor?: string;
  startingLineup?: string[];
}): Promise<{
  liveSession: {
    liveSessionId: string;
    schoolId: string;
    teamId: string;
    gameId: string;
    opponentName: string;
    pairingCode: string;
    status: "active" | "ended";
  };
  team: WorkspaceTeam;
  pairing: {
    pairingCode: string;
    operatorToken?: string | null;
  };
}> {
  const response = await fetch(`${apiBase}/api/teams/${encodeURIComponent(teamId)}/live-sessions`, {
    method: "POST",
    headers: apiKeyHeader(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not start live session.");
  }
  return response.json() as Promise<{
    liveSession: {
      liveSessionId: string;
      schoolId: string;
      teamId: string;
      gameId: string;
      opponentName: string;
      pairingCode: string;
      status: "active" | "ended";
    };
    team: WorkspaceTeam;
    pairing: {
      pairingCode: string;
      operatorToken?: string | null;
    };
  }>;
}

export async function inviteSchoolStaff(schoolId: string, input: {
  fullName: string;
  email: string;
  schoolRole?: "school_admin";
  teamRole?: "head_coach" | "assistant_coach" | "operator" | "viewer";
  teamId?: string;
}): Promise<StaffMutationResult> {
  const response = await fetch(`${apiBase}/api/schools/${encodeURIComponent(schoolId)}/staff/invitations`, {
    method: "POST",
    headers: apiKeyHeader(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not invite staff member.");
  }
  return response.json() as Promise<StaffMutationResult>;
}

export async function resendSchoolMembershipInvite(schoolId: string, membershipType: "school" | "team", membershipId: string): Promise<{ invitePath?: string; warning?: string }> {
  const segment = membershipType === "school" ? "school-memberships" : "team-memberships";
  const response = await fetch(`${apiBase}/api/schools/${encodeURIComponent(schoolId)}/staff/${segment}/${encodeURIComponent(membershipId)}/resend-invite`, {
    method: "POST",
    headers: apiKeyHeader(true),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not resend invite.");
  }
  return response.json() as Promise<{ invitePath?: string; warning?: string }>;
}

export async function removeSchoolStaffMembership(schoolId: string, membershipType: "school" | "team", membershipId: string): Promise<StaffMutationResult> {
  const segment = membershipType === "school" ? "school-memberships" : "team-memberships";
  const response = await fetch(`${apiBase}/api/schools/${encodeURIComponent(schoolId)}/staff/${segment}/${encodeURIComponent(membershipId)}`, {
    method: "DELETE",
    headers: apiKeyHeader(),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not remove staff member.");
  }
  return response.json() as Promise<StaffMutationResult>;
}

export async function updateSchoolStaffMembership(schoolId: string, membershipType: "school" | "team", membershipId: string, input: {
  role?: "school_admin" | "head_coach" | "assistant_coach" | "operator" | "viewer";
  teamId?: string;
  status?: "active" | "invited";
}): Promise<StaffMutationResult> {
  const segment = membershipType === "school" ? "school-memberships" : "team-memberships";
  const response = await fetch(`${apiBase}/api/schools/${encodeURIComponent(schoolId)}/staff/${segment}/${encodeURIComponent(membershipId)}`, {
    method: "PUT",
    headers: apiKeyHeader(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not update staff membership.");
  }
  return response.json() as Promise<StaffMutationResult>;
}
