import { PublicSiteChrome } from "./PublicSiteChrome.js";

interface HowItWorksPageProps {
  onNavigate: (path: string) => void;
}

const STEPS = [
  "Set roster and game context before tip-off",
  "Operator joins from iPad with a short code",
  "Events sync to the bench view during active possessions",
  "Review trends and corrections after final buzzer",
];

export function HowItWorksPage({ onNavigate }: HowItWorksPageProps) {
  return (
    <PublicSiteChrome onNavigate={onNavigate}>
      <main className="mkt-detail-main modern-main">
        <section className="mkt-detail-hero modern-hero">
          <p className="mkt-badge">How It Works</p>
          <h1>Four clear steps from setup to final review.</h1>
          <p>
            The workflow is designed for school staff under game pressure.
            No long setup. No second system.
          </p>
        </section>
        <ol className="modern-steps-list">
          {STEPS.map((step, index) => (
            <li key={step} className="modern-step-item" tabIndex={0} aria-label={`Step ${index + 1}`}>{step}</li>
          ))}
        </ol>
      </main>
    </PublicSiteChrome>
  );
}
