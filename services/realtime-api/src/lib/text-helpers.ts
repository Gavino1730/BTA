export function normalizePersonName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeNameKey(value: unknown): string {
  return normalizePersonName(value).toLowerCase();
}

export function buildTeamAbbreviation(name: string): string {
  const compact = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return compact.slice(0, 4) || "TEAM";
}
