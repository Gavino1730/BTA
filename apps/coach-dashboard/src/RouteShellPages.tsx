import { type FormEvent, useMemo, useState, useEffect } from "react";
import { apiBase, apiKeyHeader, fetchBillingEntitlement, fetchBillingPortalUrl, validateCoupon, applyCoupon, type BillingEntitlement } from "./platform.js";

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

interface AuthRouteFrameProps {
  subtitle: string;
  title: string;
  titleAccent: string;
  topbarSubtitle: string;
  primaryAction: React.ReactNode;
  secondaryAction?: React.ReactNode;
  children: React.ReactNode;
}

function AuthRouteFrame({
  subtitle,
  title,
  titleAccent,
  topbarSubtitle,
  primaryAction,
  secondaryAction,
  children,
}: AuthRouteFrameProps) {
  return (
    <div className="auth-page">
      <div className="auth-page-glow auth-page-glow-left" aria-hidden="true" />
      <div className="auth-page-glow auth-page-glow-right" aria-hidden="true" />

      <header className="auth-topbar">
        {primaryAction}
        <div className="auth-brand-lockup" aria-label="BTA Courtside">
          <span className="auth-brand-badge">BTA</span>
          <div>
            <p className="auth-brand-name">Courtside</p>
            <p className="auth-brand-subtitle">{topbarSubtitle}</p>
          </div>
        </div>
        {secondaryAction ?? <span className="auth-topbar-pill">Coach Access</span>}
      </header>

      <main className="auth-shell auth-shell-compact">
        <section className="auth-hero-panel auth-hero-panel-compact">
          <span className="auth-kicker">Secure Access</span>
          <h1 className="auth-display-title">
            {title}
            <span>{titleAccent}</span>
          </h1>
          <p className="auth-hero-copy">{subtitle}</p>
        </section>

        {children}
      </main>
    </div>
  );
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
    <AuthRouteFrame
      topbarSubtitle="Invitation Confirmation"
      title="Accept a staff invite and"
      titleAccent="join the coach workspace."
      subtitle="Use the invited email and invite token from your organization email sent by no-reply@btaintel.com. Once accepted, you can continue directly into login with the same address."
      primaryAction={<button type="button" className="auth-topbar-link" onClick={() => onNavigate(nextLoginPath)}>Back to Login</button>}
      secondaryAction={<span className="auth-topbar-pill">Invite Access</span>}
    >
      <section className="auth-card" aria-labelledby="invite-accept-title">
        <div className="auth-card-head">
          <p className="auth-kicker">Team Invite</p>
          <h2 id="invite-accept-title">Confirm invite details</h2>
          <p>Paste the invite token exactly as sent. If the email is already filled from the link, you only need to review and submit. If the invite is missing, contact support@btaintel.com.</p>
        </div>

        <div className="auth-form">
          <label className="auth-field">
            <span>Invited Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="coach@program.org"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>

          <label className="auth-field">
            <span>Invite Token</span>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste invite token"
              autoComplete="one-time-code"
              spellCheck={false}
            />
          </label>

          <p className="auth-support-copy">
            {hasToken
              ? "Invite token detected. Submit below to activate access for this email."
              : "No token detected. Ask your admin to resend the invite email if needed."}
          </p>

          {statusMessage && <p className="auth-status" aria-live="polite">{statusMessage}</p>}
          {errorMessage && <p className="auth-status auth-status-error" aria-live="polite">{errorMessage}</p>}

          <button type="button" className="auth-primary-button" onClick={() => { void handleAcceptInvite(); }} disabled={submitting}>
            {submitting ? "Accepting..." : "Accept Invite"}
          </button>
        </div>

        <div className="auth-link-row">
          <button type="button" className="auth-secondary-button" onClick={() => onNavigate(nextLoginPath)}>
            Continue to Login
          </button>
          <button
            type="button"
            className="auth-secondary-button"
            onClick={() => {
              const payload = buildSupportPayload("invite", email, token);
              void navigator.clipboard?.writeText(payload);
            }}
          >
            Copy Support Payload
          </button>
        </div>
      </section>
    </AuthRouteFrame>
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
    <AuthRouteFrame
      topbarSubtitle="Email Confirmation"
      title="Verify your email and"
      titleAccent="unlock coach access."
      subtitle="Confirm the verification token from your inbox message sent by no-reply@btaintel.com. After verification, you can continue to login without leaving the same auth flow."
      primaryAction={<button type="button" className="auth-topbar-link" onClick={() => onNavigate(nextLoginPath)}>Back to Login</button>}
      secondaryAction={<span className="auth-topbar-pill">Email Verification</span>}
    >
      <section className="auth-card" aria-labelledby="email-verify-title">
        <div className="auth-card-head">
          <p className="auth-kicker">Verification</p>
          <h2 id="email-verify-title">Confirm your verification details</h2>
          <p>Use the same email and token that were sent in the verification message. If you opened the link directly, the token should already be present. If the message did not arrive, contact support@btaintel.com.</p>
        </div>

        <div className="auth-form">
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="coach@program.org"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>

          <label className="auth-field">
            <span>Verification Token</span>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste verification token"
              autoComplete="one-time-code"
              spellCheck={false}
            />
          </label>

          <p className="auth-support-copy">
            {hasToken
              ? "Verification token detected. Submit below to confirm the account email."
              : "Token missing. Request a fresh verification message if this page was opened manually."}
          </p>

          {statusMessage && <p className="auth-status" aria-live="polite">{statusMessage}</p>}
          {errorMessage && <p className="auth-status auth-status-error" aria-live="polite">{errorMessage}</p>}

          <button type="button" className="auth-primary-button" onClick={() => { void handleVerifyEmail(); }} disabled={submitting}>
            {submitting ? "Verifying..." : "Verify Email"}
          </button>
        </div>

        <div className="auth-link-row">
          <button type="button" className="auth-secondary-button" onClick={() => onNavigate(nextLoginPath)}>
            Continue to Login
          </button>
          <button
            type="button"
            className="auth-secondary-button"
            onClick={() => {
              const payload = buildSupportPayload("verify", email, token);
              void navigator.clipboard?.writeText(payload);
            }}
          >
            Copy Support Payload
          </button>
        </div>
      </section>
    </AuthRouteFrame>
  );
}

export function CheckoutSuccessPage({ onNavigate }: RoutedPageProps) {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const schoolId = (params.get("schoolId") ?? "").trim();
  const email = (params.get("email") ?? "").trim().toLowerCase();
  const setupPath = schoolId
    ? `/setup?schoolId=${encodeURIComponent(schoolId)}${email ? `&email=${encodeURIComponent(email)}` : ""}`
    : "/setup";

  return (
    <ShellPage
      title="Checkout Complete"
      subtitle="Your billing workflow is marked complete. Create your account in setup to continue."
      bullets={[
        "If webhook sync is still processing, wait a few seconds and retry account creation.",
        "Setup will preserve your school scope and continue onboarding.",
        "You can still open Billing after account creation to manage subscription details.",
      ]}
      onPrimary={() => onNavigate(setupPath)}
      primaryLabel="Continue Setup"
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
  const [submittingCycle, setSubmittingCycle] = useState<"monthly" | "yearly" | null>(null);
  const [submittingPortal, setSubmittingPortal] = useState(false);
  const [status, setStatus] = useState("Loading billing information...");
  const [billingEntitlement, setBillingEntitlement] = useState<BillingEntitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponStatus, setCouponStatus] = useState("");
  const [couponError, setCouponError] = useState("");

  useEffect(() => {
    const loadBilling = async () => {
      setLoading(true);
      const entitlement = await fetchBillingEntitlement();
      setBillingEntitlement(entitlement);
      if (entitlement?.accessActive) {
        setStatus("Your subscription is active. Use the button below to manage your plan through Stripe.");
      } else {
        setStatus("Start a checkout session to activate monthly or yearly access. You can apply a promo code before checkout.");
      }
      setLoading(false);
    };
    void loadBilling();
  }, []);

  async function validateAndApplyCoupon(e?: React.FormEvent) {
    if (e) {
      e.preventDefault();
    }
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponError("Please enter a coupon code");
      return;
    }

    setValidatingCoupon(true);
    setCouponError("");
    setCouponStatus("Validating coupon...");

    try {
      const result = await validateCoupon(code);
      if (!result || !result.valid) {
        setCouponError(result?.error || "Coupon is not valid");
        setCouponStatus("");
        setValidatingCoupon(false);
        return;
      }

      const applied = await applyCoupon(code);
      if (applied.applied) {
        setCouponStatus(`✓ Coupon ${code} applied! You'll get ${result.percentOff ?? result.amountOff} off at checkout.`);
        setCouponCode("");
      } else {
        setCouponError(applied.error || "Could not apply coupon");
        setCouponStatus("");
      }
    } catch {
      setCouponError("Could not validate coupon. Please try again.");
      setCouponStatus("");
    } finally {
      setValidatingCoupon(false);
    }
  }

  async function startCheckout(planCycle: "monthly" | "yearly") {
    setSubmittingCycle(planCycle);
    setStatus(`Starting ${planCycle} checkout...`);
    try {
      const response = await fetch(`${apiBase}/api/billing/checkout-session`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({ planCycle }),
      });

      const payload = await response.json() as { error?: string; url?: string };
      if (!response.ok || !payload.url) {
        setStatus(payload.error || "Could not start checkout right now.");
        return;
      }

      window.location.assign(payload.url);
    } catch {
      setStatus("Could not reach billing service. Please try again.");
    } finally {
      setSubmittingCycle(null);
    }
  }

  async function openPortal() {
    setSubmittingPortal(true);
    setStatus("Opening subscription management portal...");
    try {
      const portalUrl = await fetchBillingPortalUrl();
      if (!portalUrl) {
        setStatus("Could not open portal right now. Please try again.");
        return;
      }

      window.location.assign(portalUrl);
    } catch {
      setStatus("Could not reach portal service. Please try again.");
    } finally {
      setSubmittingPortal(false);
    }
  }

  const showCheckout = !loading && billingEntitlement && !billingEntitlement.accessActive;
  const showPortal = !loading && billingEntitlement && billingEntitlement.accessActive;

  return (
    <div className="stats-page policy-page">
      <section className="stats-page-card policy-page-hero">
        <p className="stats-page-eyebrow">Preproduction</p>
        <h1>Billing</h1>
        <p className="stats-page-subtitle">{showPortal 
          ? "Your subscription is active. Manage your account, update payment methods, or cancel anytime."
          : "Subscription access is now managed through Stripe checkout. Activate a plan to unlock full app access."
        }</p>
      </section>

      {showPortal && (
        <section className="stats-page-card policy-page-section">
          <h3 className="policy-section-heading">Manage Subscription</h3>
          <p className="stats-page-subcopy policy-section-body">{status}</p>
          <ul className="policy-section-list">
            <li>View and manage your subscription in the Stripe billing portal.</li>
            <li>Update your payment method or billing address.</li>
            <li>Cancel or change your plan anytime.</li>
          </ul>
        </section>
      )}

      {showCheckout && (
        <>
          <section className="stats-page-card policy-page-section">
            <h3 className="policy-section-heading">Have a Promo Code?</h3>
            <p className="stats-page-subcopy policy-section-body">Enter your coupon code to get a discount on your first plan.</p>
            <form onSubmit={(e) => void validateAndApplyCoupon(e)} style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value);
                    setCouponError("");
                  }}
                  placeholder="Enter coupon code"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={validatingCoupon}
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    borderRadius: "0.375rem",
                    border: "1px solid rgba(232, 234, 240, 0.2)",
                    backgroundColor: "rgba(17, 24, 39, 0.5)",
                    color: "rgba(232, 234, 240, 0.9)",
                    fontSize: "0.875rem",
                  }}
                />
                <button
                  type="submit"
                  disabled={validatingCoupon || !couponCode.trim()}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.375rem",
                    backgroundColor: validatingCoupon || !couponCode.trim() ? "rgba(107, 114, 128, 0.5)" : "rgba(59, 130, 246, 0.8)",
                    color: "white",
                    fontSize: "0.875rem",
                    cursor: validatingCoupon || !couponCode.trim() ? "not-allowed" : "pointer",
                    border: "none",
                  }}
                >
                  {validatingCoupon ? "Validating..." : "Apply"}
                </button>
              </div>
              {couponStatus && <p style={{ color: "rgba(74, 222, 128, 0.8)", fontSize: "0.875rem", marginTop: "0.25rem" }}>{couponStatus}</p>}
              {couponError && <p style={{ color: "rgba(248, 113, 113, 0.8)", fontSize: "0.875rem", marginTop: "0.25rem" }}>{couponError}</p>}
            </form>
          </section>

          <section className="stats-page-card policy-page-section">
            <h3 className="policy-section-heading">Start Subscription</h3>
            <p className="stats-page-subcopy policy-section-body">{status}</p>
            <ul className="policy-section-list">
              <li>Monthly and yearly checkout are available in Stripe-hosted checkout.</li>
              <li>After checkout, return to the dashboard and refresh if access does not update immediately.</li>
            </ul>
          </section>
        </>
      )}

      <section className="stats-page-card policy-page-section">
        <h3 className="policy-section-heading">Current Rollout</h3>
        <p className="stats-page-subcopy policy-section-body">This phase includes core checkout and subscription management.</p>
        <ul className="policy-section-list">
          <li>Hosted checkout for monthly and yearly plans</li>
          <li>Org-level entitlement and billing portal</li>
          <li>Trial-to-paid enforcement</li>
          <li>Promo code support (beta)</li>
        </ul>
      </section>

      <section className="stats-page-card policy-page-actions-wrap">
        <div className="policy-page-actions">
          {showPortal && (
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => void openPortal()}>
              {submittingPortal ? "Opening Portal..." : "Manage Subscription"}
            </button>
          )}
          {showCheckout && (
            <>
              <button
                type="button"
                className="shell-nav-link shell-nav-link-active"
                onClick={() => void startCheckout("monthly")}
                disabled={submittingCycle !== null}
              >
                {submittingCycle === "monthly" ? "Starting Monthly..." : "Start Monthly Plan"}
              </button>
              <button
                type="button"
                className="shell-nav-link"
                onClick={() => void startCheckout("yearly")}
                disabled={submittingCycle !== null}
              >
                {submittingCycle === "yearly" ? "Starting Yearly..." : "Start Yearly Plan"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
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
  return <BillingPage onNavigate={onNavigate} />;
}

export function SupportPage({ onNavigate }: RoutedPageProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("help");
  const [severity, setSeverity] = useState("medium");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Use this form to submit support incidents and get an email confirmation.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !message.trim()) {
      setStatus("Email and message are required.");
      return;
    }

    setSubmitting(true);
    setStatus("Submitting support intake...");
    try {
      const response = await fetch(`${apiBase}/api/intake/support`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({ fullName, email, topic, severity, message }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(typeof payload.error === "string" ? payload.error : "Could not submit support intake.");
        return;
      }
      setStatus("Support request submitted. Check your email for confirmation.");
      setMessage("");
    } catch {
      setStatus("Could not reach the API. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stats-page">
      <section className="stats-page-card policy-page-hero">
        <p className="stats-page-eyebrow">Support</p>
        <h1>Support Intake</h1>
        <p className="stats-page-subtitle">Send game-day issues, bugs, and help requests.</p>
      </section>
      <form className="stats-page-card policy-page-section" onSubmit={handleSubmit}>
        <div className="setup-grid">
          <label className="stats-filter-field"><span>Name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" /></label>
          <label className="stats-filter-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.org" /></label>
          <label className="stats-filter-field"><span>Type</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="help">Help</option><option value="bug">Bug</option><option value="feature">Feature</option></select></label>
          <label className="stats-filter-field"><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label className="stats-filter-field" style={{ gridColumn: "1 / -1" }}><span>Details</span><textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe what happened and when." /></label>
        </div>
        <p className="stats-page-status">{status}</p>
        <div className="policy-page-actions">
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={submitting}>{submitting ? "Submitting..." : "Submit Support"}</button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/contact")}>Open Contact</button>
        </div>
      </form>
    </div>
  );
}

export function ContactPage({ onNavigate }: RoutedPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [category, setCategory] = useState("support");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Contact us for support, onboarding, billing, or security questions.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus("Name, email, and message are required.");
      return;
    }

    setSubmitting(true);
    setStatus("Submitting contact request...");
    try {
      const response = await fetch(`${apiBase}/api/intake/contact`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({ name, email, organization, category, message }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(typeof payload.error === "string" ? payload.error : "Could not submit contact request.");
        return;
      }
      setStatus("Contact request submitted. Check your email for confirmation.");
      setMessage("");
    } catch {
      setStatus("Could not reach the API. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stats-page">
      <section className="stats-page-card policy-page-hero">
        <p className="stats-page-eyebrow">Contact</p>
        <h1>Contact BTA</h1>
        <p className="stats-page-subtitle">General and operational requests.</p>
      </section>
      <form className="stats-page-card policy-page-section" onSubmit={handleSubmit}>
        <div className="setup-grid">
          <label className="stats-filter-field"><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="stats-filter-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="stats-filter-field"><span>Organization</span><input value={organization} onChange={(event) => setOrganization(event.target.value)} /></label>
          <label className="stats-filter-field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="support">Support</option><option value="pilot">Pilot</option><option value="billing">Billing</option><option value="security">Security</option></select></label>
          <label className="stats-filter-field" style={{ gridColumn: "1 / -1" }}><span>Message</span><textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        </div>
        <p className="stats-page-status">{status}</p>
        <div className="policy-page-actions">
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={submitting}>{submitting ? "Submitting..." : "Send"}</button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/book-demo")}>Book Demo</button>
        </div>
      </form>
    </div>
  );
}

export function DemoBookingPage({ onNavigate }: RoutedPageProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Request a demo and we will follow up with scheduling details.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setStatus("Name and email are required.");
      return;
    }
    setSubmitting(true);
    setStatus("Submitting demo request...");
    try {
      const response = await fetch(`${apiBase}/api/intake/demo`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({ fullName, email, organization, details }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(typeof payload.error === "string" ? payload.error : "Could not submit demo request.");
        return;
      }
      setStatus("Demo request submitted. Check your email for confirmation.");
      setDetails("");
    } catch {
      setStatus("Could not reach the API. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stats-page">
      <section className="stats-page-card policy-page-hero">
        <p className="stats-page-eyebrow">Demo</p>
        <h1>Book A Demo</h1>
        <p className="stats-page-subtitle">Tell us about your team and timeline.</p>
      </section>
      <form className="stats-page-card policy-page-section" onSubmit={handleSubmit}>
        <div className="setup-grid">
          <label className="stats-filter-field"><span>Name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
          <label className="stats-filter-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="stats-filter-field"><span>Organization</span><input value={organization} onChange={(event) => setOrganization(event.target.value)} /></label>
          <label className="stats-filter-field" style={{ gridColumn: "1 / -1" }}><span>Details</span><textarea rows={5} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
        </div>
        <p className="stats-page-status">{status}</p>
        <div className="policy-page-actions">
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={submitting}>{submitting ? "Submitting..." : "Request Demo"}</button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/contact")}>Back to Contact</button>
        </div>
      </form>
    </div>
  );
}

export function DataDeletionPage({ onNavigate }: RoutedPageProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Submit a data deletion request and we will confirm via email.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setStatus("Name and email are required.");
      return;
    }
    setSubmitting(true);
    setStatus("Submitting request...");
    try {
      const response = await fetch(`${apiBase}/api/intake/data-deletion`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({ fullName, email, details }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(typeof payload.error === "string" ? payload.error : "Could not submit data deletion request.");
        return;
      }
      setStatus("Data deletion request submitted. Check your email for confirmation.");
      setDetails("");
    } catch {
      setStatus("Could not reach the API. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stats-page">
      <section className="stats-page-card policy-page-hero">
        <p className="stats-page-eyebrow">Data Request</p>
        <h1>Data Deletion Request</h1>
        <p className="stats-page-subtitle">Submit compliance and account data deletion requests.</p>
      </section>
      <form className="stats-page-card policy-page-section" onSubmit={handleSubmit}>
        <div className="setup-grid">
          <label className="stats-filter-field"><span>Name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
          <label className="stats-filter-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="stats-filter-field" style={{ gridColumn: "1 / -1" }}><span>Scope / Notes</span><textarea rows={5} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
        </div>
        <p className="stats-page-status">{status}</p>
        <div className="policy-page-actions">
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={submitting}>{submitting ? "Submitting..." : "Submit Request"}</button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/contact")}>Contact</button>
        </div>
      </form>
    </div>
  );
}
