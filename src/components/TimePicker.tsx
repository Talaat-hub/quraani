import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { setSetting } from '../db/repo';
import { fmtNum } from '../i18n';
import { useApp } from '../state';
import { Button, Chip, H, Row } from '../ui';

const ITEM = 48;
const VISIBLE = 5; // odd, so one row sits in the middle
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Bottom sheet with drag-to-pick hour / minute (and AM/PM) wheels. `value` and the result are minutes since midnight. */
export function TimePicker({ title, value, onClose, onSave }: {
  title: string; value: number; onClose: () => void; onSave: (min: number) => void;
}) {
  const { c, t, settings, act } = useApp();
  const [h, setH] = useState(Math.floor(value / 60) % 24);
  const [m, setM] = useState(value % 60);
  const twelve = settings.clock === '12';
  const pm = h >= 12;
  const num = (n: number, pad = true) => fmtNum(settings.lang, pad ? String(n).padStart(2, '0') : String(n));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' }} onPress={onClose}>
        {/* Swallow taps inside the sheet so only the dimmed area closes it. */}
        <Pressable onPress={() => {}} style={{ backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 16 }}>
          <H>{title}</H>
          <Row>
            {(['24', '12'] as const).map((k) => (
              <Chip key={k} label={t(k === '24' ? 'time.h24' : 'time.h12')} selected={settings.clock === k}
                onPress={() => act((db) => setSetting(db, 'clock', k))} />
            ))}
          </Row>
          {/* Times read left-to-right in Arabic too (٢:٠٥ م), so the wheels keep LTR order. */}
          <View style={{ flexDirection: 'row', direction: 'ltr', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            {twelve
              ? <Wheel key="h12" label={t('time.hour')} items={range(12).map((i) => num(i + 1, false))}
                  index={(h % 12 || 12) - 1} onChange={(i) => setH(((i + 1) % 12) + (pm ? 12 : 0))} />
              : <Wheel key="h24" label={t('time.hour')} items={range(24).map((i) => num(i))} index={h} onChange={setH} />}
            <Text style={{ fontSize: 26, color: c.text }}>:</Text>
            <Wheel label={t('time.minute')} items={range(60).map((i) => num(i))} index={m} onChange={setM} />
            {twelve && (
              <Wheel key="ampm" label={`${t('time.am')} / ${t('time.pm')}`} items={[t('time.am'), t('time.pm')]}
                index={pm ? 1 : 0} onChange={(i) => setH((h % 12) + (i ? 12 : 0))} />
            )}
          </View>
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button title={t('set.cancel')} kind="secondary" onPress={onClose} />
            <Button title={t('common.save')} onPress={() => onSave(h * 60 + m)} />
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Vertical snap wheel: drag up/down or tap a value. Screen readers get an adjustable control. */
function Wheel({ items, index, onChange, label }: { items: string[]; index: number; onChange: (i: number) => void; label: string }) {
  const { c } = useApp();
  const ref = useRef<ScrollViewInstance>(null);
  const go = (i: number) => { onChange(i); ref.current?.scrollTo({ y: i * ITEM, animated: true }); };
  const settle = (y: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM)));
    if (i !== index) onChange(i);
  };
  return (
    <View
      style={{ height: ITEM * VISIBLE, width: 80 }}
      accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: items[index] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const i = index + (e.nativeEvent.actionName === 'increment' ? 1 : -1);
        if (i >= 0 && i < items.length) go(i);
      }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: ITEM * 2, height: ITEM, left: 0, right: 0, borderRadius: 12, backgroundColor: c.track }} />
      <ScrollView
        ref={ref} nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={ITEM} decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM * 2 }}
        onLayout={() => ref.current?.scrollTo({ y: index * ITEM, animated: false })}
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
      >
        {items.map((s, i) => (
          <Pressable key={i} onPress={() => go(i)} style={{ height: ITEM, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: i === index ? 26 : 19, fontWeight: i === index ? '600' : '400', color: i === index ? c.text : c.muted }}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
