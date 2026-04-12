export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured;
  }

  return process.env.NODE_ENV === "production"
    ? "https://btaintel.com"
    : "http://localhost:3000";
}
