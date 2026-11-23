import { getCalendars, getLocales } from 'expo-localization';
import type { ReminderSettings } from './domain/reminders';
import type { Lang } from './i18n';

export type ThemePref = 'system' | 'light' | 'dark';

export type Clock = '12' | '24';

export type AppSettings = ReminderSettings & {
  lang: Lang;
  theme: ThemePref;
  clock: Clock;
};

const int = (v: string | undefined, d: number) => (v != null && /^\d+$/.test(v) ? +v : d);

/** Typed view over the key/value settings table, with defaults. */
export function readSettings(raw: Record<string, string>): AppSettings {
  const deviceLang: Lang = getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
  return {
    lang: raw.lang === 'ar' || raw.lang === 'en' ? raw.lang : deviceLang,
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system',
    clock: raw.clock === '12' || raw.clock === '24' ? raw.clock : getCalendars()[0]?.uses24hourClock === false ? '12' : '24',
    enabled: raw.notif_enabled !== '0',
    windowStart: int(raw.window_start, 7 * 60),
    windowEnd: int(raw.window_end, 22 * 60),
    quietStart: int(raw.quiet_start, 0),
    quietEnd: int(raw.quiet_end, 0),
    maxPerDay: int(raw.max_per_day, 0), // 0 = no limit: keep reminding until the goal is done
  };
}

export const SETTING_KEYS = {
  lang: 'lang', theme: 'theme', clock: 'clock', enabled: 'notif_enabled', windowStart: 'window_start',
  windowEnd: 'window_end', quietStart: 'quiet_start', quietEnd: 'quiet_end', maxPerDay: 'max_per_day',
} as const;
