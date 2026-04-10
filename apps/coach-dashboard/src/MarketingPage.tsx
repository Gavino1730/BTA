import { useMemo, useState } from "react";
import { PublicSiteChrome } from "./PublicSiteChrome.js";

interface MarketingPageProps {
  onNavigate: (path: string) => void;
  isAuthenticated?: boolean;
}

type Scenario = {
  id: string;
  moment: string;
  problem: string;
  signal: string;
  recommendation: string;
  impact: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "clutch-run",
    moment: "Q4 1:32",
    problem: "Opponent cuts a 9-point lead to 3.",
    signal: "Momentum flips and your best scorer is 4/5 in last 3:00.",
    recommendation: "Run through #1 on the next two possessions.",
    impact: "Stops the run before the defense resets.",
  },
  {
    id: "lineup-slip",
    moment: "Q3 4:18",
    problem: "Two empty trips after timeout.",
    signal: "Current lineup is -7 in last 3 minutes.",
    recommendation: "Swap to high-assist unit for next rotation.",
    impact: "Stabilizes offense and improves shot quality.",
  },
  {
    id: "end-half",
    moment: "Q2 0:49",
    problem: "Need one clean final possession.",
    signal: "Best half-court efficiency is left-wing action.",
    recommendation: "Go back to that action before halftime.",
    impact: "Converts a high-value possession under pressure.",
  },
];

function LiveMomentPanel({ scenario }: { scenario: Scenario }) {
  return (
    <aside className="mkt-live-panel" aria-label="Live game moment">
      <header className="mkt-live-head">
        <span className="mkt-live-chip">LIVE</span>
        <span>{scenario.moment}</span>
      </header>
      <div className="mkt-live-body">
        <p><strong>Problem:</strong> {scenario.problem}</p>
        <p><strong>Signal:</strong> {scenario.signal}</p>
        <p className="mkt-live-reco"><strong>Call:</strong> {scenario.recommendation}</p>
        <p><strong>Why it matters:</strong> {scenario.impact}</p>
      </div>
    </aside>
  );
}

export function MarketingPage({ onNavigate, isAuthenticated = false }: MarketingPageProps) {
  const [activeId, setActiveId] = useState<string>(SCENARIOS[0]?.id ?? "");
  const active = useMemo(
    () => SCENARIOS.find((scenario) => scenario.id === activeId) ?? SCENARIOS[0],
    [activeId],
  );

  return (
    <PublicSiteChrome onNavigate={onNavigate}>
      <main className="mkt-home">
        <section className="mkt-home-hero">
          <div className="mkt-home-copy">
            <p className="mkt-home-kicker">Built for high school basketball programs</p>
            <h1>Know what call to make before the next possession starts.</h1>
            <p>
              BTA is for during-game decisions. Not post-game film review.
              Your staff sees momentum, lineup impact, and recommendation timing in one view.
            </p>
            <div className="mkt-home-actions">
              <button
                type="button"
                className="mkt-btn mkt-btn-primary"
                onClick={() => onNavigate(isAuthenticated ? "/live" : "/login")}
              >
                Start Now
              </button>
              <button
                type="button"
                className="mkt-btn mkt-btn-ghost"
                onClick={() => onNavigate("/product")}
              >
                See Product
              </button>
            </div>
            <div className="mkt-proof-row" aria-label="Proof points">
              <span>Sub-second update target</span>
              <span>Single operator workflow</span>
              <span>Offline-safe event sync</span>
            </div>
          </div>
          {active && <LiveMomentPanel scenario={active} />}
        </section>

        <section className="mkt-moments" aria-label="Site sections">
          <h2>Build your full game-day workflow</h2>
          <div className="mkt-moments-grid">
            <article className="mkt-moment-item">
              <p className="mkt-moment-time">Product</p>
              <h3>What your staff sees live and after games</h3>
              <p>Bench view, operator capture, and review workflow in one system.</p>
              <button type="button" className="mkt-btn mkt-btn-subtle" onClick={() => onNavigate("/product")}>Open Product</button>
            </article>
            <article className="mkt-moment-item">
              <p className="mkt-moment-time">How It Works</p>
              <h3>Simple four-step routine</h3>
              <p>Set up roster, pair operator, coach live, and review cleanly.</p>
              <button type="button" className="mkt-btn mkt-btn-subtle" onClick={() => onNavigate("/how-it-works")}>Open Workflow</button>
            </article>
            <article className="mkt-moment-item">
              <p className="mkt-moment-time">Pricing</p>
              <h3>Transparent public tiers</h3>
              <p>Monthly team, program, and district options with clear scope.</p>
              <button type="button" className="mkt-btn mkt-btn-subtle" onClick={() => onNavigate("/pricing")}>View Pricing</button>
            </article>
            <article className="mkt-moment-item">
              <p className="mkt-moment-time">Compare</p>
              <h3>During-game decisions vs after-game review</h3>
              <p>Use BTA in possession time and keep film tools for later analysis.</p>
              <button type="button" className="mkt-btn mkt-btn-subtle" onClick={() => onNavigate("/compare")}>See Comparison</button>
            </article>
          </div>
        </section>

        <section className="mkt-moments" aria-label="During-game scenarios">
          <h2>During a real game</h2>
          <div className="mkt-moments-grid">
            {SCENARIOS.map((scenario) => (
              <article
                key={scenario.id}
                className={`mkt-moment-item${scenario.id === active?.id ? " is-active" : ""}`}
                onMouseEnter={() => setActiveId(scenario.id)}
              >
                <p className="mkt-moment-time">{scenario.moment}</p>
                <h3>{scenario.problem}</h3>
                <p>{scenario.recommendation}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </PublicSiteChrome>
  );
}
