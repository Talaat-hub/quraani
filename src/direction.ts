import * as Updates from 'expo-updates';
import { I18nManager, Platform } from 'react-native';
import { getSettings, setSetting } from './db/repo';
import type { Db } from './db/schema';
import { readSettings } from './settings';

/**
 * RTL/LTR can only change with a reload. Returns true if a reload was started.
 * Tries once per language so a platform that ignores forceRTL (e.g. Expo Go) can't loop.
 */
export async function syncDirection(db: Db): Promise<boolean> {
  const raw = await getSettings(db);
  const { lang } = readSettings(raw);
  const rtl = lang === 'ar';
  if (rtl === I18nManager.isRTL || Platform.OS === 'web' || raw.rtl_applied === lang) return false;
  await setSetting(db, 'rtl_applied', lang);
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  try {
    await Updates.reloadAsync();
    return true;
  } catch {
    return false; // direction applies on next launch
  }
}
