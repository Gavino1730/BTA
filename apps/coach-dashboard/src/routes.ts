export type AppRoute =
  | "live"
  | "setup"
  | "stats-overview"
  | "stats-games"
  | "stats-players"
  | "stats-trends"
  | "stats-insights"
  | "stats-settings";

const LEGACY_ROUTE_ALIASES: Record<string, string> = {
  "/": "/live",
  "/games": "/stats/games",
  "/players": "/stats/players",
  "/trends": "/stats/trends",
  "/ai-insights": "/stats/insights",
  "/analysis": "/stats/insights",
  "/settings": "/stats/settings",
  "/onboarding": "/setup",
};

export function canonicalizeCoachPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return LEGACY_ROUTE_ALIASES[normalized] ?? normalized;
}

export function resolveCoachRoute(pathname: string): AppRoute {
  const canonical = canonicalizeCoachPath(pathname);
  if (canonical === "/setup") {
    return "setup";
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
  return "live";
}