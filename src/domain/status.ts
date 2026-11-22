/**
 * Daily status of one tracker. Derived, never stored, so it can't drift from the recorded data.
 *
 * not_started  today, nothing recorded
 * in_progress  today, some progress below target
 * completed    recorded progress >= target (any day)
 * partial      started but not finished (بدأ ولم يكمل): day ended, or user stopped for today, below target
 * postponed    user postponed with nothing recorded
 * missed       past day, nothing recorded, not postponed/paused
 * paused       tracker was paused that day
 *
 * Only not_started / in_progress generate reminders.
 */
export type Status = 'not_started' | 'in_progress' | 'completed' | 'partial' | 'postponed' | 'missed' | 'paused';

export type StatusInput = {
  done: number; // measured progress in the goal unit
  target: number; // goal amount in the same unit
  postponed: boolean;
  paused: boolean;
  isPast: boolean; // record belongs to a day before today
};

export function deriveStatus({ done, target, postponed, paused, isPast }: StatusInput): Status {
  if (target > 0 && done >= target) return 'completed';
  if (paused) return 'paused';
  if (done > 0) return postponed || isPast ? 'partial' : 'in_progress';
  if (postponed) return 'postponed';
  return isPast ? 'missed' : 'not_started';
}

export const needsReminder = (s: Status) => s === 'not_started' || s === 'in_progress';

/** 0..1, or null when a percentage would mislead (no target). Capped at 1. */
export const completion = (done: number, target: number) => (target > 0 ? Math.min(1, done / target) : null);
