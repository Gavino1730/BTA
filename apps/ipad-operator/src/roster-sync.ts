import type { RosterTeam, RosterPlayer } from "@bta/shared-schema";

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  teamColor?: string;
  coachStyle?: string;
  players: Player[];
}

export interface Player {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;
  grade?: string;
  role?: string;
  notes?: string;
}

/**
 * Fetch teams from the realtime API.
 */
export async function fetchTeamsFromRealtime(
  apiUrl: string,
  apiKey?: string
): Promise<RosterTeam[]> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(`${apiUrl}/config/roster-teams`, {
      headers,
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { teams: RosterTeam[] };
    return data.teams || [];
  } catch (err) {
    console.error("Failed to fetch teams from realtime API:", err);
    return [];
  }
}

/**
 * Convert realtime RosterTeam to app Team interface.
 */
export function convertRosterTeamToAppTeam(rosterTeam: RosterTeam): Team {
  return {
    id: rosterTeam.id,
    name: rosterTeam.name,
    abbreviation: rosterTeam.abbreviation,
    teamColor: rosterTeam.teamColor,
    coachStyle: rosterTeam.coachStyle,
    players: rosterTeam.players.map((p) => ({
      id: p.id,
      number: p.number,
      name: p.name,
      position: p.position,
      height: p.height,
      grade: p.grade,
      role: p.role,
      notes: p.notes,
    })),
  };
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
): Promise<Team | null> {
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
    return convertRosterTeamToAppTeam(data.team);
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
): Promise<Team | null> {
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
    return convertRosterTeamToAppTeam(data.team);
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
  player: Player,
  apiKey?: string
): Promise<Player | null> {
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
  updates: Partial<Player>,
  apiKey?: string
): Promise<Player | null> {
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
