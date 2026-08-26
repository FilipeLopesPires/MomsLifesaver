/**
 * Web resolution for the notification-permission hook.
 *
 * The browser has no equivalent of Android's runtime POST_NOTIFICATIONS
 * control, so this is a no-op: `available` is false and the Settings screen
 * hides the row. Keeps the same shape as the Android hook (asserted by a
 * parity test) so callers stay platform-agnostic.
 */
export type NotificationPermissionStatus =
  | 'unsupported'
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'blocked';

export const useNotificationPermission = () => {
  const request = async (): Promise<NotificationPermissionStatus> => 'unsupported';
  const openSettings = async (): Promise<void> => {};
  const refresh = async (): Promise<void> => {};

  return {
    available: false,
    status: 'unsupported' as NotificationPermissionStatus,
    request,
    openSettings,
    refresh,
  };
};
