import { Socket } from "socket.io-client";
import type { RosterTeam } from "@bta/shared-schema";

export interface RosterSyncHandler {
  onRosterUpdated: (teams: RosterTeam[]) => void;
  onTeamCreated?: (team: RosterTeam) => void;
  onTeamDeleted?: (teamId: string) => void;
  onPlayerAdded?: (teamId: string, player: any) => void;
  onPlayerDeleted?: (teamId: string, playerId: string) => void;
}

/**
 * Subscribe to roster sync events from the realtime API.
 * Emits updates via the provided handler callbacks.
 */
export function subscribeToRosterSync(
  socket: Socket | null,
  handler: RosterSyncHandler
): () => void {
  if (!socket) {
    return () => {};
  }

  const handleRosterTeams = (teams: RosterTeam[]) => {
    handler.onRosterUpdated(teams);
  };

  const handleTeamCreated = (data: { team: RosterTeam }) => {
    handler.onTeamCreated?.(data.team);
  };

  const handleTeamDeleted = (data: { teamId: string }) => {
    handler.onTeamDeleted?.(data.teamId);
  };

  const handlePlayerAdded = (data: { teamId: string; player: any }) => {
    handler.onPlayerAdded?.(data.teamId, data.player);
  };

  const handlePlayerDeleted = (data: { teamId: string; playerId: string }) => {
    handler.onPlayerDeleted?.(data.teamId, data.playerId);
  };

  socket.on("roster:teams", handleRosterTeams);
  socket.on("team:created", handleTeamCreated);
  socket.on("team:deleted", handleTeamDeleted);
  socket.on("player:added", handlePlayerAdded);
  socket.on("player:deleted", handlePlayerDeleted);

  return () => {
    socket.off("roster:teams", handleRosterTeams);
    socket.off("team:created", handleTeamCreated);
    socket.off("team:deleted", handleTeamDeleted);
    socket.off("player:added", handlePlayerAdded);
    socket.off("player:deleted", handlePlayerDeleted);
  };
}

/**
 * Sync roster to the realtime API.
 */
export async function syncRosterToRealtime(
  apiUrl: string,
  teams: RosterTeam[],
  apiKey?: string
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(`${apiUrl}/config/roster-teams`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ teams }),
    });

    return response.ok;
  } catch (err) {
    console.error("Failed to sync roster to realtime API:", err);
    return false;
  }
}

/**
 * Create a team via the realtime API.
 */
export async function createTeamViaRealtime(
  apiUrl: string,
  name: string,
  abbreviation: string,
  teamColor?: string,
  apiKey?: string
): Promise<RosterTeam | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(`${apiUrl}/teams`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, abbreviation, teamColor }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { team: RosterTeam };
    return data.team;
  } catch (err) {
    console.error("Failed to create team via realtime API:", err);
    return null;
  }
}

/**
 * Update a team via the realtime API.
 */
export async function updateTeamViaRealtime(
  apiUrl: string,
  teamId: string,
  name: string,
  abbreviation: string,
  teamColor?: string,
  apiKey?: string
): Promise<RosterTeam | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(`${apiUrl}/teams/${teamId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name, abbreviation, teamColor }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { team: RosterTeam };
    return data.team;
  } catch (err) {
    console.error("Failed to update team via realtime API:", err);
    return null;
  }
}

/**
 * Delete a team via the realtime API.
 */
export async function deleteTeamViaRealtime(
  apiUrl: string,
  teamId: string,
  apiKey?: string
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(`${apiUrl}/teams/${teamId}`, {
      method: "DELETE",
      headers,
    });

    return response.ok;
  } catch (err) {
    console.error("Failed to delete team via realtime API:", err);
    return false;
  }
}

/**
 * Add a player to a team via the realtime API.
 */
export async function addPlayerViaRealtime(
  apiUrl: string,
  teamId: string,
  player: any,
  apiKey?: string
): Promise<any | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(`${apiUrl}/teams/${teamId}/players`, {
      method: "POST",
      headers,
      body: JSON.stringify(player),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { player: any };
    return data.player;
  } catch (err) {
    console.error("Failed to add player via realtime API:", err);
    return null;
  }
}

/**
 * Update a player via the realtime API.
 */
export async function updatePlayerViaRealtime(
  apiUrl: string,
  teamId: string,
  playerId: string,
  updates: any,
  apiKey?: string
): Promise<any | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(`${apiUrl}/teams/${teamId}/players/${playerId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { player: any };
    return data.player;
  } catch (err) {
    console.error("Failed to update player via realtime API:", err);
    return null;
  }
}

/**
 * Delete a player from a team via the realtime API.
 */
export async function deletePlayerViaRealtime(
  apiUrl: string,
  teamId: string,
  playerId: string,
  apiKey?: string
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(`${apiUrl}/teams/${teamId}/players/${playerId}`, {
      method: "DELETE",
      headers,
    });

    return response.ok;
  } catch (err) {
    console.error("Failed to delete player via realtime API:", err);
    return false;
  }
}
