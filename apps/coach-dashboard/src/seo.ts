import type { AppRoute } from "./routes.js";

export interface SeoEntry {
  title: string;
  description: string;
  path: string;
  imagePath: string;
  robots: "index, follow" | "noindex, nofollow";
  structuredData?: Record<string, unknown>;
}

const BASE_TITLE = "BTA Courtside";

const PUBLIC_SEO: Partial<Record<AppRoute, Omit<SeoEntry, "robots">>> = {
  marketing: {
    title: `${BASE_TITLE} | Live Basketball Coaching Intelligence`,
    description: "Live basketball coaching intelligence for high school programs. Track momentum, lineup impact, and recommendation timing while the game is still in the balance.",
    path: "/",
    imagePath: "/og-home.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "BTA Courtside",
      applicationCategory: "SportsApplication",
      operatingSystem: "Web",
      description: "Live basketball coaching intelligence for high school coaching staffs.",
    },
  },
  product: {
    title: `${BASE_TITLE} Product | In-Game Decision Workflow`,
    description: "See how BTA Courtside combines live bench context, iPad operator entry, and post-game review in one high school basketball workflow.",
    path: "/product",
    imagePath: "/og-product.svg",
  },
  "how-it-works": {
    title: `${BASE_TITLE} | How It Works`,
    description: "A four-step routine for setup, live event sync, and post-game review built for game-day staff.",
    path: "/how-it-works",
    imagePath: "/og-product.svg",
  },
  pricing: {
    title: `${BASE_TITLE} Pricing | Public Program Tiers`,
    description: "Public monthly pricing for team, full-program, and district tiers with clear scope and support levels.",
    path: "/pricing",
    imagePath: "/og-pricing.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "OfferCatalog",
      name: "BTA Courtside Pricing",
      itemListElement: [
        { "@type": "Offer", name: "Single Team", price: "99", priceCurrency: "USD" },
        { "@type": "Offer", name: "Full Program", price: "249", priceCurrency: "USD" },
        { "@type": "Offer", name: "District", price: "799", priceCurrency: "USD" },
      ],
    },
  },
  compare: {
    title: `${BASE_TITLE} Compare | During-Game vs Film-First`,
    description: "Compare BTA Courtside's during-game workflow with film-first tools and see where each fits in a staff stack.",
    path: "/compare",
    imagePath: "/og-compare.svg",
  },
  features: {
    title: `${BASE_TITLE} Features`,
    description: "Explore live tracking, stats visibility, and analytics features for basketball coaching staffs.",
    path: "/features",
    imagePath: "/og-product.svg",
  },
  about: {
    title: `About ${BASE_TITLE}`,
    description: "Learn why BTA Courtside focuses on game-speed coaching decisions for high school basketball programs.",
    path: "/about",
    imagePath: "/og-home.svg",
  },
  status: {
    title: `${BASE_TITLE} Status | Service Health`,
    description: "Current service health and known incidents for BTA Courtside preproduction environments.",
    path: "/status",
    imagePath: "/og-home.svg",
  },
  testimonials: {
    title: `${BASE_TITLE} Testimonials | Program Outcomes`,
    description: "Case studies and testimonials from basketball programs using BTA Courtside in live operations and season review.",
    path: "/testimonials",
    imagePath: "/og-home.svg",
  },
  "demo-booking": {
    title: `${BASE_TITLE} Demo | Book a Program Walkthrough`,
    description: "Schedule a BTA Courtside demo to review live game workflows, operator sync, and analytics setup for your program.",
    path: "/book-demo",
    imagePath: "/og-pricing.svg",
  },
  "onboarding-wizard": {
    title: `${BASE_TITLE} Onboarding Wizard | Setup Guide`,
    description: "Step-by-step onboarding flow for teams adopting BTA Courtside from account setup to live game rehearsal.",
    path: "/onboarding-wizard",
    imagePath: "/og-home.svg",
  },
  changelog: {
    title: `${BASE_TITLE} Changelog | Product Updates`,
    description: "Read the latest platform updates, reliability improvements, and product milestones.",
    path: "/changelog",
    imagePath: "/og-home.svg",
  },
  roadmap: {
    title: `${BASE_TITLE} Roadmap | Preproduction Plan`,
    description: "See what is shipping now, what is next, and how BTA Courtside is progressing toward production readiness.",
    path: "/roadmap",
    imagePath: "/og-home.svg",
  },
  support: {
    title: `${BASE_TITLE} Support`,
    description: "Support resources, setup help, and operational guidance for BTA Courtside users.",
    path: "/support",
    imagePath: "/og-home.svg",
  },
  contact: {
    title: `${BASE_TITLE} Contact`,
    description: "Contact BTA Courtside for program onboarding, implementation questions, and billing support.",
    path: "/contact",
    imagePath: "/og-home.svg",
  },
  "checkout-success": {
    title: `${BASE_TITLE} Billing | Checkout Success`,
    description: "Checkout completed. Confirm billing activation and return to your dashboard workflows.",
    path: "/checkout/success",
    imagePath: "/og-pricing.svg",
  },
  "checkout-cancel": {
    title: `${BASE_TITLE} Billing | Checkout Canceled`,
    description: "Checkout canceled with no billing changes applied. Return to pricing or billing anytime.",
    path: "/checkout/cancel",
    imagePath: "/og-pricing.svg",
  },
  terms: {
    title: `${BASE_TITLE} Terms`,
    description: "Terms and conditions for using BTA Courtside services.",
    path: "/terms",
    imagePath: "/og-home.svg",
  },
  privacy: {
    title: `${BASE_TITLE} Privacy`,
    description: "Privacy policy and data handling information for BTA Courtside.",
    path: "/privacy",
    imagePath: "/og-home.svg",
  },
  "data-deletion": {
    title: `${BASE_TITLE} Data Deletion`,
    description: "Instructions and policy details for requesting data deletion.",
    path: "/data-deletion",
    imagePath: "/og-home.svg",
  },
  docs: {
    title: `${BASE_TITLE} Docs`,
    description: "Operational documentation and references for BTA Courtside.",
    path: "/docs",
    imagePath: "/og-home.svg",
  },
  help: {
    title: `${BASE_TITLE} Help`,
    description: "Get quick help for game setup, operator pairing, and troubleshooting.",
    path: "/help",
    imagePath: "/og-home.svg",
  },
  login: {
    title: `${BASE_TITLE} Coach Login`,
    description: "Sign in to BTA Courtside to access your live dashboard.",
    path: "/login",
    imagePath: "/og-home.svg",
  },
  "invite-accept": {
    title: `${BASE_TITLE} Invite | Accept Team Access`,
    description: "Accept your BTA Courtside team invite, sign in, and verify role-based access for your organization.",
    path: "/invite/accept",
    imagePath: "/og-home.svg",
  },
  "email-verify": {
    title: `${BASE_TITLE} Verify Email | Account Access`,
    description: "Verify your email to activate account access and continue onboarding workflows.",
    path: "/verify-email",
    imagePath: "/og-home.svg",
  },
};

export function seoForRoute(route: AppRoute): SeoEntry {
  const entry = PUBLIC_SEO[route];
  if (entry) {
    return {
      ...entry,
      robots: "index, follow",
    };
  }

  return {
    title: `${BASE_TITLE} App`,
    description: "Live operations workspace for authorized basketball staff.",
    path: window.location.pathname,
    imagePath: "/og-home.svg",
    robots: "noindex, nofollow",
  };
}
