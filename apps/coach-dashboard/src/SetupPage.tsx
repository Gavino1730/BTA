import { type FormEvent, useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface SetupPageProps {
  onComplete: () => void;
}

interface RosterRow {
  id: number;
  name: string;
  number: string;
  position: string;
  grade: string;
}

interface OnboardingAccountPayload {
  account?: {
    organization?: {
      organizationName?: string;
      teamName?: string;
      season?: string;
    } | null;
    primaryCoach?: {
      fullName?: string;
      email?: string;
    } | null;
  } | null;
  suggestedCoach?: {
    coachName?: string;
    coachEmail?: string;
  } | null;
}

const PROFILE_KEY = "bta.coach.setupProfile";

function buildEmptyRosterRow(id: number): RosterRow {
  return { id, name: "", number: "", position: "", grade: "" };
}

export function SetupPage({ onComplete }: SetupPageProps) {
  const [organizationName, setOrganizationName] = useState("");
  const [coachName, setCoachName] = useState("");
  const [coachEmail, setCoachEmail] = useState("");
  const [teamName, setTeamName] = useState("");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [playingStyle, setPlayingStyle] = useState("");
  const [teamColor, setTeamColor] = useState("#1d4ed8");
  const [rows, setRows] = useState<RosterRow[]>([buildEmptyRosterRow(1)]);
  const [status, setStatus] = useState("Complete setup to unlock the unified coach workspace.");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const accountResponse = await fetch(`${apiBase}/api/onboarding/account`, { headers: apiKeyHeader() });
        if (!accountResponse.ok) {
          return;
        }

        const accountPayload = await accountResponse.json() as OnboardingAccountPayload;
        const account = accountPayload.account;
        const suggestedCoach = accountPayload.suggestedCoach;
        if (account?.organization || account?.primaryCoach) {
          setOrganizationName(account.organization?.organizationName ?? "");
          setCoachName(account.primaryCoach?.fullName ?? suggestedCoach?.coachName ?? "");
          setCoachEmail(account.primaryCoach?.email ?? suggestedCoach?.coachEmail ?? "");
          setTeamName(account.organization?.teamName ?? "");
          setSeason(account.organization?.season ?? String(new Date().getFullYear()));
          return;
        }

        if (suggestedCoach?.coachName || suggestedCoach?.coachEmail) {
          setCoachName(suggestedCoach.coachName ?? "");
          setCoachEmail(suggestedCoach.coachEmail ?? "");
        }
      } catch {
        // best effort prefill only
      }
    })();
  }, []);

  const validRows = useMemo(() => {
    return rows
      .map((row) => ({
        name: row.name.trim(),
        number: row.number.trim(),
        position: row.position.trim(),
        grade: row.grade.trim(),
      }))
      .filter((row) => row.name.length > 0);
  }, [rows]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTeam = teamName.trim();
    if (!normalizedTeam || !organizationName.trim() || !coachName.trim() || !coachEmail.trim()) {
      setStatus("Organization, coach name, coach email, and team name are required.");
      return;
    }

    setSaving(true);
    setStatus("Saving organization, team, and roster setup...");

    try {
      const teamRes = await fetch(`${apiBase}/api/onboarding/complete`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          organizationName: organizationName.trim(),
          coachName: coachName.trim(),
          coachEmail: coachEmail.trim(),
          teamName: normalizedTeam,
          season: season.trim() || undefined,
          teamColor,
          playingStyle: playingStyle.trim() || undefined,
          roster: validRows,
        }),
      });

      if (!teamRes.ok) {
        throw new Error("Onboarding save failed");
      }

      localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({
          organizationName: organizationName.trim(),
          coachName: coachName.trim(),
          coachEmail: coachEmail.trim(),
          teamName: normalizedTeam,
          completedAt: new Date().toISOString(),
        }),
      );

      setStatus("Setup complete. Redirecting to live dashboard...");
      onComplete();
    } catch {
      setStatus("Could not complete setup. Check API connection and credentials.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stats-page">
      <section className="stats-page-hero">
        <div>
          <h1>Organization Setup</h1>
          <p className="stats-page-subtitle">Create your organization profile, team, and roster in one onboarding flow.</p>
        </div>
        <p className="stats-page-status">{status}</p>
      </section>

      <form className="stats-page-card setup-form" onSubmit={handleSubmit}>
        <div className="setup-grid">
          <label className="stats-filter-field">
            <span>Organization Name</span>
            <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Valley Catholic Athletics" />
          </label>
          <label className="stats-filter-field">
            <span>Coach Name</span>
            <input value={coachName} onChange={(event) => setCoachName(event.target.value)} placeholder="Coach Rivera" />
          </label>
          <label className="stats-filter-field">
            <span>Coach Email</span>
            <input type="email" value={coachEmail} onChange={(event) => setCoachEmail(event.target.value)} placeholder="coach@school.org" />
          </label>
          <label className="stats-filter-field">
            <span>Team Name *</span>
            <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Valley Catholic" required />
          </label>
          <label className="stats-filter-field">
            <span>Season</span>
            <input value={season} onChange={(event) => setSeason(event.target.value)} placeholder="2026" />
          </label>
          <label className="stats-filter-field">
            <span>Playing Style</span>
            <input value={playingStyle} onChange={(event) => setPlayingStyle(event.target.value)} placeholder="Pace and space" />
          </label>
          <label className="stats-filter-field">
            <span>Team Color</span>
            <input type="color" value={teamColor} onChange={(event) => setTeamColor(event.target.value)} />
          </label>
        </div>

        <div className="stats-page-card-head">
          <h3>Roster</h3>
          <button
            type="button"
            className="shell-nav-link"
            onClick={() => setRows((current) => [...current, buildEmptyRosterRow(current.length + 1)])}
          >
            Add Player
          </button>
        </div>

        <div className="setup-roster-list">
          {rows.map((row, index) => (
            <div key={row.id} className="setup-roster-row">
              <label className="stats-filter-field">
                <span>Name</span>
                <input
                  value={row.name}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRows((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, name: value } : entry)));
                  }}
                  placeholder="Player name"
                />
              </label>
              <label className="stats-filter-field">
                <span>#</span>
                <input
                  value={row.number}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRows((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, number: value } : entry)));
                  }}
                  placeholder="0"
                />
              </label>
              <label className="stats-filter-field">
                <span>Position</span>
                <input
                  value={row.position}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRows((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, position: value } : entry)));
                  }}
                  placeholder="PG"
                />
              </label>
              <label className="stats-filter-field">
                <span>Grade</span>
                <input
                  value={row.grade}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRows((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, grade: value } : entry)));
                  }}
                  placeholder="11"
                />
              </label>
              <button
                type="button"
                className="shell-nav-link"
                onClick={() => setRows((current) => (current.length <= 1 ? current : current.filter((entry) => entry.id !== row.id)))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="setup-actions">
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>
            {saving ? "Saving..." : "Complete Setup"}
          </button>
        </div>
      </form>
    </div>
  );
}
