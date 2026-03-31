import { type FormEvent, useEffect, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface TeamDto {
  id: string;
  name: string;
  season?: string;
  teamColor?: string;
  playingStyle?: string;
  teamContext?: string;
  customPrompt?: string;
  focusInsights?: string[];
}

interface AiSettingsDto {
  playingStyle?: string;
  teamContext?: string;
  customPrompt?: string;
  focusInsights?: string[];
}

interface OrganizationProfileDto {
  organizationName?: string;
  coachName?: string;
  coachEmail?: string;
  teamName?: string;
  season?: string;
}

interface OnboardingAccountDto {
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

interface OnboardingAccountResponse {
  account?: OnboardingAccountDto | null;
  suggestedCoach?: {
    coachName?: string;
    coachEmail?: string;
  } | null;
}

interface OrganizationMemberDto {
  memberId: string;
  fullName: string;
  email: string;
  role: "owner" | "coach" | "analyst";
  status: "active" | "invited";
}

interface OrganizationMembersResponse {
  currentMember?: OrganizationMemberDto | null;
  members?: OrganizationMemberDto[];
}

export function TeamSettingsPage() {
  const [team, setTeam] = useState<TeamDto | null>(null);
  const [profile, setProfile] = useState<OrganizationProfileDto | null>(null);
  const [members, setMembers] = useState<OrganizationMemberDto[]>([]);
  const [currentMember, setCurrentMember] = useState<OrganizationMemberDto | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationMemberDto["role"]>("coach");
  const [playingStyle, setPlayingStyle] = useState("");
  const [teamContext, setTeamContext] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [focusInsightsText, setFocusInsightsText] = useState("");
  const [status, setStatus] = useState("Loading team settings...");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("Loading team settings...");
      try {
        const [teamsResponse, aiResponse, profileResponse, membersResponse] = await Promise.all([
          fetch(`${apiBase}/api/teams`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/ai-settings`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/onboarding/account`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/org/members`, { headers: apiKeyHeader() }),
        ]);

        if (!teamsResponse.ok || !aiResponse.ok || !profileResponse.ok || !membersResponse.ok) {
          throw new Error("Failed to load settings");
        }

        const teamsPayload = await teamsResponse.json() as { teams?: TeamDto[] };
        const aiPayload = await aiResponse.json() as AiSettingsDto;
        const profilePayload = await profileResponse.json() as OnboardingAccountResponse;
        const membersPayload = await membersResponse.json() as OrganizationMembersResponse;
        const primary = Array.isArray(teamsPayload.teams) && teamsPayload.teams.length > 0 ? teamsPayload.teams[0] : null;
        const account = profilePayload.account;
        const suggestedCoach = profilePayload.suggestedCoach;

        if (!cancelled) {
          setTeam(primary);
          setProfile(account ? {
            organizationName: account.organization?.organizationName,
            coachName: account.primaryCoach?.fullName ?? suggestedCoach?.coachName,
            coachEmail: account.primaryCoach?.email ?? suggestedCoach?.coachEmail,
            teamName: account.organization?.teamName,
            season: account.organization?.season,
          } : (suggestedCoach?.coachName || suggestedCoach?.coachEmail ? {
            coachName: suggestedCoach.coachName,
            coachEmail: suggestedCoach.coachEmail,
          } : null));
          setPlayingStyle(aiPayload.playingStyle ?? primary?.playingStyle ?? "");
          setTeamContext(aiPayload.teamContext ?? primary?.teamContext ?? "");
          setCustomPrompt(aiPayload.customPrompt ?? primary?.customPrompt ?? "");
          setCurrentMember(membersPayload.currentMember ?? null);
          setMembers(Array.isArray(membersPayload.members) ? membersPayload.members : []);
          const focus = aiPayload.focusInsights ?? primary?.focusInsights ?? [];
          setFocusInsightsText(focus.join(", "));
          setStatus("Settings synced.");
        }
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
  }, []);

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

    setSaving(true);
    setStatus("Saving team profile...");

    try {
      const response = await fetch(`${apiBase}/api/team`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          name: team.name.trim(),
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
    const focusInsights = focusInsightsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    setSaving(true);
    setStatus("Saving AI settings...");

    try {
      const response = await fetch(`${apiBase}/api/ai-settings`, {
        method: "PUT",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          playingStyle: playingStyle.trim() || undefined,
          teamContext: teamContext.trim() || undefined,
          customPrompt: customPrompt.trim() || undefined,
          focusInsights,
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
          role: inviteRole,
        }),
      });

      if (!response.ok) {
        throw new Error("Invite failed");
      }

      const payload = await response.json() as { members?: OrganizationMemberDto[] };
      setMembers(Array.isArray(payload.members) ? payload.members : []);
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
          role: member.role,
          status: member.status,
        }),
      });

      if (!response.ok) {
        throw new Error("Member save failed");
      }

      const payload = await response.json() as { members?: OrganizationMemberDto[] };
      setMembers(Array.isArray(payload.members) ? payload.members : []);
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

      const payload = await response.json() as { members?: OrganizationMemberDto[] };
      setMembers(Array.isArray(payload.members) ? payload.members : []);
      setStatus("Organization member removed.");
    } catch {
      setStatus("Could not remove organization member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <p className="stats-page-eyebrow">Unified Coach Platform</p>
          <h1>Team Settings</h1>
          <p className="stats-page-subtitle">Manage team profile and AI context directly inside the coach workspace.</p>
        </div>
        <p className="stats-page-status">{status}</p>
      </section>

      <form className="stats-page-card setup-form" onSubmit={saveOrganizationProfile}>
        <div className="stats-page-card-head">
          <h3>Organization Profile</h3>
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Save Org</button>
        </div>

        <div className="setup-grid">
          <label className="stats-filter-field">
            <span>Organization Name</span>
            <input
              value={profile?.organizationName ?? ""}
              onChange={(event) => setProfile((current) => ({ ...(current ?? {}), organizationName: event.target.value }))}
              placeholder="Valley Catholic Athletics"
            />
          </label>
          <label className="stats-filter-field">
            <span>Coach Name</span>
            <input
              value={profile?.coachName ?? ""}
              onChange={(event) => setProfile((current) => ({ ...(current ?? {}), coachName: event.target.value }))}
              placeholder="Coach Rivera"
            />
          </label>
          <label className="stats-filter-field">
            <span>Coach Email</span>
            <input
              type="email"
              value={profile?.coachEmail ?? ""}
              onChange={(event) => setProfile((current) => ({ ...(current ?? {}), coachEmail: event.target.value }))}
              placeholder="coach@school.org"
            />
          </label>
        </div>
      </form>

      <form className="stats-page-card setup-form" onSubmit={saveTeamProfile}>
        <div className="stats-page-card-head">
          <h3>Team Profile</h3>
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Save Team</button>
        </div>

        <div className="setup-grid">
          <label className="stats-filter-field">
            <span>Team Name</span>
            <input
              value={team?.name ?? ""}
              onChange={(event) => setTeam((current) => ({ ...(current ?? { id: "primary-team", name: "" }), name: event.target.value }))}
              placeholder="Team name"
            />
          </label>
          <label className="stats-filter-field">
            <span>Season</span>
            <input
              value={team?.season ?? ""}
              onChange={(event) => setTeam((current) => ({ ...(current ?? { id: "primary-team", name: "" }), season: event.target.value }))}
              placeholder="2026"
            />
          </label>
          <label className="stats-filter-field">
            <span>Team Color</span>
            <input
              type="color"
              value={team?.teamColor || "#1d4ed8"}
              onChange={(event) => setTeam((current) => ({ ...(current ?? { id: "primary-team", name: "" }), teamColor: event.target.value }))}
            />
          </label>
        </div>
      </form>

      <section className="stats-page-card setup-form">
        <div className="stats-page-card-head">
          <h3>AI Context</h3>
          <button type="button" className="shell-nav-link shell-nav-link-active" disabled={saving} onClick={() => void saveAiSettings()}>
            Save AI Settings
          </button>
        </div>

        <div className="setup-grid">
          <label className="stats-filter-field">
            <span>Playing Style</span>
            <input value={playingStyle} onChange={(event) => setPlayingStyle(event.target.value)} placeholder="Fast pace, drive and kick" />
          </label>
          <label className="stats-filter-field">
            <span>Focus Insights</span>
            <input value={focusInsightsText} onChange={(event) => setFocusInsightsText(event.target.value)} placeholder="timeouts, substitutions, defensive matchups" />
          </label>
          <label className="stats-filter-field">
            <span>Team Context</span>
            <input value={teamContext} onChange={(event) => setTeamContext(event.target.value)} placeholder="Rebounding emphasis and transition defense" />
          </label>
          <label className="stats-filter-field">
            <span>Custom Prompt</span>
            <input value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} placeholder="Use concise halftime adjustments with risk level." />
          </label>
        </div>
      </section>

      <section className="stats-page-card setup-form">
        <div className="stats-page-card-head">
          <h3>Organization Members</h3>
        </div>

        {currentMember && (
          <p className="stats-page-status">Signed in as {currentMember.fullName} ({currentMember.role}).</p>
        )}

        <div className="setup-roster-list">
          {members.map((member) => (
            <div key={member.memberId} className="setup-roster-row">
              <label className="stats-filter-field">
                <span>Name</span>
                <input
                  value={member.fullName}
                  onChange={(event) => setMembers((current) => current.map((entry) => entry.memberId === member.memberId ? { ...entry, fullName: event.target.value } : entry))}
                  readOnly={currentMember?.role !== "owner"}
                />
              </label>
              <label className="stats-filter-field">
                <span>Email</span>
                <input value={member.email} readOnly />
              </label>
              <label className="stats-filter-field">
                <span>Role</span>
                <select
                  value={member.role}
                  onChange={(event) => setMembers((current) => current.map((entry) => entry.memberId === member.memberId ? { ...entry, role: event.target.value as OrganizationMemberDto["role"] } : entry))}
                  disabled={currentMember?.role !== "owner"}
                >
                  <option value="owner">Owner</option>
                  <option value="coach">Coach</option>
                  <option value="analyst">Analyst</option>
                </select>
              </label>
              <label className="stats-filter-field">
                <span>Status</span>
                <input value={member.status} readOnly />
              </label>
              {currentMember?.role === "owner" && (
                <div className="setup-actions">
                  <button type="button" className="shell-nav-link shell-nav-link-active" disabled={saving} onClick={() => void saveMember(member)}>
                    Save Member
                  </button>
                  <button type="button" className="shell-nav-link" disabled={saving || member.memberId === currentMember?.memberId} onClick={() => void removeMember(member)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <form className="setup-form" onSubmit={inviteMember}>
          <div className="stats-page-card-head">
            <h3>Invite Member</h3>
            <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Invite</button>
          </div>
          <div className="setup-grid">
            <label className="stats-filter-field">
              <span>Full Name</span>
              <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Assistant Coach Lee" />
            </label>
            <label className="stats-filter-field">
              <span>Email</span>
              <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="coach2@school.org" />
            </label>
            <label className="stats-filter-field">
              <span>Role</span>
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as OrganizationMemberDto["role"])}>
                <option value="coach">Coach</option>
                <option value="analyst">Analyst</option>
                <option value="owner">Owner</option>
              </select>
            </label>
          </div>
        </form>
      </section>
    </div>
  );
}
