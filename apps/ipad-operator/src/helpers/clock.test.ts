import { describe, expect, it } from "vitest";
import { clockToSec, formatClockFromDigits, formatClockFromPadInput, formatClockFromSeconds } from "./clock.js";

describe("clockToSec", () => {
  it("parses M:SS format", () => {
    expect(clockToSec("8:00")).toBe(480);
    expect(clockToSec("1:30")).toBe(90);
    expect(clockToSec("0:45")).toBe(45);
  });

  it("parses M:SS.T format (tenths ignored as fractional seconds)", () => {
    expect(clockToSec("0:12.3")).toBeCloseTo(12.3, 1);
  });

  it("parses bare seconds string with no colon", () => {
    expect(clockToSec("30")).toBe(30);
  });

  it("returns 0 for empty string", () => {
    expect(clockToSec("")).toBe(0);
  });

  it("returns 0 for non-numeric", () => {
    expect(clockToSec("abc")).toBe(0);
  });
});

describe("formatClockFromSeconds", () => {
  it("formats above 60 seconds as M:SS", () => {
    expect(formatClockFromSeconds(480)).toBe("8:00");
    expect(formatClockFromSeconds(90)).toBe("1:30");
    expect(formatClockFromSeconds(61)).toBe("1:01");
  });

  it("formats below 60 seconds with tenths", () => {
    expect(formatClockFromSeconds(12)).toBe("0:12.0");
    expect(formatClockFromSeconds(0)).toBe("0:00.0");
    expect(formatClockFromSeconds(9.5)).toBe("0:09.5");
  });

  it("clamps negative input to 0", () => {
    expect(formatClockFromSeconds(-5)).toBe("0:00.0");
  });

  it("pads single-digit seconds with leading zero", () => {
    expect(formatClockFromSeconds(65)).toBe("1:05");
  });
});

describe("formatClockFromDigits", () => {
  it("converts 4-digit input to M:SS", () => {
    expect(formatClockFromDigits("0800")).toBe("8:00");
    expect(formatClockFromDigits("0130")).toBe("1:30");
  });

  it("handles 2-digit input as seconds only", () => {
    expect(formatClockFromDigits("45")).toBe("0:45.0");
  });

  it("strips non-numeric characters", () => {
    expect(formatClockFromDigits("8:00")).toBe("8:00");
  });

  it("returns 0:00 for empty string", () => {
    expect(formatClockFromDigits("")).toBe("0:00");
  });

  it("clamps seconds to 59 max", () => {
    expect(formatClockFromDigits("0165")).toBe("1:59");
  });
});

describe("formatClockFromPadInput", () => {
  it("returns 0:00 for empty input", () => {
    expect(formatClockFromPadInput("")).toBe("0:00");
  });

  it("formats seconds.tenths notation", () => {
    expect(formatClockFromPadInput("12.3")).toBe("0:12.3");
    expect(formatClockFromPadInput("5.0")).toBe("0:05.0");
  });

  it("clamps pad seconds to 59 max", () => {
    expect(formatClockFromPadInput("75.0")).toBe("0:59.0");
  });

  it("falls through to formatClockFromDigits for no-dot input", () => {
    expect(formatClockFromPadInput("0800")).toBe("8:00");
  });

  it("uses 0 tenths when dot is trailing", () => {
    expect(formatClockFromPadInput("12.")).toBe("0:12.0");
  });
});
