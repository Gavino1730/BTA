export type AppRoute =
  | "marketing"
  | "login"
  | "live"
  | "setup"
  | "account"
  | "stats-overview"
  | "stats-games"
  | "stats-players"
  | "stats-trends"
  | "stats-insights"
  | "stats-settings"
  | "demo";

const LEGACY_ROUTE_ALIASES: Record<string, string> = {
  "/dashboard": "/live",
  "/games": "/stats/games",
  "/players": "/stats/players",
  "/trends": "/stats/trends",
  "/ai-insights": "/stats/insights",
  "/analysis": "/stats/insights",
  "/settings": "/stats/settings",
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
  if (canonical === "/login") {
    return "login";
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
  if (canonical === "/stats/settings") {
    return "stats-settings";
  }
  if (canonical === "/stats") {
    return "stats-overview";
  }
  if (canonical === "/demo") {
    return "demo";
  }
  return "live";
}