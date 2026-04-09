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
      subtitle="Formal legal terms are coming soon. This preproduction page will be replaced with counsel-reviewed terms before production launch."
      bullets={[
        "Scope of use and acceptable use policy",
        "Account responsibilities and termination terms",
        "Liability and service limitation language",
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
      subtitle="Quick-start guidance for coaches and operators during preproduction rollout."
      bullets={[
        "Game-day setup checklist and pairing steps",
        "Live sync troubleshooting for operator and coach devices",
        "Stat entry workflow and correction tips",
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
      subtitle="Data handling details are being finalized for preproduction."
      bullets={[
        "What data is collected and why",
        "How long data is retained and when it is deleted",
        "How to request data export and deletion",
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
      subtitle="Need account or team data removed? Submit a request and we will process it manually during preproduction."
      bullets={[
        "Include account email and school name in your request",
        "Deletion requests are reviewed and confirmed by support",
        "Pilot response target: 3-5 business days",
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
      subtitle="Billing is not live yet. Pricing is currently pilot-based."
      bullets={[
        "Contact for pilot pricing",
        "Plan and invoice management modules coming soon",
        "Usage and renewal details will appear here once billing is active",
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
