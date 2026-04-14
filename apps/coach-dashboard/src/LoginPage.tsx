import { type FormEvent, useEffect, useState } from "react";
import { apiBase, apiKeyHeader, resolveActiveSchoolId, storeAuthSession } from "./platform.js";

interface LoginPageProps {
  onSuccess: (setupComplete: boolean) => void;
  onBackHome: () => void;
  onCreateAccount: () => void;
  onForgotPassword: () => void;
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

export function LoginPage({ onSuccess, onBackHome, onCreateAccount, onForgotPassword }: LoginPageProps) {
  const activeSchoolId = resolveActiveSchoolId();
  const inviteEmailFromUrl = new URLSearchParams(window.location.search).get("email")?.trim().toLowerCase() ?? "";
  const hasInviteLink = Boolean(new URLSearchParams(window.location.search).get("invite"));
  const [coachEmail, setCoachEmail] = useState(inviteEmailFromUrl);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(
    hasInviteLink
      ? "You were invited to this workspace. Sign in, or create an account with the invited email."
      : "Sign in with an approved coach account.",
  );
  const [busy, setBusy] = useState(false);
  const statusIsError = /^could not|^cannot|^enter /i.test(status);

  useEffect(() => {
    if (!activeSchoolId) {
      setStatus("Waiting for school context before checking your session.");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`${apiBase}/api/auth/session`, { headers: apiKeyHeader() });
        if (!response.ok) {
          return;
        }

        const payload = await response.json() as AuthSessionPayload;
        if (!cancelled && payload.authenticated && payload.user && payload.token) {
          storeAuthSession({
            token: payload.token,
            email: payload.user.email,
            fullName: payload.user.fullName,
            role: payload.user.role,
            schoolId: payload.user.schoolId,
            lastLoginAtIso: payload.user.lastLoginAtIso ?? null,
          });
          setStatus(`Welcome back, ${payload.user.fullName ?? payload.user.email ?? "Coach"}. Redirecting...`);
          onSuccess(Boolean(payload.onboarding?.completed));
        }
      } catch {
        // best effort session check only
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, onSuccess]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSchoolId) {
      setStatus("Cannot sign in until school context is available.");
      return;
    }

    const normalizedEmail = coachEmail.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setStatus("Enter your approved coach email and password to continue.");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setStatus("Enter a valid coach email address.");
      return;
    }

    setBusy(true);
    setStatus("Signing in...");

    try {
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
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

      setPassword("");
      setStatus(
        payload.onboarding?.completed
          ? "Signed in successfully. Opening your dashboard..."
          : "Signed in. Finish your setup next.",
      );
      onSuccess(Boolean(payload.onboarding?.completed));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not authenticate this account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page auth-login-page">
      <div className="auth-page-glow auth-page-glow-left" aria-hidden="true" />
      <div className="auth-page-glow auth-page-glow-right" aria-hidden="true" />

      <header className="auth-topbar auth-login-topbar">
        <button type="button" className="auth-topbar-link" onClick={onBackHome}>Back Home</button>
        <span className="auth-topbar-pill">Coach Access</span>
      </header>

      <main className="auth-shell auth-shell-wide auth-login-shell">
        <section className="auth-card auth-login-card">
          <span className="auth-kicker">Coach access</span>
          <div className="auth-card-head">
            <h2>Sign in to your dashboard</h2>
            <p>
              Enter your coach credentials and jump straight into live game control.
            </p>
          </div>

          <form className="auth-form auth-login-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Coach Email</span>
              <input
                type="email"
                value={coachEmail}
                onChange={(event) => setCoachEmail(event.target.value)}
                placeholder="coach@program.org"
                autoComplete="email"
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
              />
            </label>

            <button type="submit" className="auth-primary-button" disabled={busy}>
              {busy ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <div className="auth-login-assist">
            <div className="auth-inline-row">
              <button type="button" className="auth-text-link auth-secondary-button" onClick={onForgotPassword}>
                Forgot password?
              </button>
              <button type="button" className="auth-text-link auth-secondary-button" onClick={onCreateAccount}>
                {hasInviteLink ? "Accept Invite" : "Create Account"}
              </button>
            </div>
            <div className="auth-login-quick-links">
              <button type="button" className="auth-text-link auth-secondary-button" onClick={onBackHome}>
                Return Home
              </button>
              <button type="button" className="auth-text-link auth-secondary-button" onClick={onCreateAccount}>
                {hasInviteLink ? "Use Invite Email" : "Need Access"}
              </button>
            </div>
          </div>

          <p className={`auth-status auth-login-status${statusIsError ? " auth-status-error" : ""}`}>{status}</p>
        </section>

        <section className="auth-hero-panel auth-login-hero-panel">
          <div className="auth-login-hero-header">
            <div className="auth-login-ribbon-row" aria-hidden="true">
              <span className="auth-login-ribbon">Live Feed Armed</span>
              <span className="auth-login-ribbon">Bench Alerts Ready</span>
              <span className="auth-login-ribbon">Replay Safe</span>
            </div>
            <span className="auth-kicker">Game Day Control Room</span>
            <h1 className="auth-display-title">
              Run the sideline
              <span>without losing tempo.</span>
            </h1>
            <p className="auth-hero-copy">
              Every possession, foul, and rotation update hits the staff dashboard in seconds so the bench can react in real time.
            </p>
          </div>

          <div className="auth-login-snapshot-card" aria-hidden="true">
            <div className="auth-login-snapshot-head">
              <strong>Live Snapshot</strong>
              <span>Q3 · 03:41</span>
            </div>
            <div className="auth-login-snapshot-scoreboard">
              <div>
                <p>Home</p>
                <strong>58</strong>
              </div>
              <span>:</span>
              <div>
                <p>Away</p>
                <strong>51</strong>
              </div>
            </div>
            <div className="auth-login-snapshot-events">
              <p>Last event: Defensive rebound, #12</p>
              <p>Next insight: Foul pressure warning</p>
            </div>
            <div className="auth-login-tempo-track">
              <span className="auth-login-tempo-fill" style={{ width: "72%" }} />
            </div>
          </div>

          <div className="auth-login-feature-grid" aria-hidden="true">
            <article className="auth-login-feature-card">
              <span>Latency</span>
              <strong>Sub-2s event fanout</strong>
            </article>
            <article className="auth-login-feature-card">
              <span>Replay</span>
              <strong>Deterministic game state</strong>
            </article>
            <article className="auth-login-feature-card">
              <span>Coverage</span>
              <strong>Live + postgame AI insights</strong>
            </article>
          </div>

          <aside className="auth-side-note auth-login-cta-note">
            <strong>{hasInviteLink ? "Finish your invite setup" : "Need an approved account?"}</strong>
            <p>
              {hasInviteLink
                ? "Create your account with the invited address and your dashboard will be provisioned automatically."
                : "Use create account to request access, then return here to unlock your live workspace."}
            </p>
            <button type="button" className="auth-text-link auth-secondary-button" onClick={onCreateAccount}>
              {hasInviteLink ? "Complete Invite" : "Start Create Account"}
            </button>
          </aside>
        </section>
      </main>
    </div>
  );
}
