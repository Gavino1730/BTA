import { PublicSiteChrome } from "./PublicSiteChrome.js";

interface RouteShellPageProps {
  onNavigate: (path: string) => void;
  title: string;
  subtitle: string;
  onPrimary?: () => void;
  primaryLabel?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
  bullets?: string[];
}

interface PolicySection {
  heading: string;
  body: string;
  bullets?: string[];
}

function RouteShellPage({
  onNavigate,
  title,
  subtitle,
  onPrimary,
  primaryLabel,
  onSecondary,
  secondaryLabel,
  bullets = [],
}: RouteShellPageProps) {
  return (
    <PublicSiteChrome onNavigate={onNavigate}>
      <main className="mkt-detail-main">
        <section className="stats-page-card" style={{ maxWidth: "760px", margin: "0 auto" }}>
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
      </main>
    </PublicSiteChrome>
  );
}

interface RoutedPageProps {
  onNavigate: (path: string) => void;
}

interface MarketingSection {
  title: string;
  body: string;
  bullets: string[];
}

interface PublicMarketingPageProps {
  title: string;
  subtitle: string;
  kicker: string;
  sections: MarketingSection[];
  onNavigate: (path: string) => void;
  primaryLabel: string;
  primaryPath: string;
  secondaryLabel: string;
  secondaryPath: string;
}

function PublicMarketingPage({
  title,
  subtitle,
  kicker,
  sections,
  onNavigate,
  primaryLabel,
  primaryPath,
  secondaryLabel,
  secondaryPath,
}: PublicMarketingPageProps) {
  return (
    <PublicSiteChrome onNavigate={onNavigate}>
      <main className="mkt-detail-main">
        <section className="mkt-detail-hero">
          <span className="mkt-badge">{kicker}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <div className="mkt-hero-actions">
            <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => onNavigate(primaryPath)}>{primaryLabel}</button>
            <button type="button" className="mkt-btn mkt-btn-ghost" onClick={() => onNavigate(secondaryPath)}>{secondaryLabel}</button>
          </div>
        </section>

        <section className="mkt-detail-grid">
          {sections.map((section) => (
            <article key={section.title} className="mkt-detail-card">
              <h2>{section.title}</h2>
              <p>{section.body}</p>
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </main>
    </PublicSiteChrome>
  );
}

interface PolicyContentPageProps {
  onNavigate: (path: string) => void;
  title: string;
  subtitle: string;
  sections: PolicySection[];
  onPrimary?: () => void;
  primaryLabel?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
}

function PolicyContentPage({
  onNavigate,
  title,
  subtitle,
  sections,
  onPrimary,
  primaryLabel,
  onSecondary,
  secondaryLabel,
}: PolicyContentPageProps) {
  return (
    <PublicSiteChrome onNavigate={onNavigate}>
      <main className="mkt-detail-main">
        <section className="stats-page policy-page">
          <section className="stats-page-card policy-page-hero">
            <p className="stats-page-eyebrow">Preproduction Policy Draft</p>
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
        </section>
      </main>
    </PublicSiteChrome>
  );
}

export function TermsPage({ onNavigate }: RoutedPageProps) {
  return (
    <PolicyContentPage
      onNavigate={onNavigate}
      title="Terms of Service"
      subtitle="These pilot terms describe acceptable use, data responsibilities, and service expectations during preproduction. They apply to all coaches, operators, and staff accounts using this environment."
      sections={[
        {
          heading: "1) Authorized Use and Access",
          body: "Platform access is provided for school basketball operations, live stat capture, analytics review, and internal coaching collaboration.",
          bullets: [
            "Do not share credentials outside your organization or allow unauthorized users to access school data.",
            "Use only approved school identifiers and organization context when creating games or managing members.",
            "Do not attempt to bypass role controls, tenant scope, or audit protections.",
          ],
        },
        {
          heading: "2) Account and Security Responsibilities",
          body: "Organization admins are responsible for account lifecycle management during pilot use.",
          bullets: [
            "Reset temporary passwords promptly and remove unused accounts after staffing changes.",
            "Review invited and active members regularly to prevent stale access.",
            "Report suspicious activity through the contact channel with school ID and incident context.",
          ],
        },
        {
          heading: "3) Service Scope During Preproduction",
          body: "Pilot workflows are operational but can change as reliability and product improvements are deployed.",
          bullets: [
            "Features may be adjusted without long deprecation cycles during pilot hardening.",
            "Temporary disruptions can occur during maintenance, migrations, or recovery drills.",
            "Schools should review game output before treating reports as final records.",
          ],
        },
        {
          heading: "4) Liability and Enforcement",
          body: "Pilot features are provided as-is for evaluation and operations support.",
          bullets: [
            "Platform operators may suspend access for misuse or policy violations.",
            "Organizations remain responsible for internal compliance with school and district standards.",
          ],
        },
      ]}
      onPrimary={() => onNavigate("/privacy")}
      primaryLabel="View Privacy Policy"
      onSecondary={() => onNavigate("/")}
      secondaryLabel="Back to Home"
    />
  );
}

export function FeaturesPage({ onNavigate }: RoutedPageProps) {
  return (
    <PublicMarketingPage
      kicker="Product Overview"
      title="Features built for real game pressure"
      subtitle="BTA combines live game context, analytics, and team operations in one professional workflow coaches can trust."
      onNavigate={onNavigate}
      primaryLabel="Get Started"
      primaryPath="/login"
      secondaryLabel="About BTA"
      secondaryPath="/about"
      sections={[
        {
          title: "Live Game Command",
          body: "See scoreflow, possession context, and key events with minimal delay from the operator device.",
          bullets: [
            "Real-time event fanout from iPad entry to coach dashboard",
            "Correction workflows that preserve replay-safe state",
            "Connection and sync signals visible during active games",
          ],
        },
        {
          title: "Season Analytics Workspace",
          body: "Turn every game into actionable trend visibility for players, lineups, and team outcomes.",
          bullets: [
            "Player and game-level trend views across the season",
            "Insight support for momentum and rotation decisions",
            "Consistent derived metrics from deterministic game state",
          ],
        },
        {
          title: "Team Operations",
          body: "Manage roster, roles, and support actions in one school-scoped environment.",
          bullets: [
            "Role-based access for admin, coach, operator, and player",
            "Roster and member administration in the same shell",
            "Built-in help, policy, and support access",
          ],
        },
      ]}
    />
  );
}

export function AboutPage({ onNavigate }: RoutedPageProps) {
  return (
    <PublicMarketingPage
      kicker="About"
      title="A platform focused on reliability and coaching clarity"
      subtitle="BTA is purpose-built for high school basketball programs that need dependable live operations and practical analytics."
      onNavigate={onNavigate}
      primaryLabel="View Features"
      primaryPath="/features"
      secondaryLabel="Back To Home"
      secondaryPath="/"
      sections={[
        {
          title: "What We Build",
          body: "One connected platform where events are captured once and shared across staff in a trusted state.",
          bullets: [
            "Realtime stat capture and coach dashboard fanout",
            "Deterministic replay model for correction safety",
            "Game-day and season insight support",
          ],
        },
        {
          title: "Who It Serves",
          body: "Designed for varsity, JV, and development programs that need cleaner data and faster decisions.",
          bullets: [
            "Coaches managing live decisions from the bench",
            "Operators capturing events on the iPad workflow",
            "Program staff reviewing development and performance",
          ],
        },
        {
          title: "Current Focus",
          body: "Preproduction work is centered on reliability, usability, and operator confidence.",
          bullets: [
            "Game-day reliability hardening",
            "Clearer onboarding and support workflows",
            "Higher-quality exports and team operations tooling",
          ],
        },
      ]}
    />
  );
}

export function HelpCenterPage({ onNavigate }: RoutedPageProps) {
  return (
    <PolicyContentPage
      onNavigate={onNavigate}
      title="Help Center"
      subtitle="Use this page as the first stop for game-day setup, troubleshooting, and escalation during preproduction."
      sections={[
        {
          heading: "Game-Day Setup Checklist",
          body: "Run this sequence before each event to reduce avoidable sync and roster issues.",
          bullets: [
            "Confirm school context and active account role in the coach dashboard.",
            "Verify roster completeness and jersey numbers in team settings.",
            "Pair operator device using current connection code and active game ID.",
          ],
        },
        {
          heading: "Live Troubleshooting",
          body: "When sync status appears stuck, focus on game binding and connectivity first.",
          bullets: [
            "Check that coach and operator are on the same game session.",
            "Refresh the coach live page and verify operator console remains connected.",
            "If score divergence appears, use correction tools and confirm event feed order.",
          ],
        },
        {
          heading: "Post-Game Review",
          body: "Review and correct data before sharing stats externally.",
          bullets: [
            "Audit final score, key events, and player lines in Games.",
            "Resolve foul/rotation anomalies while context is still fresh.",
            "Capture unresolved incidents in Support with game ID and severity.",
          ],
        },
      ]}
      onPrimary={() => onNavigate("/support")}
      primaryLabel="Open Support Hub"
      onSecondary={() => onNavigate("/")}
      secondaryLabel="Back to Home"
    />
  );
}

export function DocsCenterPage({ onNavigate }: RoutedPageProps) {
  return (
    <PolicyContentPage
      onNavigate={onNavigate}
      title="Docs Center"
      subtitle="Structured guides for setup, game operations, and troubleshooting. This is the dedicated documentation hub for preproduction."
      sections={[
        {
          heading: "Quickstart Guides",
          body: "Use these first when onboarding a new team or staff member.",
          bullets: [
            "Create account and complete team setup",
            "Build roster and verify jersey numbers",
            "Pair operator device and start live session",
          ],
        },
        {
          heading: "Game-Day Operations",
          body: "Operational checklists designed for reliability under live pressure.",
          bullets: [
            "Pre-tip connection and sync checks",
            "In-game correction workflow and event audit habits",
            "Post-game verification before sharing reports",
          ],
        },
        {
          heading: "Troubleshooting Library",
          body: "Common failure modes and expected recovery paths.",
          bullets: [
            "Device offline and queue replay handling",
            "Role and access mismatch recovery",
            "Escalation path with required support details",
          ],
        },
      ]}
      onPrimary={() => onNavigate("/help")}
      primaryLabel="Open Help Center"
      onSecondary={() => onNavigate("/support")}
      secondaryLabel="Open Support"
    />
  );
}

export function PrivacyPage({ onNavigate }: RoutedPageProps) {
  return (
    <PolicyContentPage
      onNavigate={onNavigate}
      title="Privacy Policy"
      subtitle="This preproduction privacy summary explains what operational data is collected, how it is used, and how deletion/export requests are handled."
      sections={[
        {
          heading: "1) Data We Collect",
          body: "Operational data is collected to run game workflows and organization management.",
          bullets: [
            "Identity data: names, emails, roles, and account metadata.",
            "Team data: roster profiles, organization details, and settings.",
            "Game data: live events, game summaries, and derived analytics.",
            "Support data: intake form details used for triage and follow-up.",
          ],
        },
        {
          heading: "2) How Data Is Used",
          body: "Data is processed to provide platform functionality and reliability support.",
          bullets: [
            "Power live stat entry, realtime dashboard updates, and historical analytics.",
            "Enforce role-based access and organization membership controls.",
            "Diagnose incidents and improve system stability during pilot.",
          ],
        },
        {
          heading: "3) Access and Retention",
          body: "Data is school-scoped and retained for pilot operations unless deletion is requested.",
          bullets: [
            "Only authorized members within a school context can access its data.",
            "Retention may extend through pilot analysis windows and reliability review cycles.",
            "Deletion and export requests are handled through manual support workflows.",
          ],
        },
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
    <PolicyContentPage
      onNavigate={onNavigate}
      title="Data Deletion Request"
      subtitle="Request deletion of account, roster, or game data for your school tenant. Deletions are reviewed manually during preproduction to prevent accidental loss."
      sections={[
        {
          heading: "Request Requirements",
          body: "Provide enough context to prevent accidental deletion and speed verification.",
          bullets: [
            "School ID and organization name",
            "Affected account emails or game IDs",
            "Requested deletion scope: account, roster, selected games, or full tenant",
          ],
        },
        {
          heading: "Review and Confirmation",
          body: "Support validates scope with an authorized admin before execution.",
          bullets: [
            "Full tenant deletion requires explicit admin signoff.",
            "Execution window and irreversible impact are confirmed before action.",
            "Completion confirmation is sent once deletion finishes.",
          ],
        },
        {
          heading: "Response Targets",
          body: "Service targets are designed for pilot operations, not legal SLAs.",
          bullets: [
            "Acknowledgement target: within 1 business day",
            "Completion target: 3-5 business days depending on scope",
            "Critical game-day issues should be stabilized through Support before deletion requests.",
          ],
        },
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
      onNavigate={onNavigate}
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
      onNavigate={onNavigate}
      title="Contact"
      subtitle="Direct support and pilot inquiries are handled manually in preproduction."
      bullets={[
        "Support email: support@bta.local (replace before production)",
        "Pilot request workflow is coming soon",
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
    <PolicyContentPage
      onNavigate={onNavigate}
      title="Billing"
      subtitle="Billing is still pilot-managed. This page outlines current pricing workflow and what billing controls will be available at launch."
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
      onPrimary={() => onNavigate("/contact")}
      primaryLabel="Contact for Pilot"
      onSecondary={() => onNavigate("/live")}
      secondaryLabel="Back to Dashboard"
    />
  );
}

export function AdminPage({ onNavigate }: RoutedPageProps) {
  return (
    <PolicyContentPage
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
            "Support queue and unresolved incident summary (planned)",
            "Security metric snapshot from existing API endpoints",
            "Factory reset guardrails and confirmation policy (planned)",
          ],
        },
        {
          heading: "Audit and Compliance",
          body: "Operational changes should remain traceable as admin capabilities expand.",
          bullets: [
            "Audit log timeline integration (planned)",
            "Environment change annotations (planned)",
            "Runbook links for incident response and recovery",
          ],
        },
      ]}
      onPrimary={() => onNavigate("/stats/settings")}
      primaryLabel="Open Team Settings"
      onSecondary={() => onNavigate("/support")}
      secondaryLabel="Open Support"
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
