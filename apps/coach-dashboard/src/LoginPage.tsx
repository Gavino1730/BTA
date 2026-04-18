import { type FormEvent, useEffect, useState } from "react";
import { apiBase, apiKeyHeader, readStoredAuthSession, storeAuthSession } from "./platform.js";
import { getSupabaseSessionIdentity, signInWithSupabase } from "./supabase/client.js";

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
  const inviteEmailFromUrl = new URLSearchParams(window.location.search).get("email")?.trim().toLowerCase() ?? "";
  const hasInviteLink = Boolean(new URLSearchParams(window.location.search).get("invite"));
  const [coachEmail, setCoachEmail] = useState(inviteEmailFromUrl);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(
    hasInviteLink
      ? "You were invited to a school workspace. Sign in, or create an account with the invited email."
      : "Sign in to your school dashboard.",
  );
  const [busy, setBusy] = useState(false);
  const statusIsError = /^could not|^cannot|^enter |^invalid/i.test(status);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`${apiBase}/api/auth/session`, { headers: apiKeyHeader() });
        if (!response.ok || cancelled) {
          return;
        }

        const payload = await response.json() as AuthSessionPayload;
        const token = payload.token ?? readStoredAuthSession()?.token ?? null;
        if (!payload.authenticated || !payload.user || !token) {
          return;
        }

        storeAuthSession({
          token,
          email: payload.user.email,
          fullName: payload.user.fullName,
          role: payload.user.role,
          schoolId: payload.user.schoolId,
          lastLoginAtIso: payload.user.lastLoginAtIso ?? null,
        });
        setStatus(`Welcome back, ${payload.user.fullName ?? payload.user.email ?? "Coach"}. Redirecting...`);
        onSuccess(Boolean(payload.onboarding?.completed));
      } catch {
        // best effort session restore only
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
      setStatus("Enter your email and password.");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setStatus("Enter a valid coach email address.");
      return;
    }

    setBusy(true);
    setStatus("Signing in...");

    try {
      const supabaseSession = await signInWithSupabase(normalizedEmail, normalizedPassword);
      storeAuthSession({
        token: supabaseSession.token,
        email: supabaseSession.email,
        fullName: supabaseSession.fullName,
      });

      const response = await fetch(`${apiBase}/api/auth/session`, {
        headers: apiKeyHeader(),
      });
      const payload = await response.json() as AuthSessionPayload;
      const token = payload.token ?? supabaseSession.token;
      if (!response.ok || !payload.user || !token) {
        throw new Error(payload.error || "Could not authenticate this account.");
      }

      storeAuthSession({
        token,
        email: payload.user.email ?? supabaseSession.email,
        fullName: payload.user.fullName ?? supabaseSession.fullName,
        role: payload.user.role,
        schoolId: payload.user.schoolId,
        lastLoginAtIso: payload.user.lastLoginAtIso ?? null,
      });

      setPassword("");
      setStatus(
        payload.onboarding?.completed
          ? "Signed in successfully. Opening dashboard..."
          : "Signed in. Finish school setup next.",
      );
      onSuccess(Boolean(payload.onboarding?.completed));
    } catch (error) {
      const fallbackSession = await getSupabaseSessionIdentity().catch(() => null);
      if (fallbackSession?.token) {
        storeAuthSession({
          token: fallbackSession.token,
          email: fallbackSession.email,
          fullName: fallbackSession.fullName,
        });
      }
      setStatus(error instanceof Error ? error.message : "Could not authenticate this account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page auth-login-page">
      <div className="auth-page-glow auth-page-glow-left" aria-hidden="true" />
      <div className="auth-page-glow auth-page-glow-right" aria-hidden="true" />

      <main className="auth-shell auth-login-shell-simple">
        <section className="auth-card auth-login-card">
          <form className="auth-form auth-login-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Coach Email</span>
              <input
                type="email"
                value={coachEmail}
                onChange={(event) => setCoachEmail(event.target.value)}
                placeholder="coach@school.org"
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
          </div>

          <p className={`auth-status auth-login-status${statusIsError ? " auth-status-error" : ""}`}>{status}</p>
        </section>
      </main>
    </div>
  );
}
