import { describe, expect, it } from "vitest";
import { resolveCoachRoute } from "./routes.js";

describe("billing route", () => {
  it("resolves /billing to billing route", () => {
    expect(resolveCoachRoute("/billing")).toBe("billing");
  });

  it("resolves trailing slash /billing/ to billing route", () => {
    expect(resolveCoachRoute("/billing/")).toBe("billing");
  });
});
