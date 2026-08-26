import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { PreferencesProvider, usePreferences } from '@/hooks/use-preferences';

// Hold the native splash until preferences have hydrated, so the first paint
// already shows the user's restored volumes/selection rather than defaults.
// A failure to hold it (e.g. already hidden) is non-fatal - at worst a single
// frame of defaults flashes before hydration completes.
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { hydrated } = usePreferences();

  useEffect(() => {
    if (hydrated) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [hydrated]);

  // Keep the splash up (render nothing) until the persisted snapshot is loaded.
  if (!hydrated) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={DarkTheme}>
        <PreferencesProvider>
          <RootNavigator />
        </PreferencesProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
