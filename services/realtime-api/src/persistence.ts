import { Pool } from "pg";
import type { GameEvent } from "@bta/shared-schema";
import type { CoachAiSettings, GameAiContext, LocalAuthAccount, OrganizationMember, OrganizationProfile, RosterTeam } from "./store.js";
import { normalizeSchoolId } from "./school-id.js";

export interface PersistedGameSessionRecord {
  schoolId: string;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  startingLineupByTeam?: Record<string, string[]>;
  aiSettings?: CoachAiSettings;
  aiContext?: GameAiContext;
  historicalContextSummary?: string;
  historicalContextFetchedAtMs?: number;
  events: GameEvent[];
}

export interface OrgDataResult {
  profiles: Record<string, OrganizationProfile>;
  members: Record<string, OrganizationMember[]>;
  localAuth: Record<string, LocalAuthAccount[]>;
}

export interface PersistenceProvider {
  readonly kind: "postgres";
  load(): Promise<unknown | null>;
  save(payload: unknown): Promise<void>;
  loadPersistedSessions(): Promise<PersistedGameSessionRecord[]>;
  replacePersistedSessions(sessions: PersistedGameSessionRecord[]): Promise<void>;
  loadRosterTeamsBySchool(): Promise<Record<string, RosterTeam[]>>;
  replaceRosterTeamsForSchool(schoolId: string, teams: RosterTeam[]): Promise<void>;
  clearAllRosterTeams(): Promise<void>;
  pruneStaleGames(retentionDays: number): Promise<number>;
  loadOrgData(): Promise<OrgDataResult>;
  replaceOrgProfileForSchool(schoolId: string, profile: OrganizationProfile | null): Promise<void>;
  replaceOrgMembersForSchool(schoolId: string, members: OrganizationMember[]): Promise<void>;
  replaceLocalAuthAccountsForSchool(schoolId: string, accounts: LocalAuthAccount[]): Promise<void>;
  close?(): Promise<void>;
}

interface PostgresPersistenceOptions {
  connectionString: string;
  tableName?: string;
}

async function setTenantContext(client: { query: Pool["query"] }, schoolId: string): Promise<void> {
  await client.query(`SELECT set_config('app.school_id', $1, false)`, [schoolId]);
}

export function normalizeEventForPersistence(event: GameEvent, schoolId: string, gameId: string): GameEvent {
  const normalizedSchoolId = normalizeSchoolId(event.schoolId ?? schoolId);
  const normalizedEvent: GameEvent = {
    ...event,
    schoolId: normalizedSchoolId,
    gameId
  };

  if (normalizedEvent.schoolId !== schoolId) {
    throw new Error(`Event tenant mismatch for game ${gameId}`);
  }

  return normalizedEvent;
}

export function createPostgresPersistenceProvider(options: PostgresPersistenceOptions): PersistenceProvider {
  const tableName = sanitizeTableName(options.tableName ?? "realtime_snapshots");
  const teamsTableName = `${tableName}_teams`;
  const playersTableName = `${tableName}_players`;
  const schoolsTableName = `${tableName}_schools`;
  const gamesTableName = `${tableName}_games`;
  const eventsTableName = `${tableName}_events`;
  const orgProfilesTableName = `${tableName}_org_profiles`;
  const orgMembersTableName = `${tableName}_org_members`;
  const localAuthTableName = `${tableName}_local_auth`;
  const pool = new Pool({ connectionString: options.connectionString });
  let schemaReady = false;

  async function ensureSchema(): Promise<void> {
    if (schemaReady) {
      return;
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        snapshot_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schoolsTableName} (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${teamsTableName} (
        school_id TEXT NOT NULL REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        abbreviation TEXT NOT NULL,
        season TEXT,
        team_color TEXT,
        coach_style TEXT,
        playing_style TEXT,
        team_context TEXT,
        custom_prompt TEXT,
        focus_insights JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, id)
      )
    `);

    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS season TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS playing_style TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS team_context TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS custom_prompt TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS focus_insights JSONB`);
    await pool.query(`ALTER TABLE ${playersTableName} ADD COLUMN IF NOT EXISTS weight TEXT`);
    await pool.query(`ALTER TABLE ${playersTableName} ADD COLUMN IF NOT EXISTS email TEXT`);
    await pool.query(`ALTER TABLE ${playersTableName} ADD COLUMN IF NOT EXISTS phone TEXT`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${playersTableName} (
        school_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        id TEXT NOT NULL,
        number TEXT NOT NULL,
        name TEXT NOT NULL,
        position TEXT NOT NULL,
        height TEXT,
        weight TEXT,
        grade TEXT,
        role TEXT,
        notes TEXT,
        email TEXT,
        phone TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, id),
        FOREIGN KEY (school_id, team_id) REFERENCES ${teamsTableName}(school_id, id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${gamesTableName} (
        school_id TEXT NOT NULL REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        game_id TEXT NOT NULL,
        home_team_id TEXT NOT NULL,
        away_team_id TEXT NOT NULL,
        opponent_name TEXT,
        opponent_team_id TEXT,
        starting_lineup_by_team JSONB,
        ai_settings JSONB,
        ai_context JSONB,
        historical_context_summary TEXT,
        historical_context_fetched_at_ms BIGINT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, game_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${eventsTableName} (
        school_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        timestamp_iso TEXT NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, id),
        FOREIGN KEY (school_id, game_id) REFERENCES ${gamesTableName}(school_id, game_id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${eventsTableName}_school_game_sequence_idx
        ON ${eventsTableName}(school_id, game_id, sequence)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS ${eventsTableName}_school_game_idx
        ON ${eventsTableName}(school_id, game_id)
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = '${eventsTableName}_payload_scope_check'
        ) THEN
          ALTER TABLE ${eventsTableName}
            ADD CONSTRAINT ${eventsTableName}_payload_scope_check
            CHECK (
              payload ? 'schoolId'
              AND payload ? 'gameId'
              AND (payload->>'schoolId') = school_id
              AND (payload->>'gameId') = game_id
            );
        END IF;
      END
      $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${orgProfilesTableName} (
        school_id TEXT PRIMARY KEY REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        organization_name TEXT NOT NULL DEFAULT '',
        organization_slug TEXT,
        coach_name TEXT NOT NULL DEFAULT '',
        coach_email TEXT NOT NULL DEFAULT '',
        team_name TEXT,
        season TEXT,
        completed_at_iso TEXT,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${orgMembersTableName} (
        school_id TEXT NOT NULL REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL,
        organization_id TEXT NOT NULL DEFAULT '',
        auth_subject TEXT,
        full_name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'coach',
        status TEXT NOT NULL DEFAULT 'invited',
        invited_at_iso TEXT,
        joined_at_iso TEXT,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, member_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${localAuthTableName} (
        school_id TEXT NOT NULL REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        organization_id TEXT,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL DEFAULT '',
        password_salt TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'owner',
        status TEXT NOT NULL DEFAULT 'active',
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        last_login_at_iso TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, account_id),
        UNIQUE (school_id, email)
      )
    `);

    await pool.query(`ALTER TABLE ${teamsTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${playersTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${gamesTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${eventsTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${orgProfilesTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${orgMembersTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${localAuthTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${teamsTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${playersTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${gamesTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${eventsTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${orgProfilesTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${orgMembersTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${localAuthTableName} FORCE ROW LEVEL SECURITY`);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${teamsTableName}' AND policyname = '${teamsTableName}_school_policy'
        ) THEN
          CREATE POLICY ${teamsTableName}_school_policy ON ${teamsTableName}
            USING (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*')
            WITH CHECK (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${playersTableName}' AND policyname = '${playersTableName}_school_policy'
        ) THEN
          CREATE POLICY ${playersTableName}_school_policy ON ${playersTableName}
            USING (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*')
            WITH CHECK (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${gamesTableName}' AND policyname = '${gamesTableName}_school_policy'
        ) THEN
          CREATE POLICY ${gamesTableName}_school_policy ON ${gamesTableName}
            USING (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*')
            WITH CHECK (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${eventsTableName}' AND policyname = '${eventsTableName}_school_policy'
        ) THEN
          CREATE POLICY ${eventsTableName}_school_policy ON ${eventsTableName}
            USING (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*')
            WITH CHECK (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${orgProfilesTableName}' AND policyname = '${orgProfilesTableName}_school_policy'
        ) THEN
          CREATE POLICY ${orgProfilesTableName}_school_policy ON ${orgProfilesTableName}
            USING (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*')
            WITH CHECK (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${orgMembersTableName}' AND policyname = '${orgMembersTableName}_school_policy'
        ) THEN
          CREATE POLICY ${orgMembersTableName}_school_policy ON ${orgMembersTableName}
            USING (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*')
            WITH CHECK (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${localAuthTableName}' AND policyname = '${localAuthTableName}_school_policy'
        ) THEN
          CREATE POLICY ${localAuthTableName}_school_policy ON ${localAuthTableName}
            USING (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*')
            WITH CHECK (school_id = current_setting('app.school_id', true) OR current_setting('app.school_id', true) = '*');
        END IF;
      END
      $$;
    `);
    schemaReady = true;
  }

  async function ensureSchool(client: Pool | { query: Pool["query"] }, schoolId: string): Promise<void> {
    await client.query(
      `INSERT INTO ${schoolsTableName} (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [schoolId]
    );
  }

  return {
    kind: "postgres",
    async load(): Promise<unknown | null> {
      await ensureSchema();
      const result = await pool.query<{ payload: unknown }>(
        `SELECT payload FROM ${tableName} WHERE snapshot_key = $1 LIMIT 1`,
        ["global"]
      );
      return result.rows[0]?.payload ?? null;
    },
    async save(payload: unknown): Promise<void> {
      await ensureSchema();
      await pool.query(
        `
          INSERT INTO ${tableName} (snapshot_key, payload, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (snapshot_key)
          DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
        `,
        ["global", JSON.stringify(payload)]
      );
    },
    async loadPersistedSessions(): Promise<PersistedGameSessionRecord[]> {
      await ensureSchema();
      await setTenantContext(pool, "*");
      const result = await pool.query<{
        school_id: string;
        game_id: string;
        home_team_id: string;
        away_team_id: string;
        opponent_name: string | null;
        opponent_team_id: string | null;
        starting_lineup_by_team: Record<string, string[]> | null;
        ai_settings: PersistedGameSessionRecord["aiSettings"] | null;
        ai_context: PersistedGameSessionRecord["aiContext"] | null;
        historical_context_summary: string | null;
        historical_context_fetched_at_ms: string | number | null;
        event_payload: GameEvent | null;
      }>(
        `
          SELECT
            g.school_id,
            g.game_id,
            g.home_team_id,
            g.away_team_id,
            g.opponent_name,
            g.opponent_team_id,
            g.starting_lineup_by_team,
            g.ai_settings,
            g.ai_context,
            g.historical_context_summary,
            g.historical_context_fetched_at_ms,
            e.payload AS event_payload
          FROM ${gamesTableName} g
          LEFT JOIN ${eventsTableName} e
            ON e.school_id = g.school_id
           AND e.game_id = g.game_id
          ORDER BY g.school_id, g.game_id, (e.payload->>'sequence')::int NULLS LAST
        `
      );

      const sessions = new Map<string, PersistedGameSessionRecord>();

      for (const row of result.rows) {
        const key = `${row.school_id}:${row.game_id}`;
        let session = sessions.get(key);
        if (!session) {
          session = {
            schoolId: normalizeSchoolId(row.school_id),
            gameId: row.game_id,
            homeTeamId: row.home_team_id,
            awayTeamId: row.away_team_id,
            opponentName: row.opponent_name ?? undefined,
            opponentTeamId: row.opponent_team_id ?? undefined,
            startingLineupByTeam: row.starting_lineup_by_team ?? undefined,
            aiSettings: row.ai_settings ?? undefined,
            aiContext: row.ai_context ?? undefined,
            historicalContextSummary: row.historical_context_summary ?? undefined,
            historicalContextFetchedAtMs: row.historical_context_fetched_at_ms === null
              ? undefined
              : Number(row.historical_context_fetched_at_ms),
            events: []
          };
          sessions.set(key, session);
        }

        if (row.event_payload) {
          session.events.push({
            ...row.event_payload,
            schoolId: normalizeSchoolId(row.event_payload.schoolId ?? row.school_id),
            gameId: row.game_id
          });
        }
      }

      return [...sessions.values()];
    },
    async replacePersistedSessions(sessions: PersistedGameSessionRecord[]): Promise<void> {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, "*");
        await client.query(`DELETE FROM ${eventsTableName}`);
        await client.query(`DELETE FROM ${gamesTableName}`);

        const schoolIds = [...new Set(sessions.map((session) => normalizeSchoolId(session.schoolId)))];
        for (const schoolId of schoolIds) {
          await ensureSchool(client, schoolId);
        }

        for (const session of sessions) {
          const schoolId = normalizeSchoolId(session.schoolId);
          await client.query(
            `
              INSERT INTO ${gamesTableName} (
                school_id,
                game_id,
                home_team_id,
                away_team_id,
                opponent_name,
                opponent_team_id,
                starting_lineup_by_team,
                ai_settings,
                ai_context,
                historical_context_summary,
                historical_context_fetched_at_ms,
                updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, NOW())
            `,
            [
              schoolId,
              session.gameId,
              session.homeTeamId,
              session.awayTeamId,
              session.opponentName ?? null,
              session.opponentTeamId ?? null,
              JSON.stringify(session.startingLineupByTeam ?? null),
              JSON.stringify(session.aiSettings ?? null),
              JSON.stringify(session.aiContext ?? null),
              session.historicalContextSummary ?? null,
              session.historicalContextFetchedAtMs ?? null
            ]
          );

          for (const event of session.events) {
            const normalizedEvent = normalizeEventForPersistence(event, schoolId, session.gameId);

            await client.query(
              `
                INSERT INTO ${eventsTableName} (
                  school_id,
                  game_id,
                  id,
                  sequence,
                  timestamp_iso,
                  payload,
                  updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
              `,
              [
                schoolId,
                session.gameId,
                normalizedEvent.id,
                normalizedEvent.sequence,
                normalizedEvent.timestampIso,
                JSON.stringify(normalizedEvent)
              ]
            );
          }
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async loadRosterTeamsBySchool(): Promise<Record<string, RosterTeam[]>> {
      await ensureSchema();
      await setTenantContext(pool, "*");
      const result = await pool.query<{
        school_id: string;
        team_id: string;
        team_name: string;
        abbreviation: string;
        season: string | null;
        team_color: string | null;
        coach_style: string | null;
        playing_style: string | null;
        team_context: string | null;
        custom_prompt: string | null;
        focus_insights: RosterTeam["focusInsights"] | null;
        player_id: string | null;
        player_number: string | null;
        player_name: string | null;
        player_position: string | null;
        player_height: string | null;
        player_weight: string | null;
        player_grade: string | null;
        player_role: string | null;
        player_notes: string | null;
        player_email: string | null;
        player_phone: string | null;
      }>(
        `
          SELECT
            t.school_id,
            t.id AS team_id,
            t.name AS team_name,
            t.abbreviation,
            t.season,
            t.team_color,
            t.coach_style,
            t.playing_style,
            t.team_context,
            t.custom_prompt,
            t.focus_insights,
            p.id AS player_id,
            p.number AS player_number,
            p.name AS player_name,
            p.position AS player_position,
            p.height AS player_height,
            p.weight AS player_weight,
            p.grade AS player_grade,
            p.role AS player_role,
            p.notes AS player_notes,
            p.email AS player_email,
            p.phone AS player_phone
          FROM ${teamsTableName} t
          LEFT JOIN ${playersTableName} p
            ON p.school_id = t.school_id
           AND p.team_id = t.id
          ORDER BY t.school_id, t.created_at, t.id, p.created_at, p.id
        `
      );

      const rosterTeamsBySchool: Record<string, RosterTeam[]> = {};
      const teamIndex = new Map<string, RosterTeam>();

      for (const row of result.rows) {
        if (!rosterTeamsBySchool[row.school_id]) {
          rosterTeamsBySchool[row.school_id] = [];
        }

        const teamKey = `${row.school_id}:${row.team_id}`;
        let team = teamIndex.get(teamKey);
        if (!team) {
          team = {
            id: row.team_id,
            schoolId: row.school_id,
            name: row.team_name,
            abbreviation: row.abbreviation,
            season: row.season ?? undefined,
            teamColor: row.team_color ?? undefined,
            coachStyle: row.coach_style ?? undefined,
            playingStyle: row.playing_style ?? undefined,
            teamContext: row.team_context ?? undefined,
            customPrompt: row.custom_prompt ?? undefined,
            focusInsights: row.focus_insights ?? undefined,
            players: []
          };
          teamIndex.set(teamKey, team);
          rosterTeamsBySchool[row.school_id].push(team);
        }

        if (row.player_id && row.player_name !== null && row.player_number !== null && row.player_position !== null) {
          team.players.push({
            id: row.player_id,
            number: row.player_number,
            name: row.player_name,
            position: row.player_position,
            height: row.player_height ?? undefined,
            weight: row.player_weight ?? undefined,
            grade: row.player_grade ?? undefined,
            role: row.player_role ?? undefined,
            notes: row.player_notes ?? undefined,
            email: row.player_email ?? undefined,
            phone: row.player_phone ?? undefined,
          });
        }
      }

      return rosterTeamsBySchool;
    },
    async replaceRosterTeamsForSchool(schoolId: string, teams: RosterTeam[]): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, normalizedSchoolId);
        await ensureSchool(client, normalizedSchoolId);
        await client.query(`DELETE FROM ${playersTableName} WHERE school_id = $1`, [normalizedSchoolId]);
        await client.query(`DELETE FROM ${teamsTableName} WHERE school_id = $1`, [normalizedSchoolId]);

        for (const team of teams) {
          await client.query(
            `
              INSERT INTO ${teamsTableName} (
                school_id, id, name, abbreviation, season, team_color, coach_style, playing_style, team_context, custom_prompt, focus_insights, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW())
            `,
            [
              normalizedSchoolId,
              team.id,
              team.name,
              team.abbreviation,
              team.season ?? null,
              team.teamColor ?? null,
              team.coachStyle ?? null,
              team.playingStyle ?? null,
              team.teamContext ?? null,
              team.customPrompt ?? null,
              JSON.stringify(team.focusInsights ?? null)
            ]
          );

          for (const player of team.players) {
            await client.query(
              `
                INSERT INTO ${playersTableName} (
                  school_id, team_id, id, number, name, position, height, weight, grade, role, notes, email, phone, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
              `,
              [
                normalizedSchoolId,
                team.id,
                player.id,
                player.number,
                player.name,
                player.position,
                player.height ?? null,
                player.weight ?? null,
                player.grade ?? null,
                player.role ?? null,
                player.notes ?? null,
                player.email ?? null,
                player.phone ?? null,
              ]
            );
          }
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async clearAllRosterTeams(): Promise<void> {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, "*");
        await client.query(`DELETE FROM ${playersTableName}`);
        await client.query(`DELETE FROM ${teamsTableName}`);
        await client.query(`DELETE FROM ${schoolsTableName}`);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async pruneStaleGames(retentionDays: number): Promise<number> {
      await ensureSchema();
      await setTenantContext(pool, "*");
      const safeDays = Number.isFinite(retentionDays) ? Math.max(Math.floor(retentionDays), 1) : 1;
      const result = await pool.query<{ game_count: string }>(
        `
          WITH deleted AS (
            DELETE FROM ${gamesTableName}
            WHERE updated_at < NOW() - ($1 * INTERVAL '1 day')
            RETURNING 1
          )
          SELECT COUNT(*)::text AS game_count FROM deleted
        `,
        [safeDays]
      );

      return Number(result.rows[0]?.game_count ?? "0");
    },
    async loadOrgData(): Promise<OrgDataResult> {
      await ensureSchema();
      await setTenantContext(pool, "*");

      const [profileRows, memberRows, authRows] = await Promise.all([
        pool.query<{
          school_id: string;
          organization_name: string;
          organization_slug: string | null;
          coach_name: string;
          coach_email: string;
          team_name: string | null;
          season: string | null;
          completed_at_iso: string | null;
          created_at_iso: string;
          updated_at_iso: string;
        }>(`SELECT * FROM ${orgProfilesTableName} ORDER BY school_id`),
        pool.query<{
          school_id: string;
          member_id: string;
          organization_id: string;
          auth_subject: string | null;
          full_name: string;
          email: string;
          role: string;
          status: string;
          invited_at_iso: string | null;
          joined_at_iso: string | null;
          created_at_iso: string;
          updated_at_iso: string;
        }>(`SELECT * FROM ${orgMembersTableName} ORDER BY school_id, email`),
        pool.query<{
          school_id: string;
          account_id: string;
          organization_id: string | null;
          email: string;
          full_name: string;
          password_hash: string;
          password_salt: string;
          role: string;
          status: string;
          created_at_iso: string;
          updated_at_iso: string;
          last_login_at_iso: string | null;
        }>(`SELECT * FROM ${localAuthTableName} ORDER BY school_id, email`)
      ]);

      const profiles: Record<string, OrganizationProfile> = {};
      for (const row of profileRows.rows) {
        profiles[row.school_id] = {
          organizationName: row.organization_name,
          organizationSlug: row.organization_slug ?? undefined,
          coachName: row.coach_name,
          coachEmail: row.coach_email,
          teamName: row.team_name ?? undefined,
          season: row.season ?? undefined,
          completedAtIso: row.completed_at_iso ?? undefined,
          createdAtIso: row.created_at_iso,
          updatedAtIso: row.updated_at_iso,
        };
      }

      const members: Record<string, OrganizationMember[]> = {};
      for (const row of memberRows.rows) {
        if (!members[row.school_id]) {
          members[row.school_id] = [];
        }
        members[row.school_id].push({
          schoolId: row.school_id,
          memberId: row.member_id,
          organizationId: row.organization_id,
          authSubject: row.auth_subject ?? undefined,
          fullName: row.full_name,
          email: row.email,
          role: row.role as OrganizationMember["role"],
          status: row.status as OrganizationMember["status"],
          invitedAtIso: row.invited_at_iso ?? undefined,
          joinedAtIso: row.joined_at_iso ?? undefined,
          createdAtIso: row.created_at_iso,
          updatedAtIso: row.updated_at_iso,
        });
      }

      const localAuth: Record<string, LocalAuthAccount[]> = {};
      for (const row of authRows.rows) {
        if (!localAuth[row.school_id]) {
          localAuth[row.school_id] = [];
        }
        localAuth[row.school_id].push({
          schoolId: row.school_id,
          accountId: row.account_id,
          organizationId: row.organization_id ?? undefined,
          email: row.email,
          fullName: row.full_name,
          passwordHash: row.password_hash,
          passwordSalt: row.password_salt,
          role: row.role as LocalAuthAccount["role"],
          status: row.status as LocalAuthAccount["status"],
          createdAtIso: row.created_at_iso,
          updatedAtIso: row.updated_at_iso,
          lastLoginAtIso: row.last_login_at_iso ?? undefined,
        });
      }

      return { profiles, members, localAuth };
    },
    async replaceOrgProfileForSchool(schoolId: string, profile: OrganizationProfile | null): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      await setTenantContext(pool, normalizedSchoolId);
      if (!profile) {
        await pool.query(`DELETE FROM ${orgProfilesTableName} WHERE school_id = $1`, [normalizedSchoolId]);
        return;
      }
      await ensureSchool(pool, normalizedSchoolId);
      await pool.query(
        `
          INSERT INTO ${orgProfilesTableName} (
            school_id, organization_name, organization_slug, coach_name, coach_email,
            team_name, season, completed_at_iso, created_at_iso, updated_at_iso, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (school_id) DO UPDATE SET
            organization_name = EXCLUDED.organization_name,
            organization_slug = EXCLUDED.organization_slug,
            coach_name = EXCLUDED.coach_name,
            coach_email = EXCLUDED.coach_email,
            team_name = EXCLUDED.team_name,
            season = EXCLUDED.season,
            completed_at_iso = EXCLUDED.completed_at_iso,
            updated_at_iso = EXCLUDED.updated_at_iso,
            updated_at = NOW()
        `,
        [
          normalizedSchoolId,
          profile.organizationName,
          profile.organizationSlug ?? null,
          profile.coachName,
          profile.coachEmail,
          profile.teamName ?? null,
          profile.season ?? null,
          profile.completedAtIso ?? null,
          profile.createdAtIso,
          profile.updatedAtIso,
        ]
      );
    },
    async replaceOrgMembersForSchool(schoolId: string, members: OrganizationMember[]): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, normalizedSchoolId);
        await ensureSchool(client, normalizedSchoolId);
        await client.query(`DELETE FROM ${orgMembersTableName} WHERE school_id = $1`, [normalizedSchoolId]);
        for (const member of members) {
          await client.query(
            `
              INSERT INTO ${orgMembersTableName} (
                school_id, member_id, organization_id, auth_subject, full_name, email,
                role, status, invited_at_iso, joined_at_iso, created_at_iso, updated_at_iso, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            `,
            [
              normalizedSchoolId,
              member.memberId,
              member.organizationId,
              member.authSubject ?? null,
              member.fullName,
              member.email,
              member.role,
              member.status,
              member.invitedAtIso ?? null,
              member.joinedAtIso ?? null,
              member.createdAtIso,
              member.updatedAtIso,
            ]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async replaceLocalAuthAccountsForSchool(schoolId: string, accounts: LocalAuthAccount[]): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, normalizedSchoolId);
        await ensureSchool(client, normalizedSchoolId);
        await client.query(`DELETE FROM ${localAuthTableName} WHERE school_id = $1`, [normalizedSchoolId]);
        for (const account of accounts) {
          await client.query(
            `
              INSERT INTO ${localAuthTableName} (
                school_id, account_id, organization_id, email, full_name,
                password_hash, password_salt, role, status,
                created_at_iso, updated_at_iso, last_login_at_iso, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            `,
            [
              normalizedSchoolId,
              account.accountId,
              account.organizationId ?? null,
              account.email,
              account.fullName,
              account.passwordHash,
              account.passwordSalt,
              account.role,
              account.status,
              account.createdAtIso,
              account.updatedAtIso,
              account.lastLoginAtIso ?? null,
            ]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async close(): Promise<void> {
      await pool.end();
    }
  };
}

function sanitizeTableName(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9_]/g, "");
  if (!normalized) {
    return "realtime_snapshots";
  }
  return normalized;
}
