import { useEffect, useMemo, useState } from "react";
import { AddTeamModal, SchoolPageHeader, SchoolSectionIntro, SchoolTeamsSection, type TeamTemplateOption } from "./SchoolAdminSections.js";
import { WorkspaceStateCard } from "./WorkspaceStateCard.js";
import { createSchoolTeam, fetchSchoolOverview, type SchoolOverviewPayload } from "./workspace.js";

interface SchoolTeamsPageProps {
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

export function SchoolTeamsPage({ schoolId, canManageSchool, onOpenTeam }: SchoolTeamsPageProps) {
  const [overview, setOverview] = useState<SchoolOverviewPayload | null>(null);
  const [status, setStatus] = useState("Loading teams...");
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templateLabel, setTemplateLabel] = useState("Boys Varsity");
  const [displayName, setDisplayName] = useState("Boys Varsity");
  const [customLabel, setCustomLabel] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [teamColor, setTeamColor] = useState("#1d4ed8");

  async function reloadOverview(nextStatus?: string) {
    setStatus(nextStatus ?? "Loading teams...");
    const payload = await fetchSchoolOverview(schoolId);
    setOverview(payload);
    setStatus(nextStatus ?? "Teams loaded.");
    return payload;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await fetchSchoolOverview(schoolId);
        if (!cancelled) {
          setOverview(payload);
          setStatus("Teams loaded.");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Could not load teams.");
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
      await reloadOverview(result.billingNotice ?? `${result.team.displayName ?? result.team.name} created.`);
      setShowAddTeam(false);
      onOpenTeam(result.team.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create team.");
    } finally {
      setBusy(false);
    }
  }

  if (!overview) {
    return (
      <WorkspaceStateCard
        eyebrow="School teams"
        title="Loading team workspaces"
        message={status}
        tone={/^could not/i.test(status) ? "warning" : "neutral"}
      />
    );
  }

  return (
    <div className="stats-page">
      <SchoolPageHeader
        eyebrow="Team workspaces"
        title={overview.school.name}
        subtitle="Each basketball team gets its own live, roster, and insights workspace while still rolling up to the school."
        status={status}
        actions={canManageSchool ? (
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => setShowAddTeam((current) => !current)}>
            Add Team
          </button>
        ) : undefined}
      />

      <SchoolSectionIntro
        title="Team inventory"
        description="Use this page to see every school team, spot read-only capacity issues, and jump straight into the right workspace."
        metricLabel="Active teams"
        metricValue={String(overview.summary.activeTeamsCount)}
      />

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
        teamColor={teamColor}
        onTeamColorChange={setTeamColor}
        customLabel={customLabel}
        onCustomLabelChange={setCustomLabel}
        showCustomLabel={selectedTemplate.gender === "custom" || selectedTemplate.level === "custom"}
        onClose={() => setShowAddTeam(false)}
        onCreate={() => void handleCreateTeam()}
      />

      <SchoolTeamsSection
        overview={overview}
        canManageSchool={canManageSchool}
        onAddTeam={() => setShowAddTeam(true)}
        onOpenTeam={onOpenTeam}
      />
    </div>
  );
}
