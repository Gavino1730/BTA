import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  apiBase,
  apiKeyHeader,
  clearAuthSession,
  formatSchoolNameFromId,
  resolveActiveSchoolId,
  storeAuthSession,
} from "./platform.js";
import {
  getSupabaseSessionIdentity,
  signInWithSupabase,
  signOutSupabase,
  signUpWithSupabase,
} from "./supabase/client.js";
import {
  bootstrapSchoolWorkspace,
  createSchoolTeam,
  fetchWorkspaceContext,
  saveWorkspaceContextPreference,
} from "./workspace.js";

interface SetupPageProps {
  onComplete: () => void;
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

const TEAM_TEMPLATES = [
  { label: "Boys Varsity", gender: "boys" as const, level: "varsity" as const },
  { label: "Boys JV", gender: "boys" as const, level: "jv" as const },
  { label: "Boys Freshman", gender: "boys" as const, level: "freshman" as const },
  { label: "Girls Varsity", gender: "girls" as const, level: "varsity" as const },
  { label: "Girls JV", gender: "girls" as const, level: "jv" as const },
  { label: "Custom Team", gender: "custom" as const, level: "custom" as const },
];

function slugifySchoolId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function SetupPage({ onComplete }: SetupPageProps) {
  const schoolPlaceholder = useMemo(() => formatSchoolNameFromId(resolveActiveSchoolId()), []);
  const inviteToken = useMemo(() => new URLSearchParams(window.location.search).get("invite")?.trim() ?? "", []);
  const inviteEmail = useMemo(() => new URLSearchParams(window.location.search).get("email")?.trim().toLowerCase() ?? "", []);
  const [schoolName, setSchoolName] = useState("");
  const [coachName, setCoachName] = useState("");
  const [coachEmail, setCoachEmail] = useState(inviteEmail);
  const [templateLabel, setTemplateLabel] = useState("Boys Varsity");
  const [displayName, setDisplayName] = useState("Boys Varsity");
  const [customLabel, setCustomLabel] = useState("");
  const [teamAbbreviation, setTeamAbbreviation] = useState("");
  const [teamColor, setTeamColor] = useState("#1d4ed8");
  const [status, setStatus] = useState("Create your account, confirm the school, and create the first team.");
  const [saving, setSaving] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">(inviteToken ? "register" : "register");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authSession, setAuthSession] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState("Create your coach account to unlock the school workspace.");
  const [authBusy, setAuthBusy] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`${apiBase}/api/auth/session`, { headers: apiKeyHeader() });
        if (!response.ok || cancelled) {
          return;
        }

        const payload = await response.json() as AuthSessionPayload;
        const fallbackSession = await getSupabaseSessionIdentity().catch(() => null);
        const token = payload.token ?? fallbackSession?.token ?? null;
        if (!payload.authenticated || !payload.user || !token) {
          return;
        }

        storeAuthSession({
          token,
          email: payload.user.email ?? fallbackSession?.email,
          fullName: payload.user.fullName ?? fallbackSession?.fullName,
          role: payload.user.role,
          schoolId: payload.user.schoolId,
          lastLoginAtIso: payload.user.lastLoginAtIso ?? null,
        });

        setAuthSession(payload.user);
        setCoachName(payload.user.fullName ?? "");
        setCoachEmail(payload.user.email ?? inviteEmail);
        setAuthStatus(`Signed in as ${payload.user.email ?? payload.user.fullName ?? "coach"}.`);

        if (payload.user.schoolId && !schoolName) {
          setSchoolName(formatSchoolNameFromId(payload.user.schoolId));
        }

        const context = await fetchWorkspaceContext().catch(() => null);
        if (!cancelled && context && context.schools.length > 0 && context.teams.length > 0) {
          onComplete();
        }
      } catch {
        // best effort session restore only
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteEmail, onComplete, schoolName]);

  const completionPercent = useMemo(() => {
    const completed = [
      authSession?.email ? "account" : "",
      schoolName.trim(),
      displayName.trim(),
    ].filter(Boolean).length;
    return Math.round((completed / 3) * 100);
  }, [authSession?.email, schoolName, displayName]);

  async function handleAuthSubmit() {
    const normalizedName = coachName.trim();
    const normalizedEmail = coachEmail.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword || (authMode === "register" && !normalizedName)) {
      setAuthStatus("Coach name, email, and password are required.");
      return;
    }

    if (authMode === "register" && !schoolName.trim()) {
      setAuthStatus("School name is required.");
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
    setAuthStatus(authMode === "login" ? "Signing in..." : "Creating account...");

    try {
      const authResult = authMode === "login"
        ? await signInWithSupabase(normalizedEmail, normalizedPassword)
        : await signUpWithSupabase(normalizedEmail, normalizedPassword, {
            full_name: normalizedName,
            name: normalizedName,
            school_name: schoolName.trim() || undefined,
            invite_token: inviteToken || undefined,
          }, `${window.location.origin}/login`);

      if (!authResult.token) {
        if (authMode === "register") {
          setAuthStatus("Account created. Check your email to confirm your address, then sign in to continue.");
          return;
        }
        throw new Error("Could not authenticate this account.");
      }

      storeAuthSession({
        token: authResult.token,
        email: authResult.email,
        fullName: authResult.fullName,
      });

      const response = await fetch(`${apiBase}/api/auth/session`, {
        headers: apiKeyHeader(),
      });

      const payload = await response.json() as AuthSessionPayload;
      const token = payload.token ?? authResult.token;
      if (!response.ok || !payload.user || !token) {
        throw new Error(payload.error || "Could not authenticate this account.");
      }

      storeAuthSession({
        token,
        email: payload.user.email ?? authResult.email,
        fullName: payload.user.fullName ?? authResult.fullName,
        role: payload.user.role,
        schoolId: payload.user.schoolId,
        lastLoginAtIso: payload.user.lastLoginAtIso ?? null,
      });
      setAuthSession(payload.user);
      setPassword("");
      setConfirmPassword("");
      setCoachName(payload.user.fullName ?? normalizedName);
      setCoachEmail(payload.user.email ?? normalizedEmail);
      if (payload.user.schoolId && !schoolName.trim()) {
        setSchoolName(formatSchoolNameFromId(payload.user.schoolId));
      }
      setAuthStatus(
        payload.onboarding?.completed
          ? "Account ready. Redirecting..."
          : `Account ready for ${payload.user.email ?? normalizedEmail}. Continue below.`,
      );

      if (payload.onboarding?.completed) {
        onComplete();
      }
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "Could not authenticate this account.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    await signOutSupabase().catch(() => undefined);
    clearAuthSession();
    setAuthSession(null);
    setPassword("");
    setConfirmPassword("");
    setAuthMode("login");
    setAuthStatus("Signed out. Sign back in to continue.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession) {
      setStatus("Create or sign in to a coach account first.");
      return;
    }

    const normalizedSchoolName = schoolName.trim();
    const normalizedDisplayName = displayName.trim() || selectedTemplate.label;
    const normalizedSchoolId = authSession.schoolId?.trim() || slugifySchoolId(normalizedSchoolName);
    if (!normalizedSchoolName || !normalizedSchoolId || !normalizedDisplayName) {
      setStatus("School name and first team are required.");
      return;
    }

    setSaving(true);
    setStatus("Creating school workspace...");

    try {
      const existingContext = await fetchWorkspaceContext().catch(() => null);
      const existingSchool = existingContext?.schools.find((school) => school.schoolId === normalizedSchoolId) ?? null;
      if (!existingSchool) {
        await bootstrapSchoolWorkspace({
          schoolId: normalizedSchoolId,
          schoolName: normalizedSchoolName,
        });
      }

      setStatus("Creating first team...");
      const teamResult = await createSchoolTeam(normalizedSchoolId, {
        gender: selectedTemplate.gender,
        level: selectedTemplate.level,
        displayName: normalizedDisplayName,
        customLabel: customLabel.trim() || undefined,
        abbreviation: teamAbbreviation.trim().toUpperCase() || undefined,
        teamColor,
      });

      await saveWorkspaceContextPreference({
        schoolId: normalizedSchoolId,
        teamId: teamResult.team.id,
        contextType: "team",
      }).catch(() => undefined);

      setStatus("Workspace ready. Opening team dashboard...");
      onComplete();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not complete setup.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stats-page">
      <section className="stats-page-hero setup-hero">
        <div>
          <p className="stats-page-eyebrow">School onboarding</p>
          <h1>Launch Your School Workspace</h1>
          <p className="stats-page-subtitle">Two required steps: confirm the school, then create the first basketball team.</p>
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
              <h3>Step 1: Account</h3>
              <p className="setup-section-copy">Create or sign in to the coach account that owns this school workspace.</p>
            </div>
            <span className={`setup-auth-pill ${authSession ? "setup-auth-pill-active" : ""}`}>
              {authSession ? "Signed in" : "Required"}
            </span>
          </div>

          <div className="setup-auth-card">
            {authSession ? (
              <div className="setup-auth-signed-in">
                <div>
                  <strong>{authSession.fullName || coachName.trim() || "Coach account ready"}</strong>
                  <p>{authSession.email || coachEmail.trim() || "Workspace owner account"}</p>
                </div>
                <div className="setup-roster-toolbar">
                  <span className="setup-count-badge">Authenticated</span>
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
                    <input type="email" value={coachEmail} onChange={(event) => setCoachEmail(event.target.value)} placeholder="coach@school.org" />
                  </label>
                  {authMode === "register" ? (
                    <label className="stats-filter-field">
                      <span>School Name</span>
                      <input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder={schoolPlaceholder || "Lincoln High School"} />
                    </label>
                  ) : null}
                  <label className="stats-filter-field">
                    <span>Password</span>
                    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" />
                  </label>
                  {authMode === "register" ? (
                    <label className="stats-filter-field">
                      <span>Confirm Password</span>
                      <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter password" />
                    </label>
                  ) : null}
                </div>

                <div className="setup-auth-actions">
                  <button
                    type="button"
                    className="shell-nav-link shell-nav-link-active setup-auth-submit"
                    onClick={() => void handleAuthSubmit()}
                    disabled={authBusy}
                  >
                    {authBusy ? (authMode === "login" ? "Signing In..." : "Creating Account...") : (authMode === "login" ? "Sign In" : "Create Account")}
                  </button>
                  <p className="stats-page-status">{authStatus}</p>
                </div>
              </>
            )}
          </div>
        </section>

        <div className="setup-summary-grid">
          <article className="setup-summary-card setup-summary-card-accent">
            <span className="setup-summary-label">School</span>
            <strong>{schoolName.trim() || "Confirm school"}</strong>
            <p>This becomes the billing and admin entity.</p>
          </article>
          <article className="setup-summary-card">
            <span className="setup-summary-label">First Team</span>
            <strong>{displayName.trim() || "Create first team"}</strong>
            <p>Default templates are optimized for high school basketball.</p>
          </article>
          <article className="setup-summary-card">
            <span className="setup-summary-label">Next Steps</span>
            <strong>Invite staff</strong>
            <p>Roster import and live game setup happen after entry, not during signup.</p>
          </article>
        </div>

        <section className="setup-section">
          <div className="setup-section-head">
            <div>
              <h3>Step 2: School Details</h3>
              <p className="setup-section-copy">This creates the school workspace and admin control center.</p>
            </div>
          </div>

          <div className="setup-grid">
            <label className="stats-filter-field">
              <span>School Name *</span>
              <input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder={schoolPlaceholder || "Lincoln High School"} required />
            </label>
          </div>
        </section>

        <section className="setup-section">
          <div className="stats-page-card-head setup-section-head setup-section-head-inline">
            <div>
              <h3>Step 3: First Team</h3>
              <p className="setup-section-copy">Create the first team workspace. Roster import can happen after entry.</p>
            </div>
            <div className="setup-roster-toolbar">
              <span className="setup-count-badge">Basketball only</span>
            </div>
          </div>

          <div className="setup-grid">
            <label className="stats-filter-field">
              <span>Template *</span>
              <select value={templateLabel} onChange={(event) => setTemplateLabel(event.target.value)}>
                {TEAM_TEMPLATES.map((template) => (
                  <option key={template.label} value={template.label}>{template.label}</option>
                ))}
              </select>
            </label>
            <label className="stats-filter-field">
              <span>Display Name *</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Boys Varsity" required />
            </label>
            <label className="stats-filter-field">
              <span>Abbreviation</span>
              <input
                value={teamAbbreviation}
                onChange={(event) => setTeamAbbreviation(event.target.value.toUpperCase().slice(0, 12))}
                placeholder="BVAR"
              />
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
            {selectedTemplate.gender === "custom" || selectedTemplate.level === "custom" ? (
              <label className="stats-filter-field">
                <span>Custom Label</span>
                <input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="Girls Development" />
              </label>
            ) : null}
          </div>
        </section>

        <div className="setup-actions">
          <button type="submit" className="shell-nav-link shell-nav-link-active setup-submit-button" disabled={saving}>
            {saving ? "Creating Workspace..." : "Create School Workspace"}
          </button>
        </div>
      </form>
    </div>
  );
}
