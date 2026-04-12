import { type FormEvent, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface ResetPasswordPageProps {
  onBackLogin: () => void;
  onBackForgot: () => void;
}

export function ResetPasswordPage({ onBackLogin, onBackForgot }: ResetPasswordPageProps) {
  const tokenFromUrl = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    tokenFromUrl
      ? "Enter a new password to complete your reset."
      : "Missing reset token. Use Forgot Password to generate a reset link.",
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedToken = token.trim();
    const nextPassword = password.trim();

    if (!normalizedToken) {
      setStatus("Reset token is required.");
      return;
    }

    if (nextPassword.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    if (nextPassword !== confirmPassword.trim()) {
      setStatus("Passwords do not match.");
      return;
    }

    setBusy(true);
    setStatus("Resetting password...");

    try {
      const response = await fetch(`${apiBase}/api/auth/password-reset/confirm`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({ token: normalizedToken, password: nextPassword }),
      });

      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Could not reset password.");
      }

      setPassword("");
      setConfirmPassword("");
      setComplete(true);
      setStatus(payload.message || "Password reset successful. You can now sign in.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page-glow auth-page-glow-left" aria-hidden="true" />
      <div className="auth-page-glow auth-page-glow-right" aria-hidden="true" />

      <header className="auth-topbar">
        <button type="button" className="auth-topbar-link" onClick={onBackForgot}>Back to Forgot Password</button>
        <div className="auth-brand-lockup" aria-label="BTA Courtside">
          <span className="auth-brand-badge">BTA</span>
          <div>
            <p className="auth-brand-name">Courtside</p>
            <p className="auth-brand-subtitle">Password Reset Confirmation</p>
          </div>
        </div>
        <button type="button" className="auth-topbar-link" onClick={onBackLogin}>Back to Login</button>
      </header>

      <main className="auth-shell auth-shell-compact">
        <section className="auth-hero-panel auth-hero-panel-compact">
          <span className="auth-kicker">Account Recovery</span>
          <h1 className="auth-display-title">
            Choose a new password and
            <span>get back into the dashboard.</span>
          </h1>
          <p className="auth-hero-copy">
            Reset tokens can arrive from the email link automatically or be pasted manually for controlled recovery and support workflows.
          </p>
        </section>

        <section className="auth-card" aria-labelledby="reset-password-title">
          <div className="auth-card-head">
            <p className="auth-kicker">Reset Password</p>
            <h2 id="reset-password-title">Set a new password</h2>
            <p>Use at least 8 characters. If you opened this page from email, the reset token should already be filled in for you.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Reset Token</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste reset token"
                autoComplete="one-time-code"
                spellCheck={false}
              />
            </label>

            <label className="auth-field">
              <span>New Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </label>

            <label className="auth-field">
              <span>Confirm Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </label>

            <button type="submit" className="auth-primary-button" disabled={busy}>
              {busy ? "Resetting..." : "Reset Password"}
            </button>
          </form>

          <p className="auth-status" aria-live="polite">{status}</p>

          <div className="auth-link-row">
            <button type="button" className="auth-secondary-button" onClick={onBackForgot}>Request Another Reset</button>
            {complete ? (
              <button type="button" className="auth-secondary-button" onClick={onBackLogin}>Return to Login</button>
            ) : (
              <button type="button" className="auth-secondary-button" onClick={onBackLogin}>Back to Login</button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
