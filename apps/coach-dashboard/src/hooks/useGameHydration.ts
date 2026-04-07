import { type MutableRefObject, useEffect } from "react";
import { normalizeTeamColor } from "@bta/shared-schema";
import { apiBase, apiKeyHeader } from "../platform.js";
import { type GameState, type Insight, type BoxScoreFilter } from "../helpers/index.js";

interface SetupNames {
  myTeamId: string;
  myTeamName: string;
  opponentName: string;
  vcSide: "home" | "away";
  homeColor: string;
  awayColor: string;
}

interface ActiveSetupResponse {
  activeGameId?: string;
  setup?: {
    gameId?: string;
    myTeamId?: string;
    myTeamName?: string;
    opponentName?: string;
    vcSide?: "home" | "away";
    homeTeamColor?: string;
    awayTeamColor?: string;
  } | null;
}

export interface UseGameHydrationOptions {
  gameId: string;
  connectionId: string;
  endedGameIdsRef: MutableRefObject<Set<string>>;
  clearActiveGame: (statusMessage: string) => void;
  setGameId: (updater: string | ((current: string) => string)) => void;
  setState: (updater: GameState | null | ((current: GameState | null) => GameState | null)) => void;
  setInsights: (insights: Insight[]) => void;
  setDeviceConnected: (connected: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setDashboardStatus: (status: string) => void;
  setSetupNames: (updater: SetupNames | ((current: SetupNames) => SetupNames)) => void;
  resetAiState: () => void;
  setBoxScoreFilter: (filter: BoxScoreFilter) => void;
}

/** Handles all server-side data fetching for the coach dashboard: game recovery,
 *  setup hydration, and state/insights loading when gameId changes. */
export function useGameHydration({
  gameId,
  connectionId,
  endedGameIdsRef,
  clearActiveGame,
  setGameId,
  setState,
  setInsights,
  setDeviceConnected,
  setIsLoading,
  setDashboardStatus,
  setSetupNames,
  resetAiState,
  setBoxScoreFilter,
}: UseGameHydrationOptions): void {
  // Reconcile gameId: auto-recover an active game or clear a stale one.
  useEffect(() => {
    let cancelled = false;

    async function reconcileGameId() {
      try {
        if (!gameId) {
          if (!connectionId) {
            return;
          }

          const activeResponse = await fetch(`${apiBase}/api/games/active/state`, {
            headers: apiKeyHeader(),
          });

          if (!activeResponse.ok || cancelled) {
            return;
          }

          const active = await activeResponse.json() as { gameId?: string };
          if (cancelled || !active.gameId || endedGameIdsRef.current.has(active.gameId)) {
            return;
          }

          setDashboardStatus("Recovered active game from server.");
          setGameId(active.gameId);
          return;
        }

        const stateResponse = await fetch(`${apiBase}/api/games/${gameId}/state`, {
          headers: apiKeyHeader(),
        });

        if (cancelled || stateResponse.status !== 404) {
          return;
        }

        const activeResponse = await fetch(`${apiBase}/api/games/active/state`, {
          headers: apiKeyHeader(),
        });

        if (cancelled) {
          return;
        }

        if (activeResponse.ok) {
          const active = await activeResponse.json() as { gameId?: string };
          if (active.gameId && active.gameId !== gameId) {
            setDashboardStatus("Recovered active game from server.");
            setGameId(active.gameId);
          }
          return;
        }

        if (activeResponse.status === 404) {
          endedGameIdsRef.current.add(gameId);
          clearActiveGame("Cleared stale game session. Start a new game when ready.");
        }
      } catch {
        // Keep local state when offline/unreachable.
      }
    }

    void reconcileGameId();

    return () => {
      cancelled = true;
    };
  }, [connectionId, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate setup names from the server when a game is active.
  useEffect(() => {
    if (!gameId) {
      return;
    }

    let cancelled = false;

    async function hydrateActiveSetupNames() {
      try {
        const response = await fetch(`${apiBase}/api/games/active/setup`, {
          headers: apiKeyHeader(),
        });

        if (!response.ok || cancelled) {
          return;
        }

        const payload = await response.json() as ActiveSetupResponse;
        if (cancelled || !payload.setup) {
          return;
        }

        if (payload.activeGameId && payload.activeGameId !== gameId) {
          return;
        }

        setSetupNames((current) => ({
          myTeamId: payload.setup?.myTeamId ?? current.myTeamId,
          myTeamName: payload.setup?.myTeamName ?? current.myTeamName,
          opponentName: payload.setup?.opponentName ?? current.opponentName,
          vcSide: payload.setup?.vcSide === "away"
            ? "away"
            : payload.setup?.vcSide === "home"
              ? "home"
              : current.vcSide,
          homeColor: normalizeTeamColor(payload.setup?.homeTeamColor) ?? current.homeColor,
          awayColor: normalizeTeamColor(payload.setup?.awayTeamColor) ?? current.awayColor,
        }));
      } catch {
        // Keep current setup when active setup cannot be fetched.
      }
    }

    void hydrateActiveSetupNames();

    return () => {
      cancelled = true;
    };
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load game state and insights when gameId changes.
  useEffect(() => {
    if (!gameId) {
      return;
    }

    // Clear ALL game-specific state immediately so the dashboard shows a clean
    // slate while new game data loads - no stale scores, events, AI chat,
    // or device-connection carry-over from the previous game.
    setState(null);
    setInsights([]);
    resetAiState();
    setBoxScoreFilter([]);
    setDeviceConnected(false);
    setDashboardStatus("Loading new game...");
    setIsLoading(true);

    async function hydrate() {
      // Fetch state and insights in parallel for faster load
      const [stateRes, insightRes] = await Promise.all([
        fetch(`${apiBase}/api/games/${gameId}/state`, { headers: apiKeyHeader() }),
        fetch(`${apiBase}/api/games/${gameId}/insights`, { headers: apiKeyHeader() })
      ]);

      // Handle game state
      try {
        if (stateRes.ok) {
          const payload = (await stateRes.json()) as GameState;
          setState(payload);
          setDashboardStatus("Loaded server game state");
          try {
            localStorage.setItem(`gameState-${gameId}`, JSON.stringify(payload));
          } catch {
            // localStorage full or disabled, ignore
          }
        } else {
          const cachedState = localStorage.getItem(`gameState-${gameId}`);
          if (cachedState) {
            try {
              const payload = JSON.parse(cachedState) as GameState;
              setState(payload);
              setDashboardStatus("Loaded cached game state (offline mode)");
            } catch {
              setDashboardStatus("Offline and no cached state available");
            }
          }
        }
      } catch {
        const cachedState = localStorage.getItem(`gameState-${gameId}`);
        if (cachedState) {
          try {
            const payload = JSON.parse(cachedState) as GameState;
            setState(payload);
            setDashboardStatus("Loaded cached game state (offline mode)");
          } catch {
            setDashboardStatus("Offline and no cached state available");
          }
        }
      }

      // Handle insights
      try {
        if (insightRes.ok) {
          const payload = (await insightRes.json()) as Insight[];
          setInsights(payload);
          try {
            localStorage.setItem(`gameInsights-${gameId}`, JSON.stringify(payload));
          } catch {
            // localStorage full or disabled, ignore
          }
        } else {
          const cachedInsights = localStorage.getItem(`gameInsights-${gameId}`);
          if (cachedInsights) {
            try {
              const payload = JSON.parse(cachedInsights) as Insight[];
              setInsights(payload);
            } catch {
              // Invalid cached data
            }
          }
        }
      } catch {
        const cachedInsights = localStorage.getItem(`gameInsights-${gameId}`);
        if (cachedInsights) {
          try {
            const payload = JSON.parse(cachedInsights) as Insight[];
            setInsights(payload);
          } catch {
            // Invalid cached data
          }
        }
      }

      setIsLoading(false);
    }

    hydrate().catch(() => {
      setIsLoading(false);
    });
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps
}
