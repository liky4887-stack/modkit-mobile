import { Tabs } from 'expo-router';
import { colors } from '@/theme/colors';
import { Terminal, Wrench, Layers, Settings } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

function makeTabIcon(Icon: LucideIcon) {
  return ({ focused, size }: { focused: boolean; size: number }) => (
    <Icon size={size} color={focused ? colors.accent : colors.textTertiary} strokeWidth={2} />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.pureBlack,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 58,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: 'JetBrainsMono-Bold',
          fontSize: 9,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Console',
          tabBarIcon: makeTabIcon(Terminal),
        }}
      />
      <Tabs.Screen
        name="patch"
        options={{
          title: 'Patch',
          tabBarIcon: makeTabIcon(Wrench),
        }}
      />
      <Tabs.Screen
        name="features"
        options={{
          title: 'Modules',
          tabBarIcon: makeTabIcon(Layers),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Config',
          tabBarIcon: makeTabIcon(Settings),
        }}
      />
      <Tabs.Screen
        name="clean"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
