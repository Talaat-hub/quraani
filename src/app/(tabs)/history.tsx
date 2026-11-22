import { useState } from 'react';
import { fmtRange } from '../../components/RangePicker';
import { getHistory, getStats } from '../../db/repo';
import { parseDay } from '../../domain/dates';
import { isRated, TRACKERS, type TrackerId } from '../../domain/trackers';
import { displayQty, fmtAmount, fmtNum } from '../../i18n';
import { useApp, useData } from '../../state';
import { Card, Chip, Row, Screen, Section, StatusBadge, Txt } from '../../ui';

export default function History() {
  const { c, t, settings } = useApp();
  const [id, setId] = useState<TrackerId>('hifz');
  const data = useData(async (db, today) => ({ list: await getHistory(db, id, today), stats: await getStats(db, id, today) }), [id]);
  const lang = settings.lang;
  const pct = (x: number | null) => (x == null ? '—' : `${fmtNum(lang, Math.round(x * 100))}%`);
  const date = (day: string) => parseDay(day).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Screen>
      <Row>
        {TRACKERS.map((x) => <Chip key={x} label={t(`tracker.${x}`)} selected={x === id} color={c[x]} onPress={() => setId(x)} />)}
      </Row>

      {data && (
        <Section title={t('hist.stats')}>
          <Stat label={t('hist.completedDays')} value={fmtNum(lang, data.stats.completedDays)} />
          <Stat label={t('hist.rate7')} value={pct(data.stats.rate7)} />
          <Stat label={t('hist.rate30')} value={pct(data.stats.rate30)} />
          {id === 'hifz' && <Stat label={t('hist.uniqueAyahs')} value={fmtNum(lang, data.stats.uniqueAyahs)} />}
          {id === 'muraja' && <Stat label={t('hist.revisedAyahs')} value={fmtNum(lang, data.stats.totalAyahs)} />}
          {id === 'tilawah' && <Stat label={t('hist.pagesRead')} value={fmtNum(lang, data.stats.totalPages)} />}
          {isRated(id) && <Stat label={t('hist.avgRating')} value={data.stats.avgRating == null ? '—' : fmtNum(lang, data.stats.avgRating)} />}
        </Section>
      )}

      {data?.list.length === 0 && <Txt muted>{t('hist.empty')}</Txt>}
      {data?.list.map((r, i) => {
        const older = data.list[i + 1];
        const goal = fmtAmount(t, r.goalUnit, r.goalAmount);
        return (
          <Card key={r.id} accent={c[id]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt bold>{date(r.day)}</Txt>
              <StatusBadge status={r.status} />
            </Row>
            <Txt muted size={14}>
              {t('today.progress', { done: displayQty(r.goalUnit, r.done), goal })}
              {older && (older.goalUnit !== r.goalUnit || older.goalAmount !== r.goalAmount) ? ` · ${t('hist.goalChanged')}` : ''}
            </Txt>
            {r.sessions.map((s) => <Txt key={s.id} size={14}>{fmtRange(lang, s)}</Txt>)}
            {r.rating != null && <Txt muted size={14}>{t('hist.rating', { n: r.rating })} · {t(`rating.${r.rating}` as 'rating.0')}</Txt>}
          </Card>
        );
      })}
    </Screen>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <Row style={{ justifyContent: 'space-between' }}><Txt muted>{label}</Txt><Txt bold>{value}</Txt></Row>
);
