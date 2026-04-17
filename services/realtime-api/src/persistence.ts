import { Pool } from "pg";
import type { GameEvent } from "@bta/shared-schema";
import type {
  ActivityEvent,
  BillingState,
  CoachAiSettings,
  GameAiContext,
  LiveGameSessionRecord,
  LocalAuthAccount,
  OperatorSessionRecord,
  OrganizationMember,
  OrganizationProfile,
  RosterTeam,
  SchoolMembership,
  SchoolRecord,
  TeamMembership,
  UserWorkspaceProfile,
} from "./store.js";
import { normalizeSchoolId } from "./school-id.js";
import { logger } from "./logger.js";

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

export interface WorkspaceDataResult {
  schools: Record<string, SchoolRecord>;
  userProfiles: Record<string, UserWorkspaceProfile>;
  schoolMemberships: Record<string, SchoolMembership[]>;
  teamMemberships: Record<string, TeamMembership[]>;
  billingStates: Record<string, BillingState>;
  activityEvents: Record<string, ActivityEvent[]>;
  liveGameSessions: Record<string, LiveGameSessionRecord[]>;
  operatorSessions: Record<string, OperatorSessionRecord>;
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
  loadWorkspaceData(): Promise<WorkspaceDataResult>;
  replaceSchoolRecord(schoolId: string, record: SchoolRecord | null): Promise<void>;
  replaceUserWorkspaceProfile(profile: UserWorkspaceProfile): Promise<void>;
  replaceSchoolMembershipsForSchool(schoolId: string, memberships: SchoolMembership[]): Promise<void>;
  replaceTeamMembershipsForSchool(schoolId: string, memberships: TeamMembership[]): Promise<void>;
  replaceBillingStateForSchool(schoolId: string, billingState: BillingState | null): Promise<void>;
  replaceActivityEventsForSchool(schoolId: string, events: ActivityEvent[]): Promise<void>;
  replaceLiveGameSessionsForSchool(schoolId: string, sessions: LiveGameSessionRecord[]): Promise<void>;
  replaceOperatorSessionsForSchool(schoolId: string, sessions: OperatorSessionRecord[]): Promise<void>;
  clearSchoolData(schoolId: string): Promise<void>;
  clearAllNormalizedData(): Promise<void>;
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
  const tableName = sanitizeTableName(options.tableName ?? "bta");
  const teamsTableName = `${tableName}_teams`;
  const playersTableName = `${tableName}_players`;
  const schoolsTableName = `${tableName}_schools`;
  const gamesTableName = `${tableName}_games`;
  const eventsTableName = `${tableName}_events`;
  const orgProfilesTableName = `${tableName}_org_profiles`;
  const orgMembersTableName = `${tableName}_org_members`;
  const localAuthTableName = `${tableName}_local_auth`;
  const schoolMembershipsTableName = `${tableName}_school_memberships`;
  const teamMembershipsTableName = `${tableName}_team_memberships`;
  const workspaceProfilesTableName = `${tableName}_workspace_profiles`;
  const billingTableName = `${tableName}_billing`;
  const activityTableName = `${tableName}_activity`;
  const liveSessionsTableName = `${tableName}_live_sessions`;
  const operatorSessionsTableName = `${tableName}_operator_sessions`;
  const pool = new Pool({ connectionString: options.connectionString });
  pool.on("error", (error) => {
    // Handle background/idle client disconnects so Node does not terminate
    // from an unhandled EventEmitter "error" while preserving diagnostics.
    logger.error("persistence.postgres_pool_error", { error });
  });
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
        name TEXT,
        slug TEXT,
        sport TEXT,
        status TEXT,
        created_at_iso TEXT,
        updated_at_iso TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE ${schoolsTableName} ADD COLUMN IF NOT EXISTS name TEXT`);
    await pool.query(`ALTER TABLE ${schoolsTableName} ADD COLUMN IF NOT EXISTS slug TEXT`);
    await pool.query(`ALTER TABLE ${schoolsTableName} ADD COLUMN IF NOT EXISTS sport TEXT`);
    await pool.query(`ALTER TABLE ${schoolsTableName} ADD COLUMN IF NOT EXISTS status TEXT`);
    await pool.query(`ALTER TABLE ${schoolsTableName} ADD COLUMN IF NOT EXISTS created_at_iso TEXT`);
    await pool.query(`ALTER TABLE ${schoolsTableName} ADD COLUMN IF NOT EXISTS updated_at_iso TEXT`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${teamsTableName} (
        school_id TEXT NOT NULL REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT,
        abbreviation TEXT NOT NULL,
        season TEXT,
        team_color TEXT,
        sport TEXT,
        gender TEXT,
        level TEXT,
        custom_label TEXT,
        status TEXT,
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
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS display_name TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS playing_style TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS team_context TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS custom_prompt TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS focus_insights JSONB`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS sport TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS gender TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS level TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS custom_label TEXT`);
    await pool.query(`ALTER TABLE ${teamsTableName} ADD COLUMN IF NOT EXISTS status TEXT`);
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
      CREATE INDEX IF NOT EXISTS ${playersTableName}_school_team_idx
        ON ${playersTableName}(school_id, team_id)
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${workspaceProfilesTableName} (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        last_school_id TEXT,
        last_team_id TEXT,
        last_context_type TEXT,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schoolMembershipsTableName} (
        school_id TEXT NOT NULL REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        membership_id TEXT NOT NULL,
        user_id TEXT,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'school_admin',
        status TEXT NOT NULL DEFAULT 'active',
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, membership_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${teamMembershipsTableName} (
        school_id TEXT NOT NULL REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        membership_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        user_id TEXT,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'viewer',
        status TEXT NOT NULL DEFAULT 'active',
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, membership_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${billingTableName} (
        school_id TEXT PRIMARY KEY REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL,
        included_active_team_limit INTEGER,
        extra_active_team_seats INTEGER,
        trial_started_at_iso TEXT,
        trial_ends_at_iso TEXT,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        current_period_ends_at_iso TEXT,
        coupon_code TEXT,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${activityTableName} (
        school_id TEXT NOT NULL REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        team_id TEXT,
        type TEXT NOT NULL,
        actor_user_id TEXT,
        message TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        metadata JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${liveSessionsTableName} (
        school_id TEXT NOT NULL REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        live_session_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        opponent_name TEXT,
        opponent_team_id TEXT,
        status TEXT NOT NULL,
        pairing_code TEXT NOT NULL,
        created_by_user_id TEXT,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, live_session_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${operatorSessionsTableName} (
        school_id TEXT NOT NULL REFERENCES ${schoolsTableName}(id) ON DELETE CASCADE,
        operator_session_id TEXT NOT NULL,
        live_session_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        pairing_code TEXT NOT NULL,
        operator_token TEXT NOT NULL,
        expires_at_iso TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, operator_session_id),
        UNIQUE (live_session_id)
      )
    `);

    await pool.query(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${schoolsTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${teamsTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${playersTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${gamesTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${eventsTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${orgProfilesTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${orgMembersTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${localAuthTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${workspaceProfilesTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${schoolMembershipsTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${teamMembershipsTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${billingTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${activityTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${liveSessionsTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${operatorSessionsTableName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${schoolsTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${teamsTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${playersTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${gamesTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${eventsTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${orgProfilesTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${orgMembersTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${localAuthTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${workspaceProfilesTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${schoolMembershipsTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${teamMembershipsTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${billingTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${activityTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${liveSessionsTableName} FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${operatorSessionsTableName} FORCE ROW LEVEL SECURITY`);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${tableName}' AND policyname = '${tableName}_service_policy'
        ) THEN
          CREATE POLICY ${tableName}_service_policy ON ${tableName}
            USING ((select current_setting('app.school_id', true)) = '*')
            WITH CHECK ((select current_setting('app.school_id', true)) = '*');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${schoolsTableName}' AND policyname = '${schoolsTableName}_school_policy'
        ) THEN
          CREATE POLICY ${schoolsTableName}_school_policy ON ${schoolsTableName}
            USING (id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*')
            WITH CHECK (id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${teamsTableName}' AND policyname = '${teamsTableName}_school_policy'
        ) THEN
          CREATE POLICY ${teamsTableName}_school_policy ON ${teamsTableName}
            USING (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*')
            WITH CHECK (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*');
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
            USING (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*')
            WITH CHECK (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*');
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
            USING (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*')
            WITH CHECK (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*');
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
            USING (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*')
            WITH CHECK (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*');
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
            USING (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*')
            WITH CHECK (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*');
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
            USING (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*')
            WITH CHECK (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*');
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
            USING (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*')
            WITH CHECK (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*');
        END IF;
      END
      $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = '${workspaceProfilesTableName}' AND policyname = '${workspaceProfilesTableName}_service_policy'
        ) THEN
          CREATE POLICY ${workspaceProfilesTableName}_service_policy ON ${workspaceProfilesTableName}
            USING ((select current_setting('app.school_id', true)) = '*')
            WITH CHECK ((select current_setting('app.school_id', true)) = '*');
        END IF;
      END
      $$;
    `);
    for (const scopedTableName of [
      schoolMembershipsTableName,
      teamMembershipsTableName,
      billingTableName,
      activityTableName,
      liveSessionsTableName,
      operatorSessionsTableName,
    ]) {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = '${scopedTableName}' AND policyname = '${scopedTableName}_school_policy'
          ) THEN
            CREATE POLICY ${scopedTableName}_school_policy ON ${scopedTableName}
              USING (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*')
              WITH CHECK (school_id = (select current_setting('app.school_id', true)) OR (select current_setting('app.school_id', true)) = '*');
          END IF;
        END
        $$;
      `);
    }
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
      await setTenantContext(pool, "*");
      const result = await pool.query<{ payload: unknown }>(
        `SELECT payload FROM ${tableName} WHERE snapshot_key = $1 LIMIT 1`,
        ["global"]
      );
      return result.rows[0]?.payload ?? null;
    },
    async save(payload: unknown): Promise<void> {
      await ensureSchema();
      await setTenantContext(pool, "*");
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
        // Serialize concurrent replacePersistedSessions calls at the DB level.
        // pg_advisory_xact_lock is released automatically at COMMIT/ROLLBACK.
        // This prevents deadlocks when multiple node processes (or pooled connections)
        // race to DELETE+INSERT the same rows.
        await client.query("SELECT pg_advisory_xact_lock(847361290)");
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
              ON CONFLICT (school_id, game_id) DO UPDATE SET
                home_team_id = EXCLUDED.home_team_id,
                away_team_id = EXCLUDED.away_team_id,
                opponent_name = EXCLUDED.opponent_name,
                opponent_team_id = EXCLUDED.opponent_team_id,
                starting_lineup_by_team = EXCLUDED.starting_lineup_by_team,
                ai_settings = EXCLUDED.ai_settings,
                ai_context = EXCLUDED.ai_context,
                historical_context_summary = EXCLUDED.historical_context_summary,
                historical_context_fetched_at_ms = EXCLUDED.historical_context_fetched_at_ms,
                updated_at = NOW()
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
                ON CONFLICT (school_id, id) DO UPDATE SET
                  game_id = EXCLUDED.game_id,
                  sequence = EXCLUDED.sequence,
                  timestamp_iso = EXCLUDED.timestamp_iso,
                  payload = EXCLUDED.payload,
                  updated_at = NOW()
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
        display_name: string | null;
        abbreviation: string;
        season: string | null;
        team_color: string | null;
        sport: string | null;
        gender: string | null;
        level: string | null;
        custom_label: string | null;
        status: string | null;
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
            t.display_name,
            t.abbreviation,
            t.season,
            t.team_color,
            t.sport,
            t.gender,
            t.level,
            t.custom_label,
            t.status,
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
            displayName: row.display_name ?? undefined,
            abbreviation: row.abbreviation,
            season: row.season ?? undefined,
            teamColor: row.team_color ?? undefined,
            sport: row.sport === "basketball" ? "basketball" : undefined,
            gender: row.gender === "boys" || row.gender === "girls" || row.gender === "custom" ? row.gender : undefined,
            level: row.level === "varsity" || row.level === "jv" || row.level === "freshman" || row.level === "custom" ? row.level : undefined,
            customLabel: row.custom_label ?? undefined,
            status: row.status === "archived" || row.status === "read_only" ? row.status : (row.status === "active" ? "active" : undefined),
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
                school_id, id, name, display_name, abbreviation, season, team_color, sport, gender, level, custom_label, status, coach_style, playing_style, team_context, custom_prompt, focus_insights, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, NOW())
            `,
            [
              normalizedSchoolId,
              team.id,
              team.name,
              "displayName" in team ? ((team as RosterTeam & { displayName?: string }).displayName ?? null) : null,
              team.abbreviation,
              team.season ?? null,
              team.teamColor ?? null,
              "sport" in team ? ((team as RosterTeam & { sport?: string }).sport ?? null) : null,
              "gender" in team ? ((team as RosterTeam & { gender?: string }).gender ?? null) : null,
              "level" in team ? ((team as RosterTeam & { level?: string }).level ?? null) : null,
              "customLabel" in team ? ((team as RosterTeam & { customLabel?: string }).customLabel ?? null) : null,
              "status" in team ? ((team as RosterTeam & { status?: string }).status ?? null) : null,
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
      // Use a single dedicated client so all three queries share the connection
      // that had app.school_id='*' set, preventing RLS from filtering rows on
      // different pool connections.
      const client = await pool.connect();
      let profileRows: { rows: {
        school_id: string; organization_name: string; organization_slug: string | null;
        coach_name: string; coach_email: string; team_name: string | null;
        season: string | null; completed_at_iso: string | null;
        created_at_iso: string; updated_at_iso: string;
      }[] };
      let memberRows: { rows: {
        school_id: string; member_id: string; organization_id: string;
        auth_subject: string | null; full_name: string; email: string;
        role: string; status: string; invited_at_iso: string | null;
        joined_at_iso: string | null; created_at_iso: string; updated_at_iso: string;
      }[] };
      let authRows: { rows: {
        school_id: string; account_id: string; organization_id: string | null;
        email: string; full_name: string; password_hash: string; password_salt: string;
        role: string; status: string; created_at_iso: string;
        updated_at_iso: string; last_login_at_iso: string | null;
      }[] };
      try {
        await setTenantContext(client, "*");
        profileRows = await client.query(`SELECT * FROM ${orgProfilesTableName} ORDER BY school_id`);
        memberRows = await client.query(`SELECT * FROM ${orgMembersTableName} ORDER BY school_id, email`);
        authRows = await client.query(`SELECT * FROM ${localAuthTableName} ORDER BY school_id, email`);
      } finally {
        client.release();
      }

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
    async loadWorkspaceData(): Promise<WorkspaceDataResult> {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await setTenantContext(client, "*");
        const [schoolRows, profileRows, schoolMembershipRows, teamMembershipRows, billingRows, activityRows, liveSessionRows, operatorSessionRows] = await Promise.all([
          client.query(`SELECT * FROM ${schoolsTableName} WHERE name IS NOT NULL ORDER BY id`),
          client.query(`SELECT * FROM ${workspaceProfilesTableName} ORDER BY user_id`),
          client.query(`SELECT * FROM ${schoolMembershipsTableName} ORDER BY school_id, email`),
          client.query(`SELECT * FROM ${teamMembershipsTableName} ORDER BY school_id, team_id, email`),
          client.query(`SELECT * FROM ${billingTableName} ORDER BY school_id`),
          client.query(`SELECT * FROM ${activityTableName} ORDER BY school_id, created_at_iso DESC`),
          client.query(`SELECT * FROM ${liveSessionsTableName} ORDER BY school_id, updated_at_iso DESC`),
          client.query(`SELECT * FROM ${operatorSessionsTableName} ORDER BY school_id, updated_at_iso DESC`),
        ]);

        const schools: Record<string, SchoolRecord> = {};
        for (const row of schoolRows.rows as Array<Record<string, unknown>>) {
          const schoolId = normalizeSchoolId(String(row.id ?? ""));
          schools[schoolId] = {
            schoolId,
            name: String(row.name ?? schoolId),
            slug: String(row.slug ?? schoolId),
            sport: "basketball",
            status: row.status === "active" ? "active" : "draft",
            createdAtIso: String(row.created_at_iso ?? new Date().toISOString()),
            updatedAtIso: String(row.updated_at_iso ?? new Date().toISOString()),
          };
        }

        const userProfiles: Record<string, UserWorkspaceProfile> = {};
        for (const row of profileRows.rows as Array<Record<string, unknown>>) {
          const userId = String(row.user_id ?? "").trim();
          if (!userId) continue;
          userProfiles[userId] = {
            userId,
            email: String(row.email ?? "").toLowerCase(),
            fullName: String(row.full_name ?? ""),
            lastSchoolId: row.last_school_id ? String(row.last_school_id) : undefined,
            lastTeamId: row.last_team_id ? String(row.last_team_id) : undefined,
            lastContextType: row.last_context_type === "team" ? "team" : "school",
            createdAtIso: String(row.created_at_iso ?? new Date().toISOString()),
            updatedAtIso: String(row.updated_at_iso ?? new Date().toISOString()),
          };
        }

        const schoolMemberships: Record<string, SchoolMembership[]> = {};
        for (const row of schoolMembershipRows.rows as Array<Record<string, unknown>>) {
          const schoolId = normalizeSchoolId(String(row.school_id ?? ""));
          schoolMemberships[schoolId] ??= [];
          schoolMemberships[schoolId].push({
            membershipId: String(row.membership_id ?? ""),
            schoolId,
            userId: row.user_id ? String(row.user_id) : undefined,
            email: String(row.email ?? "").toLowerCase(),
            fullName: String(row.full_name ?? ""),
            role: row.role === "owner" ? "owner" : "school_admin",
            status: row.status === "invited" ? "invited" : "active",
            createdAtIso: String(row.created_at_iso ?? new Date().toISOString()),
            updatedAtIso: String(row.updated_at_iso ?? new Date().toISOString()),
          });
        }

        const teamMemberships: Record<string, TeamMembership[]> = {};
        for (const row of teamMembershipRows.rows as Array<Record<string, unknown>>) {
          const schoolId = normalizeSchoolId(String(row.school_id ?? ""));
          teamMemberships[schoolId] ??= [];
          teamMemberships[schoolId].push({
            membershipId: String(row.membership_id ?? ""),
            schoolId,
            teamId: String(row.team_id ?? ""),
            userId: row.user_id ? String(row.user_id) : undefined,
            email: String(row.email ?? "").toLowerCase(),
            fullName: String(row.full_name ?? ""),
            role: String(row.role ?? "viewer") as TeamMembership["role"],
            status: row.status === "invited" ? "invited" : "active",
            createdAtIso: String(row.created_at_iso ?? new Date().toISOString()),
            updatedAtIso: String(row.updated_at_iso ?? new Date().toISOString()),
          });
        }

        const billingStates: Record<string, BillingState> = {};
        for (const row of billingRows.rows as Array<Record<string, unknown>>) {
          const schoolId = normalizeSchoolId(String(row.school_id ?? ""));
          billingStates[schoolId] = {
            schoolId,
            planId: String(row.plan_id ?? "trial"),
            status: String(row.status ?? "trialing") as BillingState["status"],
            includedActiveTeamLimit: row.included_active_team_limit === null ? undefined : Number(row.included_active_team_limit),
            extraActiveTeamSeats: row.extra_active_team_seats === null ? undefined : Number(row.extra_active_team_seats),
            trialStartedAtIso: row.trial_started_at_iso ? String(row.trial_started_at_iso) : undefined,
            trialEndsAtIso: row.trial_ends_at_iso ? String(row.trial_ends_at_iso) : undefined,
            stripeCustomerId: row.stripe_customer_id ? String(row.stripe_customer_id) : undefined,
            stripeSubscriptionId: row.stripe_subscription_id ? String(row.stripe_subscription_id) : undefined,
            currentPeriodEndsAtIso: row.current_period_ends_at_iso ? String(row.current_period_ends_at_iso) : undefined,
            couponCode: row.coupon_code ? String(row.coupon_code) : undefined,
            createdAtIso: String(row.created_at_iso ?? new Date().toISOString()),
            updatedAtIso: String(row.updated_at_iso ?? new Date().toISOString()),
          };
        }

        const activityEvents: Record<string, ActivityEvent[]> = {};
        for (const row of activityRows.rows as Array<Record<string, unknown>>) {
          const schoolId = normalizeSchoolId(String(row.school_id ?? ""));
          activityEvents[schoolId] ??= [];
          activityEvents[schoolId].push({
            id: String(row.id ?? ""),
            schoolId,
            teamId: row.team_id ? String(row.team_id) : undefined,
            type: String(row.type ?? "") as ActivityEvent["type"],
            actorUserId: row.actor_user_id ? String(row.actor_user_id) : undefined,
            message: String(row.message ?? ""),
            createdAtIso: String(row.created_at_iso ?? new Date().toISOString()),
            metadata: (row.metadata as Record<string, unknown> | undefined) ?? undefined,
          });
        }

        const liveGameSessions: Record<string, LiveGameSessionRecord[]> = {};
        for (const row of liveSessionRows.rows as Array<Record<string, unknown>>) {
          const schoolId = normalizeSchoolId(String(row.school_id ?? ""));
          liveGameSessions[schoolId] ??= [];
          liveGameSessions[schoolId].push({
            liveSessionId: String(row.live_session_id ?? ""),
            schoolId,
            teamId: String(row.team_id ?? ""),
            gameId: String(row.game_id ?? ""),
            opponentName: row.opponent_name ? String(row.opponent_name) : undefined,
            opponentTeamId: row.opponent_team_id ? String(row.opponent_team_id) : undefined,
            status: row.status === "completed" ? "completed" : "active",
            pairingCode: String(row.pairing_code ?? ""),
            createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : undefined,
            createdAtIso: String(row.created_at_iso ?? new Date().toISOString()),
            updatedAtIso: String(row.updated_at_iso ?? new Date().toISOString()),
          });
        }

        const operatorSessions: Record<string, OperatorSessionRecord> = {};
        for (const row of operatorSessionRows.rows as Array<Record<string, unknown>>) {
          const liveSessionId = String(row.live_session_id ?? "").trim();
          if (!liveSessionId) continue;
          operatorSessions[liveSessionId] = {
            operatorSessionId: String(row.operator_session_id ?? ""),
            liveSessionId,
            schoolId: normalizeSchoolId(String(row.school_id ?? "")),
            teamId: String(row.team_id ?? ""),
            pairingCode: String(row.pairing_code ?? ""),
            operatorToken: String(row.operator_token ?? ""),
            expiresAtIso: String(row.expires_at_iso ?? new Date().toISOString()),
            createdAtIso: String(row.created_at_iso ?? new Date().toISOString()),
            updatedAtIso: String(row.updated_at_iso ?? new Date().toISOString()),
          };
        }

        return { schools, userProfiles, schoolMemberships, teamMemberships, billingStates, activityEvents, liveGameSessions, operatorSessions };
      } finally {
        client.release();
      }
    },
    async replaceSchoolRecord(schoolId: string, record: SchoolRecord | null): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      await setTenantContext(pool, normalizedSchoolId);
      if (!record) {
        await pool.query(`DELETE FROM ${schoolsTableName} WHERE id = $1`, [normalizedSchoolId]);
        return;
      }
      await ensureSchool(pool, normalizedSchoolId);
      await pool.query(
        `UPDATE ${schoolsTableName}
         SET name = $2, slug = $3, sport = $4, status = $5, created_at_iso = $6, updated_at_iso = $7
         WHERE id = $1`,
        [normalizedSchoolId, record.name, record.slug, record.sport, record.status, record.createdAtIso, record.updatedAtIso]
      );
    },
    async replaceUserWorkspaceProfile(profile: UserWorkspaceProfile): Promise<void> {
      await ensureSchema();
      await setTenantContext(pool, "*");
      await pool.query(
        `
          INSERT INTO ${workspaceProfilesTableName} (
            user_id, email, full_name, last_school_id, last_team_id, last_context_type, created_at_iso, updated_at_iso, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            last_school_id = EXCLUDED.last_school_id,
            last_team_id = EXCLUDED.last_team_id,
            last_context_type = EXCLUDED.last_context_type,
            updated_at_iso = EXCLUDED.updated_at_iso,
            updated_at = NOW()
        `,
        [profile.userId, profile.email, profile.fullName, profile.lastSchoolId ?? null, profile.lastTeamId ?? null, profile.lastContextType ?? "school", profile.createdAtIso, profile.updatedAtIso]
      );
    },
    async replaceSchoolMembershipsForSchool(schoolId: string, memberships: SchoolMembership[]): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, normalizedSchoolId);
        await ensureSchool(client, normalizedSchoolId);
        await client.query(`DELETE FROM ${schoolMembershipsTableName} WHERE school_id = $1`, [normalizedSchoolId]);
        for (const membership of memberships) {
          await client.query(
            `INSERT INTO ${schoolMembershipsTableName} (
              school_id, membership_id, user_id, email, full_name, role, status, created_at_iso, updated_at_iso, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [normalizedSchoolId, membership.membershipId, membership.userId ?? null, membership.email, membership.fullName, membership.role, membership.status, membership.createdAtIso, membership.updatedAtIso]
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
    async replaceTeamMembershipsForSchool(schoolId: string, memberships: TeamMembership[]): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, normalizedSchoolId);
        await ensureSchool(client, normalizedSchoolId);
        await client.query(`DELETE FROM ${teamMembershipsTableName} WHERE school_id = $1`, [normalizedSchoolId]);
        for (const membership of memberships) {
          await client.query(
            `INSERT INTO ${teamMembershipsTableName} (
              school_id, membership_id, team_id, user_id, email, full_name, role, status, created_at_iso, updated_at_iso, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
            [normalizedSchoolId, membership.membershipId, membership.teamId, membership.userId ?? null, membership.email, membership.fullName, membership.role, membership.status, membership.createdAtIso, membership.updatedAtIso]
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
    async replaceBillingStateForSchool(schoolId: string, billingState: BillingState | null): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      await setTenantContext(pool, normalizedSchoolId);
      if (!billingState) {
        await pool.query(`DELETE FROM ${billingTableName} WHERE school_id = $1`, [normalizedSchoolId]);
        return;
      }
      await ensureSchool(pool, normalizedSchoolId);
      await pool.query(
        `
          INSERT INTO ${billingTableName} (
            school_id, plan_id, status, included_active_team_limit, extra_active_team_seats, trial_started_at_iso, trial_ends_at_iso,
            stripe_customer_id, stripe_subscription_id, current_period_ends_at_iso, coupon_code, created_at_iso, updated_at_iso, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          ON CONFLICT (school_id) DO UPDATE SET
            plan_id = EXCLUDED.plan_id,
            status = EXCLUDED.status,
            included_active_team_limit = EXCLUDED.included_active_team_limit,
            extra_active_team_seats = EXCLUDED.extra_active_team_seats,
            trial_started_at_iso = EXCLUDED.trial_started_at_iso,
            trial_ends_at_iso = EXCLUDED.trial_ends_at_iso,
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            current_period_ends_at_iso = EXCLUDED.current_period_ends_at_iso,
            coupon_code = EXCLUDED.coupon_code,
            updated_at_iso = EXCLUDED.updated_at_iso,
            updated_at = NOW()
        `,
        [normalizedSchoolId, billingState.planId, billingState.status, billingState.includedActiveTeamLimit ?? null, billingState.extraActiveTeamSeats ?? null, billingState.trialStartedAtIso ?? null, billingState.trialEndsAtIso ?? null, billingState.stripeCustomerId ?? null, billingState.stripeSubscriptionId ?? null, billingState.currentPeriodEndsAtIso ?? null, billingState.couponCode ?? null, billingState.createdAtIso, billingState.updatedAtIso]
      );
    },
    async replaceActivityEventsForSchool(schoolId: string, events: ActivityEvent[]): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, normalizedSchoolId);
        await ensureSchool(client, normalizedSchoolId);
        await client.query(`DELETE FROM ${activityTableName} WHERE school_id = $1`, [normalizedSchoolId]);
        for (const event of events) {
          await client.query(
            `INSERT INTO ${activityTableName} (
              school_id, id, team_id, type, actor_user_id, message, created_at_iso, metadata, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())`,
            [normalizedSchoolId, event.id, event.teamId ?? null, event.type, event.actorUserId ?? null, event.message, event.createdAtIso, JSON.stringify(event.metadata ?? null)]
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
    async replaceLiveGameSessionsForSchool(schoolId: string, sessions: LiveGameSessionRecord[]): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, normalizedSchoolId);
        await ensureSchool(client, normalizedSchoolId);
        await client.query(`DELETE FROM ${liveSessionsTableName} WHERE school_id = $1`, [normalizedSchoolId]);
        for (const session of sessions) {
          await client.query(
            `INSERT INTO ${liveSessionsTableName} (
              school_id, live_session_id, team_id, game_id, opponent_name, opponent_team_id, status, pairing_code, created_by_user_id, created_at_iso, updated_at_iso, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
            [normalizedSchoolId, session.liveSessionId, session.teamId, session.gameId, session.opponentName ?? null, session.opponentTeamId ?? null, session.status, session.pairingCode, session.createdByUserId ?? null, session.createdAtIso, session.updatedAtIso]
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
    async replaceOperatorSessionsForSchool(schoolId: string, sessions: OperatorSessionRecord[]): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, normalizedSchoolId);
        await ensureSchool(client, normalizedSchoolId);
        await client.query(`DELETE FROM ${operatorSessionsTableName} WHERE school_id = $1`, [normalizedSchoolId]);
        for (const session of sessions) {
          await client.query(
            `INSERT INTO ${operatorSessionsTableName} (
              school_id, operator_session_id, live_session_id, team_id, pairing_code, operator_token, expires_at_iso, created_at_iso, updated_at_iso, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [normalizedSchoolId, session.operatorSessionId, session.liveSessionId, session.teamId, session.pairingCode, session.operatorToken, session.expiresAtIso, session.createdAtIso, session.updatedAtIso]
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
    async clearSchoolData(schoolId: string): Promise<void> {
      await ensureSchema();
      const normalizedSchoolId = normalizeSchoolId(schoolId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, "*");
        await client.query(
          `
            UPDATE ${workspaceProfilesTableName}
            SET
              last_school_id = CASE WHEN last_school_id = $1 THEN NULL ELSE last_school_id END,
              last_team_id = CASE WHEN last_school_id = $1 THEN NULL ELSE last_team_id END,
              updated_at_iso = CASE WHEN last_school_id = $1 THEN $2 ELSE updated_at_iso END,
              updated_at = NOW()
            WHERE last_school_id = $1
          `,
          [normalizedSchoolId, new Date().toISOString()]
        );
        await client.query(`DELETE FROM ${schoolsTableName} WHERE id = $1`, [normalizedSchoolId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async clearAllNormalizedData(): Promise<void> {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenantContext(client, "*");
        await client.query(`DELETE FROM ${workspaceProfilesTableName}`);
        await client.query(`DELETE FROM ${schoolsTableName}`);
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
    return "bta";
  }
  return normalized;
}
