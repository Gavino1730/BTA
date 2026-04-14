import { type FormEvent, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface ForgotPasswordPageProps {
  onBackLogin: (email?: string) => void;
  onBackHome: () => void;
  onAcceptInvite: () => void;
  onVerifyEmail: () => void;
}

export function ForgotPasswordPage({ onBackLogin, onBackHome, onAcceptInvite, onVerifyEmail }: ForgotPasswordPageProps) {
  const initialEmail = typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.search).get("email") ?? "").trim().toLowerCase();
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState("Enter your coach email and we will send reset instructions if the account exists.");
  const [busy, setBusy] = useState(false);
  const [resetPath, setResetPath] = useState<string | null>(null);
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();

    if (!normalized) {
      setStatus("Enter your coach email to continue.");
      return;
    }

    if (!normalized.includes("@")) {
      setStatus("Enter a valid email address.");
      return;
    }

    setBusy(true);
    setResetPath(null);
    setExpiresInMinutes(null);
    setStatus("Preparing reset request...");

    try {
      const response = await fetch(`${apiBase}/api/auth/password-reset/request`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({ email: normalized }),
      });

      const payload = await response.json() as {
        message?: string;
        error?: string;
        resetPath?: string;
        expiresInMinutes?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not submit password reset request.");
      }

      setResetPath(payload.resetPath ?? null);
      setExpiresInMinutes(typeof payload.expiresInMinutes === "number" ? payload.expiresInMinutes : null);
      setStatus(payload.message || "If this email exists, reset instructions are ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not submit password reset request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page auth-flow-page auth-forgot-page">
      <div className="auth-page-glow auth-page-glow-left" aria-hidden="true" />
      <div className="auth-page-glow auth-page-glow-right" aria-hidden="true" />

      <header className="auth-topbar auth-flow-topbar">
        <button type="button" className="auth-topbar-link" onClick={() => onBackLogin(email.trim().toLowerCase() || undefined)}>Back to Login</button>
        <div className="auth-brand-lockup" aria-label="BTA Courtside">
          <span className="auth-brand-badge">BTA</span>
          <div>
            <p className="auth-brand-name">Courtside</p>
            <p className="auth-brand-subtitle">Secure Account Recovery</p>
          </div>
        </div>
        <button type="button" className="auth-topbar-link" onClick={onBackHome}>Home</button>
      </header>

      <main className="auth-shell auth-shell-compact auth-flow-shell">
        <section className="auth-hero-panel auth-hero-panel-compact auth-flow-hero-panel">
          <span className="auth-kicker">Account Recovery</span>
          <h1 className="auth-display-title">
            Reset access without breaking
            <span>the production flow.</span>
          </h1>
          <p className="auth-hero-copy">
            We only send reset instructions through email in production from no-reply@btaintel.com. If you do not receive the message, contact support@btaintel.com.
          </p>
        </section>

        <section className="auth-card auth-flow-card" aria-labelledby="forgot-password-title">
          <div className="auth-card-head">
            <p className="auth-kicker">Forgot Password</p>
            <h2 id="forgot-password-title">Request reset instructions</h2>
            <p>Use the coach email tied to your organization. If the account exists, we will send a secure reset email from no-reply@btaintel.com.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Coach Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="coach@program.org"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>

            <button type="submit" className="auth-primary-button" disabled={busy}>
              {busy ? "Submitting..." : "Email Reset Instructions"}
            </button>
          </form>

          <p className="auth-status auth-flow-status" aria-live="polite">{status}</p>

          {expiresInMinutes && (
            <p className="auth-support-copy">Reset links expire in about {expiresInMinutes} minutes.</p>
          )}

          {resetPath && (
            <div className="auth-dev-tools">
              <strong>Developer reset link exposed</strong>
              <p>Direct reset navigation is available only when the API is configured to expose reset materials.</p>
              <div className="auth-link-row">
                <button
                  type="button"
                  className="auth-secondary-button"
                  onClick={() => {
                    const target = resetPath.startsWith("/") ? resetPath : `/reset-password?token=${encodeURIComponent(resetPath)}`;
                    void navigator.clipboard?.writeText(target);
                  }}
                >
                  Copy Reset Path
                </button>
                <button
                  type="button"
                  className="auth-secondary-button"
                  onClick={() => {
                    const target = resetPath.startsWith("/") ? resetPath : `/reset-password?token=${encodeURIComponent(resetPath)}`;
                    window.location.assign(target);
                  }}
                >
                  Open Reset Page
                </button>
              </div>
            </div>
          )}

          <div className="auth-link-row">
            <button type="button" className="auth-secondary-button" onClick={() => onBackLogin(email.trim().toLowerCase() || undefined)}>Back to Login</button>
            <button type="button" className="auth-secondary-button" onClick={onAcceptInvite}>Accept Team Invite</button>
            <button type="button" className="auth-secondary-button" onClick={onVerifyEmail}>Verify Email</button>
          </div>
        </section>
      </main>
    </div>
  );
}
