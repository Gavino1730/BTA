import { type FormEvent, useEffect, useState } from "react";
import { apiBase, apiKeyHeader, storeAuthSession } from "./platform.js";

interface AccountPageProps {
  onSessionUpdated: (role: string | null) => void;
}

interface AuthMePayload {
  user?: {
    fullName?: string;
    email?: string;
    role?: string;
    schoolId?: string;
    lastLoginAtIso?: string | null;
  } | null;
  token?: string | null;
  error?: string;
}

export function AccountPage({ onSessionUpdated }: AccountPageProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading account...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${apiBase}/api/auth/me`, { headers: apiKeyHeader() });
        const payload = await response.json() as AuthMePayload;
        if (!response.ok || !payload.user) {
          throw new Error(payload.error || "Could not load account");
        }

        if (!cancelled) {
          setFullName(payload.user.fullName ?? "");
          setEmail(payload.user.email ?? "");
          setRole(payload.user.role ?? "");
          setStatus("Account loaded.");
          onSessionUpdated(payload.user.role ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Could not load account");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [onSessionUpdated]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("Saving account updates...");

    try {
      const response = await fetch(`${apiBase}/api/auth/me`, {
        method: "PUT",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          currentPassword: currentPassword.trim() || undefined,
          newPassword: newPassword.trim() || undefined,
        }),
      });

      const payload = await response.json() as {
        user?: { fullName?: string; email?: string; role?: string; schoolId?: string; lastLoginAtIso?: string | null } | null;
        token?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "Could not save account changes");
      }

      if (payload.token) {
        storeAuthSession({
          token: payload.token,
          email: payload.user.email,
          fullName: payload.user.fullName,
          role: payload.user.role,
          schoolId: payload.user.schoolId,
          lastLoginAtIso: payload.user.lastLoginAtIso ?? null,
        });
      }

      setRole(payload.user.role ?? role);
      setCurrentPassword("");
      setNewPassword("");
      setStatus("Account updated.");
      onSessionUpdated(payload.user.role ?? null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save account changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <h1>My Account</h1>
          <p className="stats-page-subtitle">Update your personal details and password.</p>
        </div>
        <p className="stats-page-status">{status}</p>
      </section>

      <form className="stats-page-card settings-section-card" onSubmit={handleSubmit}>
        <div className="stats-page-card-head">
          <div>
            <h3>Profile</h3>
            <p className="settings-section-desc">Role: {role || "Unknown"}</p>
          </div>
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Save</button>
        </div>

        <div className="setup-grid">
          <label className="stats-filter-field">
            <span>Full Name</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" />
          </label>
          <label className="stats-filter-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.org" />
          </label>
          <label className="stats-filter-field">
            <span>Current Password</span>
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Required for email/password changes" />
          </label>
          <label className="stats-filter-field">
            <span>New Password</span>
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Leave blank to keep current password" />
          </label>
        </div>
      </form>
    </div>
  );
}
