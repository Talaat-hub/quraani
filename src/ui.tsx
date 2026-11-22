import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { Status } from './domain/status';
import { useApp } from './state';

export function Screen({ children }: PropsWithChildren) {
  const { c } = useApp();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, accent, style }: PropsWithChildren<{ accent?: string; style?: StyleProp<ViewStyle> }>) {
  const { c } = useApp();
  return (
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }, accent ? { borderStartWidth: 4, borderStartColor: accent } : null, style]}>
      {children}
    </View>
  );
}

type TxtProps = PropsWithChildren<{ muted?: boolean; size?: number; bold?: boolean; color?: string; style?: StyleProp<TextStyle> }>;
export function Txt({ children, muted, size = 15, bold, color, style }: TxtProps) {
  const { c } = useApp();
  return (
    <Text style={[{ color: color ?? (muted ? c.muted : c.text), fontSize: size, fontWeight: bold ? '600' : '400', textAlign: 'left', lineHeight: size * 1.45 }, style]}>
      {children}
    </Text>
  );
}

export const H = ({ children }: PropsWithChildren) => <Txt size={17} bold style={{ marginBottom: 8 }}>{children}</Txt>;

export function Button({ title, onPress, kind = 'primary', disabled, accessibilityHint }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; accessibilityHint?: string;
}) {
  const { c } = useApp();
  const bg = kind === 'primary' ? c.primary : 'transparent';
  const fg = kind === 'primary' ? c.onPrimary : kind === 'danger' ? c.danger : c.primary;
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityHint={accessibilityHint}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: kind === 'danger' ? c.danger : c.primary, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      <Text style={{ color: fg, fontSize: 15, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  const { c } = useApp();
  const tint = color ?? c.primary;
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={[s.chip, { borderColor: selected ? tint : c.border, backgroundColor: selected ? tint : 'transparent' }]}
    >
      <Text style={{ color: selected ? c.onPrimary : c.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export const Row = ({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) =>
  <View style={[s.row, style]}>{children}</View>;

export function StatusBadge({ status }: { status: Status }) {
  const { c, t } = useApp();
  const color = status === 'completed' ? c.primary : status === 'missed' ? c.danger : c.muted;
  return (
    <View style={[s.badge, { borderColor: color }]} accessibilityLabel={t(`status.${status}`)}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{t(`status.${status}`)}</Text>
    </View>
  );
}

export function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const { c } = useApp();
  return (
    <View style={[s.track, { backgroundColor: c.track }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <View style={{ width: `${Math.round(pct * 100)}%`, backgroundColor: color, height: '100%', borderRadius: 4 }} />
    </View>
  );
}

export function Section({ title, children, right }: PropsWithChildren<{ title: string; right?: ReactNode }>) {
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}><H>{title}</H>{right}</Row>
      {children}
    </Card>
  );
}

export const s = StyleSheet.create({
  screen: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  btn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginVertical: 4 },
});
