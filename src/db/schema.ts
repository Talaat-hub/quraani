/** The subset of expo-sqlite's SQLiteDatabase we use, so repositories can be tested on Node. */
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: (string | number | null)[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params?: (string | number | null)[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: (string | number | null)[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/**
 * Append-only list. Never edit a shipped migration; add a new one.
 * Index n migrates user_version n -> n+1.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE trackers (
    id TEXT PRIMARY KEY CHECK (id IN ('hifz','muraja','tilawah')),
    goal_unit TEXT NOT NULL CHECK (goal_unit IN ('ayah','page','quarter')),
    goal_amount REAL NOT NULL CHECK (goal_amount > 0),
    paused INTEGER NOT NULL DEFAULT 0,
    reminder_enabled INTEGER NOT NULL DEFAULT 1,
    reminder_interval_min INTEGER NOT NULL CHECK (reminder_interval_min >= 15),
    snoozed_until INTEGER,
    updated_at INTEGER NOT NULL
  );

  -- One row per tracker per local day. The goal is snapshotted so later goal changes never
  -- rewrite history; progress lives in sessions and is never merged into the target.
  CREATE TABLE day_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracker_id TEXT NOT NULL REFERENCES trackers(id),
    day TEXT NOT NULL,
    goal_unit TEXT NOT NULL CHECK (goal_unit IN ('ayah','page','quarter')),
    goal_amount REAL NOT NULL CHECK (goal_amount > 0),
    planned_from_surah INTEGER, planned_from_ayah INTEGER,
    planned_to_surah INTEGER, planned_to_ayah INTEGER,
    postponed INTEGER NOT NULL DEFAULT 0,
    paused INTEGER NOT NULL DEFAULT 0,
    rating INTEGER CHECK (rating BETWEEN 0 AND 5),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (tracker_id, day)
  );

  -- A Quran portion actually memorized / revised / read. Several per day are allowed.
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL REFERENCES day_records(id) ON DELETE CASCADE,
    from_surah INTEGER NOT NULL, from_ayah INTEGER NOT NULL,
    to_surah INTEGER NOT NULL, to_ayah INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_record ON sessions(record_id);

  INSERT INTO trackers (id, goal_unit, goal_amount, reminder_interval_min, updated_at) VALUES
    ('hifz', 'ayah', 5, 120, 0),
    ('muraja', 'page', 2, 180, 0),
    ('tilawah', 'quarter', 4, 60, 0);
  `,
  // v2: reminder intervals down to 1 minute. SQLite can't relax v1's CHECK (>= 15) without a table
  // rebuild, so the interval moves to a new column; trackers.reminder_interval_min is unused from v2 on.
  `
  ALTER TABLE trackers ADD COLUMN remind_every_min INTEGER NOT NULL DEFAULT 60 CHECK (remind_every_min >= 1);
  UPDATE trackers SET remind_every_min = reminder_interval_min;
  `,
];

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let v = row?.user_version ?? 0;
  if (v > MIGRATIONS.length) throw new Error(`Database version ${v} is newer than this app`);
  for (; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
