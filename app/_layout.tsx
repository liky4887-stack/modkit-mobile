import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '../hooks/useFrameworkReady';
import { useFonts } from 'expo-font';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Inter_400Regular,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '@/theme/colors';
import { eventBus } from '@/orchestration/eventBus';
import { httpLog } from '@/api/httpLog';
import { startPersistingEvents } from '@/monitor/persistEvents';
import { startPersistingHttp } from '@/monitor/persistHttp';
import { startMetricsSampler } from '@/monitor/metricsSampler';
import { chatLifecycle } from '@/chat/chatLifecycle';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'JetBrainsMono-Regular': JetBrainsMono_400Regular,
    'JetBrainsMono-Bold': JetBrainsMono_700Bold,
    'Inter-Regular': Inter_400Regular,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // Boot monitoring. Idempotent — safe on hot reload.
    try {
      startPersistingEvents(eventBus as any);
      startPersistingHttp(httpLog as any);
      startMetricsSampler(null, 10000);
      // Sweep any chats left open by a previous crash, then every 2 minutes.
      void chatLifecycle.sweepStuck().catch(() => {});
      setInterval(() => { void chatLifecycle.sweepStuck().catch(() => {}); }, 120000);
    } catch {
      // never block boot
    }
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" backgroundColor={colors.pureBlack} />
    </>
  );
}
