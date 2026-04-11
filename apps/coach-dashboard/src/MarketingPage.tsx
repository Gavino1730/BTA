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
      <main className="mkt-home modern-home">
        <section className="mkt-home-hero modern-hero">
          <div className="mkt-home-copy modern-copy">
            <p className="mkt-home-kicker">Built for high school basketball programs</p>
            <h1>Know what call to make before the next possession starts.</h1>
            <p>
              BTA is for during-game decisions. Not post-game film review.<br />
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
            <div className="mkt-proof-row modern-proof-row" aria-label="Proof points">
              {["Sub-second update target", "Single operator workflow", "Offline-safe event sync"].map((point, i) => (
                <span key={point} className="modern-proof-point" style={{ animationDelay: `${i * 0.2}s` }}>{point}</span>
              ))}
            </div>
          </div>
          <div className="modern-scenario-tabs">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                className={`modern-scenario-tab${activeId === scenario.id ? " active" : ""}`}
                onClick={() => setActiveId(scenario.id)}
                aria-selected={activeId === scenario.id}
              >
                {scenario.moment}
              </button>
            ))}
          </div>
          {active && (
            <div className="modern-scenario-panel">
              <h3>{active.problem}</h3>
              <p><strong>Signal:</strong> {active.signal}</p>
              <p><strong>Call:</strong> {active.recommendation}</p>
              <p><strong>Why it matters:</strong> {active.impact}</p>
            </div>
          )}
        </section>

        <section className="mkt-moments modern-moments" aria-label="Site sections">
          <h2>Build your full game-day workflow</h2>
          <div className="mkt-moments-grid modern-moments-grid">
            <button className="modern-moment-link" onClick={() => onNavigate("/product")}>Product</button>
            <button className="modern-moment-link" onClick={() => onNavigate("/how-it-works")}>How It Works</button>
            <button className="modern-moment-link" onClick={() => onNavigate("/pricing")}>Pricing</button>
            <button className="modern-moment-link" onClick={() => onNavigate("/compare")}>Compare</button>
          </div>
        </section>
      </main>
    </PublicSiteChrome>
  );
}
