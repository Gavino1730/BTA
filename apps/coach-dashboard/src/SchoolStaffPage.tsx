import { useEffect, useMemo, useState } from "react";
import {
  InviteStaffModal,
  buildStaffRows,
  SchoolPageHeader,
  SchoolSectionIntro,
  SchoolStaffSection,
  type MembershipEditorState,
  type StaffAccessOption,
  type StaffRow,
} from "./SchoolAdminSections.js";
import { WorkspaceStateCard } from "./WorkspaceStateCard.js";
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
      <WorkspaceStateCard
        eyebrow="School staff"
        title="Loading staff access"
        message={status}
        tone={/^could not/i.test(status) ? "warning" : "neutral"}
      />
    );
  }

  return (
    <div className="stats-page">
      <SchoolPageHeader
        eyebrow="People and permissions"
        title={overview.school.name}
        subtitle="Assign school-wide admins, team-specific coaches and operators, and keep access scoped to the right teams."
        status={status}
        actions={canManageSchool ? (
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => setShowInviteStaff((current) => !current)}>
            Invite Staff
          </button>
        ) : undefined}
      />

      <SchoolSectionIntro
        title="Access map"
        description="School admins inherit access to every team. Coaches and operators only see the teams they are explicitly assigned to."
        metricLabel="Memberships"
        metricValue={String(staffRows.length)}
      />

      <InviteStaffModal
        open={showInviteStaff}
        busy={busy}
        inviteName={inviteName}
        onInviteNameChange={setInviteName}
        inviteEmail={inviteEmail}
        onInviteEmailChange={setInviteEmail}
        inviteAccess={inviteAccess}
        onInviteAccessChange={setInviteAccess}
        inviteTeamId={inviteTeamId}
        onInviteTeamChange={setInviteTeamId}
        teams={overview.teams}
        onClose={() => setShowInviteStaff(false)}
        onSend={() => void handleInviteStaff()}
      />

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
