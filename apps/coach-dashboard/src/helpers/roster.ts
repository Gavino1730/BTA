export interface RosterPlayer {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;
  grade?: string;
  role?: string;
  notes?: string;
}

export interface RosterTeam {
  id: string;
  name: string;
  abbreviation: string;
  teamColor?: string;
  coachStyle?: string;
  players: RosterPlayer[];
}

export const ROSTER_STORAGE_KEY = "shared-app-data-v3";
export const ACTIVE_GAME_KEY = "coach-active-game-id";
export const DOWNLOAD_REVOKE_DELAY_MS = 100;

export function loadRosterTeams(): RosterTeam[] {
  try {
    const raw = localStorage.getItem(ROSTER_STORAGE_KEY);
    if (raw) return (JSON.parse(raw) as { teams?: RosterTeam[] }).teams ?? [];
  } catch { /* corrupt */ }
  return [];
}

export function saveRosterTeams(teams: RosterTeam[]): void {
  try {
    const raw = localStorage.getItem(ROSTER_STORAGE_KEY);
    const existing: Record<string, unknown> = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ ...existing, teams }));
  } catch { /* storage full */ }
}

export function isRosterPlayer(value: unknown): value is RosterPlayer {
  if (!value || typeof value !== "object") return false;
  const player = value as Record<string, unknown>;
  return typeof player.id === "string"
    && typeof player.number === "string"
    && typeof player.name === "string"
    && typeof player.position === "string"
    && (player.role === undefined || typeof player.role === "string")
    && (player.notes === undefined || typeof player.notes === "string");
}

export function isRosterTeam(value: unknown): value is RosterTeam {
  if (!value || typeof value !== "object") return false;
  const team = value as Record<string, unknown>;
  return typeof team.id === "string"
    && typeof team.name === "string"
    && typeof team.abbreviation === "string"
    && (team.teamColor === undefined || typeof team.teamColor === "string")
    && (team.coachStyle === undefined || typeof team.coachStyle === "string")
    && Array.isArray(team.players)
    && team.players.every(isRosterPlayer);
}

export function normalizeRosterTeams(value: unknown): RosterTeam[] {
  return Array.isArray(value) ? value.filter(isRosterTeam) : [];
}

export function slugifyTeamName(name: string): string {
  return `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;
}

export function newPlayerId(): string {
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
