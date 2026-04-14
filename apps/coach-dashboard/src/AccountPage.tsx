import { type FormEvent, useEffect, useState } from "react";
import { apiBase, apiKeyHeader, clearAuthSession, storeAuthSession } from "./platform.js";

interface AccountPageProps {
  onSessionUpdated: (role: string | null) => void;
  onSignOutRequested: () => void;
}

interface AuthMePayload {
  user?: {
    fullName?: string;
    email?: string;
    role?: string;
    schoolId?: string;
    lastLoginAtIso?: string | null;
    profilePhotoDataUrl?: string | null;
    scheduledDeletionAtIso?: string | null;
  } | null;
  token?: string | null;
  error?: string;
}

function formatScheduledDeletion(value: string | null): string {
  if (!value) {
    return "";
  }
  const whenMs = Date.parse(value);
  if (!Number.isFinite(whenMs)) {
    return value;
  }
  return new Date(whenMs).toLocaleString();
}

export function AccountPage({ onSessionUpdated, onSignOutRequested }: AccountPageProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [profilePhotoDataUrl, setProfilePhotoDataUrl] = useState<string | null>(null);
  const [scheduledDeletionAtIso, setScheduledDeletionAtIso] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [processingSessionAction, setProcessingSessionAction] = useState(false);
  const [processingDelete, setProcessingDelete] = useState(false);
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
          setProfilePhotoDataUrl(payload.user.profilePhotoDataUrl ?? null);
          setScheduledDeletionAtIso(payload.user.scheduledDeletionAtIso ?? null);
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
    setStatus("Saving changes...");

    try {
      const response = await fetch(`${apiBase}/api/auth/me`, {
        method: "PUT",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          profilePhotoDataUrl,
          currentPassword: currentPassword.trim() || undefined,
          newPassword: newPassword.trim() || undefined,
        }),
      });

      const payload = await response.json() as {
        user?: {
          fullName?: string;
          email?: string;
          role?: string;
          schoolId?: string;
          lastLoginAtIso?: string | null;
          profilePhotoDataUrl?: string | null;
          scheduledDeletionAtIso?: string | null;
        } | null;
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
      setProfilePhotoDataUrl(payload.user.profilePhotoDataUrl ?? null);
      setScheduledDeletionAtIso(payload.user.scheduledDeletionAtIso ?? null);
      setCurrentPassword("");
      setNewPassword("");
      setStatus("Account updated.");
      onSessionUpdated(payload.user.role ?? null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleProfilePhotoPicked(file: File | null) {
    if (!file) {
      return;
    }

    const validType = ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type);
    if (!validType) {
      setStatus("Use a PNG, JPEG, or WEBP profile photo.");
      return;
    }

    if (file.size > 256 * 1024) {
      setStatus("Profile photo must be 256KB or smaller.");
      return;
    }

    try {
      const photoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Could not read selected image"));
        reader.readAsDataURL(file);
      });

      setProfilePhotoDataUrl(photoDataUrl || null);
      setStatus("Profile photo ready. Click Save to apply.");
    } catch {
      setStatus("Could not read selected image");
    }
  }

  function clearProfilePhoto() {
    setProfilePhotoDataUrl(null);
    setStatus("Profile photo removed. Click Save to apply.");
  }

  async function handleSignOutAllSessions() {
    const shouldContinue = window.confirm("Sign out all active sessions for this account? You will return to login.");
    if (!shouldContinue) {
      return;
    }

    setProcessingSessionAction(true);
    setStatus("Signing out all sessions...");
    try {
      const response = await fetch(`${apiBase}/api/auth/logout-all`, {
        method: "POST",
        headers: apiKeyHeader(),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Could not sign out all sessions");
      }

      clearAuthSession();
      onSignOutRequested();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not sign out every session");
    } finally {
      setProcessingSessionAction(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmation.trim().toUpperCase() !== "DELETE") {
      setStatus("Type DELETE to confirm account deletion.");
      return;
    }
    if (!deletePassword.trim()) {
      setStatus("Current password is required to delete your account.");
      return;
    }

    const shouldDelete = window.confirm("Schedule this account for deletion? You can cancel during the grace period.");
    if (!shouldDelete) {
      return;
    }

    setProcessingDelete(true);
    setStatus("Scheduling account deletion...");
    try {
      const response = await fetch(`${apiBase}/api/auth/me`, {
        method: "DELETE",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          currentPassword: deletePassword,
          confirmation: deleteConfirmation,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Could not schedule account deletion");
      }

      const payload = await response.json().catch(() => ({})) as {
        scheduledDeletionAtIso?: string;
        graceDays?: number;
      };
      setScheduledDeletionAtIso(payload.scheduledDeletionAtIso ?? null);
      setDeletePassword("");
      setDeleteConfirmation("");
      setStatus(`Deletion scheduled. You can cancel before ${formatScheduledDeletion(payload.scheduledDeletionAtIso ?? null)}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not schedule deletion");
    } finally {
      setProcessingDelete(false);
    }
  }

  async function handleCancelScheduledDeletion() {
    setProcessingDelete(true);
    setStatus("Canceling scheduled deletion...");
    try {
      const response = await fetch(`${apiBase}/api/auth/me/cancel-deletion`, {
        method: "POST",
        headers: apiKeyHeader(),
      });

      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        user?: { scheduledDeletionAtIso?: string | null };
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not cancel scheduled deletion");
      }

      setScheduledDeletionAtIso(payload.user?.scheduledDeletionAtIso ?? null);
      setStatus("Scheduled deletion cancelled.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not cancel scheduled deletion");
    } finally {
      setProcessingDelete(false);
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

      <section className="stats-page-card settings-section-card account-meta-card">
        <div className="stats-page-card-head">
          <div>
            <h3>Profile Photo</h3>
            <p className="settings-section-desc">Upload a PNG/JPEG/WEBP avatar (max 256KB).</p>
          </div>
        </div>
        <div className="account-photo-placeholder" role="img" aria-label="Profile photo placeholder">
          {profilePhotoDataUrl ? (
            <img src={profilePhotoDataUrl} alt="Profile avatar" className="account-photo-image" />
          ) : (
            <span>{(fullName.trim().charAt(0) || email.trim().charAt(0) || "C").toUpperCase()}</span>
          )}
        </div>
        <div className="account-action-row">
          <label className="shell-nav-link" style={{ cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
            Upload Photo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              disabled={saving || processingDelete || processingSessionAction}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleProfilePhotoPicked(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="shell-nav-link"
            onClick={clearProfilePhoto}
            disabled={!profilePhotoDataUrl || saving || processingDelete || processingSessionAction}
          >
            Remove Photo
          </button>
        </div>
      </section>

      <section className="stats-page-card settings-section-card account-meta-card">
        <div className="stats-page-card-head">
          <div>
            <h3>Session Controls</h3>
            <p className="settings-section-desc">Invalidate all active sessions and require fresh sign-in on every device.</p>
          </div>
        </div>
        <div className="account-action-row">
          <button
            type="button"
            className="shell-nav-link"
            onClick={() => void handleSignOutAllSessions()}
            disabled={processingSessionAction || saving || processingDelete}
          >
            {processingSessionAction ? "Signing Out..." : "Sign Out All Sessions"}
          </button>
        </div>
      </section>

      <section className="stats-page-card settings-section-card account-danger-card">
        <div className="stats-page-card-head">
          <div>
            <h3>Danger Zone</h3>
            <p className="settings-section-desc">Schedule account deletion with a grace period and cancel before deadline if needed.</p>
          </div>
        </div>
        {scheduledDeletionAtIso && (
          <p className="stats-page-subcopy" style={{ marginTop: "0.5rem" }}>
            Deletion is scheduled for {formatScheduledDeletion(scheduledDeletionAtIso)}.
          </p>
        )}
        <div className="setup-grid" style={{ marginTop: "0.75rem" }}>
          <label className="stats-filter-field">
            <span>Type DELETE to confirm</span>
            <input
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder="DELETE"
            />
          </label>
          <label className="stats-filter-field">
            <span>Current Password</span>
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              placeholder="Required"
            />
          </label>
        </div>
        <div className="account-action-row">
          {scheduledDeletionAtIso && (
            <button
              type="button"
              className="shell-nav-link"
              onClick={() => void handleCancelScheduledDeletion()}
              disabled={processingDelete || saving || processingSessionAction}
            >
              Cancel Scheduled Deletion
            </button>
          )}
          <button
            type="button"
            className="shell-nav-link account-danger-btn"
            onClick={() => void handleDeleteAccount()}
            disabled={processingDelete || saving || processingSessionAction}
          >
            {processingDelete ? "Processing..." : scheduledDeletionAtIso ? "Reschedule Deletion" : "Schedule Deletion"}
          </button>
        </div>
      </section>
    </div>
  );
}
