import { useMemo } from "react";

interface MarketingPageProps {
  onNavigate: (path: string) => void;
  isAuthenticated: boolean;
}

interface DemoPageProps {
  onNavigate: (path: string) => void;
}

export function MarketingPage({ onNavigate, isAuthenticated }: MarketingPageProps) {
  const primaryCta = useMemo(() => (isAuthenticated ? "/live" : "/login"), [isAuthenticated]);

  return (
    <div className="mkt-page">
      <header className="mkt-nav">
        <div className="mkt-nav-inner">
          <div className="mkt-brand" aria-label="BTA Courtside">
            <img className="auth-brand-logo" src="/brand-logo.png" alt="BTA Courtside" />
            <span className="mkt-brand-name">BTA Courtside</span>
          </div>
          <nav className="mkt-nav-links" aria-label="Marketing navigation">
            <button type="button" onClick={() => onNavigate("/demo")}>Live Demo</button>
            <button type="button" onClick={() => onNavigate("/login")}>Coach Login</button>
          </nav>
          <div className="mkt-nav-actions">
            <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => onNavigate(primaryCta)}>
              {isAuthenticated ? "Open Dashboard" : "Sign In"}
            </button>
          </div>
        </div>
      </header>

      <main className="mkt-hero">
        <section className="mkt-hero-inner">
          <div className="mkt-hero-copy">
            <span className="mkt-badge">Realtime Game Intelligence</span>
            <h1 className="mkt-h1">
              Run your sideline workflow in <span className="mkt-gradient-text">one live system</span>
            </h1>
            <p className="mkt-hero-sub">
              Courtside unifies operator input, coach context, and replay-safe game state so decision makers get
              trustworthy insights before the next possession.
            </p>
            <div className="mkt-hero-actions">
              <button type="button" className="mkt-btn mkt-btn-primary mkt-btn-lg" onClick={() => onNavigate("/login")}>
                Coach Login
              </button>
              <button type="button" className="mkt-btn mkt-btn-ghost mkt-btn-lg" onClick={() => onNavigate("/demo")}>
                View Demo
              </button>
            </div>
            <div className="mkt-trust-row" aria-label="Trust indicators">
              <span className="mkt-trust-pill">Deterministic replay</span>
              <span className="mkt-trust-pill">Realtime fanout</span>
              <span className="mkt-trust-pill">Game-day reliable</span>
            </div>
          </div>

          <aside className="mkt-hero-demo" aria-label="Live demo snapshot">
            <div className="mkt-demo-widget">
              <div className="mkt-demo-header">
                <span className="mkt-live-dot" aria-hidden="true" />
                <span className="mkt-live-label">Live Game Feed</span>
                <span className="mkt-demo-clock">Q3 · 2:18</span>
              </div>
              <div className="mkt-demo-scoreboard">
                <div className="mkt-demo-team mkt-demo-team-home">
                  <span className="mkt-demo-team-abbr">HOME</span>
                  <span className="mkt-demo-score mkt-demo-score-home">58</span>
                </div>
                <span className="mkt-demo-sep">:</span>
                <div className="mkt-demo-team mkt-demo-team-away">
                  <span className="mkt-demo-team-abbr">AWAY</span>
                  <span className="mkt-demo-score">54</span>
                </div>
              </div>
              <div className="mkt-demo-insight">Momentum shift detected after two-stop defensive run.</div>
              <div className="mkt-demo-recommendation">Recommendation: keep current lineup through next dead ball.</div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

export function DemoPage({ onNavigate }: DemoPageProps) {
  return (
    <div className="mkt-page">
      <section className="mkt-demo-banner">
        <div className="mkt-demo-page-nav">
          <span className="mkt-demo-page-title">BTA Courtside Demo</span>
          <div className="mkt-demo-page-actions">
            <button type="button" className="mkt-btn mkt-btn-ghost" onClick={() => onNavigate("/")}>Back Home</button>
            <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => onNavigate("/login")}>Coach Login</button>
          </div>
        </div>
      </section>

      <section className="mkt-demo-cta">
        <div className="mkt-demo-cta-inner">
          <h2>Interactive sideline intelligence preview</h2>
          <p>
            Continue to coach login to connect with live sessions, review synced game context, and access production
            analytics routes.
          </p>
          <div className="mkt-hero-actions">
            <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => onNavigate("/login")}>Continue to Login</button>
            <button type="button" className="mkt-btn mkt-btn-subtle" onClick={() => onNavigate("/")}>Return Home</button>
          </div>
        </div>
      </section>
    </div>
  );
}
