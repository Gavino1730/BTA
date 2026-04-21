import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  apiBase,
  apiKeyHeader,
  buildAuthRedirectUrl,
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
  const inviteName = useMemo(() => new URLSearchParams(window.location.search).get("name")?.trim() ?? "", []);
  const inviteEmail = useMemo(() => new URLSearchParams(window.location.search).get("email")?.trim().toLowerCase() ?? "", []);
  const [schoolName, setSchoolName] = useState("");
  const [coachName, setCoachName] = useState(inviteName);
  const [coachEmail, setCoachEmail] = useState(inviteEmail);
  const [displayName, setDisplayName] = useState("");
  const [teamAbbreviation, setTeamAbbreviation] = useState("");
  const [schoolColor, setSchoolColor] = useState("#1d4ed8");
  const [status, setStatus] = useState("Create your account, confirm the school, and create the first team.");
  const [saving, setSaving] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">(inviteToken ? "register" : "register");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authSession, setAuthSession] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState("Create your coach account to unlock the school workspace.");
  const [authBusy, setAuthBusy] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const sessionRestoredRef = useRef(false);

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

        const context = await fetchWorkspaceContext().catch(() => null);
        const hasAccessibleWorkspace = inviteToken
          ? Boolean(context && context.schools.length > 0)
          : Boolean(context && context.schools.length > 0 && context.teams.length > 0);
        if (!cancelled && hasAccessibleWorkspace) {
          onComplete();
          return;
        }

        // Pre-fill school name from actual workspace data, not from a slug derived from the user's email
        if (!cancelled && context?.schools[0]?.name && !schoolName) {
          setSchoolName(context.schools[0].name);
        }

        if (!cancelled && !sessionRestoredRef.current) {
          sessionRestoredRef.current = true;
          setStep(2);
        }
      } catch {
        // best effort session restore only
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteEmail, inviteToken, onComplete, schoolName]);

  const completionPercent = useMemo(() => {
    const completed = [
      authSession?.email ? "account" : "",
      schoolName.trim(),
      displayName.trim(),
    ].filter(Boolean).length;
    return Math.round((completed / 3) * 100);
  }, [authSession?.email, schoolName, displayName]);
  const setupChecklist = useMemo(
    () => [
      {
        label: "Account",
        complete: Boolean(authSession?.email),
        detail: authSession?.email ?? "Create or sign in to a coach account",
      },
      {
        label: "School",
        complete: Boolean(schoolName.trim()),
        detail: schoolName.trim() || "Confirm the school workspace",
      },
      {
        label: "First Team",
        complete: Boolean(displayName.trim()),
        detail: displayName.trim() || "Create the first basketball team",
      },
    ],
    [authSession?.email, displayName, schoolName],
  );

  async function handleAuthSubmit(): Promise<boolean> {
    const normalizedName = coachName.trim();
    const normalizedEmail = coachEmail.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword || (authMode === "register" && !normalizedName)) {
      setAuthStatus("Coach name, email, and password are required.");
      return false;
    }

    if (!normalizedEmail.includes("@")) {
      setAuthStatus("Enter a valid coach email address.");
      return false;
    }

    if (authMode === "register") {
      if (normalizedPassword.length < 8) {
        setAuthStatus("Password must be at least 8 characters.");
        return false;
      }
      if (normalizedPassword !== confirmPassword.trim()) {
        setAuthStatus("Password confirmation does not match.");
        return false;
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
          }, buildAuthRedirectUrl("/login"));

      if (!authResult.token) {
        if (authMode === "register") {
          // Email confirmation may be required — attempt an immediate sign-in so the
          // user is not blocked. If Supabase auto-confirms the account this succeeds
          // right away. If email confirmation is still pending the sign-in will throw
          // and we fall through to the informational message.
          try {
            const immediateSignIn = await signInWithSupabase(normalizedEmail, normalizedPassword);
            if (immediateSignIn.token) {
              authResult.token = immediateSignIn.token;
              authResult.email = immediateSignIn.email ?? authResult.email;
              authResult.fullName = immediateSignIn.fullName ?? authResult.fullName;
            }
          } catch {
            // sign-in failed (email not confirmed yet); fall through
          }
        }
        if (!authResult.token) {
          if (authMode === "register") {
            setAuthStatus("Account created. Check your email to confirm your address, then sign in to continue.");
            return false;
          }
          throw new Error("Could not authenticate this account.");
        }
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

      setAuthStatus(
        payload.onboarding?.completed
          ? "Account ready. Redirecting..."
          : `Account ready for ${payload.user.email ?? normalizedEmail}. Continue below.`,
      );

      if (inviteToken) {
        const context = await fetchWorkspaceContext().catch(() => null);
        if (context && context.schools.length > 0) {
          setAuthStatus("Invite accepted. Opening your workspace...");
          onComplete();
          return true;
        }
      }

      if (payload.onboarding?.completed) {
        onComplete();
      }
      return true;
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "Could not authenticate this account.");
      return false;
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleStep1Continue() {
    if (authSession) {
      if (inviteToken) {
        onComplete();
        return;
      }
      setStep(2);
      return;
    }
    const success = await handleAuthSubmit();
    if (success && !inviteToken) {
      setStep(2);
    }
  }

  function handleStep2Continue() {
    if (!schoolName.trim()) {
      setStatus("School name is required to continue.");
      return;
    }
    setStep(3);
  }

  async function handleSignOut() {
    await signOutSupabase().catch(() => undefined);
    clearAuthSession();
    setAuthSession(null);
    setPassword("");
    setConfirmPassword("");
    setAuthMode("login");
    setAuthStatus("Signed out. Sign back in to continue.");
    setStep(1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession) {
      setStatus("Create or sign in to a coach account first.");
      return;
    }

    const normalizedSchoolName = schoolName.trim();
    const normalizedDisplayName = displayName.trim();
    const normalizedSchoolId = slugifySchoolId(normalizedSchoolName) || authSession.schoolId?.trim();
    if (!normalizedSchoolName || !normalizedSchoolId || !normalizedDisplayName) {
      setStatus("School name and first team are required.");
      return;
    }

    setSaving(true);
    setStatus("Creating school workspace...");

    try {
      // Always bootstrap so the user-provided school name is applied even if
      // a school record already exists from a prior session (bootstrapSchoolWorkspace
      // calls saveSchoolRecord which is a full upsert and always updates the name).
      await bootstrapSchoolWorkspace({
        schoolId: normalizedSchoolId,
        schoolName: normalizedSchoolName,
      });

      // Re-fetch context after bootstrap so school membership is active and any
      // pre-existing roster teams (e.g. from old onboarding or a still-running
      // API instance with in-memory data) are visible.
      const postBootstrapContext = await fetchWorkspaceContext().catch(() => null);
      // Use the first team from ANY school — guards against both same-school and
      // cross-school duplicates when old data is present in the API's memory.
      const anyExistingTeam = postBootstrapContext?.teams[0] ?? null;

      let activeSchoolId = normalizedSchoolId;
      let activeTeamId: string;
      if (anyExistingTeam) {
        // User already has at least one team — skip creation to avoid duplicates.
        activeSchoolId = anyExistingTeam.schoolId ?? normalizedSchoolId;
        activeTeamId = anyExistingTeam.id;
      } else {
        setStatus("Creating first team...");
        const teamResult = await createSchoolTeam(normalizedSchoolId, {
          gender: "custom",
          level: "custom",
          displayName: normalizedDisplayName,
          abbreviation: teamAbbreviation.trim().toUpperCase() || undefined,
          teamColor: schoolColor,
        });
        activeTeamId = teamResult.team.id;
      }

      await saveWorkspaceContextPreference({
        schoolId: activeSchoolId,
        teamId: activeTeamId,
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
    <div className="stats-page setup-page">
      <section className="stats-page-hero setup-hero">
        <div className="setup-hero-copy">
          <p className="stats-page-eyebrow">Get started</p>
          <h1>Create Your Basketball Program</h1>
          {inviteToken ? (
            <div className="setup-hero-ribbon-row">
              <span className="team-workspace-chip">Invite attached</span>
            </div>
          ) : null}
        </div>
        <div className="setup-hero-status">
          <p className="stats-page-status">{status}</p>
        </div>
      </section>

      <form className="stats-page-card setup-form setup-form-shell" onSubmit={handleSubmit}>
        <nav className="setup-step-bar" aria-label="Setup progress">
          {setupChecklist.flatMap((item, index) => {
            const stepNum = (index + 1) as 1 | 2 | 3;
            const isActive = stepNum === step;
            const isDone = stepNum < step || item.complete;
            const stepEl = (
              <div key={item.label} className={`setup-step${isDone ? " is-done" : ""}${isActive ? " is-active" : ""}`}>
                <span className="setup-step-dot">{isDone ? "✓" : stepNum}</span>
                <span className="setup-step-label">{item.label}</span>
              </div>
            );
            if (index > 0) {
              return [<span key={`conn-${index}`} className="setup-step-connector" aria-hidden="true" />, stepEl];
            }
            return [stepEl];
          })}
        </nav>

        {step === 1 && (
        <section className="setup-section setup-auth-section">
          <div className="setup-section-head setup-section-head-inline">
            <div>
              <h3>Your Coach Account</h3>
              <p className="setup-section-copy">Create or sign in to the coach account that owns this workspace.</p>
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

                {inviteToken ? (
                  <div className="setup-inline-note">
                    <strong>Invite detected</strong>
                    <p>Use the invited email so this account attaches to the correct school or team membership.</p>
                  </div>
                ) : null}

                <div className="setup-grid">
                  <label className="stats-filter-field">
                    <span>Your Name</span>
                    <input value={coachName} onChange={(event) => setCoachName(event.target.value)} placeholder="Coach Taylor" />
                  </label>
                  <label className="stats-filter-field">
                    <span>Email</span>
                    <input type="email" value={coachEmail} onChange={(event) => setCoachEmail(event.target.value)} placeholder="coach@school.org" />
                  </label>
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

                <p className="stats-page-status">{authStatus}</p>
              </>
            )}
            <button
              type="button"
              className="shell-nav-link shell-nav-link-active setup-primary-action"
              onClick={() => void handleStep1Continue()}
              disabled={authBusy}
            >
              {authSession
                ? "Continue to School"
                : authBusy
                  ? (authMode === "login" ? "Signing In..." : "Creating Account...")
                  : (authMode === "login" ? "Sign In & Continue" : "Create Account & Continue")}
            </button>
          </div>
        </section>
        )}

        {step === 2 && (
        <section className="setup-section setup-stage-card">
            <div className="setup-section-head">
              <div>
              <h3>School Details</h3>
              <p className="setup-section-copy">This becomes the admin entity for every team workspace in the school.</p>
              </div>
            </div>

            <div className="setup-grid">
              <label className="stats-filter-field">
                <span>School Name *</span>
                <input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder={schoolPlaceholder || "Lincoln High School"} required />
              </label>
              <label className="stats-filter-field setup-color-field">
                <span>School Color</span>
                <div className="setup-color-control">
                  <input type="color" value={schoolColor} onChange={(event) => setSchoolColor(event.target.value)} aria-label="School color" />
                  <div className="setup-color-preview">
                    <span className="setup-color-swatch" style={{ backgroundColor: schoolColor }} />
                    <strong>{schoolColor.toUpperCase()}</strong>
                  </div>
                </div>
              </label>
            </div>

            <div className="setup-summary-card setup-summary-card-accent">
              <span className="setup-summary-label">School Workspace</span>
              <strong>{schoolName.trim() || "Confirm school"}</strong>
              <p>Admins land in School Overview first, with billing, staff, activity, and team controls in one place.</p>
            </div>

            <div className="setup-actions">
              <button type="button" className="shell-nav-link" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="shell-nav-link shell-nav-link-active setup-primary-action" onClick={handleStep2Continue}>
                Continue to First Team
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
        <section className="setup-section setup-stage-card">
            <div className="stats-page-card-head setup-section-head setup-section-head-inline">
              <div>
              <h3>First Team</h3>
                <p className="setup-section-copy">Create the first basketball team workspace. Roster import can happen after entry.</p>
              </div>
              <div className="setup-roster-toolbar">
                <span className="setup-count-badge">Basketball only</span>
              </div>
            </div>

            <div className="setup-grid">
              <label className="stats-filter-field">
                <span>Team Name *</span>
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
            </div>

            <div className="setup-summary-card">
              <span className="setup-summary-label">First Team Preview</span>
              <strong>{displayName.trim() || "Your team name"}</strong>
              <p>This team workspace will be created under the school. Roster import can happen after entry.</p>
            </div>

          <div className="setup-actions">
            <button type="button" className="shell-nav-link" onClick={() => setStep(2)} disabled={saving}>
              Back
            </button>
            <button type="submit" className="shell-nav-link shell-nav-link-active setup-primary-action" disabled={saving}>
              {saving ? "Creating Workspace..." : "Create School Workspace"}
            </button>
          </div>
        </section>
        )}
      </form>
    </div>
  );
}
