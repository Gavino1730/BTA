import { type FormEvent, useEffect, useState } from "react";
import { apiBase, apiKeyHeader, generateConnectionCode, normalizeConnectionCode } from "./platform.js";

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

// UI-facing roles (admin = owner, operator = analyst on the API side)
type AppMemberRole = "admin" | "coach" | "operator";

function roleFromApi(apiRole: string): AppMemberRole {
  if (apiRole === "owner") return "admin";
  if (apiRole === "analyst") return "operator";
  return "coach";
}

function roleToApi(appRole: AppMemberRole): string {
  if (appRole === "admin") return "owner";
  if (appRole === "operator") return "analyst";
  return "coach";
}

interface OrganizationMemberDto {
  memberId: string;
  fullName: string;
  email: string;
  role: AppMemberRole;
  status: "active" | "invited";
}

interface OrganizationMembersResponse {
  currentMember?: { memberId: string; fullName: string; email: string; role: string; status: string } | null;
  members?: { memberId: string; fullName: string; email: string; role: string; status: string }[];
}

interface RosterPlayerDto {
  name: string;
  number?: string | number;
  position?: string;
  grade?: string;
}

interface RosterEditRow {
  key: string;
  name: string;
  number: string;
  position: string;
  grade: string;
  isNew?: boolean;
}

export function TeamSettingsPage() {
  const [team, setTeam] = useState<TeamDto | null>(null);
  const [profile, setProfile] = useState<OrganizationProfileDto | null>(null);
  const [members, setMembers] = useState<OrganizationMemberDto[]>([]);
  const [currentMember, setCurrentMember] = useState<OrganizationMemberDto | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppMemberRole>("coach");
  const [roster, setRoster] = useState<RosterEditRow[]>([]);
  const [newPlayer, setNewPlayer] = useState<{ name: string; number: string; position: string; grade: string }>({ name: "", number: "", position: "", grade: "" });
  const [activeSection, setActiveSection] = useState<"pairing" | "roster" | "profile" | "ai" | "members">("pairing");
  const [playingStyle, setPlayingStyle] = useState("");
  const [teamContext, setTeamContext] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [focusInsightsText, setFocusInsightsText] = useState("");
  const [connectionCode, setConnectionCode] = useState(() => {
    if (typeof window === "undefined") {
      return generateConnectionCode();
    }

    const storedCode = normalizeConnectionCode(window.localStorage.getItem("coach-bound-connection-id"));
    const initialCode = storedCode || generateConnectionCode();
    window.localStorage.setItem("coach-bound-connection-id", initialCode);
    return initialCode;
  });
  const [status, setStatus] = useState("Loading team settings...");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
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
          const rawCurrent = membersPayload.currentMember;
          setCurrentMember(rawCurrent ? { ...rawCurrent, role: roleFromApi(rawCurrent.role), status: (rawCurrent.status as "active" | "invited") } : null);
          setMembers(Array.isArray(membersPayload.members) ? membersPayload.members.map((m) => ({ ...m, role: roleFromApi(m.role), status: (m.status as "active" | "invited") })) : []);
          if (rosterResponse.ok) {
            const rosterPayload = await rosterResponse.json() as RosterPlayerDto[];
            setRoster(
              Array.isArray(rosterPayload)
                ? rosterPayload.map((p, i) => ({
                    key: `existing-${i}-${p.name}`,
                    name: p.name ?? "",
                    number: String(p.number ?? ""),
                    position: p.position ?? "",
                    grade: p.grade ?? "",
                  }))
                : []
            );
          }
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("coach-bound-connection-id", connectionCode);
  }, [connectionCode]);

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
          role: roleToApi(inviteRole),
        }),
      });

      if (!response.ok) {
        throw new Error("Invite failed");
      }

      const payload = await response.json() as { members?: { memberId: string; fullName: string; email: string; role: string; status: string }[] };
      setMembers(Array.isArray(payload.members) ? payload.members.map((m) => ({ ...m, role: roleFromApi(m.role), status: (m.status as "active" | "invited") })) : []);
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

      const payload = await response.json() as { members?: { memberId: string; fullName: string; email: string; role: string; status: string }[] };
      setMembers(Array.isArray(payload.members) ? payload.members.map((m) => ({ ...m, role: roleFromApi(m.role), status: (m.status as "active" | "invited") })) : []);
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

      const payload = await response.json() as { members?: { memberId: string; fullName: string; email: string; role: string; status: string }[] };
      setMembers(Array.isArray(payload.members) ? payload.members.map((m) => ({ ...m, role: roleFromApi(m.role), status: (m.status as "active" | "invited") })) : []);
      setStatus("Organization member removed.");
    } catch {
      setStatus("Could not remove organization member.");
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

    try {
      const response = await fetch(`${apiBase}/api/player/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          number: newPlayer.number.trim() || undefined,
          position: newPlayer.position.trim() || undefined,
          grade: newPlayer.grade.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Add player failed");
      }

      setRoster((current) => [
        ...current,
        { key: `new-${Date.now()}`, name, number: newPlayer.number.trim(), position: newPlayer.position.trim(), grade: newPlayer.grade.trim() },
      ]);
      setNewPlayer({ name: "", number: "", position: "", grade: "" });
      setStatus(`${name} added to roster.`);
    } catch {
      setStatus("Could not add player.");
    } finally {
      setSaving(false);
    }
  }

  async function savePlayer(row: RosterEditRow) {
    const name = row.name.trim();
    if (!name) return;

    setSaving(true);
    setStatus(`Saving ${name}...`);

    try {
      const response = await fetch(`${apiBase}/api/player/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          number: row.number.trim() || undefined,
          position: row.position.trim() || undefined,
          grade: row.grade.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Save player failed");
      }

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
      setRoster((current) => current.filter((r) => r.key !== row.key));
      return;
    }

    setSaving(true);
    setStatus(`Removing ${name}...`);

    try {
      const response = await fetch(`${apiBase}/api/roster/player/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: apiKeyHeader(),
      });

      if (!response.ok) {
        throw new Error("Remove player failed");
      }

      setRoster((current) => current.filter((r) => r.key !== row.key));
      setStatus(`${name} removed.`);
    } catch {
      setStatus("Could not remove player.");
    } finally {
      setSaving(false);
    }
  }

  const SECTIONS = [
    { key: "pairing", label: "Live Pairing" },
    { key: "roster", label: "Roster" },
    { key: "profile", label: "Profile" },
    { key: "ai", label: "AI Context" },
    { key: "members", label: "Members" },
  ] as const;

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <h1>Settings</h1>
          <p className="stats-page-subtitle">Manage your program, roster, AI context, and team access.</p>
        </div>
        <p className="stats-page-status">{status}</p>
      </section>

      {/* Section tab nav */}
      <nav className="settings-tab-nav">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`settings-tab-btn${activeSection === section.key ? " settings-tab-btn-active" : ""}`}
            onClick={() => setActiveSection(section.key)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {/* ── Live Pairing ── */}
      {activeSection === "pairing" && (
        <section className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Live Pairing</h3>
              <p className="settings-section-desc">Link the score operator iPad to this dashboard using the 6-digit code below.</p>
            </div>
            <div className="settings-header-actions">
              <button type="button" className="shell-nav-link" onClick={() => void navigator.clipboard?.writeText(connectionCode)}>
                Copy Code
              </button>
              <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => setConnectionCode(generateConnectionCode())}>
                New Code
              </button>
            </div>
          </div>

          <div className="settings-pairing-display">
            <span className="settings-pairing-code">{connectionCode}</span>
            <p className="settings-pairing-hint">Enter this code in the Score Operator app under <strong>Connect to Dashboard</strong>.</p>
          </div>
        </section>
      )}

      {/* ── Roster ── */}
      {activeSection === "roster" && (
        <section className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Roster</h3>
              <p className="settings-section-desc">{roster.length} player{roster.length !== 1 ? "s" : ""} on the active roster.</p>
            </div>
          </div>

          {roster.length > 0 && (
            <div className="settings-roster-table-wrap">
              <table className="settings-roster-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Pos</th>
                    <th>Grade</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <input
                          className="settings-roster-input settings-roster-input-sm"
                          value={row.number}
                          onChange={(e) => setRoster((cur) => cur.map((r) => r.key === row.key ? { ...r, number: e.target.value } : r))}
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <input
                          className="settings-roster-input"
                          value={row.name}
                          onChange={(e) => setRoster((cur) => cur.map((r) => r.key === row.key ? { ...r, name: e.target.value } : r))}
                          placeholder="Player name"
                        />
                      </td>
                      <td>
                        <input
                          className="settings-roster-input settings-roster-input-sm"
                          value={row.position}
                          onChange={(e) => setRoster((cur) => cur.map((r) => r.key === row.key ? { ...r, position: e.target.value } : r))}
                          placeholder="PG"
                        />
                      </td>
                      <td>
                        <input
                          className="settings-roster-input settings-roster-input-sm"
                          value={row.grade}
                          onChange={(e) => setRoster((cur) => cur.map((r) => r.key === row.key ? { ...r, grade: e.target.value } : r))}
                          placeholder="11"
                        />
                      </td>
                      <td className="settings-roster-actions">
                        <button type="button" className="shell-nav-link shell-nav-link-active" disabled={saving} onClick={() => void savePlayer(row)}>Save</button>
                        <button type="button" className="shell-nav-link" disabled={saving} onClick={() => void removePlayer(row)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form className="settings-add-player-form" onSubmit={addPlayer}>
            <h4 className="settings-sub-heading">Add Player</h4>
            <div className="setup-grid">
              <label className="stats-filter-field">
                <span>Name *</span>
                <input value={newPlayer.name} onChange={(e) => setNewPlayer((cur) => ({ ...cur, name: e.target.value }))} placeholder="Player name" />
              </label>
              <label className="stats-filter-field">
                <span>Jersey #</span>
                <input value={newPlayer.number} onChange={(e) => setNewPlayer((cur) => ({ ...cur, number: e.target.value }))} placeholder="0" />
              </label>
              <label className="stats-filter-field">
                <span>Position</span>
                <input value={newPlayer.position} onChange={(e) => setNewPlayer((cur) => ({ ...cur, position: e.target.value }))} placeholder="PG" />
              </label>
              <label className="stats-filter-field">
                <span>Grade</span>
                <input value={newPlayer.grade} onChange={(e) => setNewPlayer((cur) => ({ ...cur, grade: e.target.value }))} placeholder="11" />
              </label>
            </div>
            <div className="settings-form-footer">
              <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving || !newPlayer.name.trim()}>
                {saving ? "Adding..." : "Add to Roster"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ── Profile ── */}
      {activeSection === "profile" && (
        <div className="settings-profile-grid">
          <form className="stats-page-card settings-section-card" onSubmit={saveOrganizationProfile}>
            <div className="stats-page-card-head">
              <div>
                <h3>Organization</h3>
                <p className="settings-section-desc">Your school or athletic program details.</p>
              </div>
              <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Save</button>
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

          <form className="stats-page-card settings-section-card" onSubmit={saveTeamProfile}>
            <div className="stats-page-card-head">
              <div>
                <h3>Team</h3>
                <p className="settings-section-desc">Team name, season, and identity.</p>
              </div>
              <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Save</button>
            </div>
            <div className="setup-grid">
              <label className="stats-filter-field">
                <span>Team Name</span>
                <input
                  value={team?.name ?? ""}
                  onChange={(event) => setTeam((current) => ({ ...(current ?? { id: "primary-team", name: "" }), name: event.target.value }))}
                  placeholder="Varsity Boys Basketball"
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
              <label className="stats-filter-field setup-color-field">
                <span>Team Color</span>
                <div className="setup-color-control">
                  <input
                    type="color"
                    value={team?.teamColor || "#1d4ed8"}
                    onChange={(event) => setTeam((current) => ({ ...(current ?? { id: "primary-team", name: "" }), teamColor: event.target.value }))}
                    aria-label="Team color"
                  />
                  <div className="setup-color-preview">
                    <span className="setup-color-swatch" style={{ backgroundColor: team?.teamColor || "#1d4ed8" }} />
                    <strong>{(team?.teamColor || "#1d4ed8").toUpperCase()}</strong>
                  </div>
                </div>
              </label>
            </div>
          </form>
        </div>
      )}

      {/* ── AI Context ── */}
      {activeSection === "ai" && (
        <section className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>AI Context</h3>
              <p className="settings-section-desc">Shape the AI insights engine with your coaching philosophy.</p>
            </div>
            <button type="button" className="shell-nav-link shell-nav-link-active" disabled={saving} onClick={() => void saveAiSettings()}>
              Save
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
              <span>Custom AI Prompt</span>
              <input value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} placeholder="Use concise halftime adjustments with risk level." />
            </label>
          </div>
        </section>
      )}

      {/* ── Members ── */}
      {activeSection === "members" && (
        <section className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Team Members</h3>
              <p className="settings-section-desc">
                {currentMember ? `Signed in as ${currentMember.fullName} · ${currentMember.role}` : "Manage staff access to the coach dashboard."}
              </p>
            </div>
          </div>

          {members.length > 0 && (
            <div className="settings-members-list">
              {members.map((member) => (
                <div key={member.memberId} className="settings-member-row">
                  <div className="settings-member-info">
                    <div className="settings-member-avatar">{member.fullName.charAt(0).toUpperCase()}</div>
                    <div>
                      <strong className="settings-member-name">
                        <input
                          className="settings-member-name-input"
                          value={member.fullName}
                          onChange={(event) => setMembers((current) => current.map((entry) => entry.memberId === member.memberId ? { ...entry, fullName: event.target.value } : entry))}
                          readOnly={currentMember?.role !== "admin"}
                        />
                      </strong>
                      <span className="settings-member-email">{member.email}</span>
                    </div>
                  </div>
                  <div className="settings-member-controls">
                    <select
                      className="settings-member-role-select"
                      value={member.role}
                      onChange={(event) => setMembers((current) => current.map((entry) => entry.memberId === member.memberId ? { ...entry, role: event.target.value as AppMemberRole } : entry))}
                      disabled={currentMember?.role !== "admin"}
                    >
                      <option value="admin">Admin</option>
                      <option value="coach">Coach</option>
                      <option value="operator">Operator</option>
                    </select>
                    <span className={`settings-status-badge settings-status-${member.status}`}>{member.status}</span>
                    {currentMember?.role === "admin" && (
                      <>
                        <button type="button" className="shell-nav-link shell-nav-link-active" disabled={saving} onClick={() => void saveMember(member)}>
                          Save
                        </button>
                        <button type="button" className="shell-nav-link" disabled={saving || member.memberId === currentMember?.memberId} onClick={() => void removeMember(member)}>
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form className="settings-invite-form" onSubmit={inviteMember}>
            <h4 className="settings-sub-heading">Invite Member</h4>
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
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as AppMemberRole)}>
                  <option value="admin">Admin</option>
                  <option value="coach">Coach</option>
                  <option value="operator">Operator</option>
                </select>
              </label>
            </div>
            <div className="settings-form-footer">
              <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Send Invite</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
