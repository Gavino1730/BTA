import { describe, expect, it } from "vitest";
import {
  buildBillingStatusMessage,
  buildInviteDeliveryStatus,
  formatFocusInsights,
  isValidEmail,
  mapRosterPayloadToRows,
  parseFocusInsightsText,
  resolveInitialSettingsSection,
  toggleFocusInsightValue,
} from "./helpers.js";

describe("team settings helpers", () => {
  it("prefers query section and falls back to stored section", () => {
    expect(resolveInitialSettingsSection("?section=members", "billing")).toBe("members");
    expect(resolveInitialSettingsSection("", "billing")).toBe("billing");
    expect(resolveInitialSettingsSection("?tab=nope", "billing")).toBe("pairing");
  });

  it("parses and toggles focus insights consistently", () => {
    expect(parseFocusInsightsText("timeouts, defense, , momentum")).toEqual(["timeouts", "defense", "momentum"]);
    expect(formatFocusInsights(["timeouts", "defense"])).toBe("timeouts, defense");
    expect(toggleFocusInsightValue("timeouts, defense", "defense")).toBe("timeouts");
    expect(toggleFocusInsightValue("timeouts", "momentum")).toBe("timeouts, momentum");
  });

  it("maps roster payloads into editable rows", () => {
    expect(mapRosterPayloadToRows([{ name: "Alex", number: 12, position: "PG" }])[0]).toMatchObject({
      originalName: "Alex",
      name: "Alex",
      number: "12",
      position: "PG",
    });
  });

  it("validates emails and invite delivery messages", () => {
    expect(isValidEmail("coach@school.org")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(buildInviteDeliveryStatus("coach@school.org", { delivered: true })).toBe("Invite email sent to coach@school.org.");
  });

  it("describes billing entitlement states", () => {
    expect(buildBillingStatusMessage({ accessActive: true, status: "active" } as never)).toContain("subscription is active");
    expect(buildBillingStatusMessage({ accessActive: false, status: "past_due" } as never)).toContain("payment attention");
    expect(buildBillingStatusMessage({ accessActive: false, status: "canceled" } as never)).toContain("canceled");
    expect(buildBillingStatusMessage(null)).toContain("Could not load billing status");
  });
});
