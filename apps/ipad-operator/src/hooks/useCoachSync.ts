import { useEffect } from "react";
import type { AppData } from "../types.js";
import type { OperatorLinkResponse } from "../types.js";
import {
  fetchOperatorLinkSnapshot,
  mergeCoachLinkSnapshot,
  normalizeConnectionId,
} from "../helpers/network.js";
import { saveAppData } from "../helpers/storage.js";
import { convertRosterTeamToAppTeam, fetchTeamsFromRealtime } from "../roster-sync.js";
import { DEFAULT_API, DEFAULT_SCHOOL_ID } from "../constants.js";

export const DEFAULT_CONNECTION_SYNC_STATUS =
  "Paste the coach connection code to sync roster, team setup, and keep a local backup on this iPad.";

export interface CoachSyncDeps {
  appData: AppData;
  setAppData: React.Dispatch<React.SetStateAction<AppData>>;
  setConnectionSyncStatus: (status: string) => void;
  showInlineNotice: (
    message: string,
    tone?: "info" | "success" | "warning" | "error",
    timeoutMs?: number,
  ) => void;
}

/**
 * Handles coach-link sync: initial fetch + periodic re-sync of connection code,
 * as well as periodic team/roster polling from the realtime API.
 */
export function useCoachSync({
  appData,
  setAppData,
  setConnectionSyncStatus,
  showInlineNotice,
}: CoachSyncDeps) {
  function clearCachedOperatorAuth(current: AppData): AppData {
    if (!current.gameSetup.apiKey) {
      return current;
    }

    const next: AppData = {
      ...current,
      gameSetup: {
        ...current.gameSetup,
        apiKey: undefined,
      },
    };
    saveAppData(next);
    return next;
  }

  // ---- Periodic team sync from realtime API ----
  useEffect(() => {
    let active = true;

    async function syncTeamsFromRealtime() {
      const normalizedConnectionId = normalizeConnectionId(appData.gameSetup.connectionId);
      if (!normalizedConnectionId) {
        return;
      }

      const apiUrl = appData.gameSetup.apiUrl?.trim() || DEFAULT_API;
      const apiKey = appData.gameSetup.apiKey?.trim() || undefined;
      const schoolId = appData.gameSetup.schoolId?.trim() || DEFAULT_SCHOOL_ID;
      if (!schoolId) {
        return;
      }
      const remoteTeams = await fetchTeamsFromRealtime(apiUrl, apiKey, schoolId);
      const converted = remoteTeams.map(convertRosterTeamToAppTeam);

      if (!active || converted.length === 0) {
        return;
      }

      setAppData((current) => {
        if (JSON.stringify(converted) === JSON.stringify(current.teams)) {
          return current;
        }
        const hasSelectedTeam = converted.some((team) => team.id === current.gameSetup.myTeamId);
        const nextMyTeamId = hasSelectedTeam ? current.gameSetup.myTeamId : (converted[0]?.id ?? "");
        const next: AppData = {
          ...current,
          teams: converted,
          gameSetup: { ...current.gameSetup, myTeamId: nextMyTeamId },
        };
        saveAppData(next);
        return next;
      });
    }

    void syncTeamsFromRealtime();
    const intervalId = setInterval(() => {
      void syncTeamsFromRealtime();
    }, 20000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appData.gameSetup.apiUrl, appData.gameSetup.apiKey, appData.gameSetup.schoolId, appData.gameSetup.connectionId]);

  // ---- Connection-code re-sync ----
  useEffect(() => {
    const normalizedConnectionId = normalizeConnectionId(appData.gameSetup.connectionId);
    if (!normalizedConnectionId) {
      setConnectionSyncStatus(DEFAULT_CONNECTION_SYNC_STATUS);
      return;
    }

    void syncFromCoachCode(normalizedConnectionId, { silent: true });
    const intervalId = window.setInterval(() => {
      void syncFromCoachCode(normalizedConnectionId, { silent: true });
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [appData.gameSetup.apiKey, appData.gameSetup.apiUrl, appData.gameSetup.connectionId, appData.gameSetup.schoolId]);

  // ---- syncFromCoachCode ----
  async function syncFromCoachCode(
    connectionCode = appData.gameSetup.connectionId,
    options?: { silent?: boolean },
  ): Promise<boolean> {
    const normalizedId = normalizeConnectionId(connectionCode);
    const currentSyncedId = normalizeConnectionId(appData.gameSetup.syncedConnectionId);
    const isCurrentSyncedCode = Boolean(currentSyncedId) && currentSyncedId === normalizedId;
    if (!normalizedId) {
      setConnectionSyncStatus(DEFAULT_CONNECTION_SYNC_STATUS);
      return false;
    }

    setConnectionSyncStatus(`Syncing ${normalizedId} from the coach dashboard...`);

    try {
      const snapshot = await fetchOperatorLinkSnapshot({
        apiUrl: appData.gameSetup.apiUrl,
        liveSessionId: appData.gameSetup.liveSessionId,
        connectionId: normalizedId,
        schoolId: appData.gameSetup.schoolId,
      });

      if (!snapshot) {
        const alreadySynced = isCurrentSyncedCode;
        if (alreadySynced) {
          // Link is temporarily gone but the operator already has a synced game session.
          // Preserve all in-game state so a transient 404 (e.g. server restart, coach reset)
          // does not kick the operator out mid-game.
          setAppData((current) => clearCachedOperatorAuth(current));
          setConnectionSyncStatus(
            "Coach link temporarily unavailable. Your last synced roster and lineup are saved locally.",
          );
          if (!options?.silent) {
            showInlineNotice(
              "Lost contact with the coach dashboard. Your in-game data is saved locally on this iPad.",
              "warning",
              5000,
            );
          }
        } else {
          setAppData((current) => {
            const next: AppData = {
              ...current,
              gameSetup: {
                ...current.gameSetup,
                connectionId: normalizedId,
                syncedConnectionId: undefined,
                myTeamId: "",
                opponent: "",
                startingLineup: [],
              },
            };
            saveAppData(next);
            return next;
          });
          setConnectionSyncStatus(
            "Code saved locally. Waiting for the coach dashboard to publish the linked team and roster.",
          );
          if (!options?.silent) {
            showInlineNotice(
              "That code is saved on this iPad. Open the coach dashboard live page or try Sync again in a moment.",
              "warning",
              5000,
            );
          }
        }
        return false;
      }

      const payload = snapshot.payload as OperatorLinkResponse;
      let syncedTeamName = "team";

      setAppData((current) => {
        const next = mergeCoachLinkSnapshot(current, payload);
        syncedTeamName =
          next.teams.find((team) => team.id === next.gameSetup.myTeamId)?.name ??
          payload.setup?.myTeamName?.trim() ??
          "team";
        saveAppData(next);
        return next;
      });

      setConnectionSyncStatus(
        `Synced ${syncedTeamName} roster and game setup. This iPad will keep the latest copy saved locally if it disconnects.`,
      );
      if (!options?.silent) {
        showInlineNotice(`Synced ${syncedTeamName} from the coach dashboard.`, "success", 2500);
      }
      return true;
    } catch (error) {
      setConnectionSyncStatus(
        "Coach sync is temporarily offline. The last synced roster and lineup stay saved locally on this iPad.",
      );
      if (!options?.silent) {
        showInlineNotice(
          "Could not reach the coach session right now. Your last synced data is still saved locally.",
          "warning",
          6000,
        );
      }
      return false;
    }
  }

  return { syncFromCoachCode };
}
