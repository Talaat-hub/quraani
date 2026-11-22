import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useApp } from '../../state';

export default function TabsLayout() {
  const { c, t } = useApp();
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: ColorValue; size: number }) =>
    <Ionicons name={name} color={color as string} size={size} />;
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, headerShadowVisible: false,
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted,
      sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: t('tab.today'), headerTitle: t('appName'), tabBarIcon: icon('sunny-outline') }} />
      <Tabs.Screen name="history" options={{ title: t('tab.history'), tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="settings" options={{ title: t('tab.settings'), tabBarIcon: icon('settings-outline') }} />
    </Tabs>
  );
}
