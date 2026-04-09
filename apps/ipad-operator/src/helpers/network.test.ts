import { describe, expect, it } from "vitest";
import { apiKeyHeader, operatorLinkHeaders } from "./network.js";

describe("operator link headers", () => {
  it("omits bearer tokens when recovering auth from the coach link", () => {
    expect(operatorLinkHeaders({ schoolId: "varsity-high", })).toEqual({
      Accept: "application/json",
      "x-school-id": "varsity-high",
    });
  });

  it("keeps bearer tokens on normal authenticated API requests", () => {
    expect(apiKeyHeader({ apiKey: "bta.local-token", schoolId: "varsity-high" })).toEqual({
      Authorization: "Bearer bta.local-token",
      "x-school-id": "varsity-high",
    });
  });
});