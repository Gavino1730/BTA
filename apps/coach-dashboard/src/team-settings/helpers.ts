import type { BillingEntitlement } from "../platform.js";
import {
  CONNECTION_CODE_STORAGE_KEY,
  FOCUS_INSIGHT_OPTIONS,
  SETTINGS_SECTION_STORAGE_KEY,
} from "./constants.js";
import type {
  AppMemberRole,
  EmailDeliveryResult,
  NewPlayerFormState,
  OnboardingAccountResponse,
  OrganizationMemberDto,
  OrganizationMembersResponse,
  OrganizationProfileDto,
  RosterEditRow,
  RosterPlayerDto,
  SettingsSection,
  TeamDto,
} from "./types.js";

export function normalizeSettingsSection(value: string | null | undefined, fallback: SettingsSection): SettingsSection {
  if (value === "pairing" || value === "roster" || value === "profile" || value === "ai" || value === "members" || value === "billing") {
    return value;
  }

  return fallback;
}

export function resolveInitialSettingsSection(search: string, storedSection: string | null, fallback: SettingsSection = "pairing"): SettingsSection {
  const fromQuery = new URLSearchParams(search).get("section") ?? new URLSearchParams(search).get("tab");
  if (fromQuery) {
    return normalizeSettingsSection(fromQuery, fallback);
  }

  return normalizeSettingsSection(storedSection, fallback);
}

export function readRequestedSettingsSection(search: string, fallback: SettingsSection): SettingsSection | null {
  const requested = new URLSearchParams(search).get("section") ?? new URLSearchParams(search).get("tab");
  if (!requested) {
    return null;
  }

  return normalizeSettingsSection(requested, fallback);
}

export function persistSettingsSection(section: SettingsSection): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, section);
}

export function navigateWithinCoachApp(path: string): void {
  if (window.location.pathname === path) {
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }

  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function roleFromApi(apiRole: string): AppMemberRole {
  if (apiRole === "owner") return "admin";
  if (apiRole === "analyst") return "operator";
  if (apiRole === "player") return "player";
  return "coach";
}

export function roleToApi(appRole: AppMemberRole): string {
  if (appRole === "admin") return "owner";
  if (appRole === "operator") return "analyst";
  if (appRole === "player") return "player";
  return "coach";
}

export function mapOrganizationMember(member: { memberId: string; fullName: string; email: string; role: string; status: string }): OrganizationMemberDto {
  return {
    ...member,
    role: roleFromApi(member.role),
    status: member.status as "active" | "invited",
  };
}

export function mapOrganizationMembers(members: OrganizationMembersResponse["members"] | undefined): OrganizationMemberDto[] {
  return Array.isArray(members) ? members.map(mapOrganizationMember) : [];
}

export function mapCurrentMember(member: OrganizationMembersResponse["currentMember"]): OrganizationMemberDto | null {
  return member ? mapOrganizationMember(member) : null;
}

export function buildProfileState(payload: OnboardingAccountResponse): OrganizationProfileDto | null {
  const account = payload.account;
  const suggestedCoach = payload.suggestedCoach;

  if (account) {
    return {
      organizationName: account.organization?.organizationName,
      coachName: account.primaryCoach?.fullName ?? suggestedCoach?.coachName,
      coachEmail: account.primaryCoach?.email ?? suggestedCoach?.coachEmail,
      teamName: account.organization?.teamName,
      season: account.organization?.season,
    };
  }

  if (suggestedCoach?.coachName || suggestedCoach?.coachEmail) {
    return {
      coachName: suggestedCoach.coachName,
      coachEmail: suggestedCoach.coachEmail,
    };
  }

  return null;
}

export function mapRosterPlayerToEditRow(player: RosterPlayerDto, index: number): RosterEditRow {
  return {
    key: `existing-${index}-${player.name ?? ""}`,
    playerId: player.id,
    originalName: player.name ?? "",
    name: player.name ?? "",
    number: String(player.number ?? ""),
    position: player.position ?? "",
    grade: player.grade ?? "",
    height: player.height ?? "",
    weight: player.weight ?? "",
    role: player.role ?? "",
    notes: player.notes ?? "",
    email: player.email ?? "",
    phone: player.phone ?? "",
  };
}

export function mapRosterPayloadToRows(players: RosterPlayerDto[] | undefined): RosterEditRow[] {
  return Array.isArray(players) ? players.map(mapRosterPlayerToEditRow) : [];
}

export function createEmptyNewPlayer(): NewPlayerFormState {
  return {
    name: "",
    number: "",
    position: "",
    grade: "",
    height: "",
    weight: "",
    role: "",
    notes: "",
    email: "",
    phone: "",
  };
}

export function isValidEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function buildInviteDeliveryStatus(email: string, emailDelivery?: EmailDeliveryResult, warning?: string): string {
  if (warning?.trim()) {
    return warning;
  }
  if (emailDelivery?.delivered) {
    return `Invite email sent to ${email}.`;
  }
  if (emailDelivery?.skipped) {
    return emailDelivery.reason?.trim() || `Invite created, but email delivery is disabled for ${email}.`;
  }
  if (emailDelivery && emailDelivery.delivered === false) {
    return emailDelivery.reason?.trim() || `Invite created, but email delivery failed for ${email}.`;
  }

  return `Invite created for ${email}.`;
}

export function parseFocusInsightsText(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatFocusInsights(value: string[] | undefined): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

export function toggleFocusInsightValue(currentValue: string, key: string): string {
  const active = new Set(parseFocusInsightsText(currentValue).map((item) => item.toLowerCase()));
  if (active.has(key)) {
    active.delete(key);
  } else {
    active.add(key);
  }

  const ordered = FOCUS_INSIGHT_OPTIONS.map((option) => option.key).filter((optionKey) => active.has(optionKey));
  const customValues = Array.from(active).filter((value) => !FOCUS_INSIGHT_OPTIONS.some((option) => option.key === value));
  return [...ordered, ...customValues].join(", ");
}

export function buildBillingStatusMessage(entitlement: BillingEntitlement | null): string {
  if (!entitlement) {
    return "Could not load billing status. Open Billing from Stripe to retry.";
  }
  if (entitlement.accessActive) {
    return "Your subscription is active. Open Billing from Stripe to manage your subscription details.";
  }
  if (entitlement.status === "past_due" || entitlement.status === "unpaid") {
    return "Your account needs payment attention. Open Billing from Stripe to restore full access.";
  }
  if (entitlement.status === "canceled") {
    return "Your subscription is canceled. Open Billing from Stripe to reactivate access.";
  }
  return "No active subscription found. Open Billing from Stripe to start your plan.";
}

export function createDefaultTeam(): TeamDto {
  return { id: "primary-team", name: "" };
}

export function getInitialConnectionCode(
  generateConnectionCode: () => string,
  normalizeConnectionCode: (value: string | null | undefined) => string,
): string {
  if (typeof window === "undefined") {
    return generateConnectionCode();
  }

  const storedCode = normalizeConnectionCode(window.localStorage.getItem(CONNECTION_CODE_STORAGE_KEY));
  const initialCode = storedCode || generateConnectionCode();
  window.localStorage.setItem(CONNECTION_CODE_STORAGE_KEY, initialCode);
  return initialCode;
}

export function persistConnectionCode(connectionCode: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CONNECTION_CODE_STORAGE_KEY, connectionCode);
}

export function getStoredSettingsSection(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(SETTINGS_SECTION_STORAGE_KEY);
}
