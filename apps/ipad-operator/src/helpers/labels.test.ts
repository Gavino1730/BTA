import { describe, expect, it } from "vitest";
import { OPERATOR_ALERT_AUTOCLEAR_MS, OPERATOR_ALERT_AUTOCLEAR_URGENT_MS } from "../constants.js";
import {
  defaultZoneForPoints,
  foulTypeLabel,
  getOperatorAlertAutoClearMs,
  turnoverTypeLabel,
  zoneLabel,
} from "./labels.js";
import type { OperatorAlert } from "../types.js";

describe("defaultZoneForPoints", () => {
  it("returns above_break_three for 3-pointers", () => {
    expect(defaultZoneForPoints(3)).toBe("above_break_three");
  });

  it("returns paint for 2-pointers", () => {
    expect(defaultZoneForPoints(2)).toBe("paint");
  });
});

describe("zoneLabel", () => {
  it("returns human-readable labels for all zones", () => {
    expect(zoneLabel("rim")).toBe("Rim");
    expect(zoneLabel("paint")).toBe("Paint");
    expect(zoneLabel("midrange")).toBe("Mid");
    expect(zoneLabel("corner_three")).toBe("Corner 3");
    expect(zoneLabel("above_break_three")).toBe("AB 3");
  });
});

describe("foulTypeLabel", () => {
  it("returns human-readable labels for all foul types", () => {
    expect(foulTypeLabel("personal")).toBe("Personal");
    expect(foulTypeLabel("shooting")).toBe("Shooting");
    expect(foulTypeLabel("offensive")).toBe("Offensive");
    expect(foulTypeLabel("technical")).toBe("Technical");
    expect(foulTypeLabel("flagrant")).toBe("Flagrant");
  });
});

describe("turnoverTypeLabel", () => {
  it("returns human-readable labels for all turnover types", () => {
    expect(turnoverTypeLabel("bad_pass")).toBe("Bad Pass");
    expect(turnoverTypeLabel("traveling")).toBe("Travel");
    expect(turnoverTypeLabel("double_dribble")).toBe("Double Dribble");
    expect(turnoverTypeLabel("out_of_bounds")).toBe("Out of Bounds");
    expect(turnoverTypeLabel("offensive_foul")).toBe("Offensive Foul");
    expect(turnoverTypeLabel("steal")).toBe("Steal");
    expect(turnoverTypeLabel("other")).toBe("Other");
  });
});

describe("getOperatorAlertAutoClearMs", () => {
  const makeAlert = (priority: OperatorAlert["priority"]): OperatorAlert => ({
    id: "a1",
    type: "test",
    message: "test",
    explanation: "",
    priority,
  });

  it("returns urgent timeout when any alert is urgent", () => {
    const alerts: OperatorAlert[] = [makeAlert("normal"), makeAlert("urgent")];
    expect(getOperatorAlertAutoClearMs(alerts)).toBe(OPERATOR_ALERT_AUTOCLEAR_URGENT_MS);
  });

  it("returns normal timeout when no alerts are urgent", () => {
    const alerts: OperatorAlert[] = [makeAlert("normal"), makeAlert("normal")];
    expect(getOperatorAlertAutoClearMs(alerts)).toBe(OPERATOR_ALERT_AUTOCLEAR_MS);
  });

  it("returns normal timeout for empty array", () => {
    expect(getOperatorAlertAutoClearMs([])).toBe(OPERATOR_ALERT_AUTOCLEAR_MS);
  });
});
