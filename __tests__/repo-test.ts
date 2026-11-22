import {
  addSession, deleteAllData, deleteSession, ensureDays, getDay, getHistory, getStats, getTracker,
  setGoal, setPaused, setPostponed, setRating,
} from '../src/db/repo';
import { migrate, MIGRATIONS, type Db } from '../src/db/schema';

/** expo-sqlite-shaped adapter over Node's built-in SQLite. */
function nodeDb(): Db {
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql) => void d.exec(sql),
    runAsync: async (sql, p = []) => {
      const r = d.prepare(sql).run(...p);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getAllAsync: async (sql, p = []) => d.prepare(sql).all(...p),
    getFirstAsync: async (sql, p = []) => d.prepare(sql).get(...p) ?? null,
    withTransactionAsync: async (task) => {
      d.exec('BEGIN');
      try { await task(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; }
    },
  };
}

const r = (surah: number, ayah: number) => ({ surah, ayah });
const T = '2026-11-22';
let db: Db;
beforeEach(async () => { db = nodeDb(); await migrate(db); });

it('migrations are idempotent and versioned', async () => {
  await migrate(db);
  expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version).toBe(MIGRATIONS.length);
});

it('creates today with a planned portion from the start', async () => {
  await ensureDays(db, T);
  const rec = (await getDay(db, 'hifz', T))!;
  expect(rec.status).toBe('not_started');
  expect(rec.planned).toEqual({ from: r(1, 1), to: r(1, 5) }); // default 5 ayahs
  expect(rec.pct).toBeNull(); // no misleading 0% before starting
});

it('partial progress keeps the original target; completion by multiple sessions', async () => {
  await setGoal(db, 'tilawah', 'quarter', 4, T); // full hizb
  let rec = (await getDay(db, 'tilawah', T))!;
  await addSession(db, rec.id, { from: r(1, 1), to: r(2, 25) }, T); // 1 quarter
  rec = (await getDay(db, 'tilawah', T))!;
  expect(rec).toMatchObject({ goalAmount: 4, done: 1, status: 'in_progress', pct: 0.25 });
  await setPostponed(db, rec.id, true, T);
  expect((await getDay(db, 'tilawah', T))!.status).toBe('partial'); // بدأ ولم يكمل
  await setPostponed(db, rec.id, false, T);
  await addSession(db, rec.id, { from: r(2, 26), to: r(2, 74) }, T);
  expect((await getDay(db, 'tilawah', T))!).toMatchObject({ status: 'completed', done: 4, goalAmount: 4 });
});

it('rejects invalid ranges and edits to past days', async () => {
  await ensureDays(db, '2026-11-21');
  const past = (await getDay(db, 'hifz', '2026-11-21'))!;
  await ensureDays(db, T);
  const rec = (await getDay(db, 'hifz', T))!;
  await expect(addSession(db, rec.id, { from: r(2, 10), to: r(2, 1) }, T)).rejects.toThrow('end_before_start');
  await expect(addSession(db, rec.id, { from: r(1, 1), to: r(1, 8) }, T)).rejects.toThrow('invalid_to');
  await expect(addSession(db, past.id, { from: r(1, 1), to: r(1, 2) }, T)).rejects.toThrow('Only today');
});

it('rating needs an attempt; 0 is a valid rating and is cleared when the attempt is removed', async () => {
  await ensureDays(db, T);
  const rec = (await getDay(db, 'hifz', T))!;
  await expect(setRating(db, rec.id, 3, T)).rejects.toThrow();
  await addSession(db, rec.id, { from: r(1, 1), to: r(1, 2) }, T);
  await setRating(db, rec.id, 0, T);
  const after = (await getDay(db, 'hifz', T))!;
  expect(after.rating).toBe(0);
  await expect(setRating(db, rec.id, 6, T)).rejects.toThrow();
  await deleteSession(db, after.sessions[0].id, T);
  expect((await getDay(db, 'hifz', T))!.rating).toBeNull();
});

it('backfills missed days, snapshots goals, continues from the last recorded point', async () => {
  await ensureDays(db, '2026-11-19');
  const d19 = (await getDay(db, 'hifz', '2026-11-19'))!;
  await addSession(db, d19.id, { from: r(1, 1), to: r(1, 3) }, '2026-11-19');
  await setGoal(db, 'hifz', 'ayah', 10, T); // ensures 20..22 with old goal first, then changes today
  const hist = await getHistory(db, 'hifz', T);
  expect(hist.map((h) => [h.day, h.status, h.goalAmount])).toEqual([
    [T, 'not_started', 10], ['2026-11-21', 'missed', 5], ['2026-11-20', 'missed', 5], ['2026-11-19', 'partial', 5],
  ]);
  expect(hist[0].planned).toEqual({ from: r(1, 4), to: r(2, 6) });
});

it('pause is per tracker and recorded on the day', async () => {
  await setPaused(db, 'muraja', true, T);
  expect((await getTracker(db, 'muraja')).paused).toBe(true);
  expect((await getTracker(db, 'hifz')).paused).toBe(false);
  expect((await getDay(db, 'muraja', T))!.status).toBe('paused');
  expect((await getDay(db, 'hifz', T))!.status).toBe('not_started');
});

it('stats come from sessions and do not double count memorized ayahs', async () => {
  await ensureDays(db, '2026-11-21');
  const a = (await getDay(db, 'hifz', '2026-11-21'))!;
  await addSession(db, a.id, { from: r(1, 1), to: r(1, 7) }, '2026-11-21');
  await setRating(db, a.id, 4, '2026-11-21');
  await ensureDays(db, T);
  const b = (await getDay(db, 'hifz', T))!;
  await addSession(db, b.id, { from: r(1, 5), to: r(2, 3) }, T);
  await setRating(db, b.id, 2, T);
  const s = await getStats(db, 'hifz', T);
  expect(s).toMatchObject({ uniqueAyahs: 10, totalAyahs: 13, completedDays: 2, avgRating: 3, rate7: 1 });
});

it('deleteAllData wipes records and restores defaults', async () => {
  await setPaused(db, 'hifz', true, T);
  await deleteAllData(db);
  expect(await getHistory(db, 'hifz', T)).toEqual([]);
  expect((await getTracker(db, 'hifz')).paused).toBe(false);
});
