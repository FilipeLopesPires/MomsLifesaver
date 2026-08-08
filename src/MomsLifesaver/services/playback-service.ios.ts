/**
 * iOS resolution for the playback service.
 *
 * Companion to `hooks/use-foreground-service.ios.ts`: the Android
 * implementation imports `react-native-track-player` at module scope to
 * register remote play/pause handlers for the notification. iOS has no
 * such notification, so anything importing this module on iOS should get
 * the same no-ops the web build gets rather than pulling RNTP in.
 *
 * Re-exported from the web shim so `FOREGROUND_EVENTS` cannot drift
 * between platforms.
 */
export * from './playback-service.web';
