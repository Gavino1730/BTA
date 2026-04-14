interface MarketingPageProps {
  onNavigate: (path: string) => void;
  isAuthenticated: boolean;
}

interface DemoPageProps {
  onNavigate: (path: string) => void;
}

export function MarketingPage({ onNavigate, isAuthenticated }: MarketingPageProps) {
  const primaryPath = isAuthenticated ? "/live" : "/login";
  const primaryLabel = isAuthenticated ? "Open Live Dashboard" : "Coach Login";

  return (
    <div className="stats-page">
      <section className="stats-page-card" style={{ maxWidth: "840px", margin: "0 auto" }}>
        <p className="stats-page-eyebrow">BTA Courtside</p>
        <h1>Realtime High School Basketball Intelligence</h1>
        <p className="stats-page-subtitle">
          Capture every possession from the operator console and stream live game context to coaches,
          players, and season analytics.
        </p>

        <div className="policy-page-actions" style={{ marginTop: "1rem" }}>
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => onNavigate(primaryPath)}>
            {primaryLabel}
          </button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/setup")}>
            Start Setup
          </button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/demo")}>
            Book Demo
          </button>
        </div>
      </section>
    </div>
  );
}

export function DemoPage({ onNavigate }: DemoPageProps) {
  return (
    <div className="stats-page">
      <section className="stats-page-card policy-page-hero" style={{ maxWidth: "840px", margin: "0 auto" }}>
        <p className="stats-page-eyebrow">Demo</p>
        <h1>Book A Demo</h1>
        <p className="stats-page-subtitle">Tell us about your team and we will follow up with scheduling details.</p>
        <div className="policy-page-actions" style={{ marginTop: "1rem" }}>
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => onNavigate("/login")}>
            Back to Login
          </button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/setup")}>
            Create Account
          </button>
        </div>
      </section>
    </div>
  );
}
