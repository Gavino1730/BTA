import { useEffect, useState } from "react";
import { SchoolActivitySection, SchoolPageHeader, SchoolSectionIntro } from "./SchoolAdminSections.js";
import { fetchSchoolOverview, type SchoolOverviewPayload } from "./workspace.js";
import { WorkspaceStateCard } from "./WorkspaceStateCard.js";

export function SchoolActivityPage({ schoolId }: { schoolId: string }) {
  const [overview, setOverview] = useState<SchoolOverviewPayload | null>(null);
  const [status, setStatus] = useState("Loading activity...");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await fetchSchoolOverview(schoolId);
        if (!cancelled) {
          setOverview(payload);
          setStatus("Activity loaded.");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Could not load activity.");
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
        eyebrow="School activity"
        title="Loading activity feed"
        message={status}
        tone={/^could not/i.test(status) ? "warning" : "neutral"}
      />
    );
  }

  return (
    <div className="stats-page">
      <SchoolPageHeader
        eyebrow="Audit trail"
        title={overview.school.name}
        subtitle="Track invites, team creation, membership changes, and live session activity from one running feed."
        status={status}
      />
      <SchoolSectionIntro
        title="Recent school activity"
        description="This feed should show the highest-signal operational events so an athletic director can understand what changed without digging into team pages."
        metricLabel="Events"
        metricValue={String(overview.activity.length)}
      />
      <SchoolActivitySection overview={overview} />
    </div>
  );
}
