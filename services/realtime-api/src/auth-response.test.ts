import { describe, expect, it } from "vitest";
import { buildPasswordResetRequestResponse } from "./auth-response.js";

describe("buildPasswordResetRequestResponse", () => {
  it("hides reset materials when browser exposure is disabled", () => {
    expect(buildPasswordResetRequestResponse({
      message: "Reset instructions prepared.",
      expiresInMinutes: 30,
      resetPath: "/reset-password?token=abc123",
      resetToken: "abc123",
      exposeResetMaterials: false,
    })).toEqual({
      message: "Reset instructions prepared.",
      expiresInMinutes: 30,
    });
  });

  it("includes reset materials for non-production developer flows", () => {
    expect(buildPasswordResetRequestResponse({
      message: "Reset instructions prepared.",
      expiresInMinutes: 30,
      resetPath: "/reset-password?token=abc123",
      resetToken: "abc123",
      exposeResetMaterials: true,
    })).toEqual({
      message: "Reset instructions prepared.",
      expiresInMinutes: 30,
      resetPath: "/reset-password?token=abc123",
      resetToken: "abc123",
    });
  });
});