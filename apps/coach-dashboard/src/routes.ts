export type AppRoute =
  | "login"
  | "invite-accept"
  | "email-verify"
  | "forgot-password"
  | "reset-password"
  | "not-found"
  | "forbidden"
  | "unauthorized"
  | "server-error"
  | "offline"
  | "session-expired"
  | "help"
  | "docs"
  | "terms"
  | "privacy"
  | "data-deletion"
  | "book-demo"
  | "support"
  | "contact"
  | "checkout-success"
  | "checkout-cancel"
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
  | "org-settings";

export function canonicalizeCoachPath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function resolveCoachRoute(pathname: string): AppRoute {
  const canonical = canonicalizeCoachPath(pathname);
  if (canonical === "/") {
    return "login";
  }
  if (canonical === "/login") {
    return "login";
  }
  if (canonical === "/invite/accept") {
    return "invite-accept";
  }
  if (canonical === "/verify-email") {
    return "email-verify";
  }
  if (canonical === "/forgot-password") {
    return "forgot-password";
  }
  if (canonical === "/reset-password") {
    return "reset-password";
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
  if (canonical === "/support") {
    return "support";
  }
  if (canonical === "/contact") {
    return "contact";
  }
  if (canonical === "/book-demo") {
    return "book-demo";
  }
  if (canonical === "/data-deletion") {
    return "data-deletion";
  }
  if (canonical === "/404") {
    return "not-found";
  }
  if (canonical === "/403") {
    return "forbidden";
  }
  if (canonical === "/unauthorized") {
    return "unauthorized";
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
  if (canonical === "/checkout/success") {
    return "checkout-success";
  }
  if (canonical === "/checkout/cancel") {
    return "checkout-cancel";
  }
  if (canonical === "/billing") {
    return "billing";
  }
  if (canonical === "/settings") {
    return "stats-settings";
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
  if (canonical === "/notifications") {
    return "stats-notifications";
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
  return "not-found";
}
