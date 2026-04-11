import { PublicSiteChrome } from "./PublicSiteChrome.js";

interface ComparePageProps {
  onNavigate: (path: string) => void;
}

const ITEMS = [
  {
    label: "Decision timing",
    bta: "During active possessions",
    legacy: "Mostly after the game",
  },
  {
    label: "Bench context",
    bta: "Live momentum and lineup signals",
    legacy: "Manual tracking or delay",
  },
  {
    label: "Operator workflow",
    bta: "Single iPad operator flow",
    legacy: "Paper or fragmented tools",
  },
  {
    label: "Data reliability",
    bta: "Offline-safe replay queue",
    legacy: "Higher risk of missed sequences",
  },
];

export function ComparePage({ onNavigate }: ComparePageProps) {
  return (
    <PublicSiteChrome onNavigate={onNavigate}>
      <main className="mkt-detail-main modern-main">
        <section className="mkt-detail-hero modern-hero">
          <p className="mkt-badge">Compare</p>
          <h1>BTA is for during-game calls. Film suites, including Hudl, are strongest after games.</h1>
          <p>
            This is not either-or. Keep film for breakdown. Use BTA for live possession decisions,
            momentum response, and shared staff context.
          </p>
          <p>
            If your staff already uses Hudl, BTA fits alongside it: BTA for real-time bench operations,
            Hudl for film and post-game breakdown.
          </p>
        </section>
        <section className="modern-compare-list">
          {ITEMS.map((item, i) => (
            <div key={item.label} className="modern-compare-item" tabIndex={0} aria-label={item.label} style={{ animationDelay: `${i * 0.1}s` }}>
              <h2>{item.label}</h2>
              <p><strong>BTA:</strong> {item.bta}</p>
              <p><strong>Current workflow:</strong> {item.legacy}</p>
            </div>
          ))}
        </section>
      </main>
    </PublicSiteChrome>
  );
}
