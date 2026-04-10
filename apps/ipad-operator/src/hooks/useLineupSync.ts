import { useEffect } from "react";
import type { AppData } from "../types.js";
import { apiHeaders, isConnectionReadyForStart } from "../helpers/network.js";
import { saveAppData } from "../helpers/storage.js";
import { sanitizeLineup, lineupsEqual } from "../helpers/lineup.js";

export interface UseLineupSyncInput {
  gamePhase: "pre-game" | "live" | "post-game" | "finished";
  appData: AppData;
  setAppData: React.Dispatch<React.SetStateAction<AppData>>;
  setLineupLockedByLiveGame: (locked: boolean) => void;
  setConnectionSyncStatus: (status: string) => void;
  setLineupSyncStatus: (status: string) => void;
  persistPhase: (phase: "pre-game" | "live" | "post-game" | "finished") => void;
}

export function useLineupSync({
  gamePhase,
  appData,
  setAppData,
  setLineupLockedByLiveGame,
  setConnectionSyncStatus,
  setLineupSyncStatus,
  persistPhase,
}: UseLineupSyncInput) {
  useEffect(() => {
    if (gamePhase !== "pre-game") {
      setLineupLockedByLiveGame(false);
      setLineupSyncStatus("");
      return;
    }

    if (!isConnectionReadyForStart(appData.gameSetup)) {
      setLineupLockedByLiveGame(false);
      setLineupSyncStatus("");
      return;
    }

    const schoolId = appData.gameSetup.schoolId?.trim();
    if (!schoolId) {
      setLineupLockedByLiveGame(false);
      setLineupSyncStatus("Waiting for school sync before checking live game lock.");
      return;
    }

    // Don't poll the server until we have a gameId from the coach sync.
    // useCoachSync delivers the gameId via the operator link; polling active/state
    // before that just generates repeated 404s.
    if (!appData.gameSetup.gameId) {
      setLineupLockedByLiveGame(false);
      setLineupSyncStatus("");
      return;
    }

    let cancelled = false;

    async function syncActiveGameLockAndLineup() {
      try {
        const response = await fetch(`${appData.gameSetup.apiUrl}/api/games/active/state`, apiHeaders(appData.gameSetup));
        if (cancelled) return;

        if (!response.ok) {
          return;
        }

        const activeState = await response.json() as {
          gameId?: string;
          events?: unknown[];
          activeLineupsByTeam?: Record<string, string[]>;
        };

        const hasLiveEvents = Array.isArray(activeState.events) && activeState.events.length > 0;
        setLineupLockedByLiveGame(hasLiveEvents);
        setLineupSyncStatus("");

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
        setLineupSyncStatus(
          "Could not refresh the live lineup lock from the server. Your last saved starters remain available on this iPad.",
        );
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
