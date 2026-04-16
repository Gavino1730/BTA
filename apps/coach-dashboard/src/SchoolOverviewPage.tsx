import { useEffect, useMemo, useState } from "react";
import { createSchoolTeam, fetchSchoolOverview, type SchoolOverviewPayload } from "./workspace.js";

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

export function SchoolOverviewPage({ schoolId, canManageSchool, onOpenTeam }: SchoolOverviewPageProps) {
  const [overview, setOverview] = useState<SchoolOverviewPayload | null>(null);
  const [status, setStatus] = useState("Loading school overview...");
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templateLabel, setTemplateLabel] = useState("Boys Varsity");
  const [displayName, setDisplayName] = useState("Boys Varsity");
  const [customLabel, setCustomLabel] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [teamColor, setTeamColor] = useState("#1d4ed8");

  useEffect(() => {
    let cancelled = false;
    setStatus("Loading school overview...");
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

  const selectedTemplate = useMemo(() => TEAM_TEMPLATES.find((template) => template.label === templateLabel) ?? TEAM_TEMPLATES[0], [templateLabel]);

  useEffect(() => {
    setDisplayName(selectedTemplate.label);
    if (selectedTemplate.gender !== "custom" && selectedTemplate.level !== "custom") {
      setCustomLabel("");
    }
  }, [selectedTemplate]);

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
      setShowAddTeam(false);
      setOverview(await fetchSchoolOverview(overview.school.schoolId));
      setStatus(`${result.team.displayName ?? result.team.name} created.`);
      onOpenTeam(result.team.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create team.");
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
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => setShowAddTeam((current) => !current)}>
              Add Team
            </button>
          ) : null}
          <p className="stats-page-status">{status}</p>
        </div>
      </section>

      <section className="stats-page-grid three-column">
        <article className="stats-page-card">
          <p className="stats-page-eyebrow">Billing</p>
          <h3>{overview.summary.planId}</h3>
          <p className="stats-page-subcopy">Status: {overview.summary.billingStatus}</p>
        </article>
        <article className="stats-page-card">
          <p className="stats-page-eyebrow">Teams</p>
          <h3>{overview.summary.activeTeamsCount}</h3>
          <p className="stats-page-subcopy">Active team workspaces</p>
        </article>
        <article className="stats-page-card">
          <p className="stats-page-eyebrow">Live Games</p>
          <h3>{overview.summary.activeLiveGamesCount}</h3>
          <p className="stats-page-subcopy">Current team sessions</p>
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
                  <span className={`settings-status-badge settings-status-${team.liveSession ? "active" : "invited"}`}>
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
              <p className="settings-section-desc">School-wide roles and team assignments.</p>
            </div>
          </div>
          <div className="settings-members-list">
            {overview.staff.schoolMemberships.map((membership) => (
              <div key={membership.membershipId} className="settings-member-row">
                <div className="settings-member-info">
                  <div className="settings-member-avatar">{membership.fullName.charAt(0)}</div>
                  <div>
                    <strong className="settings-member-name">{membership.fullName}</strong>
                    <span className="settings-member-email">{membership.email}</span>
                  </div>
                </div>
                <div className="settings-member-controls">
                  <span className="settings-status-badge settings-status-active">{membership.role}</span>
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
              <div key={event.id} className="settings-member-row">
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
