import * as N from 'expo-notifications';
import { Platform } from 'react-native';
import { getDay, getSettings, getTrackers, setSnooze } from '../db/repo';
import type { Db } from '../db/schema';
import { dayKey } from '../domain/dates';
import { planReminders } from '../domain/reminders';
import { needsReminder } from '../domain/status';
import { isTrackerId, type TrackerId } from '../domain/trackers';
import { fmtAmount, makeT } from '../i18n';
import { readSettings } from '../settings';

const CHANNEL = 'reminders';
const CATEGORY = 'reminder';
export const SNOOZE_MIN = 30;

/**
 * Local notifications only. Reminders are pre-scheduled as one-shot DATE triggers for today and
 * the next days (see planReminders), so they fire while the app is closed. The OS may delay them
 * (Android Doze / inexact alarms); we never promise exact times.
 *
 * Extension point: an optional remote channel (e.g. WhatsApp via a backend) would receive the
 * same plan from syncReminders. See docs/WHATSAPP.md.
 */
export async function setupNotifications(lang: 'ar' | 'en') {
  const t = makeT(lang);
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
  if (Platform.OS === 'android') {
    // eslint-disable-next-line import/namespace -- AndroidImportance is re-exported from a types module the rule can't follow; tsc checks it.
    await N.setNotificationChannelAsync(CHANNEL, { name: t('set.notifications'), importance: N.AndroidImportance.DEFAULT });
  }
  await N.setNotificationCategoryAsync(CATEGORY, [
    { identifier: 'snooze', buttonTitle: t('notif.snooze'), options: { opensAppToForeground: false } },
    { identifier: 'open', buttonTitle: t('notif.open'), options: { opensAppToForeground: true } },
  ]);
}

export async function permissionState(): Promise<'granted' | 'undetermined' | 'denied'> {
  const p = await N.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<boolean> {
  return (await N.requestPermissionsAsync()).granted;
}

// Serialize syncs: overlapping runs could otherwise schedule the same reminder twice.
let queue: Promise<void> = Promise.resolve();
export function syncReminders(db: Db): Promise<void> {
  queue = queue.then(() => doSync(db)).catch((e) => console.warn('syncReminders failed', e));
  return queue;
}

async function doSync(db: Db) {
  const settings = readSettings(await getSettings(db));
  const t = makeT(settings.lang);
  const existing = (await N.getAllScheduledNotificationsAsync()).filter((n) => n.content.data?.kind === 'reminder');
  const granted = (await N.getPermissionsAsync()).granted;

  const today = dayKey(new Date());
  const trackers = await getTrackers(db);
  const states = await Promise.all(trackers.map(async (tr) => {
    const rec = await getDay(db, tr.id, today);
    return {
      id: tr.id, enabled: tr.reminderEnabled, intervalMin: tr.reminderIntervalMin, paused: tr.paused,
      needsToday: rec ? needsReminder(rec.status) : !tr.paused, snoozedUntil: tr.snoozedUntil,
    };
  }));
  const plan = granted ? planReminders(Date.now(), settings, states) : [];

  // Diff against what's scheduled; ids are deterministic, so nothing is ever scheduled twice.
  const want = new Map(plan.map((p) => [p.id, p]));
  for (const e of existing) {
    if (!want.has(e.identifier) || e.content.data?.lang !== settings.lang) await N.cancelScheduledNotificationAsync(e.identifier);
    else want.delete(e.identifier);
  }
  for (const p of want.values()) {
    const tr = trackers.find((x) => x.id === p.trackerId)!;
    await N.scheduleNotificationAsync({
      identifier: p.id,
      content: {
        title: t('notif.title', { tracker: t(`tracker.${p.trackerId}`) }),
        body: t('notif.body', { goal: fmtAmount(t, tr.goalUnit, tr.goalAmount) }),
        data: { kind: 'reminder', trackerId: p.trackerId, lang: settings.lang },
        categoryIdentifier: CATEGORY,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
    });
  }
}

export async function nextReminder(): Promise<{ at: number; trackerId: TrackerId } | null> {
  const all = await N.getAllScheduledNotificationsAsync();
  let best: { at: number; trackerId: TrackerId } | null = null;
  for (const n of all) {
    const tid = n.content.data?.trackerId;
    const trig = n.trigger as { type?: string; value?: number; date?: number } | null;
    const at = trig?.value ?? trig?.date;
    if (!isTrackerId(tid) || typeof at !== 'number') continue;
    if (!best || at < best.at) best = { at, trackerId: tid };
  }
  return best;
}

const handled = new Set<string>();
/** Returns the tracker to open, if any. Snooze is handled here without opening a screen. */
export async function handleResponse(db: Db, r: N.NotificationResponse): Promise<TrackerId | null> {
  const key = `${r.notification.request.identifier}:${r.actionIdentifier}:${r.notification.date}`;
  if (handled.has(key)) return null;
  handled.add(key);
  const tid = r.notification.request.content.data?.trackerId;
  if (!isTrackerId(tid)) return null;
  if (r.actionIdentifier === 'snooze') {
    await setSnooze(db, tid, Date.now() + SNOOZE_MIN * 60_000);
    await syncReminders(db);
    return null;
  }
  return tid;
}
