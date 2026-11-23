import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Switch, TextInput } from 'react-native';
import { fmtRange, RangePicker } from '../../components/RangePicker';
import {
  addSession, continuePoint, deleteSession, getDay, getTracker, MAX_INTERVAL_MIN, setGoal, setPaused, setPlanned,
  setPostponed, setRating, setReminder,
} from '../../db/repo';
import { isRated, isTrackerId, type TrackerId } from '../../domain/trackers';
import { displayQty, fmtAmount, fmtNum, parseNum, type T } from '../../i18n';
import { toGoalAmount, UNIT_MAX, validateRange, type GoalUnit, type Range } from '../../quran';
import { REMINDERS } from '../../notifications';
import { useApp, useData } from '../../state';
import { Button, Chip, ProgressBar, Row, Screen, Section, StatusBadge, Txt } from '../../ui';

const INTERVALS = [5, 15, 30, 60, 120, 180];
const PRESETS: Record<GoalUnit, number[]> = { ayah: [3, 5, 10, 20], page: [1, 2, 5, 10], quarter: [1, 2, 3, 4, 8] };

export default function TrackerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return isTrackerId(id) ? <Tracker id={id} /> : null;
}

function Tracker({ id }: { id: TrackerId }) {
  const { c, t, settings, act, today } = useApp();
  const data = useData(async (db, day) => ({
    rec: await getDay(db, id, day),
    tracker: await getTracker(db, id),
    cont: await continuePoint(db, id),
  }), [id]);
  const [draft, setDraft] = useState<Range | null>(null);
  const [editPlan, setEditPlan] = useState(false);

  if (!data?.rec) return <Screen />;
  const { rec, tracker } = data;
  // Until edited, the "record" form shows the planned portion (nothing recorded yet) or where the user left off.
  const range = draft ?? (!rec.sessions.length && rec.planned ? rec.planned : { from: data.cont, to: data.cont });
  const color = c[id];
  const goal = fmtAmount(t, rec.goalUnit, rec.goalAmount);
  const open = rec.status !== 'completed';

  return (
    <Screen>
      <Stack.Screen options={{ title: t(`tracker.${id}`) }} />

      <Section title={t('tr.goal')} right={<StatusBadge status={rec.status} />}>
        <Txt>{goal}</Txt>
        {rec.sessions.length > 0 && (
          <>
            <Txt>{t('today.progress', { done: displayQty(rec.goalUnit, rec.done), goal })}</Txt>
            {rec.pct != null && <ProgressBar pct={rec.pct} color={color} />}
          </>
        )}
        {tracker.paused && <Txt muted size={14}>{t('tr.pausedNote')}</Txt>}
      </Section>

      {!tracker.paused && rec.planned && (
        <Section title={t('tr.plan')}>
          {editPlan ? (
            <PlanEditor initial={rec.planned} onSave={(r) => { setEditPlan(false); act((db) => setPlanned(db, rec.id, r, today)); }} />
          ) : (
            <>
              <Txt size={16}>{fmtRange(settings.lang, rec.planned)}</Txt>
              {id !== 'muraja' && <Txt muted size={13}>{t('tr.continueNote')}</Txt>}
              <Row>
                {open && <Button title={t('today.markDone')} onPress={() => act((db) => addSession(db, rec.id, rec.planned!, today))} />}
                <Button title={t('tr.changePlan')} kind="secondary" onPress={() => setEditPlan(true)} />
              </Row>
            </>
          )}
        </Section>
      )}

      <Section title={t('tr.record')}>
        <RangePicker value={range} onChange={setDraft} />
        <Button
          title={t('tr.save')} disabled={!!validateRange(range)}
          onPress={() => act((db) => addSession(db, rec.id, range, today)).then(() => setDraft(null))}
        />
      </Section>

      <Section title={t('tr.sessions')}>
        {rec.sessions.length === 0 && <Txt muted>{t('tr.noSessions')}</Txt>}
        {rec.sessions.map((s) => (
          <Row key={s.id} style={{ justifyContent: 'space-between' }}>
            <Txt style={{ flexShrink: 1 }}>{fmtRange(settings.lang, s)}</Txt>
            <Button title={t('tr.delete')} kind="danger" onPress={() => act((db) => deleteSession(db, s.id, today))} />
          </Row>
        ))}
      </Section>

      {isRated(id) && (
        <Section title={t('tr.rating')}>
          {rec.sessions.length === 0 ? <Txt muted>{t('tr.ratingHint')}</Txt> : (
            <>
              <Row>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <Chip key={n} label={fmtNum(settings.lang, n)} selected={rec.rating === n} color={color}
                    onPress={() => act((db) => setRating(db, rec.id, rec.rating === n ? null : n, today))} />
                ))}
              </Row>
              {rec.rating != null && <Txt muted>{t(`rating.${rec.rating}` as 'rating.0')}</Txt>}
            </>
          )}
        </Section>
      )}

      {!tracker.paused && (open || rec.postponed) && (
        <Section title={rec.postponed ? t('status.postponed') : t('tr.postpone')}>
          <Txt muted size={14}>{t('tr.postponeHint')}</Txt>
          <Button
            title={rec.postponed ? t('tr.unpostpone') : t('tr.postpone')} kind="secondary"
            onPress={() => act((db) => setPostponed(db, rec.id, !rec.postponed, today))}
          />
        </Section>
      )}

      <Section title={t('tr.goal')}>
        <Row>
          {(['ayah', 'page', 'quarter'] as const).map((u) => (
            <Chip key={u} label={t(`unit.${u}`)} selected={tracker.goalUnit === u}
              onPress={() => u !== tracker.goalUnit && act((db) => setGoal(db, id, u, PRESETS[u][0], today))} />
          ))}
        </Row>
        <Row>
          {PRESETS[tracker.goalUnit].map((n) => (
            <Chip key={n} label={fmtAmount(t, tracker.goalUnit, n)} selected={tracker.goalAmount === n}
              onPress={() => act((db) => setGoal(db, id, tracker.goalUnit, n, today))} />
          ))}
        </Row>
        <NumberField
          key={tracker.goalUnit} placeholder={t(`tr.custom.${tracker.goalUnit}`)} decimal={tracker.goalUnit === 'quarter'}
          parse={(n) => toGoalAmount(tracker.goalUnit, n)}
          onSave={(v) => act((db) => setGoal(db, id, tracker.goalUnit, v, today))}
        />
        <Txt muted size={13}>{t(`tr.customHint.${tracker.goalUnit}`, { max: displayQty(tracker.goalUnit, UNIT_MAX[tracker.goalUnit]) })}</Txt>
      </Section>

      {REMINDERS && <Section title={t('tr.reminders')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt>{t('tr.remindersOn')}</Txt>
          <Switch value={tracker.reminderEnabled} trackColor={{ true: color }}
            onValueChange={(v) => act((db) => setReminder(db, id, v, tracker.reminderIntervalMin))} />
        </Row>
        {tracker.reminderEnabled && (
          <>
            <Txt>{t('tr.everyNow', { v: fmtInterval(t, tracker.reminderIntervalMin) })}</Txt>
            <Row>
              {INTERVALS.map((m) => (
                <Chip key={m} label={fmtInterval(t, m)} selected={tracker.reminderIntervalMin === m}
                  onPress={() => act((db) => setReminder(db, id, true, m))} />
              ))}
            </Row>
            <NumberField
              placeholder={t('tr.customInterval')}
              parse={(n) => (Number.isInteger(n) && n >= 1 && n <= MAX_INTERVAL_MIN ? n : null)}
              onSave={(m) => act((db) => setReminder(db, id, true, m))}
            />
            {tracker.reminderIntervalMin < 15 && <Txt muted size={13}>{t('tr.shortNote')}</Txt>}
          </>
        )}
      </Section>}

      <Button
        title={tracker.paused ? t('tr.resume') : t('tr.pause')} kind={tracker.paused ? 'primary' : 'secondary'}
        onPress={() => act((db) => setPaused(db, id, !tracker.paused, today))}
      />
    </Screen>
  );
}

const fmtInterval = (t: T, m: number) => (m % 60 ? t('unit.min', { n: m }) : t('unit.hour', { n: m / 60 }));

/** Number box (Western or Arabic digits) + Save; `parse` returns the value to save, or null if the text isn't valid. */
function NumberField({ placeholder, decimal, parse, onSave }: {
  placeholder: string; decimal?: boolean; parse: (n: number) => number | null; onSave: (v: number) => Promise<unknown>;
}) {
  const { c, t } = useApp();
  const [text, setText] = useState('');
  const value = parse(parseNum(text));
  return (
    <Row>
      <TextInput
        value={text} onChangeText={setText} keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder={placeholder} accessibilityLabel={placeholder} placeholderTextColor={c.muted}
        style={{ flexGrow: 1, minHeight: 44, borderWidth: 1, borderColor: text && value == null ? c.danger : c.border, borderRadius: 10, paddingHorizontal: 12, color: c.text }}
      />
      <Button title={t('common.save')} kind="secondary" disabled={value == null}
        onPress={() => value != null && onSave(value).then(() => setText(''))} />
    </Row>
  );
}

function PlanEditor({ initial, onSave }: { initial: Range; onSave: (r: Range) => void }) {
  const { t } = useApp();
  const [r, setR] = useState(initial);
  return (
    <>
      <RangePicker value={r} onChange={setR} />
      <Button title={t('tr.save')} disabled={!!validateRange(r)} onPress={() => onSave(r)} />
    </>
  );
}
