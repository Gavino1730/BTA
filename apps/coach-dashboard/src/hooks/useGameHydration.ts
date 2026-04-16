import { type MutableRefObject, useEffect, useRef } from "react";
import { normalizeTeamColor } from "@bta/shared-schema";
import { apiBase, apiKeyHeader, resolveActiveSchoolId } from "../platform.js";
import { type GameState, type Insight, type BoxScoreFilter } from "../helpers/index.js";

function summarizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error ?? "unknown error");
}

/** Remove old game cache entries from localStorage, keeping the current game
 *  and at most `keepCount` of the most recent other games. Game IDs are
 *  date-prefixed (YYYY-MM-DD-slug) so alphabetical sort approximates age. */
function pruneGameStateCache(currentGameId: string, keepCount = 5): void {
  try {
    const allIds = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const match = /^gameState-(.+)$/.exec(key);
      if (match) allIds.add(match[1]);
    }
    const otherIds = [...allIds].filter((id) => id !== currentGameId).sort();
    const toDelete = otherIds.slice(0, Math.max(0, otherIds.length - keepCount));
    for (const id of toDelete) {
      localStorage.removeItem(`gameState-${id}`);
      localStorage.removeItem(`gameInsights-${id}`);
    }
  } catch {
    // Ignore storage errors.
  }
}

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

function readActiveTeamId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("teamId")?.trim() ?? "";
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
  const hasTenantScope = Boolean(resolveActiveSchoolId());
  const activeTeamId = readActiveTeamId();

  // Set to true when we've just determined there's no active game (e.g. both the
  // specific gameId and active/state returned 404). Prevents reconcileGameId from
  // firing a redundant active/state fetch immediately after clearActiveGame.
  const skipNextReconcileRef = useRef(false);

  // Reconcile gameId: auto-recover an active game when none is tracked locally.
  // When gameId is already set, the hydration effect below validates and loads
  // state — no duplicate fetch needed here.
  useEffect(() => {
    if (gameId || !connectionId || !hasTenantScope) {
      return;
    }

    if (skipNextReconcileRef.current) {
      skipNextReconcileRef.current = false;
      return;
    }

    let cancelled = false;

    async function reconcileGameId() {
      try {
        const activeUrl = new URL(`${apiBase}/api/games/active/state`);
        if (activeTeamId) {
          activeUrl.searchParams.set("teamId", activeTeamId);
        }
        const activeResponse = await fetch(activeUrl, { headers: apiKeyHeader() });

        if (!activeResponse.ok || cancelled) {
          return;
        }

        const active = await activeResponse.json() as { gameId?: string };
        if (cancelled || !active.gameId || endedGameIdsRef.current.has(active.gameId)) {
          return;
        }

        setDashboardStatus("Recovered active game from server.");
        setGameId(active.gameId);
      } catch (error) {
        console.warn("[coach-dashboard] reconcileGameId failed", summarizeError(error));
        // Keep local state when offline/unreachable.
      }
    }

    void reconcileGameId();

    return () => {
      cancelled = true;
    };
  }, [activeTeamId, connectionId, gameId, hasTenantScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate setup names from the server when a game is active.
  useEffect(() => {
    if (!gameId || !hasTenantScope) {
      return;
    }

    let cancelled = false;

    async function hydrateActiveSetupNames() {
      try {
        const activeSetupUrl = new URL(`${apiBase}/api/games/active/setup`);
        if (activeTeamId) {
          activeSetupUrl.searchParams.set("teamId", activeTeamId);
        }
        const response = await fetch(activeSetupUrl, { headers: apiKeyHeader() });

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
      } catch (error) {
        console.warn("[coach-dashboard] hydrateActiveSetupNames failed", summarizeError(error));
        // Keep current setup when active setup cannot be fetched.
      }
    }

    void hydrateActiveSetupNames();

    return () => {
      cancelled = true;
    };
  }, [activeTeamId, gameId, hasTenantScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load game state and insights when gameId changes.
  useEffect(() => {
    if (!gameId || !hasTenantScope) {
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

    let cancelled = false;

    async function hydrate() {
      // Fetch state and insights in parallel for faster load
      const [stateRes, insightRes] = await Promise.all([
        fetch(`${apiBase}/api/games/${gameId}/state`, { headers: apiKeyHeader() }),
        fetch(`${apiBase}/api/games/${gameId}/insights`, { headers: apiKeyHeader() })
      ]);

      if (cancelled) {
        setIsLoading(false);
        return;
      }

      // Handle game state
      try {
        if (stateRes.ok) {
          const payload = (await stateRes.json()) as GameState;
          setState(payload);
          setDashboardStatus("Loaded server game state");
          try {
            localStorage.setItem(`gameState-${gameId}`, JSON.stringify(payload));
            pruneGameStateCache(gameId);
          } catch {
            // localStorage full or disabled, ignore
          }
        } else if (stateRes.status === 404) {
          // Game no longer exists on server — try to find the current active game
          // and switch to it, or clear the session if none exists.
          try {
            const activeUrl = new URL(`${apiBase}/api/games/active/state`);
            if (activeTeamId) {
              activeUrl.searchParams.set("teamId", activeTeamId);
            }
            const activeRes = await fetch(activeUrl, { headers: apiKeyHeader() });
            if (activeRes.ok) {
              const active = await activeRes.json() as { gameId?: string | null };
              if (active.gameId && active.gameId !== gameId) {
                setDashboardStatus("Recovered active game from server.");
                setGameId(active.gameId);
                setIsLoading(false);
                return;
              } else if (!active.gameId) {
                endedGameIdsRef.current.add(gameId);
                skipNextReconcileRef.current = true;
                clearActiveGame("Cleared stale game session. Start a new game when ready.", { rotateConnectionCode: true });
                return;
              }
            }
          } catch (error) {
            console.warn("[coach-dashboard] active game recovery failed", summarizeError(error));
            // offline — fall through to cache
          }
          const cachedState = localStorage.getItem(`gameState-${gameId}`);
          if (cachedState) {
            try {
              setState(JSON.parse(cachedState) as GameState);
              setDashboardStatus("Loaded cached game state (offline mode)");
            } catch {
              setDashboardStatus("Offline and no cached state available");
            }
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
      } catch (error) {
        console.warn("[coach-dashboard] state hydration failed", summarizeError(error));
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
      } catch (error) {
        console.warn("[coach-dashboard] insights hydration failed", summarizeError(error));
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

    hydrate().catch((error) => {
      console.warn("[coach-dashboard] hydrate effect failed", summarizeError(error));
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTeamId, gameId, hasTenantScope]); // eslint-disable-line react-hooks/exhaustive-deps
}
