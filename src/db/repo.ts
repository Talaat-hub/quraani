import { addDays } from '../domain/dates';
import { completion, deriveStatus, type Status } from '../domain/status';
import { TRACKERS, type TrackerId } from '../domain/trackers';
import {
  ayahSet, measure, nextAyah, planPortion, toIndex, validateRange, round,
  type AyahRef, type GoalUnit, type Range,
} from '../quran';
import type { Db } from './schema';

export type Tracker = {
  id: TrackerId;
  goalUnit: GoalUnit;
  goalAmount: number;
  paused: boolean;
  reminderEnabled: boolean;
  reminderIntervalMin: number;
  snoozedUntil: number | null;
};

export type Session = Range & { id: number };

export type DayRecord = {
  id: number;
  trackerId: TrackerId;
  day: string;
  goalUnit: GoalUnit;
  goalAmount: number;
  planned: Range | null;
  postponed: boolean;
  paused: boolean;
  rating: number | null;
  sessions: Session[];
  done: number; // measured in goalUnit, overlaps counted once
  status: Status;
  pct: number | null;
};

const BACKFILL_DAYS = 60;

type TrackerRow = {
  id: TrackerId; goal_unit: GoalUnit; goal_amount: number; paused: number;
  reminder_enabled: number; reminder_interval_min: number; snoozed_until: number | null;
};
const toTracker = (r: TrackerRow): Tracker => ({
  id: r.id, goalUnit: r.goal_unit, goalAmount: r.goal_amount, paused: !!r.paused,
  reminderEnabled: !!r.reminder_enabled, reminderIntervalMin: r.reminder_interval_min, snoozedUntil: r.snoozed_until,
});

export async function getTrackers(db: Db): Promise<Tracker[]> {
  const rows = await db.getAllAsync<TrackerRow>('SELECT * FROM trackers');
  return TRACKERS.map((id) => toTracker(rows.find((r) => r.id === id)!));
}

export async function getTracker(db: Db, id: TrackerId): Promise<Tracker> {
  return toTracker((await db.getFirstAsync<TrackerRow>('SELECT * FROM trackers WHERE id = ?', [id]))!);
}

// ---------- settings ----------

export async function getSettings(db: Db): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(db: Db, key: string, value: string) {
  await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

// ---------- day records ----------

/** Where this tracker should continue: the ayah after the latest recorded session, else 1:1. */
export async function continuePoint(db: Db, id: TrackerId): Promise<AyahRef> {
  const last = await db.getFirstAsync<{ s: number; a: number }>(
    `SELECT s.to_surah s, s.to_ayah a FROM sessions s JOIN day_records r ON r.id = s.record_id
     WHERE r.tracker_id = ? ORDER BY r.day DESC, s.id DESC LIMIT 1`, [id]);
  return last ? nextAyah({ surah: last.s, ayah: last.a }) : { surah: 1, ayah: 1 };
}

/**
 * Creates the missing day records up to `today` for every tracker, snapshotting the current goal
 * and pause state. Must run before any goal/pause change so past days keep their real settings.
 */
export async function ensureDays(db: Db, today: string, now = Date.now()): Promise<void> {
  for (const t of await getTrackers(db)) {
    const last = await db.getFirstAsync<{ day: string }>('SELECT MAX(day) day FROM day_records WHERE tracker_id = ?', [t.id]);
    if (last?.day && last.day >= today) continue;
    let day = last?.day ? addDays(last.day, 1) : today;
    const earliest = addDays(today, -BACKFILL_DAYS);
    if (day < earliest) day = earliest;
    for (; day <= today; day = addDays(day, 1)) {
      const plan = day === today ? planPortion(toIndex(await continuePoint(db, t.id)), t.goalUnit, t.goalAmount) : null;
      await db.runAsync(
        `INSERT OR IGNORE INTO day_records (tracker_id, day, goal_unit, goal_amount, planned_from_surah, planned_from_ayah,
          planned_to_surah, planned_to_ayah, paused, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [t.id, day, t.goalUnit, t.goalAmount, plan?.from.surah ?? null, plan?.from.ayah ?? null,
          plan?.to.surah ?? null, plan?.to.ayah ?? null, t.paused ? 1 : 0, now, now]);
    }
  }
}

type RecordRow = {
  id: number; tracker_id: TrackerId; day: string; goal_unit: GoalUnit; goal_amount: number;
  planned_from_surah: number | null; planned_from_ayah: number | null; planned_to_surah: number | null; planned_to_ayah: number | null;
  postponed: number; paused: number; rating: number | null;
};
type SessionRow = { id: number; record_id: number; from_surah: number; from_ayah: number; to_surah: number; to_ayah: number };

function build(r: RecordRow, sessions: SessionRow[], today: string): DayRecord {
  const ss: Session[] = sessions.filter((s) => s.record_id === r.id).map((s) => ({
    id: s.id, from: { surah: s.from_surah, ayah: s.from_ayah }, to: { surah: s.to_surah, ayah: s.to_ayah },
  }));
  const done = measure(r.goal_unit, ss);
  return {
    id: r.id, trackerId: r.tracker_id, day: r.day, goalUnit: r.goal_unit, goalAmount: r.goal_amount,
    planned: r.planned_from_surah == null ? null : {
      from: { surah: r.planned_from_surah, ayah: r.planned_from_ayah! },
      to: { surah: r.planned_to_surah!, ayah: r.planned_to_ayah! },
    },
    postponed: !!r.postponed, paused: !!r.paused, rating: r.rating, sessions: ss, done,
    status: deriveStatus({ done, target: r.goal_amount, postponed: !!r.postponed, paused: !!r.paused, isPast: r.day < today }),
    pct: ss.length ? completion(done, r.goal_amount) : null,
  };
}

async function load(db: Db, where: string, params: (string | number)[], today: string, limit = -1): Promise<DayRecord[]> {
  const rows = await db.getAllAsync<RecordRow>(`SELECT * FROM day_records WHERE ${where} ORDER BY day DESC LIMIT ?`, [...params, limit]);
  if (!rows.length) return [];
  const sessions = await db.getAllAsync<SessionRow>(
    `SELECT * FROM sessions WHERE record_id IN (${rows.map(() => '?').join(',')}) ORDER BY id`, rows.map((r) => r.id));
  return rows.map((r) => build(r, sessions, today));
}

export async function getDay(db: Db, id: TrackerId, day: string, today = day): Promise<DayRecord | null> {
  return (await load(db, 'tracker_id = ? AND day = ?', [id, day], today))[0] ?? null;
}

export async function getHistory(db: Db, id: TrackerId, today: string, limit = 90): Promise<DayRecord[]> {
  return load(db, 'tracker_id = ? AND day <= ?', [id, today], today, limit);
}

// ---------- mutations (today's record only; past days are read-only) ----------

async function requireToday(db: Db, recordId: number, today: string) {
  const r = await db.getFirstAsync<{ day: string }>('SELECT day FROM day_records WHERE id = ?', [recordId]);
  if (!r) throw new Error('Record not found');
  if (r.day !== today) throw new Error('Only today can be edited');
}
const touch = (db: Db, id: number) => db.runAsync('UPDATE day_records SET updated_at = ? WHERE id = ?', [Date.now(), id]);

export async function addSession(db: Db, recordId: number, range: Range, today: string) {
  const issue = validateRange(range);
  if (issue) throw new Error(issue);
  await requireToday(db, recordId, today);
  await db.runAsync(
    'INSERT INTO sessions (record_id, from_surah, from_ayah, to_surah, to_ayah, created_at) VALUES (?,?,?,?,?,?)',
    [recordId, range.from.surah, range.from.ayah, range.to.surah, range.to.ayah, Date.now()]);
  await touch(db, recordId);
}

export async function deleteSession(db: Db, sessionId: number, today: string) {
  const s = await db.getFirstAsync<{ record_id: number }>('SELECT record_id FROM sessions WHERE id = ?', [sessionId]);
  if (!s) return;
  await requireToday(db, s.record_id, today);
  await db.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
  // A rating only makes sense for an attempted session.
  await db.runAsync('UPDATE day_records SET rating = NULL WHERE id = ? AND NOT EXISTS (SELECT 1 FROM sessions WHERE record_id = ?)', [s.record_id, s.record_id]);
  await touch(db, s.record_id);
}

export async function setPostponed(db: Db, recordId: number, postponed: boolean, today: string) {
  await requireToday(db, recordId, today);
  await db.runAsync('UPDATE day_records SET postponed = ?, updated_at = ? WHERE id = ?', [postponed ? 1 : 0, Date.now(), recordId]);
}

export async function setRating(db: Db, recordId: number, rating: number | null, today: string) {
  if (rating != null && !(Number.isInteger(rating) && rating >= 0 && rating <= 5)) throw new Error('rating must be 0-5');
  await requireToday(db, recordId, today);
  const has = await db.getFirstAsync('SELECT 1 FROM sessions WHERE record_id = ?', [recordId]);
  if (rating != null && !has) throw new Error('Record a session before rating');
  await db.runAsync('UPDATE day_records SET rating = ?, updated_at = ? WHERE id = ?', [rating, Date.now(), recordId]);
}

export async function setPlanned(db: Db, recordId: number, range: Range, today: string) {
  const issue = validateRange(range);
  if (issue) throw new Error(issue);
  await requireToday(db, recordId, today);
  await db.runAsync(
    'UPDATE day_records SET planned_from_surah=?, planned_from_ayah=?, planned_to_surah=?, planned_to_ayah=?, updated_at=? WHERE id=?',
    [range.from.surah, range.from.ayah, range.to.surah, range.to.ayah, Date.now(), recordId]);
}

/** Changes the goal from today on. Past records keep their snapshot. */
export async function setGoal(db: Db, id: TrackerId, unit: GoalUnit, amount: number, today: string) {
  if (!(amount > 0 && amount <= 6236)) throw new Error('invalid goal amount');
  await ensureDays(db, today);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE trackers SET goal_unit=?, goal_amount=?, updated_at=? WHERE id=?', [unit, amount, Date.now(), id]);
    await db.runAsync('UPDATE day_records SET goal_unit=?, goal_amount=?, updated_at=? WHERE tracker_id=? AND day=?', [unit, amount, Date.now(), id, today]);
  });
  // Re-plan today's portion only if nothing was recorded yet.
  const rec = await getDay(db, id, today);
  if (rec && !rec.sessions.length) {
    const from = rec.planned?.from ?? await continuePoint(db, id);
    await setPlanned(db, rec.id, planPortion(toIndex(from), unit, amount), today);
  }
}

export async function setPaused(db: Db, id: TrackerId, paused: boolean, today: string) {
  await ensureDays(db, today);
  await db.runAsync('UPDATE trackers SET paused=?, snoozed_until=NULL, updated_at=? WHERE id=?', [paused ? 1 : 0, Date.now(), id]);
  await db.runAsync('UPDATE day_records SET paused=?, updated_at=? WHERE tracker_id=? AND day=?', [paused ? 1 : 0, Date.now(), id, today]);
}

export async function setReminder(db: Db, id: TrackerId, enabled: boolean, intervalMin: number) {
  if (!(Number.isInteger(intervalMin) && intervalMin >= 15)) throw new Error('interval must be >= 15 min');
  await db.runAsync('UPDATE trackers SET reminder_enabled=?, reminder_interval_min=?, updated_at=? WHERE id=?', [enabled ? 1 : 0, intervalMin, Date.now(), id]);
}

export async function setSnooze(db: Db, id: TrackerId, until: number | null) {
  await db.runAsync('UPDATE trackers SET snoozed_until=? WHERE id=?', [until, id]);
}

export async function deleteAllData(db: Db) {
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM sessions; DELETE FROM day_records; DELETE FROM settings;');
    await db.execAsync(`UPDATE trackers SET paused=0, snoozed_until=NULL, reminder_enabled=1;
      UPDATE trackers SET goal_unit='ayah', goal_amount=5, reminder_interval_min=120 WHERE id='hifz';
      UPDATE trackers SET goal_unit='page', goal_amount=2, reminder_interval_min=180 WHERE id='muraja';
      UPDATE trackers SET goal_unit='quarter', goal_amount=4, reminder_interval_min=60 WHERE id='tilawah';`);
  });
}

// ---------- statistics (from recorded sessions, never from targets) ----------

export type Stats = {
  completedDays: number;
  rate7: number | null; // completed / active (non-paused) days
  rate30: number | null;
  uniqueAyahs: number; // distinct ayahs ever recorded (memorized coverage)
  totalAyahs: number; // sum over days, repeats on different days counted (revision/reading volume)
  totalPages: number;
  avgRating: number | null;
};

export async function getStats(db: Db, id: TrackerId, today: string): Promise<Stats> {
  const all = await load(db, 'tracker_id = ? AND day <= ?', [id, today], today);
  const rate = (days: number) => {
    const from = addDays(today, -(days - 1));
    // Today only counts once it's completed, so an unfinished morning doesn't lower the rate.
    const active = all.filter((r) => r.day >= from && !r.paused && (r.day < today || r.status === 'completed'));
    return active.length ? round(active.filter((r) => r.status === 'completed').length / active.length) : null;
  };
  const ratings = all.map((r) => r.rating).filter((x): x is number => x != null);
  return {
    completedDays: all.filter((r) => r.status === 'completed').length,
    rate7: rate(7),
    rate30: rate(30),
    uniqueAyahs: ayahSet(all.flatMap((r) => r.sessions)).size,
    totalAyahs: all.reduce((s, r) => s + measure('ayah', r.sessions), 0),
    totalPages: round(all.reduce((s, r) => s + measure('page', r.sessions), 0)),
    avgRating: ratings.length ? round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
  };
}
