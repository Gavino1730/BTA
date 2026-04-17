import type { Dispatch, SetStateAction } from "react";
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
                  <button type="button" className="shell-nav-link" disabled={busy} onClick={() => void onSaveEdit(membership)}>
                    Save
                  </button>
                  <button type="button" className="shell-nav-link" disabled={busy} onClick={onCancelEdit}>
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
  );
}
