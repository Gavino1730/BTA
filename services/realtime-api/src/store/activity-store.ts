import type {
  ActivityEvent,
  LiveGameSessionRecord,
  OperatorSessionRecord,
  TenantScope,
} from "./store-types.js";

interface ActivityStoreDependencies {
  resolveSchoolId: (scope?: TenantScope) => string;
  normalizeSchoolId: (schoolId?: string) => string;
  trimProfileField: (value: unknown, maxLength: number) => string;
  buildWorkspaceMembershipId: (seed: string, prefix: string) => string;
  activityEventsBySchool: Map<string, ActivityEvent[]>;
  liveGameSessionsBySchool: Map<string, LiveGameSessionRecord[]>;
  operatorSessionsByLiveSession: Map<string, OperatorSessionRecord>;
  setActivityEventsForSchool: (schoolId: string, events: ActivityEvent[]) => ActivityEvent[];
  setLiveGameSessionsForSchool: (schoolId: string, sessions: LiveGameSessionRecord[]) => LiveGameSessionRecord[];
  persistSessions: () => void;
  persistActivityEventsForSchool: (schoolId: string, events: ActivityEvent[]) => void | Promise<void>;
  persistLiveGameSessionsForSchool: (schoolId: string, sessions: LiveGameSessionRecord[]) => void | Promise<void>;
  persistOperatorSessionsForSchool: (schoolId: string, sessions: OperatorSessionRecord[]) => void | Promise<void>;
}

export function createActivityStore(deps: ActivityStoreDependencies) {
  const saveActivityEvent = (event: Omit<ActivityEvent, "id" | "createdAtIso"> & { id?: string; createdAtIso?: string }): ActivityEvent => {
    const schoolId = deps.normalizeSchoolId(event.schoolId);
    const current = deps.activityEventsBySchool.get(schoolId) ?? [];
    const saved: ActivityEvent = {
      id: deps.trimProfileField(event.id, 120) || deps.buildWorkspaceMembershipId(`${schoolId}:${event.type}:${Date.now()}`, "activity"),
      schoolId,
      teamId: deps.trimProfileField(event.teamId, 120) || undefined,
      type: event.type,
      actorUserId: deps.trimProfileField(event.actorUserId, 120) || undefined,
      message: deps.trimProfileField(event.message, 240),
      createdAtIso: deps.trimProfileField(event.createdAtIso, 64) || new Date().toISOString(),
      metadata: event.metadata,
    };
    const next = deps.setActivityEventsForSchool(schoolId, [saved, ...current]);
    deps.persistSessions();
    void deps.persistActivityEventsForSchool(schoolId, next);
    return saved;
  };

  const getActivityEventsByScope = (scope?: TenantScope): ActivityEvent[] => {
    return deps.activityEventsBySchool.get(deps.resolveSchoolId(scope)) ?? [];
  };

  const createLiveGameSessionRecord = (input: Omit<LiveGameSessionRecord, "createdAtIso" | "updatedAtIso">): LiveGameSessionRecord => {
    const schoolId = deps.normalizeSchoolId(input.schoolId);
    const liveSessionId = deps.trimProfileField(input.liveSessionId, 120);
    const current = deps.liveGameSessionsBySchool.get(schoolId) ?? [];
    const nowIso = new Date().toISOString();
    const saved: LiveGameSessionRecord = {
      ...input,
      liveSessionId,
      schoolId,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    const next = deps.setLiveGameSessionsForSchool(schoolId, [saved, ...current.filter((entry) => entry.liveSessionId !== liveSessionId)]);
    deps.persistSessions();
    void deps.persistLiveGameSessionsForSchool(schoolId, next);
    return saved;
  };

  const getLiveGameSessionsByScope = (scope?: TenantScope): LiveGameSessionRecord[] => {
    return deps.liveGameSessionsBySchool.get(deps.resolveSchoolId(scope)) ?? [];
  };

  const getLiveGameSessionById = (liveSessionId: string): LiveGameSessionRecord | null => {
    const normalizedId = deps.trimProfileField(liveSessionId, 120);
    for (const liveSessions of deps.liveGameSessionsBySchool.values()) {
      const match = liveSessions.find((entry) => entry.liveSessionId === normalizedId);
      if (match) {
        return match;
      }
    }
    return null;
  };

  const saveOperatorSessionRecord = (session: OperatorSessionRecord): OperatorSessionRecord => {
    const saved: OperatorSessionRecord = {
      ...session,
      operatorSessionId: deps.trimProfileField(session.operatorSessionId, 120),
      liveSessionId: deps.trimProfileField(session.liveSessionId, 120),
      schoolId: deps.normalizeSchoolId(session.schoolId),
      teamId: deps.trimProfileField(session.teamId, 120),
      pairingCode: deps.trimProfileField(session.pairingCode, 32),
      operatorToken: deps.trimProfileField(session.operatorToken, 2_000),
      expiresAtIso: deps.trimProfileField(session.expiresAtIso, 64),
      createdAtIso: deps.trimProfileField(session.createdAtIso, 64) || new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    };
    deps.operatorSessionsByLiveSession.set(saved.liveSessionId, saved);
    deps.persistSessions();
    const sessionsForSchool = [...deps.operatorSessionsByLiveSession.values()].filter((entry) => entry.schoolId === saved.schoolId);
    void deps.persistOperatorSessionsForSchool(saved.schoolId, sessionsForSchool);
    return saved;
  };

  const getOperatorSessionByLiveSession = (liveSessionId: string): OperatorSessionRecord | null => {
    const normalizedId = deps.trimProfileField(liveSessionId, 120);
    return normalizedId ? deps.operatorSessionsByLiveSession.get(normalizedId) ?? null : null;
  };

  return {
    saveActivityEvent,
    getActivityEventsByScope,
    createLiveGameSessionRecord,
    getLiveGameSessionsByScope,
    getLiveGameSessionById,
    saveOperatorSessionRecord,
    getOperatorSessionByLiveSession,
  };
}
