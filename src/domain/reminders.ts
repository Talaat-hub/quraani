import { addDays, dayKey, parseDay, toHHMM } from './dates';
import type { TrackerId } from './trackers';

export type ReminderSettings = {
  enabled: boolean;
  windowStart: number; // minutes since midnight
  windowEnd: number;
  quietStart: number; // quiet hours may wrap midnight; equal start/end = no quiet hours
  quietEnd: number;
  maxPerDay: number; // per tracker
};

export type TrackerReminderState = {
  id: TrackerId;
  enabled: boolean;
  intervalMin: number;
  paused: boolean;
  needsToday: boolean; // today's status still needs a reminder
  snoozedUntil: number | null; // epoch ms
};

export type PlannedReminder = { id: string; trackerId: TrackerId; at: number };

/** iOS keeps at most 64 pending local notifications per app; leave headroom. */
export const MAX_PENDING = 60;

const inQuiet = (s: ReminderSettings, m: number) =>
  s.quietStart === s.quietEnd ? false
    : s.quietStart < s.quietEnd ? m >= s.quietStart && m < s.quietEnd
      : m >= s.quietStart || m < s.quietEnd;

/**
 * Pure reminder plan for today plus the next days, so reminders keep coming even if the app
 * is never opened (future days assume nothing is recorded yet; recording progress re-plans).
 */
export function planReminders(
  now: number,
  settings: ReminderSettings,
  trackers: TrackerReminderState[],
  daysAhead = 3,
): PlannedReminder[] {
  if (!settings.enabled) return [];
  const today = dayKey(new Date(now));
  const end = settings.windowEnd > settings.windowStart ? settings.windowEnd : 24 * 60 - 1;
  const out: PlannedReminder[] = [];

  for (const t of trackers) {
    if (!t.enabled || t.paused || t.intervalMin < 15) continue;
    for (let d = 0; d < daysAhead; d++) {
      if (d === 0 && !t.needsToday) continue;
      const day = addDays(today, d);
      const base = parseDay(day);
      const snooze = d === 0 && t.snoozedUntil && t.snoozedUntil > now ? t.snoozedUntil : 0;
      const times: number[] = snooze ? [snooze] : [];
      for (let m = settings.windowStart; m <= end; m += t.intervalMin) {
        if (inQuiet(settings, m)) continue;
        const at = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(m / 60), m % 60).getTime();
        if (at > now && at > snooze) times.push(at);
      }
      for (const at of times.slice(0, settings.maxPerDay)) {
        const dt = new Date(at);
        out.push({ id: `${t.id}-${day}-${toHHMM(dt.getHours() * 60 + dt.getMinutes())}`, trackerId: t.id, at });
      }
    }
  }
  // Same id can't appear twice (one per tracker per minute); sort and cap for the OS limit.
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_PENDING);
}
