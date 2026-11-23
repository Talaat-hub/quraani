import Constants from 'expo-constants';
import * as N from 'expo-notifications';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Switch } from 'react-native';
import { TimePicker } from '../../components/TimePicker';
import { deleteAllData, setSetting } from '../../db/repo';
import { syncDirection } from '../../direction';
import { fmtNum, fmtTime } from '../../i18n';
import { REMINDERS, sendTestReminder } from '../../notifications';
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

      {REMINDERS && <Section title={t('set.notifications')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt>{t('set.notifEnabled')}</Txt>
          <Switch value={settings.enabled} trackColor={{ true: c.primary }} onValueChange={(v) => save('enabled', v)} />
        </Row>
        {settings.enabled && (
          <>
            <Txt muted size={14}>{t('set.window')}</Txt>
            <Row>
              <TimeField label={t('set.windowStart')} title={`${t('set.window')} – ${t('set.windowStart')}`} value={settings.windowStart} onSave={(m) => save('windowStart', m)} />
              <TimeField label={t('set.windowEnd')} title={`${t('set.window')} – ${t('set.windowEnd')}`} value={settings.windowEnd} onSave={(m) => save('windowEnd', m)} />
            </Row>
            <Txt muted size={14}>{t('set.quiet')}</Txt>
            <Row>
              <TimeField label={t('set.windowStart')} title={`${t('set.quiet')} – ${t('set.windowStart')}`} value={settings.quietStart} onSave={(m) => save('quietStart', m)} />
              <TimeField label={t('set.windowEnd')} title={`${t('set.quiet')} – ${t('set.windowEnd')}`} value={settings.quietEnd} onSave={(m) => save('quietEnd', m)} />
            </Row>
            <Txt muted size={13}>{t('set.quietNote')}</Txt>
            <Txt muted size={14}>{t('set.maxPerDay')}</Txt>
            <Row>
              {[0, 2, 4, 6, 10, 20].map((n) => (
                <Chip key={n} label={n ? fmtNum(lang, n) : t('set.noLimit')} selected={settings.maxPerDay === n} onPress={() => save('maxPerDay', n)} />
              ))}
            </Row>
            <Txt muted size={13}>{t('set.osNote')}</Txt>
            <Button
              title={t('set.testReminder')} kind="secondary"
              onPress={async () => {
                if (await sendTestReminder(lang)) Alert.alert(t('set.testReminder'), t('set.testSent'));
                else Alert.alert(t('set.testReminder'), t('today.notifDenied'), [
                  { text: t('set.cancel'), style: 'cancel' },
                  { text: t('today.openSettings'), onPress: () => Linking.openSettings() },
                ]);
              }}
            />
          </>
        )}
      </Section>}

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
          onPress={() => {
            const del = () => act(async (db) => { if (REMINDERS) await N.cancelAllScheduledNotificationsAsync(); await deleteAllData(db); });
            // react-native-web's Alert does nothing, so the browser's own confirm dialog asks instead.
            if (Platform.OS === 'web') { if (window.confirm(t('set.deleteConfirm'))) del(); return; }
            Alert.alert(t('set.deleteAll'), t('set.deleteConfirm'), [
              { text: t('set.cancel'), style: 'cancel' },
              { text: t('set.delete'), style: 'destructive', onPress: del },
            ]);
          }}
        />
      </Section>

      <Section title={t('set.about')}>
        <Txt muted size={14}>{t('set.aboutText', { v: Constants.expoConfig?.version ?? '' })}</Txt>
      </Section>
    </Screen>
  );
}

/** Shows a time in the user's 12/24-hour format; tapping opens the wheel picker. */
function TimeField({ label, title, value, onSave }: { label: string; title: string; value: number; onSave: (min: number) => void }) {
  const { c, t, settings } = useApp();
  const [open, setOpen] = useState(false);
  const shown = fmtTime(t, settings.lang, settings.clock, value);
  return (
    <>
      <Txt muted size={13}>{label}</Txt>
      <Pressable
        onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${title}: ${shown}`} accessibilityHint={t('time.pick')}
        style={{ minWidth: 96, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <Txt size={16}>{shown}</Txt>
      </Pressable>
      {open && (
        <TimePicker title={title} value={value} onClose={() => setOpen(false)}
          onSave={(m) => { setOpen(false); if (m !== value) onSave(m); }} />
      )}
    </>
  );
}
