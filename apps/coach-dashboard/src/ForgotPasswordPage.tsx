import { type FormEvent, useState } from "react";

interface ForgotPasswordPageProps {
  onBackLogin: () => void;
  onBackHome: () => void;
}

export function ForgotPasswordPage({ onBackLogin, onBackHome }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("Enter your coach email and we will guide your reset options.");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

    setSubmitted(true);
    setStatus("Reset request noted. In preproduction, an organization manager must complete password reset for coach accounts.");
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
            Self-service reset links are coming soon. For now, submit your email and contact your organization manager.
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

            <button type="submit" className="shell-nav-link shell-nav-link-active marketing-submit" disabled={submitted}>
              {submitted ? "Request Submitted" : "Request Password Reset"}
            </button>
          </form>

          <p className="stats-page-status">{status}</p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.82rem", color: "rgba(232,234,240,0.6)" }}>
            Preproduction note: manager-only reset is currently enforced server-side.
          </p>
        </section>
      </main>
    </div>
  );
}
