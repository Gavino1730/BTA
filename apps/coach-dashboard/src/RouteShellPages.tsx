import { useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface RoutedPageProps {
  onNavigate: (path: string) => void;
}

interface ShellPageProps {
  title: string;
  subtitle: string;
  bullets?: string[];
  onPrimary?: () => void;
  primaryLabel?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
}

interface PolicySection {
  heading: string;
  body: string;
  bullets?: string[];
}

interface PolicyPageProps extends RoutedPageProps {
  title: string;
  subtitle: string;
  sections: PolicySection[];
  onPrimary?: () => void;
  primaryLabel?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
}

function readAuthQueryValue(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return (new URLSearchParams(window.location.search).get(key) ?? "").trim();
}

function buildSupportPayload(flow: "invite" | "verify", email: string, token: string): string {
  return [
    `Flow: ${flow}`,
    `Email: ${email || "[missing]"}`,
    `Token present: ${token ? "yes" : "no"}`,
    `Timestamp: ${new Date().toISOString()}`,
  ].join("\n");
}

function ShellPage({ title, subtitle, bullets = [], onPrimary, primaryLabel, onSecondary, secondaryLabel }: ShellPageProps) {
  return (
    <div className="stats-page">
      <section className="stats-page-card" style={{ maxWidth: "840px", margin: "0 auto" }}>
        <p className="stats-page-eyebrow">Preproduction</p>
        <h1>{title}</h1>
        <p className="stats-page-subtitle">{subtitle}</p>
        {bullets.length > 0 && (
          <ul style={{ marginTop: "0.75rem", lineHeight: 1.6, color: "rgba(232,234,240,0.85)" }}>
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", marginTop: "1rem" }}>
          {onPrimary && primaryLabel && (
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={onPrimary}>
              {primaryLabel}
            </button>
          )}
          {onSecondary && secondaryLabel && (
            <button type="button" className="shell-nav-link" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function PolicyPage({ title, subtitle, sections, onPrimary, primaryLabel, onSecondary, secondaryLabel }: PolicyPageProps) {
  return (
    <div className="stats-page policy-page">
      <section className="stats-page-card policy-page-hero">
        <p className="stats-page-eyebrow">Preproduction</p>
        <h1>{title}</h1>
        <p className="stats-page-subtitle">{subtitle}</p>
      </section>

      {sections.map((section) => (
        <section key={section.heading} className="stats-page-card policy-page-section">
          <h3 className="policy-section-heading">{section.heading}</h3>
          <p className="stats-page-subcopy policy-section-body">{section.body}</p>
          {(section.bullets ?? []).length > 0 && (
            <ul className="policy-section-list">
              {section.bullets?.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="stats-page-card policy-page-actions-wrap">
        <div className="policy-page-actions">
          {onPrimary && primaryLabel && (
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={onPrimary}>
              {primaryLabel}
            </button>
          )}
          {onSecondary && secondaryLabel && (
            <button type="button" className="shell-nav-link" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function InviteAcceptancePage({ onNavigate }: RoutedPageProps) {
  const [email, setEmail] = useState(() => readAuthQueryValue("email").toLowerCase());
  const [token, setToken] = useState(() => readAuthQueryValue("token"));
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const hasToken = Boolean(token.trim());
  const nextLoginPath = useMemo(() => {
    const normalizedEmail = email.trim().toLowerCase();
    return normalizedEmail ? `/login?email=${encodeURIComponent(normalizedEmail)}` : "/login";
  }, [email]);

  const handleAcceptInvite = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setErrorMessage("Invite token is required.");
      setStatusMessage("");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await fetch(`${apiBase}/api/org/members/accept-invite`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({ email: normalizedEmail, token: normalizedToken }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(typeof payload.error === "string" ? payload.error : "Could not accept invite.");
        return;
      }

      setStatusMessage("Invite accepted. Redirecting to login.");
      onNavigate(normalizedEmail ? `/login?email=${encodeURIComponent(normalizedEmail)}` : "/login");
    } catch {
      setErrorMessage("Could not reach the API. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stats-page">
      <section className="stats-page-card policy-page-hero">
        <p className="stats-page-eyebrow">Invite Access</p>
        <h1>Accept Team Invite</h1>
        <p className="stats-page-subtitle">Use the invited email and invite token to continue into login.</p>
      </section>

      <section className="stats-page-card policy-page-section">
        <h3 className="policy-section-heading">Invite Details</h3>
        <div className="setup-grid">
          <label className="stats-filter-field">
            <span>Invited Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="coach@program.org"
            />
          </label>
          <label className="stats-filter-field">
            <span>Invite Token</span>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste invite token"
            />
          </label>
        </div>
        <p className="stats-page-subcopy" style={{ marginTop: "0.65rem" }}>
          {hasToken
            ? "Token detected. Continue to login with your invited email."
            : "No token detected. Ask your admin to resend the invite link."}
        </p>
        {statusMessage && <p className="stats-page-subcopy">{statusMessage}</p>}
        {errorMessage && <p className="stats-page-subcopy" style={{ color: "#fca5a5" }}>{errorMessage}</p>}
      </section>

      <section className="stats-page-card policy-page-actions-wrap">
        <div className="policy-page-actions">
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => { void handleAcceptInvite(); }} disabled={submitting}>
            {submitting ? "Accepting..." : "Accept Invite"}
          </button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate(nextLoginPath)}>
            Continue to Login
          </button>
          <button
            type="button"
            className="shell-nav-link"
            onClick={() => {
              const payload = buildSupportPayload("invite", email, token);
              void navigator.clipboard?.writeText(payload);
            }}
          >
            Copy Support Payload
          </button>
        </div>
      </section>
    </div>
  );
}

export function EmailVerificationPage({ onNavigate }: RoutedPageProps) {
  const [email, setEmail] = useState(() => readAuthQueryValue("email").toLowerCase());
  const [token, setToken] = useState(() => readAuthQueryValue("token"));
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const hasToken = Boolean(token.trim());
  const nextLoginPath = useMemo(() => {
    const normalizedEmail = email.trim().toLowerCase();
    return normalizedEmail ? `/login?email=${encodeURIComponent(normalizedEmail)}` : "/login";
  }, [email]);

  const handleVerifyEmail = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setErrorMessage("Verification token is required.");
      setStatusMessage("");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await fetch(`${apiBase}/api/auth/email-verify/confirm`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({ email: normalizedEmail, token: normalizedToken }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(typeof payload.error === "string" ? payload.error : "Could not verify email.");
        return;
      }

      setStatusMessage("Email verified. Redirecting to login.");
      onNavigate(normalizedEmail ? `/login?email=${encodeURIComponent(normalizedEmail)}` : "/login");
    } catch {
      setErrorMessage("Could not reach the API. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stats-page">
      <section className="stats-page-card policy-page-hero">
        <p className="stats-page-eyebrow">Email Verification</p>
        <h1>Verify Email</h1>
        <p className="stats-page-subtitle">Confirm your verification details, then continue to login.</p>
      </section>

      <section className="stats-page-card policy-page-section">
        <h3 className="policy-section-heading">Verification Details</h3>
        <div className="setup-grid">
          <label className="stats-filter-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="coach@program.org"
            />
          </label>
          <label className="stats-filter-field">
            <span>Verification Token</span>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste verification token"
            />
          </label>
        </div>
        <p className="stats-page-subcopy" style={{ marginTop: "0.65rem" }}>
          {hasToken
            ? "Token detected. Continue to login after verification."
            : "Token missing. Request a fresh verification link from your admin."}
        </p>
        {statusMessage && <p className="stats-page-subcopy">{statusMessage}</p>}
        {errorMessage && <p className="stats-page-subcopy" style={{ color: "#fca5a5" }}>{errorMessage}</p>}
      </section>

      <section className="stats-page-card policy-page-actions-wrap">
        <div className="policy-page-actions">
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => { void handleVerifyEmail(); }} disabled={submitting}>
            {submitting ? "Verifying..." : "Verify Email"}
          </button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate(nextLoginPath)}>
            Continue to Login
          </button>
          <button
            type="button"
            className="shell-nav-link"
            onClick={() => {
              const payload = buildSupportPayload("verify", email, token);
              void navigator.clipboard?.writeText(payload);
            }}
          >
            Copy Support Payload
          </button>
        </div>
      </section>
    </div>
  );
}

export function CheckoutSuccessPage({ onNavigate }: RoutedPageProps) {
  return (
    <ShellPage
      title="Checkout Complete"
      subtitle="Your billing workflow is marked complete. Subscription activation and entitlement sync can take a moment during preproduction."
      bullets={[
        "If this was a trial start, your trial window should now be active.",
        "If you do not see updated billing status, refresh Billing in a few seconds.",
        "Return to Billing if activation status looks stale.",
      ]}
      onPrimary={() => onNavigate("/billing")}
      primaryLabel="Open Billing"
      onSecondary={() => onNavigate("/stats")}
      secondaryLabel="Open Dashboard"
    />
  );
}

export function CheckoutCancelPage({ onNavigate }: RoutedPageProps) {
  return (
    <ShellPage
      title="Checkout Canceled"
      subtitle="No billing changes were applied. You can return to billing whenever you are ready."
      bullets={[
        "Your current access level remains unchanged.",
        "No payment method was updated during this canceled flow.",
        "You can restart checkout from Billing at any time.",
      ]}
      onPrimary={() => onNavigate("/billing")}
      primaryLabel="Open Billing"
      onSecondary={() => onNavigate("/stats")}
      secondaryLabel="Open Dashboard"
    />
  );
}

export function BillingPage({ onNavigate }: RoutedPageProps) {
  return (
    <PolicyPage
      onNavigate={onNavigate}
      title="Billing"
      subtitle="Billing is still pilot-managed. This page outlines the current workflow and the self-serve controls planned for launch."
      sections={[
        {
          heading: "Current Pilot Billing Workflow",
          body: "Billing and renewals are handled manually with school stakeholders.",
          bullets: [
            "Pricing and term details are finalized through direct pilot agreements.",
            "Invoices and payment instructions are not yet self-serve.",
          ],
        },
        {
          heading: "Planned Billing Capabilities",
          body: "These features are planned for production readiness.",
          bullets: [
            "Plan and seat management",
            "Invoice history and downloadable receipts",
            "Renewal reminders and billing notifications",
          ],
        },
      ]}
      onPrimary={() => onNavigate("/account")}
      primaryLabel="Open Account"
      onSecondary={() => onNavigate("/live")}
      secondaryLabel="Back to Dashboard"
    />
  );
}

export function AdminPage({ onNavigate }: RoutedPageProps) {
  return (
    <PolicyPage
      onNavigate={onNavigate}
      title="Admin Panel"
      subtitle="Starter admin surface for preproduction operations. This page is intentionally read-only while management tools are phased in."
      sections={[
        {
          heading: "Tenant and User Operations",
          body: "Visibility-first rollout for high-impact operations before write actions are enabled.",
          bullets: [
            "User and organization inventory view (planned)",
            "Role and access anomaly review (planned)",
            "Manual escalation workflow links (planned)",
          ],
        },
        {
          heading: "Support and Safety Controls",
          body: "Admin support workflows prioritize reliability and auditability.",
          bullets: [
            "Security metric snapshot from existing API endpoints",
            "Factory reset guardrails and confirmation policy (planned)",
            "Runbook links for incident response and recovery",
          ],
        },
        {
          heading: "Audit and Compliance",
          body: "Operational changes should remain traceable as admin capabilities expand.",
          bullets: [
            "Audit log timeline integration (planned)",
            "Environment change annotations (planned)",
            "Operational review checkpoints for admin actions",
          ],
        },
      ]}
      onPrimary={() => onNavigate("/stats/settings")}
      primaryLabel="Open Team Settings"
      onSecondary={() => onNavigate("/account")}
      secondaryLabel="Open Account"
    />
  );
}

export function UserSettingsPage({ onNavigate }: RoutedPageProps) {
  return (
    <ShellPage
      title="User Settings"
      subtitle="Personal settings are in active build."
      bullets={[
        "Theme and display preferences",
        "Notification preferences",
        "Timezone, default school, and device management",
      ]}
      onPrimary={() => onNavigate("/account")}
      primaryLabel="Open Account"
      onSecondary={() => onNavigate("/stats/settings")}
      secondaryLabel="Open Team Settings"
    />
  );
}
