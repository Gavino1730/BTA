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
    title: `${BASE_TITLE} | Live Basketball Bench Intelligence`,
    description: "Live bench intelligence for high school basketball programs. Track momentum, lineup impact, and recommendation timing during active possessions.",
    path: "/",
    imagePath: "/og-home.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "BTA Courtside",
      applicationCategory: "SportsApplication",
      operatingSystem: "Web",
      description: "Live basketball bench intelligence for high school coaching staffs.",
    },
  },
  product: {
    title: `${BASE_TITLE} Product | In-Game Decision Workflow`,
    description: "See how BTA combines live bench context, iPad operator entry, and post-game review in one high school basketball workflow.",
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
    description: "Compare BTA's during-game workflow with film-first tools and see where each fits in a staff stack.",
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
    description: "Learn why BTA focuses on game-speed coaching decisions for high school basketball programs.",
    path: "/about",
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
    description: "Contact BTA for program onboarding, implementation questions, and billing support.",
    path: "/contact",
    imagePath: "/og-home.svg",
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
