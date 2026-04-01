interface MarketingPageProps {
  onNavigate: (path: string) => void;
  isAuthenticated?: boolean;
}

export function MarketingPage({ onNavigate, isAuthenticated = false }: MarketingPageProps) {
  return (
    <div className="marketing-page">
      <header className="marketing-header">
        <div>
          <p className="stats-page-eyebrow">Basketball Team Assistant</p>
          <h1 className="marketing-logo">BTA Courtside</h1>
        </div>
        <div className="marketing-header-actions">
          {isAuthenticated && (
            <button type="button" className="shell-nav-link" onClick={() => onNavigate("/live")}>
              Open Dashboard
            </button>
          )}
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => onNavigate("/login")}>
            Login / Sign In
          </button>
        </div>
      </header>

      <main className="marketing-main">
        <section className="marketing-hero stats-page-card">
          <div>
            <span className="marketing-badge">Live stats + AI insights</span>
            <h2>Run your basketball program from one simple coach dashboard.</h2>
            <p className="stats-page-subtitle">
              Track games live, sync roster data, review trends, and keep everything tied to the correct coach account.
            </p>
            <div className="marketing-hero-actions">
              <button
                type="button"
                className="shell-nav-link shell-nav-link-active"
                onClick={() => onNavigate("/login")}
              >
                {isAuthenticated ? "Enter Coach Dashboard" : "Sign In"}
              </button>
              <a href="#features" className="shell-nav-link">See Features</a>
            </div>
          </div>
          <div className="marketing-hero-panel">
            <strong>Perfect for:</strong>
            <ul className="marketing-list">
              <li>High school basketball programs</li>
              <li>Live bench-side decision making</li>
              <li>Shared team and player data across devices</li>
            </ul>
          </div>
        </section>

        <section id="features" className="marketing-grid">
          <article className="marketing-card stats-page-card">
            <p className="stats-page-eyebrow">Live Game Day</p>
            <h3>Realtime score + event capture</h3>
            <p className="stats-page-subcopy">
              Connect the operator iPad to the coach dashboard and see live game information update as it happens.
            </p>
          </article>
          <article className="marketing-card stats-page-card">
            <p className="stats-page-eyebrow">Coaching Tools</p>
            <h3>Trends, players, and AI prompts</h3>
            <p className="stats-page-subcopy">
              Review player impact, game momentum, and quick AI-generated insights during and after games.
            </p>
          </article>
          <article className="marketing-card stats-page-card">
            <p className="stats-page-eyebrow">Secure Access</p>
            <h3>Each coach sees their own workspace</h3>
            <p className="stats-page-subcopy">
              Sign in with your account to access the team setup and dashboard information associated with you.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
