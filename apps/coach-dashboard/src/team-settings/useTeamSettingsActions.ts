import type { FormEvent } from "react";
import { useState } from "react";
import { apiBase, apiKeyHeader, buildAuthRedirectUrl } from "../platform.js";
import { requestSupabasePasswordReset } from "../supabase/client.js";
import { buildInviteDeliveryStatus, createEmptyNewPlayer, mapOrganizationMembers, parseFocusInsightsText, roleToApi } from "./helpers.js";
import type { AppMemberRole, InviteActionResponse, NewPlayerFormState, OrganizationMemberDto, RosterEditRow, TeamDto } from "./types.js";

interface Params {
  team: TeamDto | null;
  profile: { organizationName?: string; coachName?: string; coachEmail?: string; teamName?: string; season?: string } | null;
  playingStyle: string;
  teamContext: string;
  customPrompt: string;
  focusInsightsText: string;
  inviteName: string;
  inviteEmail: string;
  inviteRole: AppMemberRole;
  members: OrganizationMemberDto[];
  newPlayer: NewPlayerFormState;
  setMembers: React.Dispatch<React.SetStateAction<OrganizationMemberDto[]>>;
  setRoster: React.Dispatch<React.SetStateAction<RosterEditRow[]>>;
  setInviteName: React.Dispatch<React.SetStateAction<string>>;
  setInviteEmail: React.Dispatch<React.SetStateAction<string>>;
  setInviteRole: React.Dispatch<React.SetStateAction<AppMemberRole>>;
  setNewPlayer: React.Dispatch<React.SetStateAction<NewPlayerFormState>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
}

export function useTeamSettingsActions({
  team,
  profile,
  playingStyle,
  teamContext,
  customPrompt,
  focusInsightsText,
  inviteName,
  inviteEmail,
  inviteRole,
  members,
  newPlayer,
  setMembers,
  setRoster,
  setInviteName,
  setInviteEmail,
  setInviteRole,
  setNewPlayer,
  setStatus,
}: Params) {
  const [saving, setSaving] = useState(false);

  async function saveOrganizationProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile?.organizationName?.trim() || !profile.coachName?.trim() || !profile.coachEmail?.trim()) {
      setStatus("Organization, coach name, and coach email are required.");
      return;
    }

    setSaving(true);
    setStatus("Saving organization profile...");

    try {
      const response = await fetch(`${apiBase}/api/onboarding/account`, {
        method: "PUT",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          organizationName: profile.organizationName.trim(),
          coachName: profile.coachName.trim(),
          coachEmail: profile.coachEmail.trim(),
          teamName: team?.name?.trim() || profile.teamName?.trim() || undefined,
          season: team?.season?.trim() || profile.season?.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Organization profile save failed");
      }

      setStatus("Organization profile saved.");
    } catch {
      setStatus("Could not save organization profile.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTeamProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!team?.name?.trim()) {
      setStatus("Team profile unavailable. Complete setup first.");
      return;
    }
    const teamId = team.id;
    if (!teamId) {
      setStatus("No active team selected.");
      return;
    }

    setSaving(true);
    setStatus("Saving team profile...");

    try {
      const response = await fetch(`${apiBase}/api/teams/${encodeURIComponent(teamId)}`, {
        method: "PUT",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          name: team.name.trim(),
          abbreviation: team.abbreviation?.trim() || undefined,
          season: team.season?.trim() || undefined,
          teamColor: team.teamColor?.trim() || undefined,
          playingStyle: playingStyle.trim() || undefined,
          teamContext: teamContext.trim() || undefined,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Team save failed");
      }

      setStatus("Team profile saved.");
    } catch {
      setStatus("Could not save team profile.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAiSettings() {
    const teamId = team?.id;
    if (!teamId) {
      setStatus("No active team selected.");
      return;
    }

    setSaving(true);
    setStatus("Saving AI settings...");

    try {
      const response = await fetch(`${apiBase}/api/teams/${encodeURIComponent(teamId)}`, {
        method: "PUT",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          playingStyle: playingStyle.trim() || undefined,
          teamContext: teamContext.trim() || undefined,
          customPrompt: customPrompt.trim() || undefined,
          focusInsights: parseFocusInsightsText(focusInsightsText),
        }),
      });

      if (!response.ok) {
        throw new Error("AI settings save failed");
      }

      setStatus("AI settings saved.");
    } catch {
      setStatus("Could not save AI settings.");
    } finally {
      setSaving(false);
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setStatus("Invite name and email are required.");
      return;
    }

    setSaving(true);
    setStatus("Sending organization invite...");

    try {
      const response = await fetch(`${apiBase}/api/org/members`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          fullName: inviteName.trim(),
          email: inviteEmail.trim(),
          role: roleToApi(inviteRole),
        }),
      });

      if (!response.ok) {
        throw new Error("Invite failed");
      }

      const payload = await response.json() as InviteActionResponse;
      setMembers(mapOrganizationMembers(payload.members));
      setInviteName("");
      setInviteEmail("");
      setInviteRole("coach");
      setStatus("Organization member invited.");
    } catch {
      setStatus("Could not invite organization member.");
    } finally {
      setSaving(false);
    }
  }

  async function saveMember(member: OrganizationMemberDto) {
    setSaving(true);
    setStatus(`Saving ${member.fullName}...`);

    try {
      const response = await fetch(`${apiBase}/api/org/members/${encodeURIComponent(member.memberId)}`, {
        method: "PUT",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          fullName: member.fullName,
          role: roleToApi(member.role),
          status: member.status,
        }),
      });

      if (!response.ok) {
        throw new Error("Member save failed");
      }

      const payload = await response.json() as InviteActionResponse;
      setMembers(mapOrganizationMembers(payload.members));
      setStatus("Organization member updated.");
    } catch {
      setStatus("Could not update organization member.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member: OrganizationMemberDto) {
    setSaving(true);
    setStatus(`Removing ${member.fullName}...`);

    try {
      const response = await fetch(`${apiBase}/api/org/members/${encodeURIComponent(member.memberId)}`, {
        method: "DELETE",
        headers: apiKeyHeader(),
      });

      if (!response.ok) {
        throw new Error("Member remove failed");
      }

      const payload = await response.json() as InviteActionResponse;
      setMembers(mapOrganizationMembers(payload.members));
      setStatus("Organization member removed.");
    } catch {
      setStatus("Could not remove organization member.");
    } finally {
      setSaving(false);
    }
  }

  async function resendMemberInvite(member: OrganizationMemberDto) {
    setSaving(true);
    setStatus(`Sending invite to ${member.email}...`);

    try {
      const response = await fetch(`${apiBase}/api/org/members/${encodeURIComponent(member.memberId)}/resend-invite`, {
        method: "POST",
        headers: apiKeyHeader(true),
      });

      const payload = await response.json().catch(() => ({})) as InviteActionResponse;
      if (!response.ok) {
        throw new Error("Invite resend failed");
      }

      setMembers(Array.isArray(payload.members) ? mapOrganizationMembers(payload.members) : members);
      setStatus(buildInviteDeliveryStatus(member.email, payload.emailDelivery, payload.warning));
    } catch {
      setStatus("Could not resend member invite email.");
    } finally {
      setSaving(false);
    }
  }

  async function sendPasswordResetEmail(email: string) {
    setSaving(true);
    setStatus(`Sending password reset email to ${email}...`);

    try {
      await requestSupabasePasswordReset(email.trim().toLowerCase(), buildAuthRedirectUrl("/reset-password"));
      setStatus(`Password reset email sent to ${email}.`);
    } catch {
      setStatus("Could not send password reset email.");
    } finally {
      setSaving(false);
    }
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newPlayer.name.trim();
    if (!name) {
      setStatus("Player name is required.");
      return;
    }

    setSaving(true);
    setStatus(`Adding ${name}...`);

    const teamId = team?.id;
    if (!teamId) {
      setStatus("No active team selected.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`${apiBase}/teams/${encodeURIComponent(teamId)}/players`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          name,
          number: newPlayer.number.trim() || undefined,
          position: newPlayer.position.trim() || undefined,
          grade: newPlayer.grade.trim() || undefined,
          height: newPlayer.height.trim() || undefined,
          weight: newPlayer.weight.trim() || undefined,
          role: newPlayer.role.trim() || undefined,
          notes: newPlayer.notes.trim() || undefined,
          email: newPlayer.email.trim() || undefined,
          phone: newPlayer.phone.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Add player failed");
      }

      const payload = await response.json() as { player?: { id?: string } };
      setRoster((current) => [
        ...current,
        {
          key: `new-${Date.now()}`,
          playerId: payload.player?.id,
          originalName: name,
          name,
          number: newPlayer.number.trim(),
          position: newPlayer.position.trim(),
          grade: newPlayer.grade.trim(),
          height: newPlayer.height.trim(),
          weight: newPlayer.weight.trim(),
          role: newPlayer.role.trim(),
          notes: newPlayer.notes.trim(),
          email: newPlayer.email.trim(),
          phone: newPlayer.phone.trim(),
        },
      ]);
      setNewPlayer(createEmptyNewPlayer());
      setStatus(`${name} added to roster.`);
    } catch {
      setStatus("Could not add player.");
    } finally {
      setSaving(false);
    }
  }

  async function savePlayer(row: RosterEditRow) {
    const name = row.name.trim();
    if (!name) {
      return;
    }

    setSaving(true);
    setStatus(`Saving ${name}...`);

    const teamId = team?.id;
    if (!teamId || !row.playerId) {
      setStatus("Cannot save: missing team or player ID.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`${apiBase}/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(row.playerId)}`, {
        method: "PUT",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          name,
          number: row.number.trim() || undefined,
          position: row.position.trim() || undefined,
          grade: row.grade.trim() || undefined,
          height: row.height?.trim() || undefined,
          weight: row.weight?.trim() || undefined,
          role: row.role?.trim() || undefined,
          notes: row.notes?.trim() || undefined,
          email: row.email?.trim() || undefined,
          phone: row.phone?.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Save player failed");
      }

      setRoster((current) => current.map((entry) => (
        entry.key === row.key
          ? {
              ...entry,
              originalName: name,
              name,
              number: row.number.trim(),
              position: row.position.trim(),
              grade: row.grade.trim(),
              height: row.height?.trim() || "",
              weight: row.weight?.trim() || "",
              role: row.role?.trim() || "",
              notes: row.notes?.trim() || "",
              email: row.email?.trim() || "",
              phone: row.phone?.trim() || "",
            }
          : entry
      )));
      setStatus(`${name} saved.`);
    } catch {
      setStatus("Could not save player.");
    } finally {
      setSaving(false);
    }
  }

  async function removePlayer(row: RosterEditRow) {
    const name = row.name.trim();
    if (!name) {
      setRoster((current) => current.filter((entry) => entry.key !== row.key));
      return;
    }

    setSaving(true);
    setStatus(`Removing ${name}...`);

    const teamId = team?.id;
    if (!teamId || !row.playerId) {
      setStatus("Cannot remove: missing team or player ID.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`${apiBase}/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(row.playerId)}`, {
        method: "DELETE",
        headers: apiKeyHeader(),
      });

      if (!response.ok) {
        throw new Error("Remove player failed");
      }

      setRoster((current) => current.filter((entry) => entry.key !== row.key));
      setStatus(`${name} removed.`);
    } catch {
      setStatus("Could not remove player.");
    } finally {
      setSaving(false);
    }
  }

  async function sendPlayerInviteEmail(row: RosterEditRow) {
    const playerName = row.originalName.trim() || row.name.trim();
    if (!playerName) {
      setStatus("Save the player first before sending an invite.");
      return;
    }

    setSaving(true);
    setStatus(`Sending invite to ${row.email}...`);

    try {
      const response = await fetch(`${apiBase}/api/player/${encodeURIComponent(playerName)}/send-invite`, {
        method: "POST",
        headers: apiKeyHeader(true),
      });

      const payload = await response.json().catch(() => ({})) as { emailDelivery?: { delivered?: boolean; skipped?: boolean; reason?: string }; warning?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Could not send player invite email.");
      }

      setStatus(buildInviteDeliveryStatus(row.email, payload.emailDelivery, payload.warning));
    } catch {
      setStatus("Could not send player invite email.");
    } finally {
      setSaving(false);
    }
  }

  return {
    saving,
    saveOrganizationProfile,
    saveTeamProfile,
    saveAiSettings,
    inviteMember,
    saveMember,
    removeMember,
    resendMemberInvite,
    sendPasswordResetEmail,
    addPlayer,
    savePlayer,
    removePlayer,
    sendPlayerInviteEmail,
  };
}
