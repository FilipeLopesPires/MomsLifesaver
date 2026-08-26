/**
 * Android notification-permission control for the Settings screen.
 *
 * POST_NOTIFICATIONS is the app's only runtime permission (see
 * `hooks/use-foreground-service.ts`, which requests it lazily on first
 * playback). This hook exposes a *smart* re-request for the Settings screen:
 * it asks again, and if Android reports the permission permanently denied
 * (`NEVER_ASK_AGAIN` - the prompt will no longer appear), it falls back to
 * opening the OS app-settings page so a single tap always does something
 * useful. Below Android 13 the permission is install-time, so it reports
 * `granted` with nothing to prompt.
 *
 * Web and iOS resolve to no-op shims (`.web.ts` / `.ios.ts`) so the Settings
 * screen stays platform-agnostic.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';

import { handleErrorSilent } from '@/utils/error-handler';
import { log } from '@/utils/logger';

export type NotificationPermissionStatus =
  | 'unsupported'
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'blocked';

// POST_NOTIFICATIONS became a runtime permission in Android 13 (API 33).
const ANDROID_13 = 33;

export const useNotificationPermission = () => {
  const available = Platform.OS === 'android';
  const [status, setStatus] = useState<NotificationPermissionStatus>('unknown');

  const check = useCallback(async (): Promise<NotificationPermissionStatus> => {
    if (Platform.OS !== 'android') return 'unsupported';
    if (Number(Platform.Version) < ANDROID_13) return 'granted';
    try {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      return granted ? 'granted' : 'denied';
    } catch (error) {
      handleErrorSilent(error, 'general', 'Failed to check notification permission');
      return 'unknown';
    }
  }, []);

  const refresh = useCallback(async () => {
    setStatus(await check());
  }, [check]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      handleErrorSilent(error, 'general', 'Failed to open OS app settings');
    }
  }, []);

  const request = useCallback(async (): Promise<NotificationPermissionStatus> => {
    if (Platform.OS !== 'android') {
      setStatus('unsupported');
      return 'unsupported';
    }
    if (Number(Platform.Version) < ANDROID_13) {
      setStatus('granted');
      return 'granted';
    }
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      let next: NotificationPermissionStatus;
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        next = 'granted';
      } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        // The prompt will no longer appear, so the only path forward is the
        // system app-settings page. Open it so the single tap still helps.
        next = 'blocked';
        await openSettings();
      } else {
        next = 'denied';
      }
      setStatus(next);
      log('[NotificationPermission] request result:', next);
      return next;
    } catch (error) {
      handleErrorSilent(error, 'general', 'Failed to request notification permission');
      return 'unknown';
    }
  }, [openSettings]);

  return { available, status, request, openSettings, refresh };
};
