import { describe, expect, it } from "vitest";
import {
  hasWriteRole,
  resolveRequestTenant,
  resolveSocketTenant
} from "./tenant-guards.js";

describe("tenant guards", () => {
  it("allows expected write roles", () => {
    expect(hasWriteRole("admin")).toBe(true);
    expect(hasWriteRole("coach")).toBe(true);
    expect(hasWriteRole("operator")).toBe(true);
    expect(hasWriteRole("viewer")).toBe(false);
    expect(hasWriteRole(undefined)).toBe(false);
  });

  it("rejects request tenant mismatch", () => {
    const resolved = resolveRequestTenant({
      authSchoolId: "alpha",
      headerSchoolId: "beta",
      querySchoolId: undefined,
      requireTenant: true,
      defaultSchoolId: "default"
    });

    expect(resolved.schoolId).toBeUndefined();
    expect(resolved.status).toBe(403);
  });

  it("requires schoolId when strict tenant mode is enabled", () => {
    const resolved = resolveRequestTenant({
      authSchoolId: undefined,
      headerSchoolId: undefined,
      querySchoolId: undefined,
      requireTenant: true,
      defaultSchoolId: "default"
    });

    expect(resolved.schoolId).toBeUndefined();
    expect(resolved.status).toBe(400);
  });

  it("rejects socket tenant mismatch", () => {
    const resolved = resolveSocketTenant({
      authSchoolId: "alpha",
      handshakeSchoolId: "beta",
      requireTenant: true,
      defaultSchoolId: "default"
    });

    expect(resolved.schoolId).toBeUndefined();
    expect(resolved.error).toMatch(/mismatch/i);
  });
});
