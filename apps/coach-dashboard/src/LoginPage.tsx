import { type FormEvent, useEffect, useState } from "react";
import { apiBase, apiKeyHeader, storeAuthSession, type AuthSessionPersistence } from "./platform.js";

interface LoginPageProps {
  onSuccess: (setupComplete: boolean) => void;
  onBackHome: () => void;
  onCreateAccount: (email?: string) => void;
  onForgotPassword: (email?: string) => void;
  onAcceptInvite: () => void;
  onVerifyEmail: () => void;
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

export function LoginPage({ onSuccess, onBackHome, onCreateAccount, onForgotPassword, onAcceptInvite, onVerifyEmail }: LoginPageProps) {
  const initialEmail = typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.search).get("email") ?? "").trim().toLowerCase();
  const [coachEmail, setCoachEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [status, setStatus] = useState("Private preview only. Sign in with an approved coach account.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
  }, [onSuccess]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const persistence: AuthSessionPersistence = rememberMe ? "local" : "session";
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
      }, { persistence });

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

  function handleForgotPassword() {
    const normalizedEmail = coachEmail.trim().toLowerCase();
    onForgotPassword(normalizedEmail || undefined);
  }

  function handleCreateAccount() {
    const normalizedEmail = coachEmail.trim().toLowerCase();
    onCreateAccount(normalizedEmail || undefined);
  }

  return (
    <div className="auth-page auth-login-page">
      <div className="auth-page-glow auth-page-glow-left" aria-hidden="true" />
      <div className="auth-page-glow auth-page-glow-right" aria-hidden="true" />

      <header className="auth-topbar auth-login-topbar">
        <button type="button" className="auth-topbar-link" onClick={onBackHome}>Back Home</button>
        <div className="auth-brand-lockup auth-brand-lockup-compact" aria-label="BTA Courtside">
          <img className="auth-brand-logo" src="/brand-logo.png" alt="BTA Courtside" />
          <div>
            <p className="auth-brand-name">Courtside</p>
            <p className="auth-brand-subtitle">Live Basketball Intelligence</p>
          </div>
        </div>
        <span className="auth-topbar-pill">Coach Access</span>
      </header>

      <main className="auth-shell auth-shell-wide auth-login-shell">
        <section className="auth-card auth-login-card" aria-labelledby="coach-login-title">
          <div className="auth-card-head">
            <p className="auth-kicker">Coach Login</p>
            <h2 id="coach-login-title">Sign in to your dashboard</h2>
            <p>
              Use the same coach email tied to your organization. Keep this device signed in only if it is trusted.
            </p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Coach Email</span>
              <input
                type="email"
                value={coachEmail}
                onChange={(event) => setCoachEmail(event.target.value)}
                placeholder="coach@program.org"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
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

            <div className="auth-inline-row">
              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                <span>Remember me on this device</span>
              </label>

              <button type="button" className="auth-text-link" onClick={handleForgotPassword}>Forgot password?</button>
            </div>

            <button type="submit" className="auth-primary-button" disabled={busy}>
              {busy ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <p className="auth-status auth-login-status" aria-live="polite">{status}</p>

          <div className="auth-link-row">
            <button type="button" className="auth-secondary-button" onClick={onAcceptInvite}>Accept Team Invite</button>
            <button type="button" className="auth-secondary-button" onClick={onVerifyEmail}>Verify Email</button>
          </div>
        </section>

        <section className="auth-hero-panel auth-login-hero-panel" aria-label="Coach workspace overview">
          <div className="auth-login-hero-header">
            <span className="auth-kicker">Coach Workspace</span>
            <div className="auth-login-ribbon-row" aria-hidden="true">
              <span className="auth-login-ribbon">Live Stats</span>
              <span className="auth-login-ribbon">Film Context</span>
              <span className="auth-login-ribbon">Secure Sessions</span>
            </div>
            <h1 className="auth-display-title">
              Run the sideline command desk
              <span>without losing game tempo.</span>
            </h1>
            <p className="auth-hero-copy">
              Keep your bench synced, your staff aligned, and your adjustments fast with one unified coach control room.
            </p>
          </div>

          <article className="auth-login-snapshot-card" aria-label="Live snapshot preview">
            <div className="auth-login-snapshot-head">
              <strong>Live Preview</strong>
              <span>Quarter 3 · 04:12</span>
            </div>
            <div className="auth-login-snapshot-scoreboard">
              <div>
                <p>Home</p>
                <strong>64</strong>
              </div>
              <span>:</span>
              <div>
                <p>Away</p>
                <strong>59</strong>
              </div>
            </div>
            <div className="auth-login-snapshot-events">
              <p>Momentum: 6-0 run in last 1:42</p>
              <p>Lineup: 2-way wing unit on floor</p>
              <div className="auth-login-tempo-track" aria-hidden="true">
                <span className="auth-login-tempo-fill" style={{ width: "68%" }} />
              </div>
            </div>
          </article>

          <div className="auth-login-feature-grid" aria-label="Platform capabilities">
            <article className="auth-login-feature-card">
              <span>Realtime Sync</span>
              <strong>Operator and dashboard stay aligned possession-by-possession.</strong>
            </article>
            <article className="auth-login-feature-card">
              <span>Secure Sessions</span>
              <strong>Use remembered or browser-session sign-in for trusted devices.</strong>
            </article>
            <article className="auth-login-feature-card">
              <span>Account Recovery</span>
              <strong>Email verification and password reset built into the same flow.</strong>
            </article>
          </div>

          <div className="auth-side-note auth-login-cta-note">
            <strong>New to BTA Courtside?</strong>
            <p>Create your coach account, finish setup once, and return straight to live operations for future sign-ins.</p>
            <button type="button" className="auth-secondary-button" onClick={handleCreateAccount}>Create Account</button>
          </div>
        </section>
      </main>
    </div>
  );
}
