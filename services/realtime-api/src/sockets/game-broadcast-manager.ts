import type { Server } from "socket.io";

interface PendingBroadcast {
  state: unknown;
  insights: unknown;
  timerId: ReturnType<typeof setTimeout>;
}

interface CreateGameBroadcastManagerOptions {
  io: Server;
  gameRoom: (schoolId: string, gameId: string) => string;
  debounceMs?: number;
}

export function createGameBroadcastManager(options: CreateGameBroadcastManagerOptions) {
  const pendingBroadcasts = new Map<string, PendingBroadcast>();
  const debounceMs = options.debounceMs ?? 60;

  function emitToGameRooms(schoolId: string, gameId: string, eventName: string, payload: unknown): void {
    options.io.to(options.gameRoom(schoolId, gameId)).emit(eventName, payload);
  }

  function broadcastGameStateWithDebounce(schoolId: string, gameId: string, state: unknown, insights: unknown): void {
    const broadcastKey = `${schoolId}:${gameId}`;
    const existing = pendingBroadcasts.get(broadcastKey);
    if (existing) {
      existing.state = state;
      existing.insights = insights;
      return;
    }

    const timerId = setTimeout(() => {
      const pending = pendingBroadcasts.get(broadcastKey);
      if (pending) {
        emitToGameRooms(schoolId, gameId, "game:state", pending.state);
        emitToGameRooms(schoolId, gameId, "game:insights", pending.insights);
        pendingBroadcasts.delete(broadcastKey);
      }
    }, debounceMs);

    pendingBroadcasts.set(broadcastKey, { state, insights, timerId });
  }

  return {
    emitToGameRooms,
    broadcastGameStateWithDebounce,
  };
}
