import { type FormEvent, useEffect, useState } from "react";
import { apiBase, apiKeyHeader, storeAuthSession } from "./platform.js";

interface LoginPageProps {
  onSuccess: (setupComplete: boolean) => void;
  onBackHome: () => void;
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

export function LoginPage({ onSuccess, onBackHome }: LoginPageProps) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [coachName, setCoachName] = useState("");
  const [coachEmail, setCoachEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("Sign in to access your coach dashboard.");
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
    const isRegister = authMode === "register";
    const normalizedName = coachName.trim();
    const normalizedEmail = coachEmail.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword || (isRegister && !normalizedName)) {
      setStatus("Enter the required account details to continue.");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setStatus("Enter a valid coach email address.");
      return;
    }

    if (isRegister && normalizedPassword.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    if (isRegister && normalizedPassword !== confirmPassword.trim()) {
      setStatus("Password confirmation does not match.");
      return;
    }

    setBusy(true);
    setStatus(isRegister ? "Creating your account..." : "Signing in...");

    try {
      const response = await fetch(`${apiBase}/api/auth/${isRegister ? "register" : "login"}`, {
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

      setPassword("");
      setConfirmPassword("");
      setStatus(
        payload.onboarding?.completed
          ? "Signed in successfully. Opening your dashboard..."
          : "Account ready. Finish your team setup next.",
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
        <button type="button" className="shell-nav-link" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
          {authMode === "login" ? "Create Account" : "I Already Have an Account"}
        </button>
      </header>

      <main className="marketing-login-shell">
        <section className="marketing-login-card stats-page-card">
          <p className="stats-page-eyebrow">Coach access</p>
          <h1>{authMode === "login" ? "Sign in to your dashboard" : "Create your coach account"}</h1>
          <p className="stats-page-subtitle">
            Use your email and password to open the coach dashboard and the team information connected to your account.
          </p>

          <div className="setup-auth-toggle">
            <button
              type="button"
              className={authMode === "login" ? "shell-nav-link shell-nav-link-active" : "shell-nav-link"}
              onClick={() => setAuthMode("login")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={authMode === "register" ? "shell-nav-link shell-nav-link-active" : "shell-nav-link"}
              onClick={() => setAuthMode("register")}
            >
              Create Account
            </button>
          </div>

          <form className="marketing-login-form" onSubmit={handleSubmit}>
            {authMode === "register" && (
              <label className="stats-filter-field">
                <span>Coach Name</span>
                <input value={coachName} onChange={(event) => setCoachName(event.target.value)} placeholder="Coach Taylor" />
              </label>
            )}
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

            <button type="submit" className="shell-nav-link shell-nav-link-active marketing-submit" disabled={busy}>
              {busy ? (authMode === "login" ? "Signing In..." : "Creating Account...") : (authMode === "login" ? "Sign In" : "Create Account")}
            </button>
          </form>

          <p className="stats-page-status">{status}</p>
        </section>
      </main>
    </div>
  );
}
