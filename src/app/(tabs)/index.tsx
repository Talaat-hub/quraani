import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { fmtRange } from '../../components/RangePicker';
import { addSession, getDay, type DayRecord } from '../../db/repo';
import { toHHMM } from '../../domain/dates';
import { needsReminder } from '../../domain/status';
import { TRACKERS } from '../../domain/trackers';
import { displayQty, fmtAmount, fmtNum } from '../../i18n';
import { nextReminder, permissionState, requestPermission } from '../../notifications';
import { useApp, useData } from '../../state';
import { Button, Card, ProgressBar, Row, Screen, StatusBadge, Txt } from '../../ui';

export default function Today() {
  const { t, settings, act } = useApp();
  const [permTick, setPermTick] = useState(0);
  const records = useData((db, today) => Promise.all(TRACKERS.map((id) => getDay(db, id, today))));
  const perm = useData(() => permissionState(), [permTick]);
  const next = useData(() => nextReminder());

  if (!records) return <Screen />;
  const active = records.filter((r): r is DayRecord => !!r && r.status !== 'paused');
  const done = active.filter((r) => r.status === 'completed').length;

  return (
    <Screen>
      <Txt size={20} bold>
        {active.length && done === active.length ? t('today.allDone') : t('today.summary', { done, total: active.length })}
      </Txt>

      {perm && perm !== 'granted' && settings.enabled && (
        <Card>
          <Txt>{perm === 'denied' ? t('today.notifDenied') : t('today.enableNotif')}</Txt>
          {perm === 'undetermined' && (
            <Button title={t('today.enableNotifBtn')} onPress={async () => { await requestPermission(); setPermTick((x) => x + 1); await act(async () => {}); }} />
          )}
        </Card>
      )}

      {records.map((r) => r && <TrackerCard key={r.trackerId} r={r} onDone={() => act((db) => addSession(db, r.id, r.planned!, r.day))} />)}

      {perm === 'granted' && (
        <Txt muted size={13}>
          {next ? t('today.nextReminder', {
            time: fmtNum(settings.lang, toHHMM(new Date(next.at).getHours() * 60 + new Date(next.at).getMinutes())),
            tracker: t(`tracker.${next.trackerId}`),
          }) : t('today.noReminder')}
        </Txt>
      )}
    </Screen>
  );
}

function TrackerCard({ r, onDone }: { r: DayRecord; onDone: () => void }) {
  const { c, t, settings } = useApp();
  const color = c[r.trackerId];
  const goal = fmtAmount(t, r.goalUnit, r.goalAmount);
  const open = () => router.push({ pathname: '/tracker/[id]', params: { id: r.trackerId } });
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${t(`tracker.${r.trackerId}`)}, ${t(`status.${r.status}`)}`}>
      <Card accent={color}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt size={18} bold color={color}>{t(`tracker.${r.trackerId}`)}</Txt>
          <StatusBadge status={r.status} />
        </Row>
        <Txt muted>{t('today.goal', { goal })}</Txt>
        {r.sessions.length ? (
          <>
            <Txt>{t('today.progress', { done: displayQty(r.goalUnit, r.done), goal })}</Txt>
            {r.pct != null && <ProgressBar pct={r.pct} color={color} />}
          </>
        ) : r.status !== 'paused' && <Txt muted>{t('today.notStarted')}</Txt>}
        {r.planned && needsReminder(r.status) && (
          <Txt size={14}>{t('today.planned')}: {fmtRange(settings.lang, r.planned)}</Txt>
        )}
        {needsReminder(r.status) && (
          <Row style={{ marginTop: 6 }}>
            <Button title={t('today.record')} onPress={open} />
            {r.planned && <Button title={t('today.markDone')} kind="secondary" onPress={onDone} />}
          </Row>
        )}
      </Card>
    </Pressable>
  );
}
