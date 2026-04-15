import { useMemo, useState, useEffect } from "react";
import { EmptyState } from "./EmptyState.js";
import { apiBase, apiKeyHeader, fetchBillingEntitlement, fetchBillingPortalUrl, validateCoupon, applyCoupon, type BillingEntitlement } from "./platform.js";
import { AuthRouteFrame, PolicyPage, ShellPage, type RoutedPageProps } from "./RouteShellShared.js";
export { SupportPage, ContactPage, DemoBookingPage, DataDeletionPage } from "./RouteShellIntakePages.js";

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
      <section className="auth-card auth-flow-card" aria-labelledby="invite-accept-title">
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
      <section className="auth-card auth-flow-card" aria-labelledby="email-verify-title">
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
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [syncStatus, setSyncStatus] = useState("Confirming billing status...");
  const [syncing, setSyncing] = useState(true);

  function entitlementMessage(current: BillingEntitlement | null): string {
    if (!current) {
      return "Checkout completed, but billing sync is still processing. Retry in a few seconds.";
    }

    if (current.accessActive) {
      return "Billing is active. Continue setup and finish onboarding.";
    }

    if (current.status === "past_due" || current.status === "unpaid") {
      return "Payment was received but account is still marked past due. Open Billing and refresh status.";
    }

    if (current.status === "canceled") {
      return "This account is currently canceled. Open Billing to reactivate before continuing.";
    }

    if (current.status === "incomplete") {
      return "Checkout did not finalize completely. Open Billing to complete payment details.";
    }

    return "Billing status is updating. Continue setup and check Billing if access remains locked.";
  }

  async function refreshEntitlement() {
    setSyncing(true);
    const next = await fetchBillingEntitlement();
    setEntitlement(next);
    setSyncStatus(entitlementMessage(next));
    setSyncing(false);
  }

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const first = await fetchBillingEntitlement();
      if (cancelled) {
        return;
      }

      setEntitlement(first);
      setSyncStatus(entitlementMessage(first));

      if (first?.accessActive) {
        setSyncing(false);
        return;
      }

      let attempts = 0;
      const timer = window.setInterval(async () => {
        attempts += 1;
        const polled = await fetchBillingEntitlement();
        if (cancelled) {
          window.clearInterval(timer);
          return;
        }

        setEntitlement(polled);
        setSyncStatus(entitlementMessage(polled));
        if (polled?.accessActive || attempts >= 4) {
          window.clearInterval(timer);
          setSyncing(false);
        }
      }, 2000);
    };

    void run();

    return () => {
      cancelled = true;
      setSyncing(false);
    };
  }, []);

  return (
    <div className="stats-page">
      <section className="stats-page-card" style={{ maxWidth: "840px", margin: "0 auto" }}>
        <p className="stats-page-eyebrow">Billing</p>
        <h1>Checkout Complete</h1>
        <p className="stats-page-subtitle">Your billing workflow is marked complete. Confirm status and continue setup.</p>
        <p className="stats-page-subcopy" style={{ marginTop: "0.5rem" }}>{syncStatus}</p>
        <ul style={{ marginTop: "0.75rem", lineHeight: 1.6, color: "rgba(232,234,240,0.85)" }}>
          <li>Setup preserves your school scope and continues onboarding.</li>
          <li>Open Billing if access has not updated after checkout.</li>
          <li>Webhook sync may take a few seconds during peak traffic.</li>
        </ul>
        {entitlement ? (
          <p className="stats-page-subcopy" style={{ marginTop: "0.65rem" }}>
            Current billing status: <strong>{entitlement.status}</strong>
          </p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", marginTop: "1rem" }}>
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => onNavigate(setupPath)}>
            Continue Setup
          </button>
          <button type="button" className="shell-nav-link" onClick={() => void refreshEntitlement()} disabled={syncing}>
            {syncing ? "Checking Status..." : "Retry Billing Sync"}
          </button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/billing")}>
            Open Billing
          </button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/stats")}>
            Open Dashboard
          </button>
        </div>
      </section>
    </div>
  );
}

export function CheckoutCancelPage({ onNavigate }: RoutedPageProps) {
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [status, setStatus] = useState("Reviewing your current billing status...");

  useEffect(() => {
    void (async () => {
      const next = await fetchBillingEntitlement();
      setEntitlement(next);
      if (!next) {
        setStatus("No billing update was applied. You can return to Billing whenever you are ready.");
        return;
      }

      if (next.accessActive) {
        setStatus("Your subscription remains active. You can manage billing details from the Billing page.");
        return;
      }

      if (next.status === "past_due" || next.status === "unpaid") {
        setStatus("Your account still needs payment attention. Open Billing to restore full access.");
        return;
      }

      setStatus("No billing changes were applied. Restart checkout from Billing at any time.");
    })();
  }, []);

  return (
    <ShellPage
      title="Checkout Canceled"
      subtitle={status}
      bullets={[
        "Your current access level remains unchanged.",
        "No payment method was updated during this canceled flow.",
        entitlement?.status ? `Current billing status: ${entitlement.status}.` : "You can restart checkout from Billing at any time.",
      ]}
      onPrimary={() => onNavigate("/billing")}
      primaryLabel={entitlement?.accessActive ? "Manage Subscription" : "Open Billing"}
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
  const [billingLoadFailed, setBillingLoadFailed] = useState(false);
  const [billingRefreshKey, setBillingRefreshKey] = useState(0);

  useEffect(() => {
    const loadBilling = async () => {
      setLoading(true);
      setBillingLoadFailed(false);
      const entitlement = await fetchBillingEntitlement();
      setBillingEntitlement(entitlement);
      if (!entitlement) {
        setBillingLoadFailed(true);
        setStatus("Could not load billing state. You can still retry checkout or open billing portal when available.");
      } else if (entitlement.status === "active") {
        setStatus("Your subscription is active. Use the button below to manage your plan through Stripe.");
      } else if (entitlement.status === "trialing") {
        setStatus("You are currently in trial. Open the portal to add payment details or start checkout to avoid interruption.");
      } else if (entitlement.status === "past_due" || entitlement.status === "unpaid") {
        setStatus("Your account is past due. Update payment details in the billing portal or restart checkout to restore full access.");
      } else if (entitlement.status === "canceled") {
        setStatus("Your subscription is canceled. Start checkout to reactivate access.");
      } else {
        setStatus("No active subscription found. Start checkout to activate access.");
      }
      setLoading(false);
    };
    void loadBilling();
  }, [billingRefreshKey]);

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
      window.location.assign(portalUrl);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reach portal service. Please try again.");
    } finally {
      setSubmittingPortal(false);
    }
  }

  const entitlementStatus = billingEntitlement?.status;
  const showCheckout = !loading && Boolean(billingEntitlement && !billingEntitlement.accessActive);
  const showPortal = !loading && Boolean(billingEntitlement && billingEntitlement.accessActive);
  const checkoutLabel = entitlementStatus === "canceled"
    ? "Reactivate Plan"
    : entitlementStatus === "past_due" || entitlementStatus === "unpaid"
      ? "Restart Plan"
      : "Start Plan";
  const checkoutSectionTitle = entitlementStatus === "past_due" || entitlementStatus === "unpaid"
    ? "Restore Access"
    : entitlementStatus === "canceled"
      ? "Reactivate Subscription"
      : "Start Subscription";
  const subtitle = showPortal
    ? "Your subscription is active. Manage your account, update payment methods, or cancel anytime."
    : entitlementStatus === "past_due" || entitlementStatus === "unpaid"
      ? "Your account needs a billing update. Restore access through Stripe portal or restart checkout."
      : entitlementStatus === "canceled"
        ? "Your previous subscription is canceled. Reactivate to unlock premium features again."
        : "Subscription access is managed through Stripe checkout. Activate a plan to unlock full app access.";

  return (
    <div className="stats-page policy-page billing-page">
      <section className="stats-page-card policy-page-hero billing-page-hero-card">
        <p className="stats-page-eyebrow">Billing</p>
        <h1>Billing</h1>
        <p className="stats-page-subtitle">{subtitle}</p>
        <div className="billing-hero-meta">
          <span className="billing-hero-chip">Stripe Checkout</span>
          <span className="billing-hero-chip">Org Entitlements</span>
          <span className="billing-hero-chip">Promo Support</span>
        </div>
      </section>

      {billingLoadFailed && (
        <section className="stats-page-card policy-page-section billing-page-section">
          <EmptyState
            title="Billing details unavailable"
            message={status}
            actions={(
              <>
                <button
                  type="button"
                  className="shell-nav-link shell-nav-link-active"
                  onClick={() => setBillingRefreshKey((value) => value + 1)}
                  disabled={loading}
                >
                  {loading ? "Trying Again..." : "Try Again"}
                </button>
                <button
                  type="button"
                  className="shell-nav-link"
                  onClick={() => onNavigate("/stats/settings")}
                >
                  Back to Settings
                </button>
              </>
            )}
          />
        </section>
      )}

      {!billingLoadFailed && showPortal && (
        <section className="stats-page-card policy-page-section billing-page-section">
          <h3 className="policy-section-heading">Manage Subscription</h3>
          <p className="stats-page-subcopy policy-section-body">{status}</p>
          <ul className="policy-section-list">
            <li>View and manage your subscription in the Stripe billing portal.</li>
            <li>Update your payment method or billing address.</li>
            <li>Cancel or change your plan anytime.</li>
          </ul>
        </section>
      )}

      {!billingLoadFailed && showCheckout && (
        <>
          <section className="stats-page-card policy-page-section billing-page-section billing-page-promo">
            <h3 className="policy-section-heading">Have a Promo Code?</h3>
            <p className="stats-page-subcopy policy-section-body">Enter your coupon code to get a discount on your first plan.</p>
            <form onSubmit={(e) => void validateAndApplyCoupon(e)} className="coupon-form">
              <div className="coupon-form-row">
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
                  className="coupon-input"
                />
                <button
                  type="submit"
                  disabled={validatingCoupon || !couponCode.trim()}
                  className="bta-btn bta-btn-primary bta-btn-sm billing-coupon-apply"
                >
                  {validatingCoupon ? "Validating..." : "Apply"}
                </button>
              </div>
              {couponStatus && <p className="bta-status bta-status-success">{couponStatus}</p>}
              {couponError && <p className="bta-status bta-status-error">{couponError}</p>}
            </form>
          </section>

          <section className="stats-page-card policy-page-section billing-page-section">
            <h3 className="policy-section-heading">{checkoutSectionTitle}</h3>
            <p className="stats-page-subcopy policy-section-body">{status}</p>
            <ul className="policy-section-list">
              <li>Monthly and yearly checkout are available in Stripe-hosted checkout.</li>
              <li>After checkout, return to the dashboard and refresh if access does not update immediately.</li>
              {(entitlementStatus === "past_due" || entitlementStatus === "unpaid") && (
                <li>Past-due access can recover automatically after successful payment confirmation.</li>
              )}
            </ul>
          </section>
        </>
      )}

      <section className="stats-page-card policy-page-section billing-page-section">
        <h3 className="policy-section-heading">Current Rollout</h3>
        <p className="stats-page-subcopy policy-section-body">This phase includes core checkout and subscription management.</p>
        <ul className="policy-section-list">
          <li>Hosted checkout for monthly and yearly plans</li>
          <li>Org-level entitlement and billing portal</li>
          <li>Subscription-based paywall enforcement</li>
          <li>Promo code support</li>
        </ul>
      </section>

      <section className="stats-page-card policy-page-actions-wrap billing-page-actions-wrap">
        <div className="policy-page-actions billing-page-actions">
          {showPortal && (
            <button type="button" className="shell-nav-link shell-nav-link-active billing-cta-button billing-cta-button-primary" onClick={() => void openPortal()}>
              {submittingPortal ? "Opening Portal..." : "Manage Subscription"}
            </button>
          )}
          {showCheckout && (
            <>
              <button
                type="button"
                className="shell-nav-link shell-nav-link-active billing-cta-button billing-cta-button-primary"
                onClick={() => void startCheckout("monthly")}
                disabled={submittingCycle !== null}
              >
                {submittingCycle === "monthly" ? "Starting Monthly..." : `${checkoutLabel} (Monthly)`}
              </button>
              <button
                type="button"
                className="shell-nav-link billing-cta-button billing-cta-button-secondary"
                onClick={() => void startCheckout("yearly")}
                disabled={submittingCycle !== null}
              >
                {submittingCycle === "yearly" ? "Starting Yearly..." : `${checkoutLabel} (Yearly)`}
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
      subtitle="Starter admin surface for operations. This page is intentionally read-only while management tools are phased in."
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
