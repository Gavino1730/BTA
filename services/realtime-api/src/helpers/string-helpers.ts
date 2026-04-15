import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import type {
  CoachAiSettings,
  OnboardingAccountInput,
  OrganizationMember,
  OrganizationProfile,
  RosterPlayer,
  RosterTeam,
} from "../store.js";

// ---------------------------------------------------------------------------
// AI settings options
// ---------------------------------------------------------------------------

export const TEAM_AI_FOCUS_OPTIONS = new Set<CoachAiSettings["focusInsights"][number]>([
  "timeouts",
  "substitutions",
  "foul_management",
  "momentum",
  "shot_selection",
  "ball_security",
  "hot_hand",
  "defense",
]);

// ---------------------------------------------------------------------------
// String normalization
// ---------------------------------------------------------------------------

export function normalizePersonName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeNameKey(value: unknown): string {
  return normalizePersonName(value).toLowerCase();
}

// ---------------------------------------------------------------------------
// Organization / team slug builders
// ---------------------------------------------------------------------------

export function buildOrganizationSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function buildTeamAbbreviation(name: string): string {
  const compact = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return compact.slice(0, 4) || "TEAM";
}

export function buildSchoolTeamId(name: string): string {
  const slug = buildOrganizationSlug(name);
  return `team-${slug || "team"}`;
}

export function buildUniqueSchoolTeamId(name: string, teams: RosterTeam[]): string {
  const base = buildSchoolTeamId(name);
  const existing = new Set(teams.map((team) => team.id));
  if (!existing.has(base)) {
    return base;
  }
  let attempt = 2;
  while (existing.has(`${base}-${attempt}`)) {
    attempt += 1;
  }
  return `${base}-${attempt}`;
}

// ---------------------------------------------------------------------------
// Payload field resolvers
// ---------------------------------------------------------------------------

export function sanitizeTextField(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function resolveSchoolName(payload: Record<string, unknown>): string {
  return sanitizeTextField(
    payload.schoolName ?? payload.organizationName ?? payload.school,
    160,
  );
}

export function resolveCoachName(payload: Record<string, unknown>): string {
  return sanitizeTextField(payload.coachName ?? payload.fullName, 120);
}

export function resolveCoachEmail(payload: Record<string, unknown>): string {
  return sanitizeTextField(payload.coachEmail ?? payload.email, 160).toLowerCase();
}

export function shouldSyncPrimaryCoachIdentity(role: OrganizationMember["role"]): boolean {
  return role === "owner" || role === "coach";
}

// ---------------------------------------------------------------------------
// Password helpers
// ---------------------------------------------------------------------------

export function hashPassword(password: string, salt?: string): { passwordHash: string; passwordSalt: string } {
  const passwordSalt = salt ?? randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, passwordSalt, 64).toString("hex");
  return { passwordHash, passwordSalt };
}

export function verifyPassword(password: string, passwordSalt: string, passwordHash: string): boolean {
  if (!password || !passwordSalt || !passwordHash) {
    return false;
  }
  try {
    const actual = scryptSync(password, passwordSalt, 64);
    const expected = Buffer.from(passwordHash, "hex");
    if (actual.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Team AI settings
// ---------------------------------------------------------------------------

export function defaultTeamAiSettings(): CoachAiSettings {
  return {
    playingStyle: "",
    teamContext: "",
    customPrompt: "",
    focusInsights: [
      "timeouts",
      "substitutions",
      "foul_management",
      "momentum",
      "shot_selection",
      "ball_security",
      "hot_hand",
      "defense",
    ],
  };
}

export function sanitizeFocusInsights(value: unknown): CoachAiSettings["focusInsights"] {
  if (!Array.isArray(value)) {
    return defaultTeamAiSettings().focusInsights;
  }
  const normalized = [
    ...new Set(
      value
        .map((item) => String(item).trim().toLowerCase())
        .filter((item): item is CoachAiSettings["focusInsights"][number] =>
          TEAM_AI_FOCUS_OPTIONS.has(item as CoachAiSettings["focusInsights"][number])
        )
    ),
  ];
  return normalized.length > 0 ? normalized : defaultTeamAiSettings().focusInsights;
}

export function extractTeamAiSettings(team?: RosterTeam | null): CoachAiSettings {
  const defaults = defaultTeamAiSettings();
  return {
    playingStyle: sanitizeTextField(team?.playingStyle, 500) || defaults.playingStyle,
    teamContext: sanitizeTextField(team?.teamContext, 1200) || defaults.teamContext,
    customPrompt: sanitizeTextField(team?.customPrompt, 1200) || defaults.customPrompt,
    focusInsights: sanitizeFocusInsights(team?.focusInsights),
  };
}

// ---------------------------------------------------------------------------
// Player / roster builders
// ---------------------------------------------------------------------------

export function buildPlayerId(teamId: string, playerName: string): string {
  const slug = normalizeNameKey(playerName)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${teamId}-${slug || Date.now().toString()}`;
}

export function buildRosterPlayer(
  input: Record<string, unknown>,
  teamId: string,
  existingPlayer?: RosterPlayer,
): RosterPlayer | null {
  const name = normalizePersonName(input.name ?? existingPlayer?.name);
  if (!name) {
    return null;
  }
  return {
    id: existingPlayer?.id ?? buildPlayerId(teamId, name),
    number: sanitizeTextField(input.number ?? existingPlayer?.number, 8),
    name,
    position: sanitizeTextField(input.position ?? existingPlayer?.position, 24),
    height: sanitizeTextField(input.height ?? existingPlayer?.height, 32) || undefined,
    weight: sanitizeTextField(input.weight ?? existingPlayer?.weight, 32) || undefined,
    grade: sanitizeTextField(input.grade ?? existingPlayer?.grade, 16) || undefined,
    role: sanitizeTextField(input.role ?? existingPlayer?.role, 80) || undefined,
    notes: sanitizeTextField(input.notes ?? existingPlayer?.notes, 240) || undefined,
    email: sanitizeTextField(input.email ?? existingPlayer?.email, 200) || undefined,
    phone: sanitizeTextField(input.phone ?? existingPlayer?.phone, 30) || undefined,
  };
}

export function findPlayerRecord(
  teams: RosterTeam[],
  playerName: string,
): { team: RosterTeam; player: RosterPlayer; playerIndex: number; teamIndex: number } | null {
  const targetKey = normalizeNameKey(playerName);
  for (const [teamIndex, team] of teams.entries()) {
    const playerIndex = team.players.findIndex((player) => normalizeNameKey(player.name) === targetKey);
    if (playerIndex >= 0) {
      return { team, player: team.players[playerIndex]!, playerIndex, teamIndex };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Organization profile / onboarding payload builders
// ---------------------------------------------------------------------------

export function buildOrganizationProfilePayload(
  schoolId: string,
  payload: Record<string, unknown>,
  options?: { complete?: boolean },
): Partial<OrganizationProfile> {
  const organizationName = resolveSchoolName(payload);
  const coachName = resolveCoachName(payload);
  const coachEmail = resolveCoachEmail(payload);
  return {
    schoolId,
    organizationName,
    organizationSlug: buildOrganizationSlug(organizationName),
    coachName,
    coachEmail,
    teamName: sanitizeTextField(payload.teamName, 120) || undefined,
    season: sanitizeTextField(payload.season, 40) || undefined,
    completedAtIso: options?.complete ? new Date().toISOString() : undefined,
  };
}

export function buildOnboardingAccountPayload(
  schoolId: string,
  payload: Record<string, unknown>,
  options?: { complete?: boolean },
): OnboardingAccountInput {
  const organizationName = resolveSchoolName(payload);
  const coachName = resolveCoachName(payload);
  const coachEmail = resolveCoachEmail(payload);
  return {
    organization: {
      schoolId,
      organizationName,
      organizationSlug: buildOrganizationSlug(organizationName),
      teamName: sanitizeTextField(payload.teamName, 120) || undefined,
      season: sanitizeTextField(payload.season, 40) || undefined,
      onboardingCompletedAtIso: options?.complete ? new Date().toISOString() : undefined,
    },
    primaryCoach: {
      schoolId,
      fullName: coachName,
      email: coachEmail,
      role: "owner",
      organizationId: "",
      accountId: "",
      createdAtIso: "",
      updatedAtIso: "",
    },
  };
}

export function requireOnboardingIdentity(
  payload: Record<string, unknown>,
  res: Response,
): boolean {
  const organizationName = resolveSchoolName(payload);
  const coachName = resolveCoachName(payload);
  const coachEmail = resolveCoachEmail(payload);
  if (!organizationName || !coachName || !coachEmail) {
    res.status(400).json({ error: "schoolName, coachName, and coachEmail are required" });
    return false;
  }
  return true;
}
