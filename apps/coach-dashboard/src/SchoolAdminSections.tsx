import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { SchoolOverviewPayload } from "./workspace.js";

export type StaffAccessOption = "school_admin" | "head_coach" | "assistant_coach" | "operator" | "viewer";

export interface MembershipEditorState {
  role: StaffAccessOption;
  teamId: string;
}

export interface StaffRow {
  membershipType: "school" | "team";
  membershipId: string;
  fullName: string;
  email: string;
  role: string;
  status: "active" | "invited";
  teamId?: string;
  teamName?: string;
}

export interface TeamTemplateOption {
  label: string;
  gender: "boys" | "girls" | "custom";
  level: "varsity" | "jv" | "freshman" | "custom";
}

function formatMembershipRole(role: string): string {
  return role.replace(/_/g, " ");
}

function formatActivityTypeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

export function SchoolPageHeader({
  eyebrow,
  title,
  subtitle,
  status,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  status: string;
  actions?: ReactNode;
}) {
  return (
    <section className="stats-page-hero compact school-page-hero">
      <div className="school-page-hero-copy">
        <p className="stats-page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="stats-page-subtitle">{subtitle}</p>
      </div>
      <div className="school-page-hero-side">
        {actions ? <div className="settings-header-actions school-page-hero-actions">{actions}</div> : null}
        <p className="stats-page-status school-page-status">{status}</p>
      </div>
    </section>
  );
}

export function SchoolModal({
  open,
  title,
  description,
  onClose,
  actions,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  actions: ReactNode;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="school-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="school-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="school-modal-head">
          <div>
            <p className="school-modal-eyebrow">School workspace</p>
            <h3>{title}</h3>
            <p className="settings-section-desc">{description}</p>
          </div>
          <button type="button" className="school-modal-close" onClick={onClose} aria-label={`Close ${title}`}>
            ×
          </button>
        </div>
        <div className="school-modal-body">
          {children}
        </div>
        <div className="school-modal-actions">
          {actions}
        </div>
      </section>
    </div>
  );
}

export function AddTeamModal({
  open,
  busy,
  templates,
  templateLabel,
  onTemplateChange,
  displayName,
  onDisplayNameChange,
  abbreviation,
  onAbbreviationChange,
  teamColor,
  onTeamColorChange,
  customLabel,
  onCustomLabelChange,
  showCustomLabel,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  templates: TeamTemplateOption[];
  templateLabel: string;
  onTemplateChange: (value: string) => void;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  abbreviation: string;
  onAbbreviationChange: (value: string) => void;
  teamColor: string;
  onTeamColorChange: (value: string) => void;
  customLabel: string;
  onCustomLabelChange: (value: string) => void;
  showCustomLabel: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <SchoolModal
      open={open}
      title="Add Team"
      description="Create a basketball workspace under this school. The new team will appear in the switcher immediately."
      onClose={onClose}
      actions={(
        <>
          <button type="button" className="shell-nav-link" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={onCreate} disabled={busy}>
            {busy ? "Creating..." : "Create Team"}
          </button>
        </>
      )}
    >
      <div className="setup-grid school-modal-grid">
        <label className="stats-filter-field">
          <span>Template</span>
          <select value={templateLabel} onChange={(event) => onTemplateChange(event.target.value)}>
            {templates.map((template) => (
              <option key={template.label} value={template.label}>{template.label}</option>
            ))}
          </select>
        </label>
        <label className="stats-filter-field">
          <span>Display Name</span>
          <input value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} placeholder="Boys Varsity" />
        </label>
        <label className="stats-filter-field">
          <span>Abbreviation</span>
          <input value={abbreviation} onChange={(event) => onAbbreviationChange(event.target.value.toUpperCase())} placeholder="BVAR" />
        </label>
        <label className="stats-filter-field school-color-field">
          <span>Team Color</span>
          <div className="school-color-control">
            <input type="color" value={teamColor} onChange={(event) => onTeamColorChange(event.target.value)} />
            <code>{teamColor.toUpperCase()}</code>
          </div>
        </label>
        {showCustomLabel ? (
          <label className="stats-filter-field">
            <span>Custom Label</span>
            <input value={customLabel} onChange={(event) => onCustomLabelChange(event.target.value)} placeholder="Girls Development" />
          </label>
        ) : null}
      </div>
    </SchoolModal>
  );
}

export function InviteStaffModal({
  open,
  busy,
  inviteName,
  onInviteNameChange,
  inviteEmail,
  onInviteEmailChange,
  inviteAccess,
  onInviteAccessChange,
  inviteTeamId,
  onInviteTeamChange,
  teams,
  onClose,
  onSend,
}: {
  open: boolean;
  busy: boolean;
  inviteName: string;
  onInviteNameChange: (value: string) => void;
  inviteEmail: string;
  onInviteEmailChange: (value: string) => void;
  inviteAccess: StaffAccessOption;
  onInviteAccessChange: (value: StaffAccessOption) => void;
  inviteTeamId: string;
  onInviteTeamChange: (value: string) => void;
  teams: Array<{ id: string; name?: string; displayName?: string }>;
  onClose: () => void;
  onSend: () => void;
}) {
  return (
    <SchoolModal
      open={open}
      title="Invite Staff"
      description="Invite school admins or team-specific staff without leaving the current school context."
      onClose={onClose}
      actions={(
        <>
          <button type="button" className="shell-nav-link" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={onSend} disabled={busy}>
            {busy ? "Sending..." : "Send Invite"}
          </button>
        </>
      )}
    >
      <div className="setup-grid school-modal-grid">
        <label className="stats-filter-field">
          <span>Full Name</span>
          <input value={inviteName} onChange={(event) => onInviteNameChange(event.target.value)} placeholder="Assistant Coach Lee" />
        </label>
        <label className="stats-filter-field">
          <span>Email</span>
          <input type="email" value={inviteEmail} onChange={(event) => onInviteEmailChange(event.target.value)} placeholder="coach@school.org" />
        </label>
        <label className="stats-filter-field">
          <span>Access</span>
          <select value={inviteAccess} onChange={(event) => onInviteAccessChange(event.target.value as StaffAccessOption)}>
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
            <select value={inviteTeamId} onChange={(event) => onInviteTeamChange(event.target.value)}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.displayName ?? team.name ?? team.id}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </SchoolModal>
  );
}

export function SchoolSectionIntro({
  title,
  description,
  metricLabel,
  metricValue,
}: {
  title: string;
  description: string;
  metricLabel: string;
  metricValue: string;
}) {
  return (
    <section className="stats-page-card school-section-intro">
      <div>
        <p className="school-section-intro-label">{metricLabel}</p>
        <h2 className="school-section-intro-title">{title}</h2>
        <p className="school-section-intro-copy">{description}</p>
      </div>
      <div className="school-section-intro-metric">
        <span>{metricLabel}</span>
        <strong>{metricValue}</strong>
      </div>
    </section>
  );
}

export function SchoolQuickActions({
  onAddTeam,
  onInviteStaff,
  onOpenLive,
  onImportRoster,
}: {
  onAddTeam: () => void;
  onInviteStaff: () => void;
  onOpenLive?: () => void;
  onImportRoster?: () => void;
}) {
  return (
    <section className="stats-page-card school-quick-actions-card">
      <div className="stats-page-card-head">
        <div>
          <h3>Quick Actions</h3>
          <p className="settings-section-desc">The core admin actions should stay one click away.</p>
        </div>
      </div>
      <div className="school-quick-actions-grid">
        <button type="button" className="school-quick-action" onClick={onAddTeam}>
          <span className="school-quick-action-kicker">Teams</span>
          <strong>Add Team</strong>
          <p>Create a new basketball workspace and route directly into it.</p>
        </button>
        <button type="button" className="school-quick-action" onClick={onInviteStaff}>
          <span className="school-quick-action-kicker">Staff</span>
          <strong>Invite Staff</strong>
          <p>Grant school-wide or team-specific access without leaving overview.</p>
        </button>
        <button type="button" className="school-quick-action" onClick={onOpenLive} disabled={!onOpenLive}>
          <span className="school-quick-action-kicker">Game Day</span>
          <strong>Start Live Game</strong>
          <p>Pick a team and launch a live session with operator pairing.</p>
        </button>
        <button type="button" className="school-quick-action" onClick={onImportRoster} disabled={!onImportRoster}>
          <span className="school-quick-action-kicker">Roster</span>
          <strong>Import Roster</strong>
          <p>Use roster setup after entry instead of blocking onboarding.</p>
        </button>
      </div>
    </section>
  );
}

export function buildStaffRows(overview: SchoolOverviewPayload): StaffRow[] {
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
}

export function SchoolTeamsSection({
  overview,
  canManageSchool,
  onAddTeam,
  onOpenTeam,
}: {
  overview: SchoolOverviewPayload;
  canManageSchool: boolean;
  onAddTeam: () => void;
  onOpenTeam: (teamId: string) => void;
}) {
  return (
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
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={onAddTeam}>
              Add Team
            </button>
          ) : null}
        </div>
      ) : (
        <div className="settings-members-list">
          {overview.teams.map((team) => (
            <div key={team.id} className="settings-member-row school-team-row">
              <div className="settings-member-info">
                <div className="settings-member-avatar school-team-avatar">{(team.displayName ?? team.name).charAt(0)}</div>
                <div>
                  <strong className="settings-member-name">{team.displayName ?? team.name}</strong>
                  <div className="school-inline-metadata">
                    <span className="settings-member-email">{team.rosterCount ?? team.players.length} players</span>
                    <span className="settings-member-email">{team.staffCount ?? 0} staff</span>
                    <span className="settings-member-email">{team.level ?? "custom"} level</span>
                  </div>
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
  );
}

export function SchoolStaffSection({
  overview,
  canManageSchool,
  staffRows,
  busy,
  editingMembershipId,
  editorState,
  setEditorState,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onResendInvite,
  onRemoveStaff,
}: {
  overview: SchoolOverviewPayload;
  canManageSchool: boolean;
  staffRows: StaffRow[];
  busy: boolean;
  editingMembershipId: string | null;
  editorState: MembershipEditorState | null;
  setEditorState: Dispatch<SetStateAction<MembershipEditorState | null>>;
  onStartEdit: (membership: StaffRow) => void;
  onSaveEdit: (membership: StaffRow) => Promise<void>;
  onCancelEdit: () => void;
  onResendInvite: (membershipType: "school" | "team", membershipId: string) => Promise<void>;
  onRemoveStaff: (membershipType: "school" | "team", membershipId: string) => Promise<void>;
}) {
  return (
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
          <div key={`${membership.membershipType}:${membership.membershipId}`} className="settings-member-row school-staff-row">
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
                  <button type="button" className="shell-nav-link" disabled={busy} onClick={() => void onSaveEdit(membership)}>
                    Save
                  </button>
                  <button type="button" className="shell-nav-link" disabled={busy} onClick={onCancelEdit}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="settings-status-badge school-role-badge">
                    {formatMembershipRole(membership.role)}
                  </span>
                  <span className={`settings-status-badge settings-status-${membership.status === "active" ? "active" : "invited"}`}>
                    {membership.status}
                  </span>
                  {canManageSchool ? (
                    <button
                      type="button"
                      className="shell-nav-link"
                      disabled={busy || (membership.membershipType === "school" && membership.role === "owner")}
                      onClick={() => onStartEdit(membership)}
                    >
                      Edit
                    </button>
                  ) : null}
                </>
              )}
              {canManageSchool && membership.status === "invited" ? (
                <button type="button" className="shell-nav-link" disabled={busy} onClick={() => void onResendInvite(membership.membershipType, membership.membershipId)}>
                  Resend
                </button>
              ) : null}
              {canManageSchool ? (
                <button
                  type="button"
                  className="shell-nav-link"
                  disabled={busy || (membership.membershipType === "school" && membership.role === "owner")}
                  onClick={() => void onRemoveStaff(membership.membershipType, membership.membershipId)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SchoolActivitySection({ overview }: { overview: SchoolOverviewPayload }) {
  return (
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
          <div key={event.id} className="settings-member-row activity-feed-row school-activity-row">
            <div className="settings-member-info">
              <div>
                <strong className="settings-member-name">{event.message}</strong>
                <div className="school-inline-metadata">
                  <span className="settings-status-badge school-activity-badge">{formatActivityTypeLabel(event.type)}</span>
                  {event.teamId ? <span className="settings-member-email">Team: {event.teamId}</span> : null}
                </div>
                <span className="settings-member-email">{new Date(event.createdAtIso).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
