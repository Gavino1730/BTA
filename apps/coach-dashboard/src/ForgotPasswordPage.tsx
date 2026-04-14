import { type FormEvent, useState } from "react";
import { apiBase, resolveActiveSchoolId } from "./platform.js";

interface ForgotPasswordPageProps {
  onBackLogin: () => void;
  onBackHome: () => void;
}

export function ForgotPasswordPage({ onBackLogin, onBackHome }: ForgotPasswordPageProps) {
  const schoolId = resolveActiveSchoolId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("Enter your coach email to receive a password reset link.");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();

    if (!schoolId) {
      setStatus("Open your school workspace link first so we know where to send the reset.");
      return;
    }

    if (!normalized) {
      setStatus("Enter your coach email to continue.");
      return;
    }

    if (!normalized.includes("@")) {
      setStatus("Enter a valid email address.");
      return;
    }

    setBusy(true);
    setStatus("Preparing your reset email...");

    try {
      const response = await fetch(`${apiBase}/api/auth/password-reset/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-school-id": schoolId,
        },
        body: JSON.stringify({ email: normalized }),
      });

      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Could not submit password reset request.");
      }

      setStatus(payload.message || "If this email exists for your organization, reset instructions have been sent.");
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
            We&apos;ll email a secure reset link to the coach account tied to this school workspace.
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
              {busy ? "Sending..." : "Email Reset Link"}
            </button>
          </form>

          <p className="stats-page-status">{status}</p>
        </section>
      </main>
    </div>
  );
}