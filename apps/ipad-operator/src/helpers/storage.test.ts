import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { APP_DATA_KEY, DEVICE_NAME_KEY } from "../constants.js";
import type { GameEvent } from "@bta/shared-schema";
import {
  appendPendingConflicts,
  clearOperatorLocalCache,
  consumePendingIntegrityIssue,
  loadAppData,
  loadPending,
  loadPendingConflicts,
  pendingBackupKey,
  pendingConflictKey,
  pendingKey,
  saveAppData,
  savePending,
} from "./storage.js";

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

  it("keeps saved app data on restart when no connectionId query is present", () => {
    saveAppData({
      teams: [{ id: "team-home", name: "VC", abbreviation: "VC", players: [] }],
      gameSetup: {
        gameId: "game-2026-04-09",
        connectionId: "abc123",
        syncedConnectionId: "abc123",
        myTeamId: "team-home",
        apiUrl: "http://localhost:4000",
        schoolId: "school-1",
        opponent: "Rivals",
        vcSide: "home",
      },
    });

    window.history.replaceState({}, "", window.location.pathname);
    const loaded = loadAppData();

    expect(loaded.gameSetup.connectionId).toBe("abc123");
    expect(loaded.gameSetup.syncedConnectionId).toBe("abc123");
    expect(loaded.gameSetup.myTeamId).toBe("team-home");
    expect(loaded.teams).toHaveLength(1);
  });

  it("clears operator cache only when reset query is requested", () => {
    saveAppData({
      teams: [{ id: "team-home", name: "VC", abbreviation: "VC", players: [] }],
      gameSetup: {
        gameId: "game-2026-04-09",
        connectionId: "abc123",
        syncedConnectionId: "abc123",
        myTeamId: "team-home",
        apiUrl: "http://localhost:4000",
        schoolId: "school-1",
        opponent: "Rivals",
        vcSide: "home",
        deviceName: "Scorer iPad",
      },
    });
    localStorage.setItem("operator-console:game-2026-04-09:pending", "[]");

    window.history.replaceState({}, "", `${window.location.pathname}?reset=1`);
    const loaded = loadAppData();

    expect(localStorage.getItem(APP_DATA_KEY)).toBeNull();
    expect(localStorage.getItem(DEVICE_NAME_KEY)).toBe("Scorer iPad");
    expect(loaded.gameSetup.connectionId).toBeUndefined();
  });

  it("persists pending queue in versioned envelope and loads it", () => {
    const event: GameEvent = {
      id: "evt-queue-1",
      gameId: "game-queue-1",
      sequence: 1,
      timestampIso: "2026-04-10T00:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 470,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt",
      playerId: "h1",
      made: true,
      points: 2,
      zone: "paint",
    };

    savePending("game-queue-1", [event]);
    const persistedRaw = localStorage.getItem(pendingKey("game-queue-1"));
    expect(persistedRaw).toContain("\"version\"");
    expect(loadPending("game-queue-1")).toHaveLength(1);
    expect(consumePendingIntegrityIssue("game-queue-1")).toBeNull();
  });

  it("backs up and resets pending queue on checksum mismatch", () => {
    const corruptedEnvelope = {
      version: 2,
      checksum: 1,
      events: [
        {
          id: "evt-corrupt-1",
          gameId: "game-corrupt",
          sequence: 1,
          timestampIso: "2026-04-10T00:00:00.000Z",
          period: "Q1",
          clockSecondsRemaining: 470,
          teamId: "home",
          operatorId: "op-1",
          type: "shot_attempt",
          playerId: "h1",
          made: true,
          points: 2,
          zone: "paint",
        },
      ],
    };

    localStorage.setItem(pendingKey("game-corrupt"), JSON.stringify(corruptedEnvelope));
    expect(loadPending("game-corrupt")).toEqual([]);
    expect(localStorage.getItem(pendingBackupKey("game-corrupt"))).not.toBeNull();

    const warning = consumePendingIntegrityIssue("game-corrupt");
    expect(warning).toMatch(/checksum mismatch/i);
    expect(consumePendingIntegrityIssue("game-corrupt")).toBeNull();
  });

  it("backs up and resets pending queue when payload is invalid json", () => {
    localStorage.setItem(pendingKey("game-bad-json"), "{invalid");
    expect(loadPending("game-bad-json")).toEqual([]);
    expect(localStorage.getItem(pendingBackupKey("game-bad-json"))).toBe("{invalid");

    const warning = consumePendingIntegrityIssue("game-bad-json");
    expect(warning).toMatch(/unreadable/i);
  });

  it("backs up and resets pending queue when envelope version is unsupported", () => {
    const unsupportedEnvelope = {
      version: 999,
      checksum: 0,
      events: [],
    };
    const raw = JSON.stringify(unsupportedEnvelope);

    localStorage.setItem(pendingKey("game-bad-version"), raw);
    expect(loadPending("game-bad-version")).toEqual([]);
    expect(localStorage.getItem(pendingBackupKey("game-bad-version"))).toBe(raw);

    const warning = consumePendingIntegrityIssue("game-bad-version");
    expect(warning).toMatch(/format was invalid/i);
  });

  it("backs up and resets pending queue when envelope shape is missing events", () => {
    const malformedEnvelope = {
      version: 2,
      checksum: 12345,
      payload: [],
    };
    const raw = JSON.stringify(malformedEnvelope);

    localStorage.setItem(pendingKey("game-bad-shape"), raw);
    expect(loadPending("game-bad-shape")).toEqual([]);
    expect(localStorage.getItem(pendingBackupKey("game-bad-shape"))).toBe(raw);

    const warning = consumePendingIntegrityIssue("game-bad-shape");
    expect(warning).toMatch(/format was invalid/i);
  });

  it("persists pending conflict quarantine records", () => {
    const localEvent: GameEvent = {
      id: "evt-conflict-1",
      gameId: "game-conflicts",
      sequence: 2,
      timestampIso: "2026-04-10T00:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 460,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt",
      playerId: "h1",
      made: false,
      points: 2,
      zone: "paint",
    };
    const remoteEvent: GameEvent = {
      ...localEvent,
      made: true,
    };

    appendPendingConflicts("game-conflicts", [{
      localEvent,
      remoteEvent,
      detectedAtIso: "2026-04-10T01:00:00.000Z",
      reason: "payload_mismatch",
    }]);

    const raw = localStorage.getItem(pendingConflictKey("game-conflicts"));
    expect(raw).toContain("evt-conflict-1");

    const loaded = loadPendingConflicts("game-conflicts");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].localEvent.id).toBe("evt-conflict-1");
    expect(loaded[0].remoteEvent.made).toBe(true);
  });

  it("deduplicates pending conflict records by local event id", () => {
    const baseEvent: GameEvent = {
      id: "evt-conflict-2",
      gameId: "game-conflicts-dupe",
      sequence: 3,
      timestampIso: "2026-04-10T00:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 450,
      teamId: "home",
      operatorId: "op-1",
      type: "shot_attempt",
      playerId: "h1",
      made: false,
      points: 2,
      zone: "paint",
    };

    appendPendingConflicts("game-conflicts-dupe", [{
      localEvent: baseEvent,
      remoteEvent: { ...baseEvent, made: true },
      detectedAtIso: "2026-04-10T01:00:00.000Z",
      reason: "payload_mismatch",
    }]);

    appendPendingConflicts("game-conflicts-dupe", [{
      localEvent: baseEvent,
      remoteEvent: { ...baseEvent, points: 3, zone: "above_break_three" },
      detectedAtIso: "2026-04-10T02:00:00.000Z",
      reason: "payload_mismatch",
    }]);

    const loaded = loadPendingConflicts("game-conflicts-dupe");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].remoteEvent.points).toBe(3);
  });
});
