/**
 * Settings screen.
 *
 * Reached from the always-on gear on the playlist screen. Renders a small,
 * extensible set of controls: the Android notification permission, the
 * background-audio (foreground service) toggle, and a reset-preferences action.
 * Android-only rows are hidden on web. The header/back button come from the
 * Stack registration in `app/_layout.tsx`.
 */
import { useCallback } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Typography } from '@/constants/theme';
import { SettingsButton, SettingsRow, SettingsSwitch } from '@/components/settings-row';
import { usePreferences } from '@/hooks/use-preferences';
import {
  useNotificationPermission,
  type NotificationPermissionStatus,
} from '@/hooks/use-notification-permission';

const permissionCopy = (
  status: NotificationPermissionStatus,
): { label: string; subtitle: string } => {
  switch (status) {
    case 'granted':
      return { label: 'Allowed', subtitle: 'Playback notifications are allowed.' };
    case 'blocked':
      return {
        label: 'Open settings',
        subtitle: 'Blocked. Open system settings to allow notifications.',
      };
    case 'denied':
      return {
        label: 'Allow',
        subtitle: 'Not allowed yet. Tap Allow to show the playback notification.',
      };
    default:
      return { label: 'Allow', subtitle: 'Allow notifications to show playback controls.' };
  }
};

const confirmReset = (onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    const message =
      'Reset all preferences to defaults? This stops playback and clears your saved tracks and volumes.';
    if (typeof window !== 'undefined' && window.confirm(message)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(
    'Reset preferences?',
    'This stops playback and clears your saved tracks and volumes.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: onConfirm },
    ],
    { cancelable: true },
  );
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { foregroundServiceEnabled, setForegroundServiceEnabled, resetPreferences } =
    usePreferences();
  const notificationPermission = useNotificationPermission();
  const showForegroundRow = Platform.OS !== 'web';

  const permission = permissionCopy(notificationPermission.status);

  const handleNotificationPress = useCallback(() => {
    if (notificationPermission.status === 'blocked') {
      void notificationPermission.openSettings();
    } else {
      void notificationPermission.request();
    }
  }, [notificationPermission]);

  const handleReset = useCallback(() => {
    confirmReset(() => {
      void resetPreferences();
    });
  }, [resetPreferences]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={styles.sectionLabel}>Preferences</Text>

      {notificationPermission.available && (
        <SettingsRow
          testID="settings-notification-row"
          title="Notifications"
          subtitle={permission.subtitle}
          control={
            <SettingsButton
              testID="settings-notification-button"
              label={permission.label}
              icon="notifications-outline"
              onPress={handleNotificationPress}
            />
          }
        />
      )}

      {showForegroundRow && (
        <SettingsRow
          testID="settings-foreground-row"
          title="Background audio"
          subtitle="Keep audio playing and show a notification when the app is in the background."
          control={
            <SettingsSwitch
              testID="settings-foreground-switch"
              value={foregroundServiceEnabled}
              onValueChange={setForegroundServiceEnabled}
              accessibilityLabel="Background audio"
            />
          }
        />
      )}

      <SettingsRow
        testID="settings-reset-row"
        title="Reset preferences"
        subtitle="Clear saved tracks, volumes, and settings, and return to defaults."
        control={
          <SettingsButton
            testID="settings-reset-button"
            label="Reset"
            icon="refresh-outline"
            destructive
            onPress={handleReset}
          />
        }
      />

      <View style={styles.footerNote}>
        <Text style={styles.footerText}>
          Your choices are saved on this device and restored the next time you open the app.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
    gap: 12,
  },
  sectionLabel: {
    ...Typography.hint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  footerNote: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  footerText: {
    ...Typography.hint,
  },
});
