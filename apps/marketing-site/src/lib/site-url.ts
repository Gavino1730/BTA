export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured;
  }

  return process.env.NODE_ENV === "production"
    ? "https://btaintel.com"
    : "http://localhost:3000";
}

export function getDashboardUrl(): string {
  const configured = process.env.NEXT_PUBLIC_DASHBOARD_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return process.env.NODE_ENV === "production"
    ? "https://dashboard.btaintel.com"
    : "http://localhost:5173";
}

export function getDashboardLoginUrl(): string {
  return `${getDashboardUrl()}/login`;
}
