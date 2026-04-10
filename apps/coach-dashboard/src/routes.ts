export type AppRoute =
  | "marketing"
  | "features"
  | "about"
  | "login"
  | "forgot-password"
  | "reset-password"
  | "not-found"
  | "forbidden"
  | "server-error"
  | "offline"
  | "session-expired"
  | "help"
  | "docs"
  | "terms"
  | "privacy"
  | "data-deletion"
  | "support"
  | "contact"
  | "billing"
  | "settings"
  | "admin"
  | "live"
  | "setup"
  | "account"
  | "stats-overview"
  | "stats-games"
  | "stats-players"
  | "stats-trends"
  | "stats-insights"
  | "stats-notifications"
  | "stats-settings"
  | "org-settings"
  | "demo";

const LEGACY_ROUTE_ALIASES: Record<string, string> = {
  "/dashboard": "/live",
  "/games": "/stats/games",
  "/players": "/stats/players",
  "/trends": "/stats/trends",
  "/ai-insights": "/stats/insights",
  "/analysis": "/stats/insights",
  "/notifications": "/stats/notifications",
  "/activity": "/stats/notifications",
  "/organization": "/org/settings",
  "/org": "/org/settings",
  "/team-settings": "/stats/settings",
  "/profile": "/account",
  "/onboarding": "/setup",
  "/signin": "/login",
  "/sign-in": "/login",
  "/home": "/",
};

export function canonicalizeCoachPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return LEGACY_ROUTE_ALIASES[normalized] ?? normalized;
}

export function resolveCoachRoute(pathname: string): AppRoute {
  const canonical = canonicalizeCoachPath(pathname);
  if (canonical === "/") {
    return "marketing";
  }
  if (canonical === "/features") {
    return "features";
  }
  if (canonical === "/about") {
    return "about";
  }
  if (canonical === "/login") {
    return "login";
  }
  if (canonical === "/forgot-password") {
    return "forgot-password";
  }
  if (canonical === "/reset-password") {
    return "reset-password";
  }
  if (canonical === "/404") {
    return "not-found";
  }
  if (canonical === "/403") {
    return "forbidden";
  }
  if (canonical === "/500") {
    return "server-error";
  }
  if (canonical === "/offline") {
    return "offline";
  }
  if (canonical === "/session-expired") {
    return "session-expired";
  }
  if (canonical === "/help") {
    return "help";
  }
  if (canonical === "/docs") {
    return "docs";
  }
  if (canonical === "/terms") {
    return "terms";
  }
  if (canonical === "/privacy") {
    return "privacy";
  }
  if (canonical === "/data-deletion") {
    return "data-deletion";
  }
  if (canonical === "/support") {
    return "support";
  }
  if (canonical === "/contact") {
    return "contact";
  }
  if (canonical === "/billing") {
    return "billing";
  }
  if (canonical === "/settings") {
    return "settings";
  }
  if (canonical === "/admin") {
    return "admin";
  }
  if (canonical === "/live") {
    return "live";
  }
  if (canonical === "/setup") {
    return "setup";
  }
  if (canonical === "/account") {
    return "account";
  }
  if (canonical === "/stats/games") {
    return "stats-games";
  }
  if (canonical === "/stats/players") {
    return "stats-players";
  }
  if (canonical === "/stats/trends") {
    return "stats-trends";
  }
  if (canonical === "/stats/insights") {
    return "stats-insights";
  }
  if (canonical === "/stats/notifications") {
    return "stats-notifications";
  }
  if (canonical === "/stats/settings") {
    return "stats-settings";
  }
  if (canonical === "/org/settings") {
    return "org-settings";
  }
  if (canonical === "/stats") {
    return "stats-overview";
  }
  if (canonical === "/demo") {
    return "demo";
  }
  return "not-found";
}