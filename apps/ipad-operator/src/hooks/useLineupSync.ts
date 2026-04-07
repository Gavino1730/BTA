import { useEffect } from "react";
import type { AppData } from "../types.js";
import { apiHeaders, isConnectionReadyForStart } from "../helpers/network.js";
import { saveAppData } from "../helpers/storage.js";
import { sanitizeLineup, lineupsEqual } from "../helpers/lineup.js";

export interface UseLineupSyncInput {
  gamePhase: "pre-game" | "live" | "post-game";
  appData: AppData;
  setAppData: React.Dispatch<React.SetStateAction<AppData>>;
  setLineupLockedByLiveGame: (locked: boolean) => void;
  setConnectionSyncStatus: (status: string) => void;
  persistPhase: (phase: "pre-game" | "live" | "post-game") => void;
}

export function useLineupSync({
  gamePhase,
  appData,
  setAppData,
  setLineupLockedByLiveGame,
  setConnectionSyncStatus,
  persistPhase,
}: UseLineupSyncInput) {
  useEffect(() => {
    if (gamePhase !== "pre-game") {
      setLineupLockedByLiveGame(false);
      return;
    }

    if (!isConnectionReadyForStart(appData.gameSetup)) {
      setLineupLockedByLiveGame(false);
      return;
    }

    let cancelled = false;

    async function syncActiveGameLockAndLineup() {
      try {
        const response = await fetch(`${appData.gameSetup.apiUrl}/api/games/active/state`, apiHeaders(appData.gameSetup));
        if (cancelled) return;

        if (!response.ok) {
          if (response.status === 404) {
            setLineupLockedByLiveGame(false);
          }
          return;
        }

        const activeState = await response.json() as {
          gameId?: string;
          events?: unknown[];
          activeLineupsByTeam?: Record<string, string[]>;
        };

        const hasLiveEvents = Array.isArray(activeState.events) && activeState.events.length > 0;
        setLineupLockedByLiveGame(hasLiveEvents);

        if (hasLiveEvents && gamePhase === "pre-game") {
          setConnectionSyncStatus("Live game detected from the server. Resuming this game on this iPad.");
          persistPhase("live");
        }

        setAppData((current) => {
          const trackedTeamId = current.gameSetup.vcSide === "away"
            ? (current.gameSetup.myTeamId || "team-away")
            : (current.gameSetup.myTeamId || "team-home");

          const serverLineup = sanitizeLineup(activeState.activeLineupsByTeam?.[trackedTeamId]);
          const currentLineup = sanitizeLineup(current.gameSetup.startingLineup ?? []);

          const team = current.teams.find((entry) => entry.id === current.gameSetup.myTeamId);
          const allowedPlayerIds = new Set((team?.players ?? []).map((player) => player.id));
          const filteredLineup = serverLineup.filter((playerId) => allowedPlayerIds.has(playerId));
          const nextLineup = filteredLineup.length > 0 ? filteredLineup : serverLineup;

          const nextGameId = activeState.gameId?.trim() || current.gameSetup.gameId;
          const lineupChanged = nextLineup.length > 0 && !lineupsEqual(currentLineup, nextLineup);
          const gameIdChanged = nextGameId !== current.gameSetup.gameId;

          if (!lineupChanged && !gameIdChanged) {
            return current;
          }

          const next = {
            ...current,
            gameSetup: {
              ...current.gameSetup,
              gameId: nextGameId,
              startingLineup: lineupChanged ? nextLineup : current.gameSetup.startingLineup,
            },
          };
          saveAppData(next);
          return next;
        });
      } catch {
        // Keep last known lineup lock if network is temporarily unavailable.
      }
    }

    void syncActiveGameLockAndLineup();
    const intervalId = window.setInterval(() => {
      void syncActiveGameLockAndLineup();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [appData.gameSetup, gamePhase]); // eslint-disable-line react-hooks/exhaustive-deps
}
