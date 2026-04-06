import { describe, expect, it } from "vitest";
import { DEFAULT_SCHOOL_ID, buildAuthHeaders } from "./roster-sync.js";

describe("roster sync auth headers", () => {
  it("does not set an implicit local default school id", () => {
    expect(DEFAULT_SCHOOL_ID).toBe("");

    const headers = buildAuthHeaders({});
    expect(headers["x-school-id"]).toBeUndefined();
  });

  it("includes school id when explicitly provided", () => {
    const headers = buildAuthHeaders({ schoolId: "valley-catholic" });
    expect(headers["x-school-id"]).toBe("valley-catholic");
  });
});
