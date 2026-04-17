import type { RosterTeam } from "../store.js";

type TeamStatus = "active" | "archived" | "read_only";

export type WorkspaceRosterTeam = RosterTeam & {
  status?: TeamStatus;
};

export type GameStateLike = {
  homeTeamId?: string;
  awayTeamId?: string;
};

export function findTrackedRosterTeamForGame(
  state: GameStateLike | null | undefined,
  teams: WorkspaceRosterTeam[],
): WorkspaceRosterTeam | null {
  if (!state) {
    return null;
  }

  const byId = new Map(teams.map((team) => [team.id, team]));
  if (state.homeTeamId && byId.has(state.homeTeamId)) {
    return byId.get(state.homeTeamId) ?? null;
  }
  if (state.awayTeamId && byId.has(state.awayTeamId)) {
    return byId.get(state.awayTeamId) ?? null;
  }
  return null;
}

export function isTeamReadOnly(team: WorkspaceRosterTeam | null | undefined): boolean {
  return team?.status === "read_only";
}
