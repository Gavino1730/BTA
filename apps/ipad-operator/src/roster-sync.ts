import type { RosterTeam } from "@bta/shared-schema";

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

function isLocalNetworkHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "0.0.0.0"
    || normalized === "::1"
    || normalized === "[::1]"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
    || /^10(?:\.\d{1,3}){3}$/.test(normalized)
    || /^192\.168(?:\.\d{1,3}){2}$/.test(normalized)
    || /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(normalized)
    || normalized.endsWith(".local")
    || !normalized.includes(".");
}

function resolveDefaultSchoolId(hostname: string): string {
  return isLocalNetworkHost(hostname) ? "default" : "";
}

const DEFAULT_SCHOOL_ID = (import.meta.env.VITE_SCHOOL_ID
  ?? (typeof window !== "undefined" ? resolveDefaultSchoolId(window.location.hostname || "localhost") : "default"))
  .toString()
  .trim();

function buildHeaders(apiKey?: string, schoolId?: string, withJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const resolvedSchoolId = schoolId?.trim() || DEFAULT_SCHOOL_ID;
  if (resolvedSchoolId) {
    headers["x-school-id"] = resolvedSchoolId;
  }
  if (withJson) {
    headers["Content-Type"] = "application/json";
  }
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

/**
 * Fetch teams from the realtime API.
 */
export async function fetchTeamsFromRealtime(
  apiUrl: string,
  apiKey?: string,
  schoolId?: string
): Promise<RosterTeam[]> {
  try {
    const response = await fetch(`${apiUrl}/config/roster-teams`, {
      headers: buildHeaders(apiKey, schoolId),
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
  apiKey?: string,
  schoolId?: string
): Promise<Team | null> {
  try {
    const response = await fetch(`${apiUrl}/teams`, {
      method: "POST",
      headers: buildHeaders(apiKey, schoolId, true),
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
  apiKey?: string,
  schoolId?: string
): Promise<Team | null> {
  try {
    const response = await fetch(`${apiUrl}/teams/${teamId}`, {
      method: "PUT",
      headers: buildHeaders(apiKey, schoolId, true),
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
  apiKey?: string,
  schoolId?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/teams/${teamId}`, {
      method: "DELETE",
      headers: buildHeaders(apiKey, schoolId),
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
  apiKey?: string,
  schoolId?: string
): Promise<Player | null> {
  try {
    const response = await fetch(`${apiUrl}/teams/${teamId}/players`, {
      method: "POST",
      headers: buildHeaders(apiKey, schoolId, true),
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
  apiKey?: string,
  schoolId?: string
): Promise<Player | null> {
  try {
    const response = await fetch(`${apiUrl}/teams/${teamId}/players/${playerId}`, {
      method: "PUT",
      headers: buildHeaders(apiKey, schoolId, true),
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
  apiKey?: string,
  schoolId?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/teams/${teamId}/players/${playerId}`, {
      method: "DELETE",
      headers: buildHeaders(apiKey, schoolId),
    });

    return response.ok;
  } catch (err) {
    console.error("Failed to delete player via realtime API:", err);
    return false;
  }
}
