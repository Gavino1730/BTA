import { type FormEvent, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface ForgotPasswordPageProps {
  onBackLogin: () => void;
  onBackHome: () => void;
  onAcceptInvite: () => void;
  onVerifyEmail: () => void;
}

export function ForgotPasswordPage({ onBackLogin, onBackHome, onAcceptInvite, onVerifyEmail }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("Enter your coach email to request a password reset link.");
  const [busy, setBusy] = useState(false);
  const [resetPath, setResetPath] = useState<string | null>(null);

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
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not submit password reset request.");
      }

      setResetPath(payload.resetPath ?? null);
      setStatus(payload.message || "If this email exists, reset instructions are ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not submit password reset request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="marketing-page">
      <header className="marketing-header marketing-header-tight">
        <button type="button" className="shell-nav-link" onClick={onBackLogin}>Back to Login</button>
        <button type="button" className="shell-nav-link" onClick={onBackHome}>Home</button>
      </header>

      <main className="marketing-login-shell">
        <section className="marketing-login-card stats-page-card">
          <p className="stats-page-eyebrow">Account Recovery</p>
          <h1>Forgot Password</h1>
          <p className="stats-page-subtitle">
            Submit your coach email and we will send a password reset link if the account exists.
          </p>

          <form className="marketing-login-form" onSubmit={handleSubmit}>
            <label className="stats-filter-field">
              <span>Coach Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="coach@program.org"
              />
            </label>

            <button type="submit" className="shell-nav-link shell-nav-link-active marketing-submit" disabled={busy}>
              {busy ? "Submitting..." : "Request Password Reset"}
            </button>
          </form>

          <p className="stats-page-status">{status}</p>
          {resetPath && (
            <div style={{ marginTop: "0.65rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="shell-nav-link"
                onClick={() => {
                  const target = resetPath.startsWith("/") ? resetPath : `/reset-password?token=${encodeURIComponent(resetPath)}`;
                  void navigator.clipboard?.writeText(target);
                }}
              >
                Copy Reset Path
              </button>
              <button
                type="button"
                className="shell-nav-link"
                onClick={() => {
                  const target = resetPath.startsWith("/") ? resetPath : `/reset-password?token=${encodeURIComponent(resetPath)}`;
                  window.location.assign(target);
                }}
              >
                Open Reset Page
              </button>
            </div>
          )}

          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="shell-nav-link" onClick={onAcceptInvite}>Need to accept an invite?</button>
            <button type="button" className="shell-nav-link" onClick={onVerifyEmail}>Need to verify email?</button>
          </div>
        </section>
      </main>
    </div>
  );
}
