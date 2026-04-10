import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import type { AppData, GameSetup, OperatorAlert } from "../types.js";
import { useSocket } from "./useSocket.js";

const socketMocks = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const handlers = new Map<string, Set<Handler>>();

  const socket = {
    connected: true,
    on: vi.fn((event: string, handler: Handler) => {
      const existing = handlers.get(event) ?? new Set<Handler>();
      existing.add(handler);
      handlers.set(event, existing);
      return socket;
    }),
    off: vi.fn((event: string, handler?: Handler) => {
      if (!event) {
        return socket;
      }
      if (!handler) {
        handlers.delete(event);
        return socket;
      }
      const existing = handlers.get(event);
      existing?.delete(handler);
      if (existing && existing.size === 0) {
        handlers.delete(event);
      }
      return socket;
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  return {
    io: vi.fn(() => socket),
    trigger(event: string, payload?: unknown) {
      for (const handler of handlers.get(event) ?? []) {
        handler(payload);
      }
    },
    reset() {
      handlers.clear();
      socket.connected = true;
      socket.on.mockClear();
      socket.off.mockClear();
      socket.emit.mockClear();
      socket.connect.mockClear();
      socket.disconnect.mockClear();
      this.io.mockClear();
    },
  };
});

vi.mock("socket.io-client", () => ({ io: socketMocks.io }));

const baseSetup: GameSetup = {
  gameId: "game-1",
  connectionId: "conn-1",
  myTeamId: "team-home",
  apiUrl: "http://localhost:4000",
  apiKey: "test-key",
  schoolId: "school-test",
  opponent: "Rivals",
  vcSide: "home",
  dashboardUrl: "http://localhost:5173",
};

const baseAppData: AppData = {
  teams: [],
  gameSetup: baseSetup,
};

function renderSocketHook(options?: { gameId?: string; gamePhase?: string; persistPhase?: (phase: "pre-game" | "live" | "post-game" | "finished") => void; showInlineNotice?: (message: string) => void }) {
  const setAppData = vi.fn();
  const setLiveAlerts = vi.fn();
  const setDismissedAlertIds = vi.fn();
  const setConnectionSyncStatus = vi.fn();
  const setConnectedOperatorCount = vi.fn();
  const persistPhase = options?.persistPhase ?? vi.fn();
  const onGameSubmitted = vi.fn();
  const showInlineNotice = options?.showInlineNotice ?? vi.fn();

  function Harness() {
    const socketRef = useRef<ReturnType<typeof socketMocks.io> | null>(null);
    useSocket({
      gameId: options?.gameId ?? "game-1",
      gamePhase: (options?.gamePhase ?? "live") as "pre-game" | "live" | "post-game",
      gameSetup: baseSetup,
      socketRef,
      setAppData: setAppData as React.Dispatch<React.SetStateAction<AppData>>,
      setLiveAlerts: setLiveAlerts as React.Dispatch<React.SetStateAction<OperatorAlert[]>>,
      setDismissedAlertIds: setDismissedAlertIds as React.Dispatch<React.SetStateAction<Set<string>>>,
      setConnectionSyncStatus,
      setConnectedOperatorCount,
      persistPhase,
      onGameSubmitted,
      showInlineNotice: showInlineNotice as (message: string, tone?: "info" | "success" | "warning" | "error", timeoutMs?: number) => void,
    });
    return null;
  }

  render(<Harness />);

  return {
    persistPhase,
    onGameSubmitted,
    showInlineNotice,
    setAppData,
  };
}

afterEach(() => {
  cleanup();
  socketMocks.reset();
});

describe("useSocket", () => {
  it("moves operator to finished when matching game is submitted", () => {
    const persistPhase = vi.fn();
    const showInlineNotice = vi.fn();

    const rendered = renderSocketHook({
      gameId: "game-1",
      gamePhase: "live",
      persistPhase,
      showInlineNotice,
    });

    socketMocks.trigger("game:submitted", { gameId: "game-1" });

    expect(persistPhase).toHaveBeenCalledWith("finished");
    expect(rendered.onGameSubmitted).toHaveBeenCalledTimes(1);
    expect(showInlineNotice).toHaveBeenCalledWith(
      "Game ended on another device. Switched to finished view.",
      "info",
      4500,
    );
  });

  it("ignores submitted events for a different game", () => {
    const persistPhase = vi.fn();
    const showInlineNotice = vi.fn();

    const rendered = renderSocketHook({
      gameId: "game-1",
      gamePhase: "live",
      persistPhase,
      showInlineNotice,
    });

    socketMocks.trigger("game:submitted", { gameId: "game-2" });

    expect(persistPhase).not.toHaveBeenCalled();
    expect(rendered.onGameSubmitted).not.toHaveBeenCalled();
    expect(showInlineNotice).not.toHaveBeenCalledWith(
      "Game ended on another device. Switched to finished view.",
      "info",
      4500,
    );
  });

  it("does not force post-game when already not live", () => {
    const persistPhase = vi.fn();
    const showInlineNotice = vi.fn();

    renderSocketHook({
      gameId: "game-1",
      gamePhase: "post-game",
      persistPhase,
      showInlineNotice,
    });

    socketMocks.trigger("game:submitted", { gameId: "game-1" });

    expect(persistPhase).not.toHaveBeenCalledWith("post-game");
    expect(showInlineNotice).not.toHaveBeenCalled();
  });
});
