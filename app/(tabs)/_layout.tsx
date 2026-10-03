import { Tabs } from 'expo-router';
import { colors } from '@/theme/colors';
import { Activity, Radio, MessageSquare, Settings } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.pureBlack,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingTop: 6,
          height: 62,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontFamily: 'Inter-Medium',
          fontSize: 9,
          letterSpacing: 1,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'JOBS',
          tabBarIcon: ({ color, size }) => (
            <Activity size={size - 4} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="monitor"
        options={{
          title: 'MONITOR',
          tabBarIcon: ({ color, size }) => (
            <Radio size={size - 4} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'CHATS',
          tabBarIcon: ({ color, size }) => (
            <MessageSquare size={size - 4} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="system"
        options={{
          title: 'SYSTEM',
          tabBarIcon: ({ color, size }) => (
            <Settings size={size - 4} color={color} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  );
}
