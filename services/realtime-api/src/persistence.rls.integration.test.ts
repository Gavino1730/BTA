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
});
