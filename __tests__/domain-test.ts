import { addDays, dayKey, fromHHMM, toHHMM } from '../src/domain/dates';
import { planReminders, type ReminderSettings, type TrackerReminderState } from '../src/domain/reminders';
import { completion, deriveStatus, needsReminder } from '../src/domain/status';

describe('status', () => {
  const base = { done: 0, target: 4, postponed: false, paused: false, isPast: false };
  it.each([
    [{}, 'not_started'],
    [{ done: 2 }, 'in_progress'],
    [{ done: 4 }, 'completed'],
    [{ done: 5 }, 'completed'],
    [{ done: 2, isPast: true }, 'partial'],
    [{ done: 2, postponed: true }, 'partial'],
    [{ postponed: true }, 'postponed'],
    [{ isPast: true }, 'missed'],
    [{ paused: true }, 'paused'],
    [{ paused: true, done: 4 }, 'completed'],
  ])('%j -> %s', (patch, expected) => {
    expect(deriveStatus({ ...base, ...patch })).toBe(expected);
  });
  it('only open statuses remind', () => {
    expect(needsReminder('not_started')).toBe(true);
    expect(needsReminder('in_progress')).toBe(true);
    for (const s of ['completed', 'partial', 'postponed', 'missed', 'paused'] as const) expect(needsReminder(s)).toBe(false);
  });
  it('completion is capped and null without target', () => {
    expect(completion(6, 4)).toBe(1);
    expect(completion(1, 0)).toBeNull();
  });
});

describe('dates', () => {
  it('day keys and month/year rollover', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
  it('HH:MM parsing', () => {
    expect(fromHHMM('07:30')).toBe(450);
    expect(fromHHMM('24:00')).toBeNull();
    expect(toHHMM(450)).toBe('07:30');
  });
});

describe('planReminders', () => {
  const settings: ReminderSettings = { enabled: true, windowStart: 8 * 60, windowEnd: 22 * 60, quietStart: 0, quietEnd: 0, maxPerDay: 20 };
  const tracker = (p: Partial<TrackerReminderState> = {}): TrackerReminderState =>
    ({ id: 'tilawah', enabled: true, intervalMin: 120, paused: false, needsToday: true, snoozedUntil: null, ...p });
  const now = new Date(2026, 10, 22, 13, 0).getTime();
  const times = (plan: { at: number }[], day = 22) =>
    plan.filter((p) => new Date(p.at).getDate() === day).map((p) => toHHMM(new Date(p.at).getHours() * 60 + new Date(p.at).getMinutes()));

  it('every interval inside the window, only in the future', () => {
    const plan = planReminders(now, settings, [tracker()], 1);
    expect(times(plan)).toEqual(['14:00', '16:00', '18:00', '20:00', '22:00']);
  });
  it('none for completed (not needed today) but future days still planned', () => {
    const plan = planReminders(now, settings, [tracker({ needsToday: false })], 2);
    expect(times(plan)).toEqual([]);
    expect(times(plan, 23)).toHaveLength(8);
  });
  it('none for paused or disabled trackers, or when globally off', () => {
    expect(planReminders(now, settings, [tracker({ paused: true })])).toEqual([]);
    expect(planReminders(now, settings, [tracker({ enabled: false })])).toEqual([]);
    expect(planReminders(now, { ...settings, enabled: false }, [tracker()])).toEqual([]);
  });
  it('respects quiet hours, including ones wrapping midnight', () => {
    const plan = planReminders(now, { ...settings, quietStart: 15 * 60, quietEnd: 19 * 60 }, [tracker()], 1);
    expect(times(plan)).toEqual(['14:00', '20:00', '22:00']);
    const wrap = planReminders(now, { ...settings, windowStart: 0, windowEnd: 23 * 60, quietStart: 21 * 60, quietEnd: 7 * 60 }, [tracker({ needsToday: false })], 2);
    expect(times(wrap, 23)).toEqual(['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00']);
  });
  it('caps per tracker per day and in total', () => {
    expect(times(planReminders(now, { ...settings, maxPerDay: 2 }, [tracker()], 1))).toEqual(['14:00', '16:00']);
    const many = planReminders(now, { ...settings, windowStart: 0, windowEnd: 23 * 60 + 59 },
      [tracker({ intervalMin: 15 }), tracker({ id: 'hifz', intervalMin: 15 })], 3);
    expect(many.length).toBe(60);
    expect(new Set(many.map((p) => p.id)).size).toBe(many.length);
  });
  it('snooze suppresses earlier reminders and fires at the snooze time', () => {
    const until = new Date(2026, 10, 22, 16, 30).getTime();
    expect(times(planReminders(now, settings, [tracker({ snoozedUntil: until })], 1))).toEqual(['16:30', '18:00', '20:00', '22:00']);
  });
  it('ids are deterministic so re-planning never duplicates', () => {
    expect(planReminders(now, settings, [tracker()]).map((p) => p.id)).toEqual(planReminders(now, settings, [tracker()]).map((p) => p.id));
  });
});
