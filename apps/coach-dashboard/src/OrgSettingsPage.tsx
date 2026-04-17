import { type FormEvent, useEffect, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";
import { requestSupabasePasswordReset } from "./supabase/client.js";

interface OnboardingAccountResponse {
  account?: {
    organization?: {
      organizationName?: string;
      teamName?: string;
      season?: string;
    } | null;
    primaryCoach?: {
      fullName?: string;
      email?: string;
    } | null;
  } | null;
  suggestedCoach?: {
    coachName?: string;
    coachEmail?: string;
  } | null;
}

interface OrganizationMember {
  memberId: string;
  fullName: string;
  email: string;
  role: "owner" | "coach" | "analyst" | "player";
  status: "active" | "invited";
}

interface OrgMembersResponse {
  currentMember?: OrganizationMember | null;
  members?: OrganizationMember[];
}

interface InviteEmailDelivery {
  delivered?: boolean;
  skipped?: boolean;
  reason?: string;
}

interface InviteMemberResponse {
  members?: OrganizationMember[];
  emailDelivery?: InviteEmailDelivery;
  warning?: string;
}

interface OrgProfileState {
  organizationName: string;
  coachName: string;
  coachEmail: string;
  teamName: string;
  season: string;
}

const ROLE_OPTIONS: Array<{ value: OrganizationMember["role"]; label: string }> = [
  { value: "owner", label: "Admin" },
  { value: "coach", label: "Coach" },
  { value: "analyst", label: "Operator" },
  { value: "player", label: "Player" },
];

function toProfileState(payload: OnboardingAccountResponse): OrgProfileState {
  const account = payload.account;
  const suggestedCoach = payload.suggestedCoach;

  return {
    organizationName: account?.organization?.organizationName ?? "",
    coachName: account?.primaryCoach?.fullName ?? suggestedCoach?.coachName ?? "",
    coachEmail: account?.primaryCoach?.email ?? suggestedCoach?.coachEmail ?? "",
    teamName: account?.organization?.teamName ?? "",
    season: account?.organization?.season ?? "",
  };
}

function roleLabel(role: OrganizationMember["role"]): string {
  const found = ROLE_OPTIONS.find((entry) => entry.value === role);
  return found?.label ?? role;
}

function canManageMembers(currentMember: OrganizationMember | null): boolean {
  return currentMember?.role === "owner";
}

function isValidEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function buildInviteDeliveryStatus(email: string, emailDelivery?: InviteEmailDelivery, warning?: string): string {
  if (warning?.trim()) {
    return warning;
  }

  if (emailDelivery?.delivered) {
    return `Invite email sent to ${email}.`;
  }
  if (emailDelivery?.skipped) {
    return emailDelivery.reason?.trim() || `Member invited, but email delivery is disabled for ${email}.`;
  }
  if (emailDelivery && emailDelivery.delivered === false) {
    return emailDelivery.reason?.trim() || `Member invited, but invite email failed for ${email}.`;
  }

  return "Member invitation sent.";
}

interface Props {
  onNavigate: (path: string) => void;
}

export function OrgSettingsPage({ onNavigate }: Props) {
  const [profile, setProfile] = useState<OrgProfileState>({
    organizationName: "",
    coachName: "",
    coachEmail: "",
    teamName: "",
    season: "",
  });
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [currentMember, setCurrentMember] = useState<OrganizationMember | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationMember["role"]>("coach");

  const [retryKey, setRetryKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading organization settings...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError("");
      setStatus("Loading organization settings...");

      try {
        const [accountRes, membersRes] = await Promise.all([
          fetch(`${apiBase}/api/onboarding/account`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/org/members`, { headers: apiKeyHeader() }),
        ]);

        if (!accountRes.ok || !membersRes.ok) {
          throw new Error("Failed to load organization settings");
        }

        const accountPayload = await accountRes.json() as OnboardingAccountResponse;
        const membersPayload = await membersRes.json() as OrgMembersResponse;

        if (cancelled) {
          return;
        }

        setProfile(toProfileState(accountPayload));
        setCurrentMember(membersPayload.currentMember ?? null);
        setMembers(Array.isArray(membersPayload.members) ? membersPayload.members : []);
        setStatus("Organization settings synced.");
        setIsLoading(false);
      } catch {
        if (!cancelled) {
          setLoadError("Could not load organization settings from the realtime API.");
          setStatus("Could not load organization settings from the realtime API.");
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile.organizationName.trim() || !profile.coachName.trim() || !profile.coachEmail.trim()) {
      setStatus("Organization name, coach name, and coach email are required.");
      return;
    }

    setSaving(true);
    setStatus("Saving organization profile...");

    try {
      const response = await fetch(`${apiBase}/api/onboarding/account`, {
        method: "PUT",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          organizationName: profile.organizationName.trim(),
          coachName: profile.coachName.trim(),
          coachEmail: profile.coachEmail.trim(),
          teamName: profile.teamName.trim() || undefined,
          season: profile.season.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Profile save failed");
      }

      setStatus("Organization profile saved.");
    } catch {
      setStatus("Could not save organization profile.");
    } finally {
      setSaving(false);
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!inviteName.trim() || !inviteEmail.trim()) {
      setStatus("Invite name and email are required.");
      return;
    }
    if (!isValidEmail(inviteEmail)) {
      setStatus("Enter a valid invite email address.");
      return;
    }

    setSaving(true);
    setStatus("Inviting member...");

    try {
      const response = await fetch(`${apiBase}/api/org/members`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          fullName: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      if (!response.ok) {
        throw new Error("Invite failed");
      }

      const payload = await response.json() as InviteMemberResponse;
      setMembers(Array.isArray(payload.members) ? payload.members : members);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("coach");
      setStatus(buildInviteDeliveryStatus(inviteEmail.trim(), payload.emailDelivery, payload.warning));
    } catch {
      setStatus("Could not invite member.");
    } finally {
      setSaving(false);
    }
  }

  async function saveMember(member: OrganizationMember) {
    setSaving(true);
    setStatus(`Saving ${member.fullName}...`);

    try {
      const response = await fetch(`${apiBase}/api/org/members/${encodeURIComponent(member.memberId)}`, {
        method: "PUT",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          fullName: member.fullName,
          role: member.role,
          status: member.status,
        }),
      });

      if (!response.ok) {
        throw new Error("Update failed");
      }

      const payload = await response.json() as { members?: OrganizationMember[] };
      setMembers(Array.isArray(payload.members) ? payload.members : members);
      setStatus("Member updated.");
    } catch {
      setStatus("Could not update member.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member: OrganizationMember) {
    setSaving(true);
    setStatus(`Removing ${member.fullName}...`);

    try {
      const response = await fetch(`${apiBase}/api/org/members/${encodeURIComponent(member.memberId)}`, {
        method: "DELETE",
        headers: apiKeyHeader(true),
      });

      if (!response.ok) {
        throw new Error("Remove failed");
      }

      const payload = await response.json() as { members?: OrganizationMember[] };
      setMembers(Array.isArray(payload.members) ? payload.members : members.filter((entry) => entry.memberId !== member.memberId));
      setStatus("Member removed.");
    } catch {
      setStatus("Could not remove member.");
    } finally {
      setSaving(false);
    }
  }

  async function resendMemberInvite(member: OrganizationMember) {
    setSaving(true);
    setStatus(`Sending invite to ${member.email}...`);

    try {
      const response = await fetch(`${apiBase}/api/org/members/${encodeURIComponent(member.memberId)}/resend-invite`, {
        method: "POST",
        headers: apiKeyHeader(true),
      });

      const payload = await response.json().catch(() => ({})) as InviteMemberResponse;
      if (!response.ok) {
        throw new Error("Could not send invite email");
      }

      setMembers(Array.isArray(payload.members) ? payload.members : members);
      setStatus(buildInviteDeliveryStatus(member.email, payload.emailDelivery, payload.warning));
    } catch {
      setStatus("Could not send invite email.");
    } finally {
      setSaving(false);
    }
  }

  async function sendPasswordResetEmail(email: string) {
    setSaving(true);
    setStatus(`Sending password reset email to ${email}...`);

    try {
      await requestSupabasePasswordReset(email.trim().toLowerCase(), `${window.location.origin}/reset-password`);
      setStatus(`Password reset email sent to ${email}.`);
    } catch {
      setStatus("Could not send password reset email.");
    } finally {
      setSaving(false);
    }
  }

  const managerView = canManageMembers(currentMember);

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <h1>Organization Settings</h1>
          <p className="stats-page-subtitle">Manage your organization profile and staff access in one place.</p>
        </div>
        {status && <p className="stats-page-status">{status}</p>}
      </section>

      {isLoading && (
        <section className="stats-page-card">
          <div className="loading-indicator">
            <div className="loading-spinner" />
            <p className="loading-text">Loading organization settings...</p>
          </div>
        </section>
      )}

      {!isLoading && loadError && (
        <section className="stats-page-card">
          <p className="stats-empty-copy">{loadError}</p>
          <button
            type="button"
            className="shell-nav-link org-settings-retry-btn"
            onClick={() => setRetryKey((value) => value + 1)}
          >
            Retry
          </button>
        </section>
      )}

      {!isLoading && !loadError && (
        <>
          <section className="stats-page-grid two-column org-settings-section-gap">
            <form className="stats-page-card settings-section-card" onSubmit={saveProfile}>
              <div className="stats-page-card-head">
                <div>
                  <h3>Organization Profile</h3>
                  <p className="settings-section-desc">School identity, primary coach contact, and season context.</p>
                </div>
                <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving || !managerView}>Save</button>
              </div>
              <div className="setup-grid">
                <label className="stats-filter-field">
                  <span>Organization Name</span>
                  <input
                    value={profile.organizationName}
                    onChange={(event) => setProfile((current) => ({ ...current, organizationName: event.target.value }))}
                    placeholder="School or athletic program"
                    disabled={!managerView}
                  />
                </label>
                <label className="stats-filter-field">
                  <span>Primary Coach Name</span>
                  <input
                    value={profile.coachName}
                    onChange={(event) => setProfile((current) => ({ ...current, coachName: event.target.value }))}
                    placeholder="Coach Name"
                    disabled={!managerView}
                  />
                </label>
                <label className="stats-filter-field">
                  <span>Primary Coach Email</span>
                  <input
                    type="email"
                    value={profile.coachEmail}
                    onChange={(event) => setProfile((current) => ({ ...current, coachEmail: event.target.value }))}
                    placeholder="coach@school.org"
                    disabled={!managerView}
                  />
                </label>
                <label className="stats-filter-field">
                  <span>Team Name</span>
                  <input
                    value={profile.teamName}
                    onChange={(event) => setProfile((current) => ({ ...current, teamName: event.target.value }))}
                    placeholder="Varsity Basketball"
                    disabled={!managerView}
                  />
                </label>
                <label className="stats-filter-field">
                  <span>Season</span>
                  <input
                    value={profile.season}
                    onChange={(event) => setProfile((current) => ({ ...current, season: event.target.value }))}
                    placeholder={String(new Date().getFullYear())}
                    disabled={!managerView}
                  />
                </label>
              </div>
              {!managerView && (
                <p className="stats-page-subcopy org-settings-role-note">
                  You are signed in as {roleLabel(currentMember?.role ?? "coach")}. Only organization admins can edit this section.
                </p>
              )}
            </form>

            <section className="stats-page-card settings-section-card">
              <div className="stats-page-card-head">
                <div>
                  <h3>Member Access</h3>
                  <p className="settings-section-desc">
                    {currentMember ? `Signed in as ${currentMember.fullName} (${roleLabel(currentMember.role)})` : "Manage organization members."}
                  </p>
                  <p className="stats-page-subcopy org-settings-invite-note">
                    Invite Email sends onboarding access. Reset Email sends a password reset link for an existing login.
                  </p>
                </div>
              </div>

              {members.length === 0 ? (
                <p className="stats-empty-copy">No organization members found.</p>
              ) : (
                <div className="settings-members-list">
                  {members.map((member) => (
                    <div key={member.memberId} className="settings-member-row">
                      <div className="settings-member-info">
                        <div className="settings-member-avatar">{member.fullName.charAt(0).toUpperCase()}</div>
                        <div>
                          <strong className="settings-member-name">
                            <input
                              className="settings-member-name-input"
                              value={member.fullName}
                              onChange={(event) => setMembers((current) => current.map((entry) => entry.memberId === member.memberId ? { ...entry, fullName: event.target.value } : entry))}
                              readOnly={!managerView}
                            />
                          </strong>
                          <span className="settings-member-email">{member.email}</span>
                        </div>
                      </div>
                      <div className="settings-member-controls">
                        <select
                          className="settings-member-role-select"
                          value={member.role}
                          onChange={(event) => setMembers((current) => current.map((entry) => entry.memberId === member.memberId ? { ...entry, role: event.target.value as OrganizationMember["role"] } : entry))}
                          disabled={!managerView}
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <span className={`settings-status-badge settings-status-${member.status}`}>{member.status}</span>
                        {managerView && (
                          <>
                            <button type="button" className="shell-nav-link shell-nav-link-active" disabled={saving} onClick={() => void saveMember(member)}>
                              Save
                            </button>
                            <button type="button" className="shell-nav-link" title="Send a fresh invite email with setup access" disabled={saving} onClick={() => void resendMemberInvite(member)}>
                              Invite Email
                            </button>
                            <button type="button" className="shell-nav-link" title="Send a password reset email to this address" disabled={saving || !isValidEmail(member.email)} onClick={() => void sendPasswordResetEmail(member.email)}>
                              Reset Email
                            </button>
                            <button
                              type="button"
                              className="shell-nav-link"
                              disabled={saving || member.memberId === currentMember?.memberId}
                              onClick={() => void removeMember(member)}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {managerView ? (
                <form className="settings-invite-form" onSubmit={inviteMember}>
                  <h4 className="settings-sub-heading">Invite Member</h4>
                  <p className="stats-page-subcopy org-settings-invite-note">
                    Invite emails are sent automatically when configured.
                  </p>
                  <div className="setup-grid">
                    <label className="stats-filter-field">
                      <span>Full Name</span>
                      <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Full name" />
                    </label>
                    <label className="stats-filter-field">
                      <span>Email</span>
                      <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@school.org" />
                    </label>
                    <label className="stats-filter-field">
                      <span>Role</span>
                      <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as OrganizationMember["role"])}>
                        {ROLE_OPTIONS.map((option) => (
                          <option key={`invite-${option.value}`} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="settings-form-footer">
                    <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Send Invite</button>
                  </div>
                </form>
              ) : (
                <div className="org-settings-request-access-wrap">
                  <button type="button" className="shell-nav-link" onClick={() => onNavigate("/account")}>Request Admin Access</button>
                </div>
              )}
            </section>
          </section>
        </>
      )}
    </div>
  );
}
