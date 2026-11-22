import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fmtNum, type Lang } from '../i18n';
import { ayahCount, surahName, SURAH_COUNT, validateRange, type AyahRef, type Range } from '../quran';
import { useApp } from '../state';
import { Button, Row, Txt } from '../ui';

export const fmtRef = (lang: Lang, r: AyahRef) => `${surahName(r.surah, lang)} ${fmtNum(lang, r.ayah)}`;
export const fmtRange = (lang: Lang, r: Range) => `${fmtRef(lang, r.from)} ${lang === 'ar' ? '←' : '→'} ${fmtRef(lang, r.to)}`;

/** Two rows (from / to), each a surah picker plus an ayah stepper. Shows validation inline. */
export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const { c, t } = useApp();
  const issue = validateRange(value);
  return (
    <View style={{ gap: 8 }}>
      <RefInput label={t('range.from')} value={value.from} onChange={(from) => onChange({ ...value, from })} />
      <RefInput label={t('range.to')} value={value.to} onChange={(to) => onChange({ ...value, to })} />
      {issue && <Txt color={c.danger} size={14}>{t(`range.${issue}`)}</Txt>}
    </View>
  );
}

function RefInput({ label, value, onChange }: { label: string; value: AyahRef; onChange: (r: AyahRef) => void }) {
  const { c, t, settings } = useApp();
  const [open, setOpen] = useState(false);
  const max = ayahCount(value.surah);
  const setAyah = (a: number) => onChange({ ...value, ayah: Math.max(1, Math.min(max, a)) });
  return (
    <View style={{ gap: 4 }}>
      <Txt muted size={13}>{label}</Txt>
      <Row>
        <Pressable
          onPress={() => setOpen(true)} accessibilityRole="button"
          style={[st.surah, { borderColor: c.border, backgroundColor: c.bg }]}
        >
          <Txt>{fmtNum(settings.lang, value.surah)}. {surahName(value.surah, settings.lang)}</Txt>
        </Pressable>
        <Pressable onPress={() => setAyah(value.ayah - 1)} style={[st.step, { borderColor: c.border }]} accessibilityLabel="-1">
          <Txt bold>−</Txt>
        </Pressable>
        <TextInput
          value={String(value.ayah)} keyboardType="number-pad" accessibilityLabel={`${label} ${t('range.ayah')}`}
          onChangeText={(s) => /^\d+$/.test(s) && setAyah(+s)} selectTextOnFocus
          style={[st.ayah, { borderColor: c.border, color: c.text }]}
        />
        <Pressable onPress={() => setAyah(value.ayah + 1)} style={[st.step, { borderColor: c.border }]} accessibilityLabel="+1">
          <Txt bold>+</Txt>
        </Pressable>
        <Txt muted size={13}>/ {fmtNum(settings.lang, max)}</Txt>
      </Row>
      <SurahPicker
        visible={open} onClose={() => setOpen(false)}
        onPick={(surah) => { onChange({ surah, ayah: Math.min(value.ayah, ayahCount(surah)) }); setOpen(false); }}
      />
    </View>
  );
}

const ALL = Array.from({ length: SURAH_COUNT }, (_, i) => i + 1);
// Search ignores hamza/alif variants, ta marbuta, case, spaces and hyphens.
const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[-'\s]/g, '');

function SurahPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (s: number) => void }) {
  const { c, t, settings } = useApp();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = norm(q);
    if (!n) return ALL;
    return ALL.filter((s) => String(s) === n || norm(surahName(s, 'ar')).includes(n) || norm(surahName(s, 'en')).includes(n));
  }, [q]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 16, gap: 12 }}>
        <TextInput
          value={q} onChangeText={setQ} placeholder={t('range.searchSurah')} placeholderTextColor={c.muted} autoFocus
          style={[st.search, { borderColor: c.border, color: c.text, backgroundColor: c.card }]}
        />
        <FlatList
          data={list} keyExtractor={String} keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item)} style={[st.item, { borderColor: c.border }]} accessibilityRole="button">
              <Text style={{ color: c.text, fontSize: 18, textAlign: 'left' }}>
                {fmtNum(settings.lang, item)}. {surahName(item, 'ar')}
              </Text>
              <Text style={{ color: c.muted, fontSize: 13, textAlign: 'left' }}>
                {surahName(item, 'en')} · {fmtNum(settings.lang, ayahCount(item))} {t('unit.ayah')}
              </Text>
            </Pressable>
          )}
        />
        <Button title={t('set.cancel')} kind="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  surah: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center', flexGrow: 1 },
  step: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ayah: { width: 64, height: 44, borderRadius: 10, borderWidth: 1, textAlign: 'center', fontSize: 16 },
  search: { height: 48, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 16 },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
