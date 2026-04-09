interface RouteShellPageProps {
  title: string;
  subtitle: string;
  onPrimary?: () => void;
  primaryLabel?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
  bullets?: string[];
}

function RouteShellPage({
  title,
  subtitle,
  onPrimary,
  primaryLabel,
  onSecondary,
  secondaryLabel,
  bullets = [],
}: RouteShellPageProps) {
  return (
    <div className="stats-page">
      <section className="stats-page-card" style={{ maxWidth: "760px", margin: "2.5rem auto" }}>
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

interface RoutedPageProps {
  onNavigate: (path: string) => void;
}

export function TermsPage({ onNavigate }: RoutedPageProps) {
  return (
    <RouteShellPage
      title="Terms of Service"
      subtitle="These pilot terms describe acceptable use, data responsibilities, and service expectations during preproduction. They apply to all coaches, operators, and staff accounts using this environment."
      bullets={[
        "Authorized use: This platform is for school basketball operations, roster management, and game analytics. Do not use it for unlawful activity or unauthorized account access.",
        "Account security: Keep credentials private, rotate temporary passwords quickly, and remove access for staff who no longer need team data.",
        "Data accuracy: Coaches are responsible for verifying game entries, corrections, and submitted reports before external sharing.",
        "Service level during pilot: Features may change rapidly, and temporary downtime or resets can occur while reliability work is in progress.",
        "Termination and access control: Admins can revoke member access at any time; platform operators may suspend accounts that violate policy.",
        "Liability scope: Pilot features are provided as-is for evaluation, and should not be treated as the sole official record without coach review.",
      ]}
      onPrimary={() => onNavigate("/privacy")}
      primaryLabel="View Privacy Policy"
      onSecondary={() => onNavigate("/")}
      secondaryLabel="Back to Home"
    />
  );
}

export function HelpCenterPage({ onNavigate }: RoutedPageProps) {
  return (
    <RouteShellPage
      title="Help Center"
      subtitle="Use this page as the first stop for game-day setup, troubleshooting, and escalation during preproduction."
      bullets={[
        "Game-day checklist: confirm school scope, roster readiness, operator pairing code, and active game session before tip-off.",
        "Live sync troubleshooting: if dashboard status is waiting/offline, verify both devices are on the same game and refresh from Live page.",
        "Stat correction flow: use game event corrections quickly during play, then run a post-game review in Games before final submission.",
        "Account access issues: use Forgot Password, then contact support with school ID and impacted account email if reset fails.",
        "Escalation path: critical game-day failures should be sent through Support with severity and callback details for faster triage.",
      ]}
      onPrimary={() => onNavigate("/support")}
      primaryLabel="Open Support Hub"
      onSecondary={() => onNavigate("/")}
      secondaryLabel="Back to Home"
    />
  );
}

export function PrivacyPage({ onNavigate }: RoutedPageProps) {
  return (
    <RouteShellPage
      title="Privacy Policy"
      subtitle="This preproduction privacy summary explains what operational data is collected, how it is used, and how deletion/export requests are handled."
      bullets={[
        "Collected data: account identity, organization membership, roster data, game events, game summaries, and support/contact intake details.",
        "Purpose of processing: provide live game workflows, team analytics, access control, and operational support.",
        "Access model: data is tenant-scoped by school context; authorized members can view and manage their own organization records.",
        "Retention: pilot data may be retained for product validation and reliability testing, then pruned according to school requests.",
        "Security expectations: password-based access, role checks, and scoped API behavior are enforced, but pilot environments should still be treated with caution.",
        "Your controls: admins can remove users, request data deletion, and contact support for export/deletion review.",
      ]}
      onPrimary={() => onNavigate("/contact")}
      primaryLabel="Contact Support"
      onSecondary={() => onNavigate("/")}
      secondaryLabel="Back to Home"
    />
  );
}

export function DataDeletionPage({ onNavigate }: RoutedPageProps) {
  return (
    <RouteShellPage
      title="Data Deletion Request"
      subtitle="Request deletion of account, roster, or game data for your school tenant. Deletions are reviewed manually during preproduction to prevent accidental loss."
      bullets={[
        "Include school ID, affected account emails, and specific data categories (accounts, roster, games, or full tenant reset).",
        "If requesting full tenant deletion, include an admin confirmation and a preferred execution window.",
        "Support will confirm request scope before execution and provide completion confirmation when finished.",
        "Pilot response target: acknowledgement within 1 business day, completion target within 3-5 business days.",
        "For urgent corrections during active events, use Support first so operations can stabilize before deletion actions.",
      ]}
      onPrimary={() => onNavigate("/contact")}
      primaryLabel="Request Deletion"
      onSecondary={() => onNavigate("/privacy")}
      secondaryLabel="Back to Privacy"
    />
  );
}

export function SupportPage({ onNavigate }: RoutedPageProps) {
  return (
    <RouteShellPage
      title="Support"
      subtitle="Support center is in preproduction. Use this page as the central place for help, bug reports, and feature requests."
      bullets={[
        "FAQ and setup help are being expanded",
        "Bug report and feature request forms are coming soon",
        "Expected response window: 1-2 business days during pilot",
      ]}
      onPrimary={() => onNavigate("/contact")}
      primaryLabel="Contact Support"
      onSecondary={() => onNavigate("/login")}
      secondaryLabel="Coach Login"
    />
  );
}

export function ContactPage({ onNavigate }: RoutedPageProps) {
  return (
    <RouteShellPage
      title="Contact"
      subtitle="Direct support and pilot inquiries are handled manually in preproduction."
      bullets={[
        "Support email: support@bta.local (replace before production)",
        "Pilot/demo request workflow is coming soon",
        "Status page link will be added before launch",
      ]}
      onPrimary={() => onNavigate("/support")}
      primaryLabel="Open Support"
      onSecondary={() => onNavigate("/")}
      secondaryLabel="Back to Home"
    />
  );
}

export function BillingPage({ onNavigate }: RoutedPageProps) {
  return (
    <RouteShellPage
      title="Billing"
      subtitle="Billing is still pilot-managed. This page outlines current pricing workflow and what billing controls will be available at launch."
      bullets={[
        "Pilot pricing and renewal terms are handled through direct school agreements.",
        "Invoice and payment portal access is not yet self-serve in this environment.",
        "Planned launch features: plan selection, seat tracking, invoice history, and downloadable receipts.",
        "Subscription alerts and renewal reminders will appear in Notifications once billing integrations are live.",
      ]}
      onPrimary={() => onNavigate("/contact")}
      primaryLabel="Contact for Pilot"
      onSecondary={() => onNavigate("/live")}
      secondaryLabel="Back to Dashboard"
    />
  );
}

export function UserSettingsPage({ onNavigate }: RoutedPageProps) {
  return (
    <RouteShellPage
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
