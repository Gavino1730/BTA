import { PublicSiteChrome } from "./PublicSiteChrome.js";

interface PricingPageProps {
  onNavigate: (path: string) => void;
}

type Tier = {
  name: string;
  price: string;
  cadence: string;
  annualEquivalent: string;
  details: string[];
};

const TIERS: Tier[] = [
  {
    name: "Single Team",
    price: "$99",
    cadence: "per month",
    annualEquivalent: "$1,188 / year",
    details: [
      "1 team workspace",
      "Live bench + operator workflow",
      "Email support",
    ],
  },
  {
    name: "Full Program",
    price: "$249",
    cadence: "per month",
    annualEquivalent: "$2,988 / year",
    details: [
      "Varsity + JV + development teams",
      "Shared staff access controls",
      "Priority support",
    ],
  },
  {
    name: "District",
    price: "$799",
    cadence: "per month",
    annualEquivalent: "$9,588 / year",
    details: [
      "Multi-school rollout",
      "Centralized administration",
      "Implementation planning support",
    ],
  },
];

export function PricingPage({ onNavigate }: PricingPageProps) {
  return (
    <PublicSiteChrome onNavigate={onNavigate}>
      <main className="mkt-detail-main modern-main">
        <section className="mkt-detail-hero modern-hero">
          <p className="mkt-badge">Pricing</p>
          <h1>Simple plans for schools and programs.</h1>
          <p>Public pricing with clear scope. No hidden setup fees. Month-to-month to start.</p>
        </section>
        <section className="modern-pricing-list">
          {TIERS.map((tier, i) => (
            <div key={tier.name} className="modern-pricing-item" tabIndex={0} aria-label={tier.name} style={{ animationDelay: `${i * 0.1}s` }}>
              <h2>{tier.name}</h2>
              <p><strong>{tier.price}</strong> {tier.cadence}</p>
              <p>{tier.annualEquivalent}</p>
              <ul>
                {tier.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section className="mkt-detail-hero modern-hero" style={{ marginTop: "2rem" }}>
          <p>Need procurement-friendly annual billing? We can provide school invoice workflows.</p>
          <div className="mkt-hero-actions">
            <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => onNavigate("/contact")}>Contact Sales</button>
          </div>
        </section>
      </main>
    </PublicSiteChrome>
  );
}
