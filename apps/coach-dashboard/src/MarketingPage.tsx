interface MarketingPageProps {
  onNavigate: (path: string) => void;
  isAuthenticated?: boolean;
}

const featureCards = [
  {
    eyebrow: "Live Game Day",
    title: "Track the game live",
    copy: "See score, momentum, and key events update in real time.",
  },
  {
    eyebrow: "Coach Workflow",
    title: "Keep everything in one dashboard",
    copy: "Roster, live game view, and team insights stay connected.",
  },
  {
    eyebrow: "Secure Access",
    title: "Each coach gets their own login",
    copy: "Team info stays tied to the correct account and workspace.",
  },
  {
    eyebrow: "Coming Soon",
    title: "Private preview in progress",
    copy: "The platform is still being polished before public release.",
  },
];

const workflowSteps = [
  {
    step: "01",
    title: "Sign in",
    copy: "Enter the coach dashboard with your account.",
  },
  {
    step: "02",
    title: "Connect the iPad",
    copy: "Pair the operator device for live stat entry.",
  },
  {
    step: "03",
    title: "Coach with live data",
    copy: "Use the dashboard during the game and review later.",
  },
];

export function MarketingPage({ onNavigate, isAuthenticated = false }: MarketingPageProps) {
  return (
    <div className="marketing-page">
      <header className="marketing-header">
        <div className="marketing-brand-lockup">
          <div>
            <p className="stats-page-eyebrow">Basketball Team Assistant</p>
            <h1 className="marketing-logo">BTA Courtside</h1>
          </div>
          <span className="marketing-coming-pill">Coming Soon</span>
        </div>
        <div className="marketing-header-actions">
          <a href="#features" className="shell-nav-link">Features</a>
          <a href="#how-it-works" className="shell-nav-link">How It Works</a>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate(isAuthenticated ? "/live" : "/login")}>
            Open Dashboard
          </button>
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => onNavigate("/login")}>
            Sign In
          </button>
        </div>
      </header>

      <main className="marketing-main">
        <section className="marketing-hero stats-page-card">
          <div className="marketing-hero-copy">
            <span className="marketing-badge">Private preview · not released yet</span>
            <h2>
              Live basketball stats and <span className="marketing-gradient-text">coach insights</span> in one place.
            </h2>
            <p className="stats-page-subtitle">
              A simple coach dashboard for tracking games live, syncing the operator iPad, and reviewing team trends.
            </p>
            <div className="marketing-hero-actions">
              <button
                type="button"
                className="shell-nav-link"
                onClick={() => onNavigate(isAuthenticated ? "/live" : "/login")}
              >
                Open Dashboard
              </button>
              <button
                type="button"
                className="shell-nav-link shell-nav-link-active"
                onClick={() => onNavigate("/login")}
              >
                Sign In
              </button>
            </div>
            <div className="marketing-trust-row">
              <span className="marketing-trust-pill">Coming soon</span>
              <span className="marketing-trust-pill">Live game tracking</span>
              <span className="marketing-trust-pill">iPad sync</span>
            </div>
          </div>

          <div className="marketing-hero-stack">
            <article className="marketing-hero-panel">
              <strong>What it does</strong>
              <ul className="marketing-list">
                <li>Tracks games live from the bench</li>
                <li>Connects coaches and operators</li>
                <li>Keeps team info under one login</li>
              </ul>
            </article>
            <article className="marketing-highlight-card">
              <span className="marketing-highlight-label">Status</span>
              <div className="marketing-highlight-row">
                <strong>Coming soon</strong>
                <p>BTA is still in private development and not publicly released yet.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="marketing-stats-row">
          <article className="marketing-stat-card">
            <strong>Live</strong>
            <span>Game data as it happens</span>
          </article>
          <article className="marketing-stat-card">
            <strong>Fast</strong>
            <span>Simple workflow for coaches</span>
          </article>
          <article className="marketing-stat-card">
            <strong>Secure</strong>
            <span>Account-based dashboard access</span>
          </article>
          <article className="marketing-stat-card">
            <strong>Soon</strong>
            <span>Public release is still ahead</span>
          </article>
        </section>

        <section id="features" className="marketing-section">
          <div className="marketing-section-head">
            <p className="stats-page-eyebrow">Everything in one place</p>
            <h3>A better way to run the bench</h3>
            <p className="stats-page-subcopy">
              One simple system for live stats, team access, and quick coaching context.
            </p>
          </div>
          <div className="marketing-grid marketing-grid-six">
            {featureCards.map((feature) => (
              <article key={feature.title} className="marketing-card stats-page-card">
                <p className="stats-page-eyebrow">{feature.eyebrow}</p>
                <h4>{feature.title}</h4>
                <p className="stats-page-subcopy">{feature.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="marketing-section marketing-workflow stats-page-card">
          <div className="marketing-section-head">
            <p className="stats-page-eyebrow">How it works</p>
            <h3>Simple setup for a coming-soon coach platform</h3>
          </div>
          <div className="marketing-workflow-grid">
            {workflowSteps.map((item) => (
              <article key={item.step} className="marketing-workflow-card">
                <span className="marketing-step-badge">{item.step}</span>
                <h4>{item.title}</h4>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-cta stats-page-card">
          <div>
            <p className="stats-page-eyebrow">Coming soon</p>
            <h3>BTA is still in development and preparing for release.</h3>
            <p className="stats-page-subcopy">
              Sign in to access the coach dashboard when your account is enabled.
            </p>
          </div>
          <div className="marketing-header-actions">
            <button type="button" className="shell-nav-link" onClick={() => onNavigate(isAuthenticated ? "/live" : "/login")}>
              Open Dashboard
            </button>
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => onNavigate("/login")}>
              Sign In
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
