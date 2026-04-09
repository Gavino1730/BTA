import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHOOL_ID,
  buildAuthHeaders,
  extractBearerTokenValue,
  isBearerTokenLike,
} from "./roster-sync.js";

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

  it("uses Authorization for local operator tokens", () => {
    const headers = buildAuthHeaders({ apiKey: "bta.payload.signature" }, { allowBearerToken: true });

    expect(headers.Authorization).toBe("Bearer bta.payload.signature");
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("uses Authorization for JWT-style operator tokens", () => {
    const jwtToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvcGVyYXRvci0xIn0.signature_value";
    const headers = buildAuthHeaders({ apiKey: jwtToken }, { allowBearerToken: true });

    expect(headers.Authorization).toBe(`Bearer ${jwtToken}`);
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("keeps x-api-key for opaque rollout keys", () => {
    const headers = buildAuthHeaders({ apiKey: "rollout-api-key" }, { allowBearerToken: true });

    expect(headers["x-api-key"]).toBe("rollout-api-key");
    expect(headers.Authorization).toBeUndefined();
  });

  it("normalizes explicit bearer prefixes", () => {
    expect(extractBearerTokenValue("Bearer   token-123 ")).toBe("token-123");
    expect(isBearerTokenLike("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig")).toBe(true);
  });
});

