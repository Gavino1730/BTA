import type { BillingEntitlement } from "../platform.js";

export type SettingsSection = "pairing" | "roster" | "profile" | "ai" | "members" | "billing";

export interface TeamDto {
  id: string;
  name: string;
  abbreviation?: string;
  season?: string;
  teamColor?: string;
  playingStyle?: string;
  teamContext?: string;
  customPrompt?: string;
  focusInsights?: string[];
}

export interface AiSettingsDto {
  playingStyle?: string;
  teamContext?: string;
  customPrompt?: string;
  focusInsights?: string[];
}

export interface OrganizationProfileDto {
  organizationName?: string;
  coachName?: string;
  coachEmail?: string;
  teamName?: string;
  season?: string;
}

export interface OnboardingAccountDto {
  organization?: {
    organizationName?: string;
    teamName?: string;
    season?: string;
  } | null;
  primaryCoach?: {
    fullName?: string;
    email?: string;
  } | null;
}

export interface OnboardingAccountResponse {
  account?: OnboardingAccountDto | null;
  suggestedCoach?: {
    coachName?: string;
    coachEmail?: string;
  } | null;
}

export type AppMemberRole = "admin" | "coach" | "operator" | "player";

export interface OrganizationMemberDto {
  memberId: string;
  fullName: string;
  email: string;
  role: AppMemberRole;
  status: "active" | "invited";
}

export interface OrganizationMembersResponse {
  currentMember?: { memberId: string; fullName: string; email: string; role: string; status: string } | null;
  members?: { memberId: string; fullName: string; email: string; role: string; status: string }[];
}

export interface EmailDeliveryResult {
  delivered?: boolean;
  skipped?: boolean;
  reason?: string;
}

export interface InviteActionResponse {
  members?: { memberId: string; fullName: string; email: string; role: string; status: string }[];
  emailDelivery?: EmailDeliveryResult;
  warning?: string;
}

export interface RosterPlayerDto {
  name: string;
  number?: string | number;
  position?: string;
  grade?: string;
  height?: string;
  weight?: string;
  role?: string;
  notes?: string;
  email?: string;
  phone?: string;
}

export interface RosterEditRow {
  key: string;
  originalName: string;
  name: string;
  number: string;
  position: string;
  grade: string;
  height: string;
  weight: string;
  role: string;
  notes: string;
  email: string;
  phone: string;
  showExpanded?: boolean;
}

export interface NewPlayerFormState {
  name: string;
  number: string;
  position: string;
  grade: string;
  height: string;
  weight: string;
  role: string;
  notes: string;
  email: string;
  phone: string;
}

export interface BillingSummaryState {
  billingEntitlement: BillingEntitlement | null;
  billingStatus: string;
  billingLoading: boolean;
  billingLoadFailed: boolean;
}
