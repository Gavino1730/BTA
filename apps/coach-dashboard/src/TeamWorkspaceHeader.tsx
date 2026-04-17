import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchWorkspaceContext, type WorkspaceContext, type WorkspaceTeam } from "./workspace.js";

function resolveActiveTeamId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const teamId = new URLSearchParams(window.location.search).get("teamId")?.trim() ?? "";
  return teamId || null;
}

function formatTeamLevel(team: WorkspaceTeam | null): string {
  if (!team?.level) {
    return "Team workspace";
  }
  return `${team.level.charAt(0).toUpperCase()}${team.level.slice(1)} basketball`;
}

export function TeamWorkspaceHeader({
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
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [metaStatus, setMetaStatus] = useState("Loading workspace metadata...");
  const activeTeamId = resolveActiveTeamId();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchWorkspaceContext();
        if (cancelled) {
          return;
        }
        setWorkspace(next);
        setMetaStatus("Workspace metadata loaded.");
      } catch {
        if (!cancelled) {
          setMetaStatus("Workspace metadata unavailable.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentTeam = useMemo(
    () => workspace?.teams.find((team) => team.id === activeTeamId) ?? null,
    [activeTeamId, workspace],
  );

  const currentSchool = useMemo(
    () => workspace?.schools.find((school) => school.schoolId === currentTeam?.schoolId) ?? null,
    [currentTeam?.schoolId, workspace],
  );

  const headerChips = [
    currentSchool ? `School: ${currentSchool.name}` : null,
    currentTeam ? formatTeamLevel(currentTeam) : null,
    currentTeam ? `${currentTeam.rosterCount ?? currentTeam.players.length} players` : null,
    typeof currentTeam?.staffCount === "number" ? `${currentTeam.staffCount} staff` : null,
    currentTeam?.liveSession ? "Live session active" : "No live session",
  ].filter(Boolean) as string[];

  return (
    <section className="stats-page-hero team-workspace-hero">
      <div className="team-workspace-hero-copy">
        <p className="stats-page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="team-workspace-title">{currentTeam?.displayName ?? currentTeam?.name ?? "Team workspace"}</p>
        <p className="stats-page-subtitle">{subtitle}</p>
        <div className="team-workspace-chip-row">
          <span className={`team-workspace-chip ${currentTeam?.status === "read_only" ? "is-warning" : "is-primary"}`}>
            {currentTeam?.status === "read_only" ? "Read Only" : "Active Workspace"}
          </span>
          {headerChips.map((chip) => (
            <span key={chip} className="team-workspace-chip">{chip}</span>
          ))}
        </div>
      </div>
      <div className="team-workspace-hero-side">
        {actions ? <div className="team-workspace-hero-actions">{actions}</div> : null}
        <p className="stats-page-status school-page-status">{status}</p>
        <p className="stats-page-status">{metaStatus}</p>
      </div>
    </section>
  );
}
