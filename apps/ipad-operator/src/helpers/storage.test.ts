import { beforeEach, describe, expect, it } from "vitest";
import { APP_DATA_KEY, DEVICE_NAME_KEY } from "../constants.js";
import { clearOperatorLocalCache, loadAppData, saveAppData } from "./storage.js";

describe("device name persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", window.location.pathname);
  });

  it("restores persisted device name when app data is cleared", () => {
    saveAppData({
      teams: [],
      gameSetup: {
        gameId: "game-1",
        myTeamId: "",
        deviceName: "Scorer iPad",
      },
    });

    clearOperatorLocalCache();

    expect(localStorage.getItem(APP_DATA_KEY)).toBeNull();
    expect(localStorage.getItem(DEVICE_NAME_KEY)).toBe("Scorer iPad");

    const loaded = loadAppData();
    expect(loaded.gameSetup.deviceName).toBe("Scorer iPad");
  });

  it("removes persisted key when device name is empty", () => {
    saveAppData({
      teams: [],
      gameSetup: {
        gameId: "game-1",
        myTeamId: "",
        deviceName: "Scorer iPad",
      },
    });

    saveAppData({
      teams: [],
      gameSetup: {
        gameId: "game-1",
        myTeamId: "",
        deviceName: "   ",
      },
    });

    expect(localStorage.getItem(DEVICE_NAME_KEY)).toBeNull();
  });
});
