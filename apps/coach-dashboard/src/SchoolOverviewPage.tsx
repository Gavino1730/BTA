import { useEffect, useMemo, useState } from "react";
import {
  createSchoolTeam,
  fetchSchoolOverview,
  inviteSchoolStaff,
  removeSchoolStaffMembership,
  resendSchoolMembershipInvite,
  updateSchoolStaffMembership,
  type SchoolOverviewPayload,
} from "./workspace.js";

interface SchoolOverviewPageProps {
  schoolId: string;
  canManageSchool: boolean;
  onOpenTeam: (teamId: string) => void;
}

const TEAM_TEMPLATES = [
  { label: "Boys Varsity", gender: "boys" as const, level: "varsity" as const },
  { label: "Boys JV", gender: "boys" as const, level: "jv" as const },
  { label: "Boys Freshman", gender: "boys" as const, level: "freshman" as const },
  { label: "Girls Varsity", gender: "girls" as const, level: "varsity" as const },
  { label: "Girls JV", gender: "girls" as const, level: "jv" as const },
  { label: "Custom Team", gender: "custom" as const, level: "custom" as const },
];

type StaffAccessOption = "school_admin" | "head_coach" | "assistant_coach" | "operator" | "viewer";

interface MembershipEditorState {
  role: StaffAccessOption;
  teamId: string;
}

interface StaffRow {
  membershipType: "school" | "team";
  membershipId: string;
  fullName: string;
  email: string;
  role: string;
  status: "active" | "invited";
  teamId?: string;
  teamName?: string;
}

export function SchoolOverviewPage({ schoolId, canManageSchool, onOpenTeam }: SchoolOverviewPageProps) {
  const [overview, setOverview] = useState<SchoolOverviewPayload | null>(null);
  const [status, setStatus] = useState("Loading school overview...");
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showInviteStaff, setShowInviteStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templateLabel, setTemplateLabel] = useState("Boys Varsity");
  const [displayName, setDisplayName] = useState("Boys Varsity");
  const [customLabel, setCustomLabel] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [teamColor, setTeamColor] = useState("#1d4ed8");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccess, setInviteAccess] = useState<StaffAccessOption>("school_admin");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<MembershipEditorState | null>(null);

  async function reloadOverview(nextStatus?: string) {
    setStatus(nextStatus ?? "Loading school overview...");
    const payload = await fetchSchoolOverview(schoolId);
    setOverview(payload);
    setStatus(nextStatus ?? "School overview loaded.");
    return payload;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await fetchSchoolOverview(schoolId);
        if (cancelled) {
          return;
        }
        setOverview(payload);
        setStatus("School overview loaded.");
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Could not load school overview.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const selectedTemplate = useMemo(
    () => TEAM_TEMPLATES.find((template) => template.label === templateLabel) ?? TEAM_TEMPLATES[0],
    [templateLabel],
  );

  const staffRows = useMemo<StaffRow[]>(() => {
    if (!overview) {
      return [];
    }
    const teamNameById = new Map(overview.teams.map((team) => [team.id, team.displayName ?? team.name]));
    return [
      ...overview.staff.schoolMemberships.map((membership) => ({
        membershipType: "school" as const,
        membershipId: membership.membershipId,
        fullName: membership.fullName,
        email: membership.email,
        role: membership.role,
        status: membership.status,
      })),
      ...overview.staff.teamMemberships.map((membership) => ({
        membershipType: "team" as const,
        membershipId: membership.membershipId,
        fullName: membership.fullName,
        email: membership.email,
        role: membership.role,
        status: membership.status,
        teamId: membership.teamId,
        teamName: teamNameById.get(membership.teamId) ?? membership.teamId,
      })),
    ].sort((left, right) => left.fullName.localeCompare(right.fullName) || left.email.localeCompare(right.email));
  }, [overview]);

  useEffect(() => {
    setDisplayName(selectedTemplate.label);
    if (selectedTemplate.gender !== "custom" && selectedTemplate.level !== "custom") {
      setCustomLabel("");
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (!overview?.teams.length) {
      setInviteTeamId("");
      return;
    }
    if (inviteAccess !== "school_admin" && !inviteTeamId) {
      setInviteTeamId(overview.teams[0]?.id ?? "");
    }
  }, [inviteAccess, inviteTeamId, overview?.teams]);

  async function handleCreateTeam() {
    if (!overview) {
      return;
    }
    setBusy(true);
    setStatus("Creating team...");
    try {
      const nextDisplayName = displayName.trim() || selectedTemplate.label;
      const result = await createSchoolTeam(overview.school.schoolId, {
        gender: selectedTemplate.gender,
        level: selectedTemplate.level,
        displayName: nextDisplayName,
        customLabel: customLabel.trim() || undefined,
        abbreviation: abbreviation.trim().toUpperCase() || undefined,
        teamColor,
      });
      await reloadOverview(result.billingNotice ?? `${result.team.displayName ?? result.team.name} created.`);
      setShowAddTeam(false);
      onOpenTeam(result.team.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create team.");
    } finally {
      setBusy(false);
    }
  }

  async function handleInviteStaff() {
    if (!overview) {
      return;
    }
    setBusy(true);
    setStatus("Sending invite...");
    try {
      const response = await inviteSchoolStaff(overview.school.schoolId, {
        fullName: inviteName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        schoolRole: inviteAccess === "school_admin" ? "school_admin" : undefined,
        teamRole: inviteAccess !== "school_admin" ? inviteAccess : undefined,
        teamId: inviteAccess !== "school_admin" ? inviteTeamId : undefined,
      });
      setInviteName("");
      setInviteEmail("");
      setShowInviteStaff(false);
      await reloadOverview(response.warning ?? "Staff invite sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not invite staff member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResendInvite(membershipType: "school" | "team", membershipId: string) {
    setBusy(true);
    setStatus("Resending invite...");
    try {
      const response = await resendSchoolMembershipInvite(schoolId, membershipType, membershipId);
      setStatus(response.warning ?? "Invite resent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not resend invite.");
    } finally {
      setBusy(false);
    }
  }

  function handleStartEdit(membership: StaffRow) {
    setEditingMembershipId(`${membership.membershipType}:${membership.membershipId}`);
    setEditorState({
      role: membership.role as StaffAccessOption,
      teamId: membership.teamId ?? "",
    });
  }

  function handleCancelEdit() {
    setEditingMembershipId(null);
    setEditorState(null);
  }

  async function handleSaveEdit(membership: StaffRow) {
    if (!editorState) {
      return;
    }
    setBusy(true);
    setStatus("Updating staff membership...");
    try {
      await updateSchoolStaffMembership(schoolId, membership.membershipType, membership.membershipId, {
        role: editorState.role,
        teamId: membership.membershipType === "team" ? editorState.teamId : undefined,
        status: membership.status,
      });
      handleCancelEdit();
      await reloadOverview("Staff membership updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update staff membership.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveStaff(membershipType: "school" | "team", membershipId: string) {
    setBusy(true);
    setStatus("Removing staff member...");
    try {
      await removeSchoolStaffMembership(schoolId, membershipType, membershipId);
      await reloadOverview("Staff membership removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove staff member.");
    } finally {
      setBusy(false);
    }
  }

  if (!overview) {
    return (
      <div className="stats-page">
        <section className="stats-page-card">
          <p className="stats-page-status">{status}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <h1>{overview.school.name}</h1>
          <p className="stats-page-subtitle">School Overview</p>
        </div>
        <div className="settings-header-actions">
          {canManageSchool ? (
            <>
              <button type="button" className="shell-nav-link" onClick={() => setShowInviteStaff((current) => !current)}>
                Invite Staff
              </button>
              <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => setShowAddTeam((current) => !current)}>
                Add Team
              </button>
            </>
          ) : null}
          <p className="stats-page-status">{status}</p>
        </div>
      </section>

      <section className="stats-page-grid three-column">
        <article className="stats-metric-card">
          <p className="stats-metric-label">Billing</p>
          <p className="stats-metric-value" style={{ fontSize: "1.35rem" }}>{overview.summary.planId}</p>
          <p className="stats-metric-detail">
            Status: {overview.summary.billingStatus}
            {overview.summary.activeTeamLimit === null
              ? " / Unlimited active teams in trial"
              : ` / ${overview.summary.activeTeamsCount} of ${overview.summary.activeTeamLimit} active team slots used`}
          </p>
        </article>
        <article className="stats-metric-card accent-blue">
          <p className="stats-metric-label">Teams</p>
          <p className="stats-metric-value">{overview.summary.activeTeamsCount}</p>
          <p className="stats-metric-detail">
            Active team workspaces
            {overview.summary.overLimitTeamCount ? ` / ${overview.summary.overLimitTeamCount} read-only` : ""}
          </p>
        </article>
        <article className="stats-metric-card">
          <p className="stats-metric-label">Live Games</p>
          <p className="stats-metric-value">{overview.summary.activeLiveGamesCount}</p>
          <p className="stats-metric-detail">Current team sessions</p>
        </article>
      </section>

      {showAddTeam ? (
        <section className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Add Team</h3>
              <p className="settings-section-desc">Create a basketball team workspace under this school.</p>
            </div>
          </div>
          <div className="setup-grid">
            <label className="stats-filter-field">
              <span>Template</span>
              <select value={templateLabel} onChange={(event) => setTemplateLabel(event.target.value)}>
                {TEAM_TEMPLATES.map((template) => (
                  <option key={template.label} value={template.label}>{template.label}</option>
                ))}
              </select>
            </label>
            <label className="stats-filter-field">
              <span>Display Name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Boys Varsity" />
            </label>
            <label className="stats-filter-field">
              <span>Abbreviation</span>
              <input value={abbreviation} onChange={(event) => setAbbreviation(event.target.value.toUpperCase())} placeholder="BVAR" />
            </label>
            <label className="stats-filter-field">
              <span>Team Color</span>
              <input type="color" value={teamColor} onChange={(event) => setTeamColor(event.target.value)} />
            </label>
            {selectedTemplate.gender === "custom" || selectedTemplate.level === "custom" ? (
              <label className="stats-filter-field">
                <span>Custom Label</span>
                <input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="Girls Development" />
              </label>
            ) : null}
          </div>
          <div className="settings-header-actions">
            <button type="button" className="shell-nav-link" onClick={() => setShowAddTeam(false)} disabled={busy}>Cancel</button>
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => void handleCreateTeam()} disabled={busy}>
              {busy ? "Creating..." : "Create Team"}
            </button>
          </div>
        </section>
      ) : null}

      {showInviteStaff ? (
        <section className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Invite Staff</h3>
              <p className="settings-section-desc">Invite school admins or team staff into this workspace.</p>
            </div>
          </div>
          <div className="setup-grid">
            <label className="stats-filter-field">
              <span>Full Name</span>
              <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Assistant Coach Lee" />
            </label>
            <label className="stats-filter-field">
              <span>Email</span>
              <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="coach@school.org" />
            </label>
            <label className="stats-filter-field">
              <span>Access</span>
              <select value={inviteAccess} onChange={(event) => setInviteAccess(event.target.value as StaffAccessOption)}>
                <option value="school_admin">School Admin</option>
                <option value="head_coach">Head Coach</option>
                <option value="assistant_coach">Assistant Coach</option>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            {inviteAccess !== "school_admin" ? (
              <label className="stats-filter-field">
                <span>Team</span>
                <select value={inviteTeamId} onChange={(event) => setInviteTeamId(event.target.value)}>
                  {overview.teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.displayName ?? team.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="settings-header-actions">
            <button type="button" className="shell-nav-link" onClick={() => setShowInviteStaff(false)} disabled={busy}>Cancel</button>
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => void handleInviteStaff()} disabled={busy}>
              {busy ? "Sending..." : "Send Invite"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="stats-page-card settings-section-card">
        <div className="stats-page-card-head">
          <div>
            <h3>Teams</h3>
            <p className="settings-section-desc">Open a team workspace or start managing roster and live sessions.</p>
          </div>
        </div>
        {overview.teams.length === 0 ? (
          <div className="empty-state">
            <p className="stats-empty-copy">No teams yet.</p>
            {canManageSchool ? (
              <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => setShowAddTeam(true)}>
                Add Team
              </button>
            ) : null}
          </div>
        ) : (
          <div className="settings-members-list">
            {overview.teams.map((team) => (
              <div key={team.id} className="settings-member-row">
                <div className="settings-member-info">
                  <div className="settings-member-avatar">{(team.displayName ?? team.name).charAt(0)}</div>
                  <div>
                    <strong className="settings-member-name">{team.displayName ?? team.name}</strong>
                    <span className="settings-member-email">{team.rosterCount ?? team.players.length} players · {team.staffCount ?? 0} staff</span>
                  </div>
                </div>
                <div className="settings-member-controls">
                  {team.status === "read_only" ? (
                    <span className="settings-status-badge settings-status-invited">Read Only</span>
                  ) : null}
                  <span className={`settings-status-badge settings-status-${team.liveSession ? "live" : "active"}`}>
                    {team.liveSession ? "Live" : "Ready"}
                  </span>
                  <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => onOpenTeam(team.id)}>
                    Open Team
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stats-page-grid two-column">
        <section className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Staff</h3>
              <p className="settings-section-desc">School admins and team-level staff memberships.</p>
            </div>
          </div>
          <div className="settings-members-list">
            {staffRows.length === 0 ? (
              <p className="stats-empty-copy">No staff memberships yet.</p>
            ) : staffRows.map((membership) => (
              <div key={`${membership.membershipType}:${membership.membershipId}`} className="settings-member-row">
                <div className="settings-member-info">
                  <div className="settings-member-avatar">{membership.fullName.charAt(0)}</div>
                  <div>
                    <strong className="settings-member-name">{membership.fullName}</strong>
                    <span className="settings-member-email">{membership.email}</span>
                    <span className="settings-member-email">
                      {membership.membershipType === "school" ? "School access" : membership.teamName ? `Team: ${membership.teamName}` : "Team access"}
                    </span>
                  </div>
                </div>
                <div className="settings-member-controls">
                  {editingMembershipId === `${membership.membershipType}:${membership.membershipId}` && editorState ? (
                    <>
                      <select
                        value={editorState.role}
                        onChange={(event) => setEditorState((current) => current ? { ...current, role: event.target.value as StaffAccessOption } : current)}
                        disabled={busy || (membership.membershipType === "school" && membership.role === "owner")}
                      >
                        {membership.membershipType === "school" ? (
                          <>
                            <option value="school_admin">School Admin</option>
                            {membership.role === "owner" ? <option value="school_admin" disabled>Owner</option> : null}
                          </>
                        ) : (
                          <>
                            <option value="head_coach">Head Coach</option>
                            <option value="assistant_coach">Assistant Coach</option>
                            <option value="operator">Operator</option>
                            <option value="viewer">Viewer</option>
                          </>
                        )}
                      </select>
                      {membership.membershipType === "team" ? (
                        <select
                          value={editorState.teamId}
                          onChange={(event) => setEditorState((current) => current ? { ...current, teamId: event.target.value } : current)}
                          disabled={busy}
                        >
                          {overview.teams.map((team) => (
                            <option key={team.id} value={team.id}>{team.displayName ?? team.name}</option>
                          ))}
                        </select>
                      ) : null}
                      <button type="button" className="shell-nav-link" disabled={busy} onClick={() => void handleSaveEdit(membership)}>
                        Save
                      </button>
                      <button type="button" className="shell-nav-link" disabled={busy} onClick={handleCancelEdit}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`settings-status-badge settings-status-${membership.status === "active" ? "active" : "invited"}`}>
                        {membership.role}
                      </span>
                      {canManageSchool ? (
                        <button
                          type="button"
                          className="shell-nav-link"
                          disabled={busy || (membership.membershipType === "school" && membership.role === "owner")}
                          onClick={() => handleStartEdit(membership)}
                        >
                          Edit
                        </button>
                      ) : null}
                    </>
                  )}
                  {canManageSchool && membership.status === "invited" ? (
                    <button type="button" className="shell-nav-link" disabled={busy} onClick={() => void handleResendInvite(membership.membershipType, membership.membershipId)}>
                      Resend
                    </button>
                  ) : null}
                  {canManageSchool ? (
                    <button
                      type="button"
                      className="shell-nav-link"
                      disabled={busy || (membership.membershipType === "school" && membership.role === "owner")}
                      onClick={() => void handleRemoveStaff(membership.membershipType, membership.membershipId)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Activity</h3>
              <p className="settings-section-desc">Recent team and workspace events.</p>
            </div>
          </div>
          <div className="settings-members-list">
            {overview.activity.length === 0 ? (
              <p className="stats-empty-copy">No recent activity.</p>
            ) : overview.activity.map((event) => (
              <div key={event.id} className="settings-member-row activity-feed-row">
                <div className="settings-member-info">
                  <div>
                    <strong className="settings-member-name">{event.message}</strong>
                    <span className="settings-member-email">{new Date(event.createdAtIso).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
