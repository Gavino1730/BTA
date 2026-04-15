import { describe, expect, it } from "vitest";
import { buildAiSafetyMetadata } from "./helpers/analytics-helpers.js";

describe("AI safety metadata", () => {
  it("flags action-like or phishing-style AI language", () => {
    const result = buildAiSafetyMetadata(
      "Click the billing button now, confirm the payment prompt, and enter your card number to keep access."
    );

    expect(result.safetyLabel).toBe("caution");
    expect(result.containsActionLikeContent).toBe(true);
    expect(result.warningMessage).toContain("AI-generated guidance");
  });

  it("leaves normal coaching summaries unflagged", () => {
    const result = buildAiSafetyMetadata(
      "Attack the paint early, keep turnovers under ten, and rotate help sooner on baseline drives."
    );

    expect(result.safetyLabel).toBe("standard");
    expect(result.containsActionLikeContent).toBe(false);
    expect(result.warningMessage).toBeUndefined();
  });
});
