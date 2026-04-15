import type { Server } from "socket.io";

export interface OperatorPresence {
  schoolId: string;
  userId?: string;
  deviceId?: string;
  deviceName?: string;
  connectionId?: string;
  gameId: string;
  socketId: string;
  connectedAtIso: string;
  lastSeenIso: string;
}

export interface OperatorLinkSetup {
  gameId?: string;
  myTeamId?: string;
  myTeamName?: string;
  opponentName?: string;
  vcSide: "home" | "away";
  homeTeamColor?: string;
  awayTeamColor?: string;
  dashboardUrl?: string;
  startingLineup?: string[];
  updatedAtIso: string;
  operatorToken?: string;
}

interface CreateOperatorPresenceManagerOptions {
  io: Server;
  deviceRoom: (schoolId: string, deviceId: string) => string;
  connectionRoom: (schoolId: string, connectionId: string) => string;
}

export function createOperatorPresenceManager(options: CreateOperatorPresenceManagerOptions) {
  const operatorPresenceBySocketId = new Map<string, OperatorPresence>();
  const operatorPresenceByDeviceId = new Map<string, OperatorPresence>();
  const operatorPresenceByConnectionId = new Map<string, OperatorPresence>();
  const operatorLinkByConnectionId = new Map<string, OperatorLinkSetup>();

  function normalizeConnectionKey(value: unknown): string {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 40);
  }

  function operatorLinkKey(schoolId: string, connectionId: string): string {
    return `${schoolId}:${connectionId}`;
  }

  function getOperatorsByConnectionId(schoolId: string, connectionId: string): OperatorPresence[] {
    const normalizedConnectionId = normalizeConnectionKey(connectionId);
    if (!normalizedConnectionId) {
      return [];
    }

    const matches: OperatorPresence[] = [];
    for (const presence of operatorPresenceBySocketId.values()) {
      if (presence.schoolId === schoolId && presence.connectionId === normalizedConnectionId) {
        matches.push(presence);
      }
    }
    return matches;
  }

  function pickMostRecentOperator(operators: OperatorPresence[]): OperatorPresence | null {
    if (operators.length === 0) {
      return null;
    }

    return operators.reduce((latest, candidate) => {
      const latestMs = Date.parse(latest.lastSeenIso);
      const candidateMs = Date.parse(candidate.lastSeenIso);
      if (!Number.isFinite(latestMs)) {
        return candidate;
      }
      if (!Number.isFinite(candidateMs)) {
        return latest;
      }
      return candidateMs >= latestMs ? candidate : latest;
    });
  }

  function refreshOperatorConnectionIndex(schoolId: string, connectionId: string): void {
    const normalizedConnectionId = normalizeConnectionKey(connectionId);
    if (!normalizedConnectionId) {
      return;
    }
    const key = operatorLinkKey(schoolId, normalizedConnectionId);
    const operators = getOperatorsByConnectionId(schoolId, normalizedConnectionId);
    const latest = pickMostRecentOperator(operators);
    if (!latest) {
      operatorPresenceByConnectionId.delete(key);
      return;
    }
    operatorPresenceByConnectionId.set(key, latest);
  }

  function buildConnectionPresencePayload(schoolId: string, connectionId: string): {
    deviceId: string | null;
    connectionId: string;
    online: boolean;
    gameId: string | null;
    lastSeenIso: string | null;
    operatorCount: number;
    operators: Array<{ deviceId: string | null; deviceName: string | null; gameId: string | null; lastSeenIso: string | null; connectedAtIso: string | null }>;
  } {
    const operators = getOperatorsByConnectionId(schoolId, connectionId);
    const latest = pickMostRecentOperator(operators);

    return {
      deviceId: latest?.deviceId ?? null,
      connectionId,
      online: operators.length > 0,
      gameId: latest?.gameId ?? null,
      lastSeenIso: latest?.lastSeenIso ?? null,
      operatorCount: operators.length,
      operators: operators.map((operator) => ({
        deviceId: operator.deviceId ?? null,
        deviceName: operator.deviceName ?? null,
        gameId: operator.gameId ?? null,
        lastSeenIso: operator.lastSeenIso ?? null,
        connectedAtIso: operator.connectedAtIso ?? null,
      })),
    };
  }

  function getOperatorLinkSetup(schoolId: string, connectionId: string): OperatorLinkSetup | null {
    return operatorLinkByConnectionId.get(operatorLinkKey(schoolId, connectionId)) ?? null;
  }

  function setOperatorLinkSetup(schoolId: string, connectionId: string, setup: OperatorLinkSetup): void {
    operatorLinkByConnectionId.set(operatorLinkKey(schoolId, connectionId), setup);
  }

  function getLatestOperatorLinkSetup(
    schoolId: string,
    options?: { gameId?: string }
  ): { connectionId: string; setup: OperatorLinkSetup } | null {
    const prefix = `${schoolId}:`;
    const targetGameId = options?.gameId?.trim();
    let latest: { connectionId: string; setup: OperatorLinkSetup; updatedAtMs: number } | null = null;

    for (const [key, setup] of operatorLinkByConnectionId.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      if (targetGameId && setup.gameId !== targetGameId) {
        continue;
      }

      const updatedAtMs = Date.parse(setup.updatedAtIso);
      const safeUpdatedAtMs = Number.isFinite(updatedAtMs) ? updatedAtMs : 0;
      if (!latest || safeUpdatedAtMs >= latest.updatedAtMs) {
        latest = {
          connectionId: key.slice(prefix.length),
          setup,
          updatedAtMs: safeUpdatedAtMs,
        };
      }
    }

    if (!latest) {
      return null;
    }

    return {
      connectionId: latest.connectionId,
      setup: latest.setup,
    };
  }

  function clearOperatorLinksForSchool(schoolId: string): void {
    const prefix = `${schoolId}:`;
    for (const key of operatorLinkByConnectionId.keys()) {
      if (key.startsWith(prefix)) {
        operatorLinkByConnectionId.delete(key);
      }
    }
  }

  function listSchoolIdsForConnection(connectionId: string): string[] {
    return Array.from(operatorLinkByConnectionId.keys())
      .filter((key) => key.endsWith(`:${connectionId}`))
      .map((key) => key.slice(0, key.lastIndexOf(":")));
  }

  function emitPresenceForDevice(schoolId: string, deviceId: string): void {
    const operator = operatorPresenceByDeviceId.get(`${schoolId}:${deviceId}`) ?? null;
    const payload = {
      deviceId,
      connectionId: operator?.connectionId ?? null,
      online: Boolean(operator),
      gameId: operator?.gameId ?? null,
      lastSeenIso: operator?.lastSeenIso ?? null,
    };

    options.io.to(options.deviceRoom(schoolId, deviceId)).emit("presence:status", payload);
  }

  function emitPresenceForConnection(schoolId: string, connectionId: string): void {
    const payload = buildConnectionPresencePayload(schoolId, connectionId);
    options.io.to(options.connectionRoom(schoolId, connectionId)).emit("presence:status", payload);
  }

  return {
    operatorPresenceBySocketId,
    operatorPresenceByDeviceId,
    normalizeConnectionKey,
    getOperatorsByConnectionId,
    refreshOperatorConnectionIndex,
    buildConnectionPresencePayload,
    getOperatorLinkSetup,
    setOperatorLinkSetup,
    getLatestOperatorLinkSetup,
    clearOperatorLinksForSchool,
    listSchoolIdsForConnection,
    emitPresenceForDevice,
    emitPresenceForConnection,
  };
}
