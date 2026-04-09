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
      setStatus(payload.message || "Password reset successful. You can now sign in.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="marketing-page">
      <header className="marketing-header marketing-header-tight">
        <button type="button" className="shell-nav-link" onClick={onBackForgot}>Back to Forgot Password</button>
        <button type="button" className="shell-nav-link" onClick={onBackLogin}>Back to Login</button>
      </header>

      <main className="marketing-login-shell">
        <section className="marketing-login-card stats-page-card">
          <p className="stats-page-eyebrow">Account Recovery</p>
          <h1>Reset Password</h1>
          <p className="stats-page-subtitle">
            Enter your reset token and choose a new password.
          </p>

          <form className="marketing-login-form" onSubmit={handleSubmit}>
            <label className="stats-filter-field">
              <span>Reset Token</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste reset token"
              />
            </label>
            <label className="stats-filter-field">
              <span>New Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </label>
            <label className="stats-filter-field">
              <span>Confirm Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter password"
              />
            </label>

            <button type="submit" className="shell-nav-link shell-nav-link-active marketing-submit" disabled={busy}>
              {busy ? "Resetting..." : "Reset Password"}
            </button>
          </form>

          <p className="stats-page-status">{status}</p>
        </section>
      </main>
    </div>
  );
}
