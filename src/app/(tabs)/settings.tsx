import Constants from 'expo-constants';
import * as N from 'expo-notifications';
import { useState } from 'react';
import { Alert, Switch, TextInput } from 'react-native';
import { deleteAllData, setSetting } from '../../db/repo';
import { fromHHMM, toHHMM } from '../../domain/dates';
import { syncDirection } from '../../direction';
import { fmtNum } from '../../i18n';
import { SETTING_KEYS } from '../../settings';
import { useApp } from '../../state';
import { Button, Chip, Row, Screen, Section, Txt } from '../../ui';

export default function Settings() {
  const { c, t, settings, act } = useApp();
  const lang = settings.lang;
  const save = (key: keyof typeof SETTING_KEYS, value: string | number | boolean) =>
    act((db) => setSetting(db, SETTING_KEYS[key], typeof value === 'boolean' ? (value ? '1' : '0') : String(value)));

  return (
    <Screen>
      <Section title={t('set.language')}>
        <Row>
          <Chip label="العربية" selected={lang === 'ar'} onPress={() => lang !== 'ar' && act((db) => setSetting(db, 'lang', 'ar').then(() => syncDirection(db)))} />
          <Chip label="English" selected={lang === 'en'} onPress={() => lang !== 'en' && act((db) => setSetting(db, 'lang', 'en').then(() => syncDirection(db)))} />
        </Row>
        <Txt muted size={13}>{t('set.langNote')}</Txt>
      </Section>

      <Section title={t('set.theme')}>
        <Row>
          {(['system', 'light', 'dark'] as const).map((th) => (
            <Chip key={th} label={t(`set.theme.${th}`)} selected={settings.theme === th} onPress={() => save('theme', th)} />
          ))}
        </Row>
      </Section>

      <Section title={t('set.notifications')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt>{t('set.notifEnabled')}</Txt>
          <Switch value={settings.enabled} trackColor={{ true: c.primary }} onValueChange={(v) => save('enabled', v)} />
        </Row>
        {settings.enabled && (
          <>
            <Txt muted size={14}>{t('set.window')}</Txt>
            <Row>
              <TimeField label={t('set.windowStart')} value={settings.windowStart} onSave={(m) => save('windowStart', m)} />
              <TimeField label={t('set.windowEnd')} value={settings.windowEnd} onSave={(m) => save('windowEnd', m)} />
            </Row>
            <Txt muted size={14}>{t('set.quiet')}</Txt>
            <Row>
              <TimeField label={t('set.windowStart')} value={settings.quietStart} onSave={(m) => save('quietStart', m)} />
              <TimeField label={t('set.windowEnd')} value={settings.quietEnd} onSave={(m) => save('quietEnd', m)} />
            </Row>
            <Txt muted size={13}>{t('set.quietNote')}</Txt>
            <Txt muted size={14}>{t('set.maxPerDay')}</Txt>
            <Row>
              {[0, 2, 4, 6, 10, 20].map((n) => (
                <Chip key={n} label={n ? fmtNum(lang, n) : t('set.noLimit')} selected={settings.maxPerDay === n} onPress={() => save('maxPerDay', n)} />
              ))}
            </Row>
            <Txt muted size={13}>{t('set.osNote')}</Txt>
          </>
        )}
      </Section>

      <Section title={t('set.mushaf')}>
        <Txt>{t('set.mushafValue')}</Txt>
      </Section>

      <Section title={t('set.whatsapp')}>
        <Txt muted size={14}>{t('set.whatsappNote')}</Txt>
      </Section>

      <Section title={t('set.data')}>
        <Txt muted size={14}>{t('set.dataNote')}</Txt>
        <Button
          title={t('set.deleteAll')} kind="danger"
          onPress={() => Alert.alert(t('set.deleteAll'), t('set.deleteConfirm'), [
            { text: t('set.cancel'), style: 'cancel' },
            {
              text: t('set.delete'), style: 'destructive',
              onPress: () => act(async (db) => { await N.cancelAllScheduledNotificationsAsync(); await deleteAllData(db); }),
            },
          ])}
        />
      </Section>

      <Section title={t('set.about')}>
        <Txt muted size={14}>{t('set.aboutText', { v: Constants.expoConfig?.version ?? '' })}</Txt>
      </Section>
    </Screen>
  );
}

/** HH:MM text field; saves on blur when valid. */
function TimeField({ label, value, onSave }: { label: string; value: number; onSave: (min: number) => void }) {
  const { c, t } = useApp();
  const [text, setText] = useState(toHHMM(value));
  const valid = fromHHMM(text) != null;
  return (
    <>
      <Txt muted size={13}>{label}</Txt>
      <TextInput
        value={text} onChangeText={setText} keyboardType="numbers-and-punctuation" maxLength={5}
        accessibilityLabel={label} accessibilityHint={t('set.timeInvalid')}
        onBlur={() => { const m = fromHHMM(text); if (m != null && m !== value) onSave(m); else if (m == null) setText(toHHMM(value)); }}
        style={{ width: 80, minHeight: 44, borderWidth: 1, borderRadius: 10, textAlign: 'center', fontSize: 16, color: c.text, borderColor: valid ? c.border : c.danger }}
      />
    </>
  );
}
