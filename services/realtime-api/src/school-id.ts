export const DEFAULT_SCHOOL_ID = "default";

export function normalizeSchoolId(input: unknown): string {
  if (typeof input !== "string") {
    return DEFAULT_SCHOOL_ID;
  }

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return DEFAULT_SCHOOL_ID;
  }

  return trimmed.replace(/[^a-z0-9_-]/g, "").slice(0, 64) || DEFAULT_SCHOOL_ID;
}