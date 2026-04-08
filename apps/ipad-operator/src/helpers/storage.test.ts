import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { APP_DATA_KEY, DEVICE_NAME_KEY } from "../constants.js";
import { clearOperatorLocalCache, loadAppData, saveAppData } from "./storage.js";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe("device name persistence", () => {
  beforeAll(() => {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
    });
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
  });

  beforeEach(() => {
    localStorage.clear();
    localStorage.removeItem(APP_DATA_KEY);
    localStorage.removeItem(DEVICE_NAME_KEY);
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
