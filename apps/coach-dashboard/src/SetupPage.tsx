import { type FormEvent, useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader, clearAuthSession, storeAuthSession } from "./platform.js";

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

interface AuthUser {
  accountId?: string;
  fullName?: string;
  email?: string;
  role?: string;
  schoolId?: string;
  lastLoginAtIso?: string | null;
}

interface AuthSessionPayload {
  authenticated?: boolean;
  token?: string | null;
  user?: AuthUser | null;
  onboarding?: {
    completed?: boolean;
  } | null;
  error?: string;
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
  const [teamColor, setTeamColor] = useState("#1d4ed8");
  const [rows, setRows] = useState<RosterRow[]>([buildEmptyRosterRow(1)]);
  const [status, setStatus] = useState("Create your account and complete setup to unlock the unified coach workspace.");
  const [saving, setSaving] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authSession, setAuthSession] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState("Create a coach account with email and password to secure this workspace.");
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [sessionResponse, accountResponse] = await Promise.all([
          fetch(`${apiBase}/api/auth/session`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/onboarding/account`, { headers: apiKeyHeader() }),
        ]);

        if (sessionResponse.ok) {
          const sessionPayload = await sessionResponse.json() as AuthSessionPayload;
          if (sessionPayload.authenticated && sessionPayload.user) {
            setAuthSession(sessionPayload.user);
            setCoachName(sessionPayload.user.fullName ?? "");
            setCoachEmail(sessionPayload.user.email ?? "");
            setAuthStatus(`Signed in as ${sessionPayload.user.email ?? sessionPayload.user.fullName ?? "your coach account"}.`);
            if (sessionPayload.token) {
              storeAuthSession({
                token: sessionPayload.token,
                email: sessionPayload.user.email,
                fullName: sessionPayload.user.fullName,
                role: sessionPayload.user.role,
                schoolId: sessionPayload.user.schoolId,
                lastLoginAtIso: sessionPayload.user.lastLoginAtIso ?? null,
              });
            }
          } else {
            clearAuthSession();
          }
        }

        if (!accountResponse.ok) {
          return;
        }

        const accountPayload = await accountResponse.json() as OnboardingAccountPayload;
        const account = accountPayload.account;
        const suggestedCoach = accountPayload.suggestedCoach;
        if (account?.organization || account?.primaryCoach) {
          setOrganizationName(account.organization?.organizationName ?? "");
          setCoachName((current) => current || account.primaryCoach?.fullName || suggestedCoach?.coachName || "");
          setCoachEmail((current) => current || account.primaryCoach?.email || suggestedCoach?.coachEmail || "");
          setTeamName(account.organization?.teamName ?? "");
          setSeason(account.organization?.season ?? String(new Date().getFullYear()));
          if (account.primaryCoach?.email && !authSession) {
            setAuthMode("login");
            setAuthStatus("Sign in with your coach email and password to continue onboarding.");
          }
          return;
        }

        if (suggestedCoach?.coachName || suggestedCoach?.coachEmail) {
          setCoachName((current) => current || suggestedCoach.coachName || "");
          setCoachEmail((current) => current || suggestedCoach.coachEmail || "");
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

  const completionPercent = useMemo(() => {
    const completed = [
      authSession?.email ? "account" : "",
      organizationName.trim(),
      coachName.trim(),
      coachEmail.trim(),
      teamName.trim(),
      season.trim(),
      validRows.length > 0 ? "roster" : "",
    ].filter(Boolean).length;

    return Math.round((completed / 7) * 100);
  }, [authSession?.email, organizationName, coachName, coachEmail, teamName, season, validRows.length]);

  async function handleAuthSubmit() {
    const normalizedName = coachName.trim();
    const normalizedEmail = coachEmail.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword || (authMode === "register" && !normalizedName)) {
      setAuthStatus("Coach name, email, and password are required.");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setAuthStatus("Enter a valid coach email address.");
      return;
    }

    if (authMode === "register") {
      if (normalizedPassword.length < 8) {
        setAuthStatus("Password must be at least 8 characters.");
        return;
      }
      if (normalizedPassword !== confirmPassword.trim()) {
        setAuthStatus("Password confirmation does not match.");
        return;
      }
    }

    setAuthBusy(true);
    setAuthStatus(authMode === "login" ? "Signing in..." : "Creating your secure coach account...");

    try {
      const response = await fetch(`${apiBase}/api/auth/${authMode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          fullName: normalizedName,
          email: normalizedEmail,
          password: normalizedPassword,
        }),
      });

      const payload = await response.json() as AuthSessionPayload;
      if (!response.ok || !payload.user || !payload.token) {
        throw new Error(payload.error || "Could not authenticate this account.");
      }

      storeAuthSession({
        token: payload.token,
        email: payload.user.email,
        fullName: payload.user.fullName,
        role: payload.user.role,
        schoolId: payload.user.schoolId,
        lastLoginAtIso: payload.user.lastLoginAtIso ?? null,
      });
      setAuthSession(payload.user);
      setPassword("");
      setConfirmPassword("");
      setAuthStatus(
        payload.onboarding?.completed
          ? `Welcome back, ${payload.user.fullName ?? payload.user.email ?? "Coach"}. Redirecting to your dashboard...`
          : `Account ready for ${payload.user.email ?? normalizedEmail}. Continue with program setup below.`,
      );

      if (payload.onboarding?.completed) {
        setStatus("Account verified. Redirecting to live dashboard...");
        onComplete();
      }
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "Could not authenticate this account.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    clearAuthSession();
    setAuthSession(null);
    setPassword("");
    setConfirmPassword("");
    setAuthMode("login");
    setAuthStatus("Signed out. Sign back in to continue.");
    setStatus("Sign in to access onboarding and the coach workspace.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTeam = teamName.trim();
    if (!authSession) {
      setStatus("Create or sign into your coach account before completing setup.");
      return;
    }
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
      <section className="stats-page-hero setup-hero">
        <div>
          <p className="stats-page-eyebrow">Coach onboarding</p>
          <h1>Organization Setup</h1>
          <p className="stats-page-subtitle">Create your organization profile, team, and roster in one streamlined flow.</p>
        </div>
        <div className="setup-hero-status">
          <span className="setup-status-pill">{completionPercent}% ready</span>
          <p className="stats-page-status">{status}</p>
        </div>
      </section>

      <form className="stats-page-card setup-form setup-form-shell" onSubmit={handleSubmit}>
        <section className="setup-section setup-auth-section">
          <div className="setup-section-head setup-section-head-inline">
            <div>
              <h3>Account Access</h3>
              <p className="setup-section-copy">Secure this workspace with an email/password coach account before finishing onboarding.</p>
            </div>
            <span className={`setup-auth-pill ${authSession ? "setup-auth-pill-active" : ""}`}>
              {authSession ? "Signed in" : "Step 1"}
            </span>
          </div>

          <div className="setup-auth-card">
            {authSession ? (
              <div className="setup-auth-signed-in">
                <div>
                  <strong>{authSession.fullName || coachName.trim() || "Coach account ready"}</strong>
                  <p>{authSession.email || coachEmail.trim() || "This workspace is protected."}</p>
                </div>
                <div className="setup-roster-toolbar">
                  <span className="setup-count-badge">Protected workspace</span>
                  <button type="button" className="shell-nav-link" onClick={() => void handleSignOut()}>
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="setup-auth-toggle">
                  <button
                    type="button"
                    className={authMode === "register" ? "shell-nav-link shell-nav-link-active" : "shell-nav-link"}
                    onClick={() => setAuthMode("register")}
                  >
                    Create Account
                  </button>
                  <button
                    type="button"
                    className={authMode === "login" ? "shell-nav-link shell-nav-link-active" : "shell-nav-link"}
                    onClick={() => setAuthMode("login")}
                  >
                    Sign In
                  </button>
                </div>

                <div className="setup-grid">
                  <label className="stats-filter-field">
                    <span>Coach Name</span>
                    <input value={coachName} onChange={(event) => setCoachName(event.target.value)} placeholder="Coach Taylor" />
                  </label>
                  <label className="stats-filter-field">
                    <span>Coach Email</span>
                    <input type="email" value={coachEmail} onChange={(event) => setCoachEmail(event.target.value)} placeholder="coach@program.org" />
                  </label>
                  <label className="stats-filter-field">
                    <span>Password</span>
                    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" />
                  </label>
                  {authMode === "register" && (
                    <label className="stats-filter-field">
                      <span>Confirm Password</span>
                      <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter password" />
                    </label>
                  )}
                </div>

                <div className="setup-auth-actions">
                  <button
                    type="button"
                    className="shell-nav-link shell-nav-link-active setup-auth-submit"
                    onClick={() => void handleAuthSubmit()}
                    disabled={authBusy}
                  >
                    {authBusy ? (authMode === "login" ? "Signing In..." : "Creating Account...") : (authMode === "login" ? "Sign In" : "Create Secure Account")}
                  </button>
                  <p className="stats-page-status">{authStatus}</p>
                </div>
              </>
            )}
          </div>
        </section>

        <div className="setup-summary-grid">
          <article className="setup-summary-card setup-summary-card-accent">
            <span className="setup-summary-label">Workspace readiness</span>
            <strong>{completionPercent}%</strong>
            <p>
              {validRows.length > 0
                ? `${validRows.length} player${validRows.length === 1 ? "" : "s"} added so far.`
                : "Add your first player to unlock live lineup context."}
            </p>
          </article>
          <article className="setup-summary-card">
            <span className="setup-summary-label">Coach profile</span>
            <strong>{coachName.trim() || "Add lead coach"}</strong>
            <p>{coachEmail.trim() || "Set the main contact email for alerts and invites."}</p>
          </article>
          <article className="setup-summary-card">
            <span className="setup-summary-label">Program identity</span>
            <strong>{teamName.trim() || "Team name"}</strong>
            <p>{season.trim() ? `Season ${season.trim()}` : "Choose the current season"}</p>
          </article>
        </div>

        <section className="setup-section">
          <div className="setup-section-head">
            <div>
              <h3>Program Details</h3>
              <p className="setup-section-copy">These details appear across the coach dashboard, operator app, and live reports.</p>
            </div>
          </div>

          <div className="setup-grid">
            <label className="stats-filter-field">
              <span>Organization Name</span>
              <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Central High Athletics" />
            </label>
            <label className="stats-filter-field">
              <span>Team Name *</span>
              <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Varsity Boys Basketball" required />
            </label>
            <label className="stats-filter-field">
              <span>Season</span>
              <input value={season} onChange={(event) => setSeason(event.target.value)} placeholder="2026" />
            </label>
            <label className="stats-filter-field setup-color-field">
              <span>Team Color</span>
              <div className="setup-color-control">
                <input type="color" value={teamColor} onChange={(event) => setTeamColor(event.target.value)} aria-label="Team color" />
                <div className="setup-color-preview">
                  <span className="setup-color-swatch" style={{ backgroundColor: teamColor }} />
                  <strong>{teamColor.toUpperCase()}</strong>
                </div>
              </div>
            </label>
          </div>
        </section>

        <section className="setup-section">
          <div className="stats-page-card-head setup-section-head setup-section-head-inline">
            <div>
              <h3>Roster</h3>
              <p className="setup-section-copy">Add players now so live tracking, AI insights, and box scores are ready on day one.</p>
            </div>
            <div className="setup-roster-toolbar">
              <span className="setup-count-badge">{validRows.length} player{validRows.length === 1 ? "" : "s"}</span>
              <button
                type="button"
                className="shell-nav-link"
                onClick={() => setRows((current) => [...current, buildEmptyRosterRow(current.length + 1)])}
              >
                Add Player
              </button>
            </div>
          </div>

          <div className="setup-roster-list">
            {rows.map((row, index) => (
              <div key={row.id} className="setup-roster-row setup-player-row">
                <div className="setup-player-row-head">
                  <div className="setup-roster-index" aria-hidden="true">
                    <span>Player</span>
                    <strong>{index + 1}</strong>
                  </div>
                  <button
                    type="button"
                    className="shell-nav-link setup-remove-button"
                    onClick={() => setRows((current) => (current.length <= 1 ? current : current.filter((entry) => entry.id !== row.id)))}
                  >
                    Remove
                  </button>
                </div>

                <div className="setup-player-fields">
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
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="setup-actions">
          <button type="submit" className="shell-nav-link shell-nav-link-active setup-submit-button" disabled={saving}>
            {saving ? "Saving..." : "Complete Setup"}
          </button>
        </div>
      </form>
    </div>
  );
}
