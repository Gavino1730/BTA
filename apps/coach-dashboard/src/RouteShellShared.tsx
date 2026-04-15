import type { ReactNode } from "react";

export interface RoutedPageProps {
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

interface AuthRouteFrameProps {
  subtitle: string;
  title: string;
  titleAccent: string;
  topbarSubtitle: string;
  primaryAction: ReactNode;
  secondaryAction?: ReactNode;
  children: ReactNode;
}

export function AuthRouteFrame({
  subtitle,
  title,
  titleAccent,
  topbarSubtitle,
  primaryAction,
  secondaryAction,
  children,
}: AuthRouteFrameProps) {
  return (
    <div className="auth-page auth-flow-page">
      <div className="auth-page-glow auth-page-glow-left" aria-hidden="true" />
      <div className="auth-page-glow auth-page-glow-right" aria-hidden="true" />

      <header className="auth-topbar auth-flow-topbar">
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

      <main className="auth-shell auth-shell-compact auth-flow-shell">
        <section className="auth-hero-panel auth-hero-panel-compact auth-flow-hero-panel">
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

export function ShellPage({
  title,
  subtitle,
  bullets = [],
  onPrimary,
  primaryLabel,
  onSecondary,
  secondaryLabel,
}: ShellPageProps) {
  return (
    <div className="stats-page">
      <section className="stats-page-card" style={{ maxWidth: "840px", margin: "0 auto" }}>
        <p className="stats-page-eyebrow">Platform</p>
        <h1>{title}</h1>
        <p className="stats-page-subtitle">{subtitle}</p>
        {bullets.length > 0 && (
          <ul style={{ marginTop: "0.75rem", lineHeight: 1.6, color: "rgba(232,234,240,0.85)" }}>
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        )}
        <div className="bta-shell-actions" style={{ marginTop: "1rem" }}>
          {onPrimary && primaryLabel ? (
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={onPrimary}>
              {primaryLabel}
            </button>
          ) : null}
          {onSecondary && secondaryLabel ? (
            <button type="button" className="shell-nav-link" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function PolicyPage({
  title,
  subtitle,
  sections,
  onPrimary,
  primaryLabel,
  onSecondary,
  secondaryLabel,
}: PolicyPageProps) {
  return (
    <div className="stats-page policy-page">
      <section className="stats-page-card policy-page-hero">
        <p className="stats-page-eyebrow">Platform</p>
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
          {onPrimary && primaryLabel ? (
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={onPrimary}>
              {primaryLabel}
            </button>
          ) : null}
          {onSecondary && secondaryLabel ? (
            <button type="button" className="shell-nav-link" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
