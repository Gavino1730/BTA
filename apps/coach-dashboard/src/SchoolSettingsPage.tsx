import { useEffect, useState } from "react";
import { SchoolPageHeader, SchoolSectionIntro } from "./SchoolAdminSections.js";
import { fetchSchoolOverview, type SchoolOverviewPayload } from "./workspace.js";
import { WorkspaceStateCard } from "./WorkspaceStateCard.js";

interface SchoolSettingsPageProps {
  schoolId: string;
  onNavigate: (path: string) => void;
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "Not set";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function SchoolSettingsPage({ schoolId, onNavigate }: SchoolSettingsPageProps) {
  const [overview, setOverview] = useState<SchoolOverviewPayload | null>(null);
  const [status, setStatus] = useState("Loading school settings...");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await fetchSchoolOverview(schoolId);
        if (cancelled) {
          return;
        }
        setOverview(payload);
        setStatus("School settings loaded.");
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Could not load school settings.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  if (!overview) {
    return (
      <WorkspaceStateCard
        eyebrow="School settings"
        title="Loading school settings"
        message={status}
        tone={/^could not/i.test(status) ? "warning" : "neutral"}
      />
    );
  }

  const schoolAdminCount = overview.staff.schoolMemberships.filter((membership) => membership.status === "active").length;
  const invitedStaffCount = overview.staff.schoolMemberships.filter((membership) => membership.status === "invited").length
    + overview.staff.teamMemberships.filter((membership) => membership.status === "invited").length;
  const readOnlyTeams = overview.teams.filter((team) => team.status === "read_only").length;

  return (
    <div className="stats-page">
      <SchoolPageHeader
        eyebrow="School settings"
        title={overview.school.name}
        subtitle="Review tenant identity, access policy, billing behavior, and game-day model for this school workspace."
        status={status}
        actions={(
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/billing")}>
            Open Billing
          </button>
        )}
      />

      <SchoolSectionIntro
        title="School workspace policy"
        description="This page is the administrative reference for how this school is identified, billed, and allowed to operate across teams and live sessions."
        metricLabel="Total teams"
        metricValue={String(overview.teams.length)}
      />

      <section className="stats-page-grid two-column">
        <article className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>School Profile</h3>
            </div>
          </div>
          <div className="setup-grid">
            <label className="stats-filter-field">
              <span>School Name</span>
              <input value={overview.school.name} readOnly />
            </label>
            <label className="stats-filter-field">
              <span>School ID</span>
              <input value={overview.school.schoolId} readOnly />
            </label>
            <label className="stats-filter-field">
              <span>Slug</span>
              <input value={overview.school.slug} readOnly />
            </label>
            <label className="stats-filter-field">
              <span>Status</span>
              <input value={overview.school.status} readOnly />
            </label>
          </div>
        </article>

        <article className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Access Model</h3>
            </div>
          </div>
          <div className="settings-members-list">
            <div className="settings-member-row">
              <div className="settings-member-info">
                <strong className="settings-member-name">School Admins</strong>
                <span className="settings-member-email">{schoolAdminCount} active</span>
              </div>
            </div>
            <div className="settings-member-row">
              <div className="settings-member-info">
                <strong className="settings-member-name">Pending Invites</strong>
                <span className="settings-member-email">{invitedStaffCount} outstanding</span>
              </div>
            </div>
            <div className="settings-member-row">
              <div className="settings-member-info">
                <strong className="settings-member-name">Team Workspaces</strong>
                <span className="settings-member-email">{overview.teams.length} total / {readOnlyTeams} read-only</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="stats-page-grid two-column">
        <article className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Billing Policy</h3>
            </div>
          </div>
          <div className="settings-members-list">
            <div className="settings-member-row">
              <div className="settings-member-info">
                <strong className="settings-member-name">Plan</strong>
                <span className="settings-member-email">{overview.summary.planId}</span>
              </div>
            </div>
            <div className="settings-member-row">
              <div className="settings-member-info">
                <strong className="settings-member-name">Subscription Status</strong>
                <span className="settings-member-email">{overview.summary.billingStatus}</span>
              </div>
            </div>
            <div className="settings-member-row">
              <div className="settings-member-info">
                <strong className="settings-member-name">Active Team Limit</strong>
                <span className="settings-member-email">
                  {overview.summary.activeTeamLimit === null ? "Unlimited during trial" : String(overview.summary.activeTeamLimit)}
                </span>
              </div>
            </div>
            <div className="settings-member-row">
              <div className="settings-member-info">
                <strong className="settings-member-name">Trial Ends</strong>
                <span className="settings-member-email">{formatDate(overview.billing?.trialEndsAtIso)}</span>
              </div>
            </div>
          </div>
        </article>

        <article className="stats-page-card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Game Day Model</h3>
            </div>
          </div>
          <div className="settings-members-list">
            <div className="settings-member-row">
              <div className="settings-member-info">
                <strong className="settings-member-name">Live Session Scope</strong>
                <span className="settings-member-email">Team-scoped, not school-scoped</span>
              </div>
            </div>
            <div className="settings-member-row">
              <div className="settings-member-info">
                <strong className="settings-member-name">Operator Pairing</strong>
                <span className="settings-member-email">Issued per live session with short pairing code</span>
              </div>
            </div>
            <div className="settings-member-row">
              <div className="settings-member-info">
                <strong className="settings-member-name">Concurrent Team Games</strong>
                <span className="settings-member-email">Supported across multiple teams in one school</span>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
