import { useEffect, useMemo, useState } from "react";
import {
  buildStaffRows,
  SchoolStaffSection,
  type MembershipEditorState,
  type StaffAccessOption,
  type StaffRow,
} from "./SchoolAdminSections.js";
import {
  fetchSchoolOverview,
  inviteSchoolStaff,
  removeSchoolStaffMembership,
  resendSchoolMembershipInvite,
  updateSchoolStaffMembership,
  type SchoolOverviewPayload,
} from "./workspace.js";

interface SchoolStaffPageProps {
  schoolId: string;
  canManageSchool: boolean;
}

export function SchoolStaffPage({ schoolId, canManageSchool }: SchoolStaffPageProps) {
  const [overview, setOverview] = useState<SchoolOverviewPayload | null>(null);
  const [status, setStatus] = useState("Loading staff...");
  const [showInviteStaff, setShowInviteStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccess, setInviteAccess] = useState<StaffAccessOption>("school_admin");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<MembershipEditorState | null>(null);

  async function reloadOverview(nextStatus?: string) {
    setStatus(nextStatus ?? "Loading staff...");
    const payload = await fetchSchoolOverview(schoolId);
    setOverview(payload);
    setStatus(nextStatus ?? "Staff loaded.");
    return payload;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await fetchSchoolOverview(schoolId);
        if (!cancelled) {
          setOverview(payload);
          setStatus("Staff loaded.");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Could not load staff.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const staffRows = useMemo(() => (overview ? buildStaffRows(overview) : []), [overview]);

  useEffect(() => {
    if (!overview?.teams.length) {
      setInviteTeamId("");
      return;
    }
    if (inviteAccess !== "school_admin" && !inviteTeamId) {
      setInviteTeamId(overview.teams[0]?.id ?? "");
    }
  }, [inviteAccess, inviteTeamId, overview?.teams]);

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
          <p className="stats-page-subtitle">Staff</p>
        </div>
        <div className="settings-header-actions">
          {canManageSchool ? (
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => setShowInviteStaff((current) => !current)}>
              Invite Staff
            </button>
          ) : null}
          <p className="stats-page-status">{status}</p>
        </div>
      </section>

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

      <SchoolStaffSection
        overview={overview}
        canManageSchool={canManageSchool}
        staffRows={staffRows}
        busy={busy}
        editingMembershipId={editingMembershipId}
        editorState={editorState}
        setEditorState={setEditorState}
        onStartEdit={handleStartEdit}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={handleCancelEdit}
        onResendInvite={handleResendInvite}
        onRemoveStaff={handleRemoveStaff}
      />
    </div>
  );
}
