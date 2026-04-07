import { useEffect } from "react";
import type { AppData } from "../types.js";
import type { OperatorLinkResponse } from "../types.js";
import {
  apiHeaders,
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
      const remoteTeams = await fetchTeamsFromRealtime(apiUrl, apiKey, schoolId);
      const converted = remoteTeams.map(convertRosterTeamToAppTeam);

      if (!active || converted.length === 0) {
        return;
      }

      if (JSON.stringify(converted) === JSON.stringify(appData.teams)) {
        return;
      }

      const hasSelectedTeam = converted.some((team) => team.id === appData.gameSetup.myTeamId);
      const nextMyTeamId = hasSelectedTeam ? appData.gameSetup.myTeamId : (converted[0]?.id ?? "");

      const next: AppData = {
        ...appData,
        teams: converted,
        gameSetup: { ...appData.gameSetup, myTeamId: nextMyTeamId },
      };
      setAppData(next);
      saveAppData(next);
    }

    void syncTeamsFromRealtime();
    const intervalId = setInterval(() => {
      void syncTeamsFromRealtime();
    }, 5000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [appData]);

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
    if (!normalizedId) {
      setConnectionSyncStatus(DEFAULT_CONNECTION_SYNC_STATUS);
      return false;
    }

    setConnectionSyncStatus(`Syncing ${normalizedId} from the coach dashboard...`);

    try {
      const response = await fetch(
        `${appData.gameSetup.apiUrl}/api/operator-links/${encodeURIComponent(normalizedId)}`,
        apiHeaders(appData.gameSetup),
      );

      if (response.status === 404) {
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
        return false;
      }

      if (!response.ok) {
        throw new Error(`Sync failed (${response.status})`);
      }

      const payload = (await response.json()) as OperatorLinkResponse;
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
    } catch {
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
