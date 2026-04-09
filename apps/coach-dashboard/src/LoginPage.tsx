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
  const hasInviteLink = Boolean(new URLSearchParams(window.location.search).get("invite"));
  const [coachEmail, setCoachEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(
    hasInviteLink
      ? "You were invited to this workspace. Sign in if you already have an account, or create one with the invited email."
      : "Private preview only. Sign in with an approved coach account.",
  );
  const [busy, setBusy] = useState(false);

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
    <div className="marketing-page">
      <header className="marketing-header marketing-header-tight">
        <button type="button" className="shell-nav-link" onClick={onBackHome}>← Back Home</button>
        <span className="marketing-coming-pill">Invite Only</span>
      </header>

      <main className="marketing-login-shell">
        <section className="marketing-login-card stats-page-card">
          <p className="stats-page-eyebrow">Coach access</p>
          <h1>Sign in to your dashboard</h1>
          <p className="stats-page-subtitle">
            Sign in below, or use the temporary create-account flow to unlock your dashboard.
          </p>

          <div className="marketing-login-note">
            <strong>{hasInviteLink ? "Invite detected" : "Temporary access enabled"}</strong>
            <p>
              {hasInviteLink
                ? "Use the invited email address to create your account and finish joining this workspace."
                : "If you do not have a coach login yet, create one first and then finish setup."}
            </p>
            <button type="button" className="shell-nav-link" onClick={onCreateAccount}>
              {hasInviteLink ? "Accept Invite" : "Create Account"}
            </button>
          </div>

          <form className="marketing-login-form" onSubmit={handleSubmit}>
            <label className="stats-filter-field">
              <span>Coach Email</span>
              <input type="email" value={coachEmail} onChange={(event) => setCoachEmail(event.target.value)} placeholder="coach@program.org" />
            </label>
            <label className="stats-filter-field">
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" />
            </label>

            <button type="submit" className="shell-nav-link shell-nav-link-active marketing-submit" disabled={busy}>
              {busy ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <div style={{ marginTop: "0.65rem" }}>
            <button type="button" className="shell-nav-link" onClick={onForgotPassword}>Forgot password?</button>
          </div>

          <p className="stats-page-status">{status}</p>
        </section>
      </main>
    </div>
  );
}
