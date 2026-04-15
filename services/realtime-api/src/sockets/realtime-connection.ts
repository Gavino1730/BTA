import type { Server, Socket } from "socket.io";

interface OperatorPresence {
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

interface RegisterRealtimeConnectionHandlersOptions {
  getSchoolIdFromSocket: (socket: Socket) => string | null | undefined;
  schoolRoom: (schoolId: string) => string;
  normalizeConnectionKey: (value: unknown) => string;
  apiKey?: string;
  writeApiKey?: string;
  isJwtAuthEnabled: () => boolean;
  jwtWriteRequired: boolean;
  hasWriteRole: (role: string | undefined) => boolean;
  getOperatorsByConnectionId: (schoolId: string, connectionId: string) => Array<{ userId?: string }>;
  operatorPresenceBySocketId: Map<string, OperatorPresence>;
  operatorPresenceByDeviceId: Map<string, OperatorPresence>;
  refreshOperatorConnectionIndex: (schoolId: string, connectionId: string) => void;
  gameRoom: (schoolId: string, gameId: string) => string;
  deviceRoom: (schoolId: string, deviceId: string) => string;
  emitPresenceForDevice: (schoolId: string, deviceId: string) => void;
  connectionRoom: (schoolId: string, connectionId: string) => string;
  emitPresenceForConnection: (schoolId: string, connectionId: string) => void;
  patchGameLineup: (gameId: string, lineupByTeam: Record<string, string[]>, scope: { schoolId: string }) => unknown | null;
  emitToGameRooms: (schoolId: string, gameId: string, eventName: string, payload: unknown) => void;
  isGameSubmitted: (gameId: string, scope: { schoolId: string }) => boolean;
  getGameState: (gameId: string, scope: { schoolId: string }) => unknown | null;
  getGameInsights: (gameId: string, scope: { schoolId: string }) => unknown;
  refreshAndBroadcastInsights: (schoolId: string, gameId: string) => Promise<void>;
  buildConnectionPresencePayload: (schoolId: string, connectionId: string) => unknown;
}

export function registerRealtimeConnectionHandlers(io: Server, options: RegisterRealtimeConnectionHandlersOptions): void {
  io.on("connection", (socket) => {
    const schoolId = options.getSchoolIdFromSocket(socket);
    if (!schoolId) {
      socket.emit("error", { error: "schoolId is required" });
      socket.disconnect(true);
      return;
    }
    const socketSchoolId = schoolId;
    socket.join(options.schoolRoom(socketSchoolId));

    function registerOperator(rawPayload: unknown): void {
      const payload = (rawPayload ?? {}) as Record<string, unknown>;
      const deviceId = typeof payload.deviceId === "string" ? payload.deviceId.trim() : "";
      const deviceName = typeof payload.deviceName === "string" ? payload.deviceName.trim() : "";
      const connectionId = options.normalizeConnectionKey(payload.connectionId);
      const gameId = typeof payload.gameId === "string" ? payload.gameId.trim() : "";

      if (!connectionId || !gameId) {
        return;
      }

      const socketApiKey = typeof socket.handshake.auth?.apiKey === "string"
        ? socket.handshake.auth.apiKey
        : typeof socket.handshake.headers["x-api-key"] === "string"
          ? socket.handshake.headers["x-api-key"]
          : undefined;
      const hasValidKey = Boolean(options.apiKey && socketApiKey === options.apiKey);
      const hasValidWriteKey = Boolean(options.writeApiKey && socketApiKey === options.writeApiKey);

      if (options.isJwtAuthEnabled() && options.jwtWriteRequired && !socket.data.authContext && !hasValidKey && !hasValidWriteKey) {
        socket.emit("error", { error: "operator registration requires bearer auth" });
        return;
      }

      if (hasValidWriteKey) {
        // Explicit machine write key may register operators without a JWT role.
      } else if (!options.isJwtAuthEnabled()) {
        socket.emit("error", { error: "insufficient role for operator registration" });
        return;
      } else if (!hasValidKey) {
        const role = typeof socket.data.authContext?.role === "string"
          ? socket.data.authContext.role.trim().toLowerCase()
          : undefined;
        if (!options.hasWriteRole(role)) {
          socket.emit("error", { error: "insufficient role for operator registration" });
          return;
        }
      }

      const userId = typeof socket.data.authContext?.subject === "string"
        ? socket.data.authContext.subject
        : undefined;
      const claimedByAnotherUser = connectionId
        ? options.getOperatorsByConnectionId(socketSchoolId, connectionId).some((presence) => presence.userId && userId && presence.userId !== userId)
        : false;
      if (claimedByAnotherUser) {
        socket.emit("error", { error: "connection is already registered to another account" });
        return;
      }

      const now = new Date().toISOString();
      const existing = options.operatorPresenceBySocketId.get(socket.id);

      // Remove old indexes if the operator changed binding keys.
      if (existing?.deviceId && existing.deviceId !== deviceId) {
        options.operatorPresenceByDeviceId.delete(`${socketSchoolId}:${existing.deviceId}`);
      }
      const presence: OperatorPresence = {
        schoolId: socketSchoolId,
        userId,
        deviceId: deviceId || undefined,
        deviceName: deviceName || undefined,
        connectionId: connectionId || undefined,
        gameId,
        socketId: socket.id,
        connectedAtIso: existing?.connectedAtIso ?? now,
        lastSeenIso: now,
      };

      options.operatorPresenceBySocketId.set(socket.id, presence);
      if (deviceId) {
        options.operatorPresenceByDeviceId.set(`${socketSchoolId}:${deviceId}`, presence);
      }
      if (existing?.connectionId && existing.connectionId !== connectionId) {
        options.refreshOperatorConnectionIndex(socketSchoolId, existing.connectionId);
      }
      if (connectionId) {
        options.refreshOperatorConnectionIndex(socketSchoolId, connectionId);
      }

      socket.join(gameId);
      socket.join(options.gameRoom(socketSchoolId, gameId));
      if (deviceId) {
        socket.join(options.deviceRoom(socketSchoolId, deviceId));
        options.emitPresenceForDevice(socketSchoolId, deviceId);
      }
      if (connectionId) {
        socket.join(options.connectionRoom(socketSchoolId, connectionId));
        options.emitPresenceForConnection(socketSchoolId, connectionId);
      }

      // Re-sync the starting lineup if the operator included one and the server
      // has an empty active lineup (e.g. after an API restart).
      const rawLineupByTeam = payload.startingLineupByTeam;
      if (rawLineupByTeam && typeof rawLineupByTeam === "object" && !Array.isArray(rawLineupByTeam)) {
        const updated = options.patchGameLineup(gameId, rawLineupByTeam as Record<string, string[]>, { schoolId: socketSchoolId });
        if (updated) {
          options.emitToGameRooms(socketSchoolId, gameId, "game:state", updated);
        }
      }
    }

    socket.on("operator:register", (payload: unknown) => {
      registerOperator(payload);
    });

    socket.on("operator:heartbeat", (payload: unknown) => {
      registerOperator(payload);
    });

    socket.on("join:game", (gameId: string) => {
      if (!gameId) {
        return;
      }

      socket.join(gameId);
      socket.join(options.gameRoom(socketSchoolId, gameId));
      if (options.isGameSubmitted(gameId, { schoolId: socketSchoolId })) {
        socket.emit("game:submitted", { gameId });
        return;
      }
      const state = options.getGameState(gameId, { schoolId: socketSchoolId });
      if (state) {
        socket.emit("game:state", state);
        socket.emit("game:insights", options.getGameInsights(gameId, { schoolId: socketSchoolId }));
        void options.refreshAndBroadcastInsights(socketSchoolId, gameId);
      }
    });

    socket.on("join:coach", (rawPayload: unknown) => {
      const payload = (rawPayload ?? {}) as Record<string, unknown>;
      const gameId = typeof payload.gameId === "string" ? payload.gameId.trim() : "";
      const connectionId = options.normalizeConnectionKey(payload.connectionId);

      if (gameId) {
        socket.join(gameId);
        socket.join(options.gameRoom(socketSchoolId, gameId));
        if (options.isGameSubmitted(gameId, { schoolId: socketSchoolId })) {
          socket.emit("game:submitted", { gameId });
        } else {
          const state = options.getGameState(gameId, { schoolId: socketSchoolId });
          if (state) {
            socket.emit("game:state", state);
            socket.emit("game:insights", options.getGameInsights(gameId, { schoolId: socketSchoolId }));
            void options.refreshAndBroadcastInsights(socketSchoolId, gameId);
          }
        }
      }

      if (connectionId) {
        socket.join(options.connectionRoom(socketSchoolId, connectionId));
        socket.emit("presence:status", options.buildConnectionPresencePayload(socketSchoolId, connectionId));
      }
    });

    socket.on("disconnect", () => {
      const operator = options.operatorPresenceBySocketId.get(socket.id);
      if (!operator) {
        return;
      }

      options.operatorPresenceBySocketId.delete(socket.id);
      if (operator.deviceId) {
        options.operatorPresenceByDeviceId.delete(`${operator.schoolId}:${operator.deviceId}`);
        socket.leave(options.deviceRoom(operator.schoolId, operator.deviceId));
      }
      if (operator.connectionId) {
        options.refreshOperatorConnectionIndex(operator.schoolId, operator.connectionId);
        socket.leave(options.connectionRoom(operator.schoolId, operator.connectionId));
      }
      socket.leave(options.gameRoom(operator.schoolId, operator.gameId));
      socket.leave(operator.gameId);

      if (operator.deviceId) {
        options.emitPresenceForDevice(operator.schoolId, operator.deviceId);
      }
      if (operator.connectionId) {
        options.emitPresenceForConnection(operator.schoolId, operator.connectionId);
      }
    });
  });
}
