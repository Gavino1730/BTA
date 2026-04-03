/**
 * Shared utility validators used across the platform
 * Centralized to avoid duplication and divergence
 */

/** Validate and normalize team color hex code. Expands 3-char shorthand to 6-char form. */
export function normalizeTeamColor(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return undefined;
}

/** Sanitize text input for AI prompts (remove BOMs, control chars) */
export function sanitizePromptText(text: string, maxLength: number): string {
  return text
    .replace(/^\ufeff/g, "") // Remove BOM
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "") // Remove control characters except newline/tab
    .trim()
    .slice(0, maxLength);
}

/** Returns true for localhost/private-network style hostnames used in LAN setups. */
export function isLocalNetworkHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "0.0.0.0"
    || normalized === "::1"
    || normalized === "[::1]"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
    || /^10(?:\.\d{1,3}){3}$/.test(normalized)
    || /^192\.168(?:\.\d{1,3}){2}$/.test(normalized)
    || /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(normalized)
    || normalized.endsWith(".local")
    || !normalized.includes(".");
}


