/**
 * Android media-notification module (local Expo module).
 *
 * Hosts a `MediaSessionService` whose `Player` is a stub that owns no audio,
 * so the notification can be repainted as often as we like without ever
 * requesting AudioFocus. The real audio comes from expo-audio; see
 * `android/src/main/java/expo/modules/medianotification/StubPlayer.kt` for why
 * that separation is load-bearing.
 *
 * `index.ios.ts` / `index.web.ts` resolve to no-ops, so callers never have to
 * branch on platform. This file is the Android implementation *and* the type
 * contract the shims are checked against.
 */
import { NativeModule, requireNativeModule } from 'expo';

export type MediaNotificationEventPayload = {
  /** What the remote control asked for, not what the app decided to do. */
  playWhenReady: boolean;
};

export type MediaNotificationEvents = {
  onTogglePlayPause: (payload: MediaNotificationEventPayload) => void;
  onStop: (payload: MediaNotificationEventPayload) => void;
  /**
   * Fired on a native `Handler` cadence, not a JS timer - this is what lets
   * the sleep-timer fade keep advancing while the app is backgrounded (React
   * Native stops dispatching JS `setInterval` callbacks on host pause).
   */
  onSleepTimerTick: () => void;
};

declare class MediaNotificationNativeModule extends NativeModule<MediaNotificationEvents> {
  /**
   * Starts the foreground service and seeds the session state. Must be called
   * while the app is in the foreground (Android 12+ blocks background starts).
   */
  start(title: string, artist: string, isPlaying: boolean): void;
  /** Repaints the notification. Safe to call as often as playback changes. */
  update(title: string, artist: string, isPlaying: boolean): void;
  /** Stops the service and removes the notification. */
  stop(): void;
  /** Starts (or re-cadences) periodic `onSleepTimerTick` events. */
  startTick(intervalMs: number): void;
  /** Stops the periodic tick. Safe to call even if not currently ticking. */
  stopTick(): void;
}

export default requireNativeModule<MediaNotificationNativeModule>('MediaNotification');
