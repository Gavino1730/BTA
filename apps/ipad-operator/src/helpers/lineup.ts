/** Deduplicates and validates a raw lineup array from the server or local state. */
export function sanitizeLineup(lineup: unknown): string[] {
  if (!Array.isArray(lineup)) return [];
  return [...new Set(lineup.map((id) => String(id).trim()).filter(Boolean))].slice(0, 5);
}

/** Returns true if two sanitized lineup arrays contain the same player IDs in the same order. */
export function lineupsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
