import { type FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseSessionIdentity, updateSupabasePassword } from "./supabase/client.js";

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
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [status, setStatus] = useState(
    tokenFromUrl
      ? "Legacy reset tokens are no longer supported here. Open the full reset link from your email."
      : "Open the password reset link from your email to continue.",
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await getSupabaseSessionIdentity().catch(() => null);
      if (cancelled) {
        return;
      }
      if (session?.token) {
        setRecoveryReady(true);
        setStatus("Enter a new password to finish resetting your account.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPassword = password.trim();

    if (!recoveryReady) {
      setStatus("Open the password reset link from your email, then try again.");
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
      await updateSupabasePassword(nextPassword);
      setPassword("");
      setConfirmPassword("");
      setStatus("Password reset successful. You can now sign in.");
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
            Open the full reset link from your email and choose a new password.
          </p>

          <form className="marketing-login-form" onSubmit={handleSubmit}>
            <label className="stats-filter-field">
              <span>New Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
            </label>
            <label className="stats-filter-field">
              <span>Confirm Password</span>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter password" />
            </label>

            <button type="submit" className="shell-nav-link shell-nav-link-active marketing-submit" disabled={busy}>
              {busy ? "Resetting..." : "Reset Password"}
            </button>
          </form>

          {token ? (
            <p className="stats-page-status">This page now uses Supabase recovery links instead of pasted reset tokens.</p>
          ) : null}

          <p className="stats-page-status">{status}</p>
        </section>
      </main>
    </div>
  );
}
