import { useEffect, useState } from "react";
import { SchoolActivitySection } from "./SchoolAdminSections.js";
import { fetchSchoolOverview, type SchoolOverviewPayload } from "./workspace.js";

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
          <p className="stats-page-subtitle">Activity</p>
        </div>
        <div className="settings-header-actions">
          <p className="stats-page-status">{status}</p>
        </div>
      </section>
      <SchoolActivitySection overview={overview} />
    </div>
  );
}
