export function sanitizeTextField(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function buildOrganizationSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function resolveSchoolName(payload: Record<string, unknown>): string {
  return sanitizeTextField(
    payload.schoolName
    ?? payload.organizationName
    ?? payload.school,
    160,
  );
}

export function resolveCoachName(payload: Record<string, unknown>): string {
  return sanitizeTextField(payload.coachName ?? payload.fullName, 120);
}

export function resolveCoachEmail(payload: Record<string, unknown>): string {
  return sanitizeTextField(payload.coachEmail ?? payload.email, 160).toLowerCase();
}

export function sanitizeProfilePhotoDataUrl(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const validDataUrl = /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(trimmed);
  if (!validDataUrl) {
    return "";
  }

  if (trimmed.length > 350_000) {
    return "";
  }

  return trimmed;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function toBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
