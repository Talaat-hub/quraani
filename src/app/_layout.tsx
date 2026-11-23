import * as N from 'expo-notifications';
import { LocaleProvider, router, Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { getSettings } from '../db/repo';
import { migrate, type Db } from '../db/schema';
import { syncDirection } from '../direction';
import { handleResponse, REMINDERS, setupNotifications } from '../notifications';
import { readSettings, type AppSettings } from '../settings';
import { AppProvider, useApp } from '../state';
import { COLORS } from '../theme';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="quraani.db" onInit={(db) => migrate(db as unknown as Db)}>
      <Boot />
    </SQLiteProvider>
  );
}

/** Applies layout direction (may reload once), loads settings, then renders the app. */
function Boot() {
  const db = useSQLiteContext() as unknown as Db;
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    (async () => {
      if (await syncDirection(db)) return;
      const s = readSettings(await getSettings(db));
      await setupNotifications(s.lang);
      setSettings(s);
    })().catch((e) => { console.warn('boot failed', e); });
  }, [db]);

  if (!settings) return <View style={{ flex: 1 }} />;
  return (
    <AppProvider initial={settings}>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { c, t, settings, db } = useApp();

  // Tapping a reminder opens its tracker; the snooze action is handled without opening a screen.
  useEffect(() => {
    if (!REMINDERS) return;
    const open = async (r: N.NotificationResponse | null) => {
      const id = r && await handleResponse(db, r);
      if (id) router.push({ pathname: '/tracker/[id]', params: { id } });
    };
    N.getLastNotificationResponseAsync().then(open);
    const sub = N.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [db]);

  return (
    <LocaleProvider direction={settings.lang === 'ar' ? 'rtl' : 'ltr'}>
      <StatusBar style={c === COLORS.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, contentStyle: { backgroundColor: c.bg },
        headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal',
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('appName') }} />
        <Stack.Screen name="tracker/[id]" options={{ title: '' }} />
      </Stack>
    </LocaleProvider>
  );
}
