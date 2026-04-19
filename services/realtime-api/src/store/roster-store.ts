import type { RosterTeam, TenantScope } from "./store-types.js";

interface RosterStoreDependencies {
  resolveSchoolId: (scope?: TenantScope) => string;
  trimProfileField: (value: unknown, maxLength: number) => string;
  rosterTeamsBySchool: Map<string, RosterTeam[]>;
  getRosterTeamsForSchool: (schoolId: string) => RosterTeam[];
  setRosterTeamsForSchool: (schoolId: string, teams: RosterTeam[]) => RosterTeam[];
  persistSessions: () => void;
  persistRosterTeamsForSchool: (schoolId: string, teams: RosterTeam[]) => void | Promise<void>;
}

export function createRosterStore(deps: RosterStoreDependencies) {
  const getRosterTeamsByScope = (scope?: TenantScope): RosterTeam[] => {
    return deps.getRosterTeamsForSchool(deps.resolveSchoolId(scope));
  };

  const saveRosterTeams = (next: RosterTeam[], scope?: TenantScope): RosterTeam[] => {
    const schoolId = deps.resolveSchoolId(scope);
    const saved = deps.setRosterTeamsForSchool(schoolId, next);
    deps.persistSessions();
    void deps.persistRosterTeamsForSchool(schoolId, saved);
    return saved;
  };

  const getTeamById = (teamId: string, scope?: TenantScope): RosterTeam | null => {
    const normalizedTeamId = deps.trimProfileField(teamId, 120);
    if (!normalizedTeamId) {
      return null;
    }
    if (scope?.schoolId) {
      return getRosterTeamsByScope(scope).find((team) => team.id === normalizedTeamId) ?? null;
    }
    for (const teams of deps.rosterTeamsBySchool.values()) {
      const match = teams.find((team) => team.id === normalizedTeamId);
      if (match) {
        return match;
      }
    }
    return null;
  };

  return {
    getRosterTeamsByScope,
    saveRosterTeams,
    getTeamById,
  };
}
