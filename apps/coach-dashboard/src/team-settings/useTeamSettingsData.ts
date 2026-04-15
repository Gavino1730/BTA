import { useEffect, useState } from "react";
import { apiBase, apiKeyHeader } from "../platform.js";
import { buildProfileState, formatFocusInsights, mapCurrentMember, mapOrganizationMembers, mapRosterPayloadToRows } from "./helpers.js";
import type {
  AiSettingsDto,
  OnboardingAccountResponse,
  OrganizationProfileDto,
  OrganizationMemberDto,
  RosterEditRow,
  RosterPlayerDto,
  TeamDto,
  OrganizationMembersResponse,
} from "./types.js";

export function useTeamSettingsData(activeSchoolId: string) {
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
        const [teamsResponse, aiResponse, profileResponse, membersResponse, rosterResponse] = await Promise.all([
          fetch(`${apiBase}/api/teams`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/ai-settings`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/onboarding/account`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/org/members`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/roster/players`, { headers: apiKeyHeader() }),
        ]);

        if (!teamsResponse.ok || !aiResponse.ok || !profileResponse.ok || !membersResponse.ok) {
          throw new Error("Failed to load settings");
        }

        const teamsPayload = await teamsResponse.json() as { teams?: TeamDto[] };
        const aiPayload = await aiResponse.json() as AiSettingsDto;
        const profilePayload = await profileResponse.json() as OnboardingAccountResponse;
        const membersPayload = await membersResponse.json() as OrganizationMembersResponse;
        const primaryTeam = Array.isArray(teamsPayload.teams) && teamsPayload.teams.length > 0 ? teamsPayload.teams[0] : null;
        const rosterPayload = rosterResponse.ok ? await rosterResponse.json() as RosterPlayerDto[] : [];

        if (cancelled) {
          return;
        }

        setTeam(primaryTeam);
        setProfile(buildProfileState(profilePayload));
        setPlayingStyle(aiPayload.playingStyle ?? primaryTeam?.playingStyle ?? "");
        setTeamContext(aiPayload.teamContext ?? primaryTeam?.teamContext ?? "");
        setCustomPrompt(aiPayload.customPrompt ?? primaryTeam?.customPrompt ?? "");
        setCurrentMember(mapCurrentMember(membersPayload.currentMember));
        setMembers(mapOrganizationMembers(membersPayload.members));
        setRoster(mapRosterPayloadToRows(rosterPayload));
        setFocusInsightsText(formatFocusInsights(aiPayload.focusInsights ?? primaryTeam?.focusInsights));
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
  }, [activeSchoolId]);

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
