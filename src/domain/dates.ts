// Days are stored as local calendar keys ('YYYY-MM-DD') in the device timezone at the time of
// recording; instants are stored as epoch milliseconds (UTC). Reminders are re-planned on every
// app foreground, which picks up timezone and day-boundary changes.

const pad = (n: number) => String(n).padStart(2, '0');

export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Minutes since midnight <-> 'HH:MM'. */
export const toHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export function fromHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}
