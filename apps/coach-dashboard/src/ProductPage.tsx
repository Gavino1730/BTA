import { PublicSiteChrome } from "./PublicSiteChrome.js";

interface ProductPageProps {
  onNavigate: (path: string) => void;
}

const SECTIONS = [
  {
    title: "Live Bench View",
    body: "Score, possession, momentum, and recommendation context update while the game is still in motion.",
  },
  {
    title: "Operator iPad Flow",
    body: "One operator can capture events quickly with minimal friction and no complicated setup.",
  },
  {
    title: "Insights and Recommendations",
    body: "Signals surface when momentum shifts, lineups slip, or a player run should be extended.",
  },
  {
    title: "Post-Game Review",
    body: "Review trends, player impact, and lineup outcomes without rebuilding stats manually.",
  },
  {
    title: "Reliability",
    body: "Offline-safe queueing and replay keeps events consistent if connection drops mid game.",
  },
];

export function ProductPage({ onNavigate }: ProductPageProps) {
  return (
    <PublicSiteChrome onNavigate={onNavigate}>
      <main className="mkt-detail-main">
        <section className="mkt-detail-hero">
          <p className="mkt-badge">Product</p>
          <h1>Built for in-game decisions, not after-game guesswork.</h1>
          <p>
            This is the full operating surface: live bench context, iPad operator entry,
            recommendation signals, and post-game review in one workflow.
          </p>
          <p>
            Use this page to evaluate operational fit, then review <button type="button" className="mkt-inline-link" onClick={() => onNavigate("/how-it-works")}>workflow setup</button> and <button type="button" className="mkt-inline-link" onClick={() => onNavigate("/pricing")}>pricing tiers</button>.
          </p>
        </section>
        <section className="mkt-detail-grid">
          {SECTIONS.map((section) => (
            <article key={section.title} className="mkt-detail-card">
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>
      </main>
    </PublicSiteChrome>
  );
}
