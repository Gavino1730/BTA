import { useEffect, useMemo, useState } from "react";
import {
  AddTeamModal,
  buildStaffRows,
  InviteStaffModal,
  SchoolActivitySection,
  SchoolPageHeader,
  SchoolQuickActions,
  SchoolSectionIntro,
  SchoolStaffSection,
  SchoolTeamsSection,
  type MembershipEditorState,
  type StaffAccessOption,
  type StaffRow,
  type TeamTemplateOption,
} from "./SchoolAdminSections.js";
import { WorkspaceStateCard } from "./WorkspaceStateCard.js";
import {
  createSchoolTeam,
  deleteSchoolTeam,
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

const TEAM_TEMPLATES: TeamTemplateOption[] = [
  { label: "Boys Varsity", gender: "boys" as const, level: "varsity" as const },
  { label: "Boys JV", gender: "boys" as const, level: "jv" as const },
  { label: "Boys Freshman", gender: "boys" as const, level: "freshman" as const },
  { label: "Girls Varsity", gender: "girls" as const, level: "varsity" as const },
  { label: "Girls JV", gender: "girls" as const, level: "jv" as const },
  { label: "Custom Team", gender: "custom" as const, level: "custom" as const },
];

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

  const staffRows = useMemo<StaffRow[]>(() => (overview ? buildStaffRows(overview) : []), [overview]);

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

  async function handleDeleteTeam(teamId: string) {
    if (!overview) {
      return;
    }
    setBusy(true);
    setStatus("Deleting team...");
    try {
      await deleteSchoolTeam(overview.school.schoolId, teamId);
      await reloadOverview("Team deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete team.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTeam() {
    if (!overview) {
      return;
    }
    setBusy(true);
    setStatus("Creating team...");
    try {
      const nextDisplayName = displayName.trim() || selectedTemplate.label;
      const schoolColor = overview.teams[0]?.teamColor ?? "#1d4ed8";
      const result = await createSchoolTeam(overview.school.schoolId, {
        gender: selectedTemplate.gender,
        level: selectedTemplate.level,
        displayName: nextDisplayName,
        customLabel: customLabel.trim() || undefined,
        abbreviation: abbreviation.trim().toUpperCase() || undefined,
        teamColor: schoolColor,
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
      <WorkspaceStateCard
        eyebrow="School overview"
        title="Loading school workspace"
        message={status}
        tone={/^could not/i.test(status) ? "warning" : "neutral"}
      />
    );
  }

  return (
    <div className="stats-page">
      <SchoolPageHeader
        eyebrow="School control"
        title={overview.school.name}
        subtitle="This is the admin control center for teams, staff access, live operations, and billing capacity."
        status={status}
        actions={canManageSchool ? (
          <>
            <button type="button" className="shell-nav-link" onClick={() => setShowInviteStaff((current) => !current)}>
              Invite Staff
            </button>
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => setShowAddTeam((current) => !current)}>
              Add Team
            </button>
          </>
        ) : undefined}
      />

      <section className="stats-page-grid three-column">
        <article className="stats-metric-card">
          <p className="stats-metric-label">Billing</p>
          <p className="stats-metric-value" style={{ fontSize: "1.35rem", textTransform: "capitalize" }}>{overview.summary.planId}</p>
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

      <section className="stats-page-grid two-column school-overview-top-grid">
        <SchoolQuickActions
          onAddTeam={() => setShowAddTeam(true)}
          onInviteStaff={() => setShowInviteStaff(true)}
        />
        <SchoolSectionIntro
          title="Capacity and access"
          description="School billing controls which teams stay fully active. Over-limit teams remain visible but become read-only instead of disappearing."
          metricLabel="School staff"
          metricValue={String(overview.summary.staffCount)}
        />
      </section>

      <AddTeamModal
        open={showAddTeam}
        busy={busy}
        templates={TEAM_TEMPLATES}
        templateLabel={templateLabel}
        onTemplateChange={setTemplateLabel}
        displayName={displayName}
        onDisplayNameChange={setDisplayName}
        abbreviation={abbreviation}
        onAbbreviationChange={setAbbreviation}
        customLabel={customLabel}
        onCustomLabelChange={setCustomLabel}
        showCustomLabel={selectedTemplate.gender === "custom" || selectedTemplate.level === "custom"}
        onClose={() => setShowAddTeam(false)}
        onCreate={() => void handleCreateTeam()}
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

      <SchoolTeamsSection
        overview={overview}
        canManageSchool={canManageSchool}
        onAddTeam={() => setShowAddTeam(true)}
        onOpenTeam={onOpenTeam}
        onDeleteTeam={(teamId) => void handleDeleteTeam(teamId)}
      />

      <section className="stats-page-grid two-column" style={{ marginTop: "1.5rem" }}>
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
        <SchoolActivitySection overview={overview} />
      </section>
    </div>
  );
}
