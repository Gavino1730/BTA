import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { GameEvent } from "@bta/shared-schema";
import { createPostgresPersistenceProvider, type PersistenceProvider } from "./persistence.js";

const TEST_DB_URL = process.env.BTA_TEST_DATABASE_URL?.trim();
const hasTestDb = Boolean(TEST_DB_URL);

describe.skipIf(!hasTestDb)("persistence RLS integration", () => {
  let provider: PersistenceProvider;
  let pool: Pool;
  const tableBase = `realtime_snapshots_rls_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  beforeAll(async () => {
    provider = createPostgresPersistenceProvider({
      connectionString: TEST_DB_URL!,
      tableName: tableBase
    });
    pool = new Pool({ connectionString: TEST_DB_URL! });

    const alphaEvent: GameEvent = {
      id: "evt-alpha-1",
      schoolId: "alpha",
      gameId: "game-alpha",
      sequence: 1,
      timestampIso: "2026-03-30T12:00:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 420,
      teamId: "home",
      operatorId: "op-alpha",
      type: "foul",
      playerId: "pa1",
      foulType: "personal"
    };

    const betaEvent: GameEvent = {
      id: "evt-beta-1",
      schoolId: "beta",
      gameId: "game-beta",
      sequence: 1,
      timestampIso: "2026-03-30T12:01:00.000Z",
      period: "Q1",
      clockSecondsRemaining: 418,
      teamId: "away",
      operatorId: "op-beta",
      type: "foul",
      playerId: "pb1",
      foulType: "personal"
    };

    await provider.replacePersistedSessions([
      {
        schoolId: "alpha",
        gameId: "game-alpha",
        homeTeamId: "home",
        awayTeamId: "away",
        events: [alphaEvent]
      },
      {
        schoolId: "beta",
        gameId: "game-beta",
        homeTeamId: "home",
        awayTeamId: "away",
        events: [betaEvent]
      }
    ]);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_operator_sessions CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_live_sessions CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_activity CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_billing CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_team_memberships CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_school_memberships CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_workspace_profiles CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_local_auth CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_org_members CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_org_profiles CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_events CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_games CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_players CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_teams CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase}_schools CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${tableBase} CASCADE`);
    await provider.close?.();
    await pool.end();
  });

  it("enforces tenant filter when app.school_id is scoped", async () => {
    await pool.query("SELECT set_config('app.school_id', $1, false)", ["alpha"]);
    const alphaRows = await pool.query<{ school_id: string }>(
      `SELECT DISTINCT school_id FROM ${tableBase}_games ORDER BY school_id`
    );
    expect(alphaRows.rows.map((row) => row.school_id)).toEqual(["alpha"]);

    await pool.query("SELECT set_config('app.school_id', $1, false)", ["beta"]);
    const betaRows = await pool.query<{ school_id: string }>(
      `SELECT DISTINCT school_id FROM ${tableBase}_games ORDER BY school_id`
    );
    expect(betaRows.rows.map((row) => row.school_id)).toEqual(["beta"]);
  });

  it("allows cross-tenant maintenance access with wildcard scope", async () => {
    await pool.query("SELECT set_config('app.school_id', $1, false)", ["*"]);
    const allRows = await pool.query<{ school_id: string }>(
      `SELECT DISTINCT school_id FROM ${tableBase}_games ORDER BY school_id`
    );
    expect(allRows.rows.map((row) => row.school_id)).toEqual(["alpha", "beta"]);
  });

  it("round-trips workspace records through normalized postgres tables", async () => {
    await provider.replaceSchoolRecord("alpha", {
      schoolId: "alpha",
      name: "Alpha High",
      slug: "alpha-high",
      sport: "basketball",
      status: "active",
      createdAtIso: "2026-04-01T00:00:00.000Z",
      updatedAtIso: "2026-04-01T00:00:00.000Z",
    });
    await provider.replaceUserWorkspaceProfile({
      userId: "user-alpha",
      email: "alpha@school.org",
      fullName: "Alpha Coach",
      lastSchoolId: "alpha",
      lastTeamId: "alpha-varsity",
      lastContextType: "team",
      createdAtIso: "2026-04-01T00:00:00.000Z",
      updatedAtIso: "2026-04-01T00:00:00.000Z",
    });
    await provider.replaceSchoolMembershipsForSchool("alpha", [{
      membershipId: "school-member-alpha",
      schoolId: "alpha",
      userId: "user-alpha",
      email: "alpha@school.org",
      fullName: "Alpha Coach",
      role: "owner",
      status: "active",
      createdAtIso: "2026-04-01T00:00:00.000Z",
      updatedAtIso: "2026-04-01T00:00:00.000Z",
    }]);
    await provider.replaceTeamMembershipsForSchool("alpha", [{
      membershipId: "team-member-alpha",
      schoolId: "alpha",
      teamId: "alpha-varsity",
      userId: "user-alpha",
      email: "alpha@school.org",
      fullName: "Alpha Coach",
      role: "head_coach",
      status: "active",
      createdAtIso: "2026-04-01T00:00:00.000Z",
      updatedAtIso: "2026-04-01T00:00:00.000Z",
    }]);
    await provider.replaceBillingStateForSchool("alpha", {
      schoolId: "alpha",
      planId: "trial",
      status: "trialing",
      includedActiveTeamLimit: 1,
      extraActiveTeamSeats: 0,
      trialStartedAtIso: "2026-04-01T00:00:00.000Z",
      trialEndsAtIso: "2026-04-15T00:00:00.000Z",
      createdAtIso: "2026-04-01T00:00:00.000Z",
      updatedAtIso: "2026-04-01T00:00:00.000Z",
    });
    await provider.replaceActivityEventsForSchool("alpha", [{
      id: "activity-alpha-1",
      schoolId: "alpha",
      teamId: "alpha-varsity",
      type: "team_created",
      actorUserId: "user-alpha",
      message: "Alpha added varsity.",
      createdAtIso: "2026-04-01T00:00:00.000Z",
      metadata: { source: "test" },
    }]);
    await provider.replaceLiveGameSessionsForSchool("alpha", [{
      liveSessionId: "live-alpha-1",
      schoolId: "alpha",
      teamId: "alpha-varsity",
      gameId: "game-alpha-live",
      opponentName: "Central",
      opponentTeamId: "opp-central",
      status: "active",
      pairingCode: "123456",
      createdByUserId: "user-alpha",
      createdAtIso: "2026-04-01T00:00:00.000Z",
      updatedAtIso: "2026-04-01T00:00:00.000Z",
    }]);
    await provider.replaceOperatorSessionsForSchool("alpha", [{
      operatorSessionId: "operator-alpha-1",
      liveSessionId: "live-alpha-1",
      schoolId: "alpha",
      teamId: "alpha-varsity",
      pairingCode: "123456",
      operatorToken: "token-alpha",
      expiresAtIso: "2026-04-02T00:00:00.000Z",
      createdAtIso: "2026-04-01T00:00:00.000Z",
      updatedAtIso: "2026-04-01T00:00:00.000Z",
    }]);

    const data = await provider.loadWorkspaceData();
    expect(data.schools.alpha?.name).toBe("Alpha High");
    expect(data.userProfiles["user-alpha"]?.lastSchoolId).toBe("alpha");
    expect(data.schoolMemberships.alpha?.[0]?.role).toBe("owner");
    expect(data.teamMemberships.alpha?.[0]?.teamId).toBe("alpha-varsity");
    expect(data.billingStates.alpha?.status).toBe("trialing");
    expect(data.activityEvents.alpha?.[0]?.id).toBe("activity-alpha-1");
    expect(data.liveGameSessions.alpha?.[0]?.liveSessionId).toBe("live-alpha-1");
    expect(data.operatorSessions["live-alpha-1"]?.operatorSessionId).toBe("operator-alpha-1");
  });

  it("clears school-scoped normalized workspace rows", async () => {
    await provider.clearSchoolData("alpha");
    const data = await provider.loadWorkspaceData();

    expect(data.schools.alpha).toBeUndefined();
    expect(data.schoolMemberships.alpha).toBeUndefined();
    expect(data.teamMemberships.alpha).toBeUndefined();
    expect(data.billingStates.alpha).toBeUndefined();
    expect(data.activityEvents.alpha).toBeUndefined();
    expect(data.liveGameSessions.alpha).toBeUndefined();
    expect(data.operatorSessions["live-alpha-1"]).toBeUndefined();
    expect(data.userProfiles["user-alpha"]?.lastSchoolId).toBeUndefined();
    expect(data.userProfiles["user-alpha"]?.lastTeamId).toBeUndefined();
  });
});
