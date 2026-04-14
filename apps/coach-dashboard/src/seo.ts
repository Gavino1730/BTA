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
