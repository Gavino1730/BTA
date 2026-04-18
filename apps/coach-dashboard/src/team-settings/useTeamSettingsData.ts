import { useEffect, useState } from "react";
import { apiBase, apiKeyHeader } from "../platform.js";
import { buildProfileState, formatFocusInsights, mapCurrentMember, mapOrganizationMembers, mapRosterPayloadToRows } from "./helpers.js";
import type {
  OnboardingAccountResponse,
  OrganizationProfileDto,
  OrganizationMemberDto,
  RosterEditRow,
  TeamDto,
  OrganizationMembersResponse,
} from "./types.js";

export function useTeamSettingsData(activeSchoolId: string, activeTeamId?: string | null) {
  const [team, setTeam] = useState<TeamDto | null>(null);
  const [profile, setProfile] = useState<OrganizationProfileDto | null>(null);
  const [members, setMembers] = useState<OrganizationMemberDto[]>([]);
  const [currentMember, setCurrentMember] = useState<OrganizationMemberDto | null>(null);
  const [roster, setRoster] = useState<RosterEditRow[]>([]);
  const [playingStyle, setPlayingStyle] = useState("");
  const [teamContext, setTeamContext] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [focusInsightsText, setFocusInsightsText] = useState("");
  const [status, setStatus] = useState("Loading team settings...");

  useEffect(() => {
    if (!activeSchoolId) {
      setStatus("Select or sign in to a school before loading team settings.");
      return;
    }

    let cancelled = false;

    async function load() {
      setStatus("Loading team settings...");
      try {
        const [teamsResponse, profileResponse, membersResponse] = await Promise.all([
          fetch(`${apiBase}/api/teams`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/onboarding/account`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/org/members`, { headers: apiKeyHeader() }),
        ]);

        if (!teamsResponse.ok || !profileResponse.ok || !membersResponse.ok) {
          throw new Error("Failed to load settings");
        }

        const teamsPayload = await teamsResponse.json() as { teams?: TeamDto[] };
        const profilePayload = await profileResponse.json() as OnboardingAccountResponse;
        const membersPayload = await membersResponse.json() as OrganizationMembersResponse;
        const allTeams = Array.isArray(teamsPayload.teams) ? teamsPayload.teams : [];
        const primaryTeam = (activeTeamId ? allTeams.find((t) => t.id === activeTeamId) : null) ?? allTeams[0] ?? null;

        if (cancelled) {
          return;
        }

        setTeam(primaryTeam);
        setProfile(buildProfileState(profilePayload));
        setPlayingStyle(primaryTeam?.playingStyle ?? "");
        setTeamContext(primaryTeam?.teamContext ?? "");
        setCustomPrompt(primaryTeam?.customPrompt ?? "");
        setCurrentMember(mapCurrentMember(membersPayload.currentMember));
        setMembers(mapOrganizationMembers(membersPayload.members));
        setRoster(mapRosterPayloadToRows(primaryTeam?.players ?? []));
        setFocusInsightsText(formatFocusInsights(primaryTeam?.focusInsights));
        setStatus("Settings synced.");
      } catch {
        if (!cancelled) {
          setStatus("Could not load team settings from the realtime API.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, activeTeamId]);

  return {
    team,
    setTeam,
    profile,
    setProfile,
    members,
    setMembers,
    currentMember,
    setCurrentMember,
    roster,
    setRoster,
    playingStyle,
    setPlayingStyle,
    teamContext,
    setTeamContext,
    customPrompt,
    setCustomPrompt,
    focusInsightsText,
    setFocusInsightsText,
    status,
    setStatus,
  };
}
