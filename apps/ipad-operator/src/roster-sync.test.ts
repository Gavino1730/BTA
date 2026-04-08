import { describe, expect, it } from "vitest";
import { DEFAULT_SCHOOL_ID, buildAuthHeaders } from "./roster-sync.js";

describe("roster sync auth headers", () => {
  it("only includes a school header when a default or explicit school is configured", () => {
    const headers = buildAuthHeaders({});

    if (DEFAULT_SCHOOL_ID) {
      expect(headers["x-school-id"]).toBe(DEFAULT_SCHOOL_ID);
    } else {
      expect(headers["x-school-id"]).toBeUndefined();
    }
  });

  it("includes school id when explicitly provided", () => {
    const headers = buildAuthHeaders({ schoolId: "home-team" });
    expect(headers["x-school-id"]).toBe("home-team");
  });
});

