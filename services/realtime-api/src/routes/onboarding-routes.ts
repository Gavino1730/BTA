import type { Express, NextFunction, Request, Response } from "express";
import type {
  OnboardingAccountInput,
  OrganizationProfile,
  RosterPlayer,
} from "../store.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

type RequestSchoolResolution = {
  schoolId?: string;
  error?: string;
  status?: number;
};

type PrimaryTeam = {
  id?: string;
  name?: string;
  season?: unknown;
  teamColor?: unknown;
  coachStyle?: unknown;
  playingStyle?: unknown;
  teamContext?: unknown;
  abbreviation?: string;
  players: RosterPlayer[];
};

type OnboardingPayload = Record<string, unknown>;

interface RegisterOnboardingRoutesOptions {
  requireApiKey: Middleware;
  requireWriteRole: Middleware;
  resolveRequestSchoolId: (req: Request, options?: { suppressMissingScopeTelemetry?: boolean }) => RequestSchoolResolution;
  getSchoolIdFromRequest: (req: Request) => string;
  getSuggestedCoachIdentity: (req: Request) => unknown;
  buildOnboardingProfileView: (schoolId: string) => unknown;
  getOnboardingAccountStateByScope: (scope: { schoolId: string }) => unknown;
  getPrimaryTeam: (schoolId: string) => { teams: PrimaryTeam[]; team: PrimaryTeam | null };
  withSuggestedOnboardingIdentity: (req: Request, payload: OnboardingPayload) => OnboardingPayload;
  requireOnboardingIdentity: (payload: OnboardingPayload, res: Response) => boolean;
  saveOnboardingAccountState: (payload: OnboardingAccountInput, scope: { schoolId: string }) => unknown;
  buildOnboardingAccountPayload: (schoolId: string, payload: OnboardingPayload, options?: { complete?: boolean }) => OnboardingAccountInput;
  ensureAuthenticatedOrganizationMember: (req: Request, schoolId: string) => unknown;
  ensureOwnerMembership: (req: Request, schoolId: string, account: any) => unknown;
  saveOrganizationProfile: (payload: Partial<OrganizationProfile>, scope: { schoolId: string }) => unknown;
  buildOrganizationProfilePayload: (schoolId: string, payload: OnboardingPayload, options?: { complete?: boolean }) => Partial<OrganizationProfile>;
  buildOrganizationSlug: (name: string) => string;
  normalizeNameKey: (name: string) => string;
  buildRosterPlayer: (entry: OnboardingPayload, teamId: string, existing?: RosterPlayer | undefined) => RosterPlayer | null;
  upsertPrimaryTeam: (schoolId: string, payload: Record<string, unknown>) => PrimaryTeam[];
  persistSchoolTeams: (schoolId: string, teams: any) => PrimaryTeam[];
  sanitizeTextField: (value: unknown, maxLength: number) => string;
  buildTeamAbbreviation: (name: string) => string;
}

export function registerOnboardingRoutes(app: Express, options: RegisterOnboardingRoutesOptions): void {
  app.get("/api/onboarding/state", (req, res) => {
    const schoolResolution = options.resolveRequestSchoolId(req, { suppressMissingScopeTelemetry: true });
    const schoolId = schoolResolution.schoolId;
    if (!schoolId) {
      if (schoolResolution.error && schoolResolution.error !== "schoolId is required") {
        res.status(schoolResolution.status ?? 400).json({ error: schoolResolution.error });
        return;
      }

      res.json({
        completed: false,
        hasAccount: false,
        hasProfile: false,
        hasTeam: false,
        teamCount: 0,
        account: null,
        profile: null,
        suggestedCoach: options.getSuggestedCoachIdentity(req),
      });
      return;
    }

    const profile = options.buildOnboardingProfileView(schoolId);
    const account = options.getOnboardingAccountStateByScope({ schoolId }) as
      | { organization?: { organizationName?: string; onboardingCompletedAtIso?: string }; primaryCoach?: { email?: string } }
      | null;
    const suggestedCoach = options.getSuggestedCoachIdentity(req);
    const { teams, team } = options.getPrimaryTeam(schoolId);
    const completedAtIso = (profile as { completedAtIso?: string } | null)?.completedAtIso;
    const completed = Boolean((account?.organization?.onboardingCompletedAtIso || completedAtIso) && team?.name?.trim());

    res.json({
      completed,
      hasAccount: Boolean(account?.organization?.organizationName && account?.primaryCoach?.email),
      hasProfile: Boolean(profile),
      hasTeam: Boolean(team?.name?.trim()),
      teamCount: teams.length,
      account,
      profile,
      suggestedCoach,
    });
  });

  app.get("/api/onboarding/account", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const currentMember = options.ensureAuthenticatedOrganizationMember(req, schoolId);
    res.json({
      account: options.getOnboardingAccountStateByScope({ schoolId }),
      suggestedCoach: options.getSuggestedCoachIdentity(req),
      currentMember,
    });
  });

  app.put("/api/onboarding/account", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = options.withSuggestedOnboardingIdentity(req, (req.body ?? {}) as OnboardingPayload);
    if (!options.requireOnboardingIdentity(payload, res)) {
      return;
    }

    const account = options.saveOnboardingAccountState(options.buildOnboardingAccountPayload(schoolId, payload), { schoolId });
    const member = options.ensureOwnerMembership(req, schoolId, account);
    const profile = options.saveOrganizationProfile(options.buildOrganizationProfilePayload(schoolId, payload), { schoolId });
    res.json({ message: "Onboarding account saved", account, profile, member });
  });

  app.get("/api/onboarding/profile", (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    res.json({ profile: options.buildOnboardingProfileView(schoolId), suggestedCoach: options.getSuggestedCoachIdentity(req) });
  });

  app.put("/api/onboarding/profile", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = options.withSuggestedOnboardingIdentity(req, (req.body ?? {}) as OnboardingPayload);
    if (!options.requireOnboardingIdentity(payload, res)) {
      return;
    }

    const account = options.saveOnboardingAccountState(options.buildOnboardingAccountPayload(schoolId, payload), { schoolId });
    const member = options.ensureOwnerMembership(req, schoolId, account);
    const saved = options.saveOrganizationProfile(options.buildOrganizationProfilePayload(schoolId, payload), { schoolId });
    res.json({ message: "Onboarding profile saved", profile: saved, account, member });
  });

  app.post("/api/onboarding/complete", options.requireApiKey, options.requireWriteRole, (req, res) => {
    const schoolId = options.getSchoolIdFromRequest(req);
    const payload = options.withSuggestedOnboardingIdentity(req, (req.body ?? {}) as OnboardingPayload);
    if (!options.requireOnboardingIdentity(payload, res)) {
      return;
    }

    const teamName = options.sanitizeTextField(payload.teamName ?? payload.name, 120);
    if (!teamName) {
      res.status(400).json({ error: "teamName is required" });
      return;
    }

    const requestedAbbreviation = options.sanitizeTextField(payload.abbreviation, 12).toUpperCase();

    const existing = options.getPrimaryTeam(schoolId).team;
    const teamId = existing?.id ?? `team-${options.buildOrganizationSlug(teamName) || "primary"}`;
    const currentPlayers = new Map((existing?.players ?? []).map((player) => [options.normalizeNameKey(player.name), player]));
    const rosterPayload = Array.isArray(payload.roster) ? payload.roster : [];
    const players = rosterPayload
      .map((entry) => options.buildRosterPlayer(entry as OnboardingPayload, teamId, currentPlayers.get(options.normalizeNameKey(String((entry as OnboardingPayload).name ?? "")))))
      .filter((player): player is RosterPlayer => Boolean(player));

    const savedTeams = options.upsertPrimaryTeam(schoolId, {
      teamId,
      name: teamName,
      season: payload.season,
      teamColor: payload.teamColor,
      coachStyle: payload.coachStyle ?? existing?.coachStyle,
      playingStyle: payload.playingStyle,
      teamContext: payload.teamContext ?? existing?.teamContext,
      abbreviation: requestedAbbreviation || existing?.abbreviation || options.buildTeamAbbreviation(teamName),
    });

    savedTeams[0]!.players = players;
    const persistedTeams = options.persistSchoolTeams(schoolId, savedTeams);
    const account = options.saveOnboardingAccountState(options.buildOnboardingAccountPayload(schoolId, payload, { complete: true }), { schoolId });
    const member = options.ensureOwnerMembership(req, schoolId, account);
    const profile = options.saveOrganizationProfile(options.buildOrganizationProfilePayload(schoolId, payload, { complete: true }), { schoolId });

    res.status(201).json({
      message: "Onboarding completed successfully",
      completed: true,
      account,
      member,
      profile,
      team: { id: persistedTeams[0]?.id ?? teamId, name: persistedTeams[0]?.name ?? teamName },
      playersLoaded: persistedTeams[0]?.players.length ?? 0,
    });
  });
}
