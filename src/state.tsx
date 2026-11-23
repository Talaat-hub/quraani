import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Alert, AppState, Platform, useColorScheme } from 'react-native';
import { ensureDays, getSettings } from './db/repo';
import type { Db } from './db/schema';
import { dayKey } from './domain/dates';
import { makeT, type T } from './i18n';
import { syncReminders } from './notifications';
import { readSettings, type AppSettings } from './settings';
import { COLORS, type Colors } from './theme';

type App = {
  db: Db;
  today: string;
  settings: AppSettings;
  t: T;
  c: Colors;
  /** Bumps on every write; screens re-query when it changes. */
  rev: number;
  /** Runs a write, then refreshes days, UI and the reminder schedule. */
  act: (fn: (db: Db) => Promise<unknown>) => Promise<void>;
};

const Ctx = createContext<App | null>(null);
export const useApp = () => useContext(Ctx)!;

export function AppProvider({ initial, children }: PropsWithChildren<{ initial: AppSettings }>) {
  const db = useSQLiteContext() as unknown as Db;
  const [today, setToday] = useState(() => dayKey(new Date()));
  const [settings, setSettings] = useState(initial);
  const [rev, setRev] = useState(0);
  const scheme = useColorScheme();

  const refresh = useCallback(async () => {
    const day = dayKey(new Date());
    await ensureDays(db, day);
    setSettings(readSettings(await getSettings(db)));
    setToday(day);
    setRev((r) => r + 1);
    await syncReminders(db);
    setRev((r) => r + 1); // again, so "next reminder" reflects the freshly scheduled plan
  }, [db]);

  // Foregrounding handles new days, timezone changes and time spent with the app closed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh() sets state only after awaiting the DB (external sync).
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const act = useCallback(async (fn: (db: Db) => Promise<unknown>) => {
    try {
      await fn(db);
    } catch (e) {
      // Repository validation already prevents bad writes; tell the user instead of failing silently.
      console.warn(e);
      const msg = makeT(settings.lang)('error.generic');
      if (Platform.OS === 'web') window.alert(msg); // react-native-web's Alert does nothing
      else Alert.alert(msg);
    }
    await refresh();
  }, [db, refresh, settings.lang]);

  const value = useMemo<App>(() => ({
    db, today, settings, rev, act,
    t: makeT(settings.lang),
    c: COLORS[settings.theme === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : settings.theme],
  }), [db, today, settings, rev, act, scheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Re-runs `fn` whenever data changes. */
export function useData<R>(fn: (db: Db, today: string) => Promise<R>, deps: unknown[] = []): R | undefined {
  const { db, today, rev } = useApp();
  const [data, setData] = useState<R>();
  useEffect(() => {
    let live = true;
    fn(db, today).then((d) => live && setData(d), (e) => console.warn(e));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, today, rev, ...deps]);
  return data;
}
