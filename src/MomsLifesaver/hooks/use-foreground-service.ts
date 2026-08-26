/**
 * Android-only foreground service hook.
 *
 * Drives the local `media-notification` Expo module: a `MediaSessionService`
 * whose Player owns no audio. The service keeps Android from killing the
 * process while tracks play in the background, and media3 builds the
 * MediaStyle notification (and the lock-screen / Bluetooth controls) from the
 * session.
 *
 * The real audio is produced by `useAudioController` (expo-audio). The two
 * layers no longer compete: the stub player has no audio pipeline, so it never
 * requests AudioFocus, so `updateMetadata` may sync the play/pause icon as
 * often as playback changes. The previous track-player-based implementation
 * could not - every icon sync stole focus and silenced the real audio - which
 * is why the notification used to show a permanently wrong icon.
 *
 * Initialization is lazy: the POST_NOTIFICATIONS prompt only runs the first
 * time the caller invokes `startService()` or `updateMetadata()`, so the app
 * does not ask for notifications before the user has played anything.
 *
 * On web and iOS the companion files export no-op implementations so the rest
 * of the app stays platform-agnostic.
 */
import { useEffect, useCallback, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import MediaNotification from '@/modules/media-notification';
import { log } from '@/utils/logger';
import { handleError, handleErrorSilent } from '@/utils/error-handler';

const DEFAULT_METADATA = {
  title: "Mom's Lifesaver",
  artist: 'Ready to play',
  isPlaying: false,
};

// POST_NOTIFICATIONS became a runtime permission in Android 13 (API 33).
const ANDROID_13 = 33;

type ForegroundServiceCallbacks = {
  onTogglePlayPause: () => void;
  onStop?: () => void;
  /** Fired on the native tick cadence started by `startTick`. */
  onTick?: () => void;
};

export const useForegroundService = (callbacks: ForegroundServiceCallbacks) => {
  const isInitialized = useRef(false);
  const isServiceRunning = useRef(false);
  const setupPromiseRef = useRef<Promise<boolean> | null>(null);
  const callbacksRef = useRef(callbacks);
  const currentMetadataRef = useRef(DEFAULT_METADATA);

  // Keep callbacks ref up to date
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Lazy setup: the first caller triggers the POST_NOTIFICATIONS prompt.
  // Subsequent calls reuse the cached promise. Returns true iff the service
  // may be started (so callers can short-circuit).
  //
  // A denied permission is NOT a failure. The service still runs and still
  // keeps background audio alive; only the notification is hidden. Blocking
  // here would trade a missing notification for missing audio.
  const ensureInitialized = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    if (isInitialized.current) return true;
    if (setupPromiseRef.current) return setupPromiseRef.current;

    const run = async (): Promise<boolean> => {
      try {
        if (Number(Platform.Version) >= ANDROID_13) {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          if (result !== PermissionsAndroid.RESULTS.GRANTED) {
            // Worth logging loudly: without it the service runs and the
            // notification is silently hidden, which looks exactly like the
            // feature being broken.
            log('[ForegroundService] POST_NOTIFICATIONS denied - notification will be hidden');
          }
        }

        isInitialized.current = true;
        return true;
      } catch (error) {
        handleError(error, 'foreground-service', 'Failed to request notification permission');
        // Allow a later caller to retry.
        setupPromiseRef.current = null;
        return false;
      }
    };

    setupPromiseRef.current = run();
    return setupPromiseRef.current;
  }, []);

  // Unmount cleanup (Android only)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    return () => {
      if (isServiceRunning.current) {
        try {
          MediaNotification.stop();
        } catch {
          // Nothing useful to do while tearing down.
        }
      }
    };
  }, []);

  // Listen for remote control events - notification, lock screen, Bluetooth
  // headset. Subscribed on mount, independent of lazy setup, so a button press
  // is never dropped because the prompt has not run yet.
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const toggleSub = MediaNotification.addListener('onTogglePlayPause', () => {
      log('[ForegroundService] Received onTogglePlayPause from the media session');
      callbacksRef.current.onTogglePlayPause();
    });

    const stopSub = MediaNotification.addListener('onStop', () => {
      log('[ForegroundService] Received onStop from the media session');
      callbacksRef.current.onStop?.();
    });

    const tickSub = MediaNotification.addListener('onSleepTimerTick', () => {
      callbacksRef.current.onTick?.();
    });

    return () => {
      toggleSub.remove();
      stopSub.remove();
      tickSub.remove();
    };
  }, []);

  // Start the foreground service (shows notification).
  // Triggers lazy setup on first call.
  const startService = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    const ready = await ensureInitialized();
    if (!ready) {
      log('[ForegroundService] Cannot start - setup failed');
      return;
    }
    if (isServiceRunning.current) {
      log('[ForegroundService] Service already running');
      return;
    }

    try {
      log('[ForegroundService] Starting foreground service');
      const { title, artist, isPlaying } = currentMetadataRef.current;
      MediaNotification.start(title, artist, isPlaying);
      isServiceRunning.current = true;
    } catch (error) {
      handleErrorSilent(error, 'foreground-service', 'Failed to start service');
    }
  }, [ensureInitialized]);

  // Stop the foreground service (hides notification).
  // No-op if the service was never started.
  const stopService = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (!isInitialized.current || !isServiceRunning.current) return;

    try {
      log('[ForegroundService] Stopping foreground service');
      MediaNotification.stop();
      isServiceRunning.current = false;
      // Reset so the next startService() seeds from defaults rather than
      // from a stale mix, and so the dedup check below cannot swallow the
      // first update after a restart.
      currentMetadataRef.current = DEFAULT_METADATA;
    } catch (error) {
      handleErrorSilent(error, 'foreground-service', 'Failed to stop service');
    }
  }, []);

  // Update the notification's metadata and play/pause icon.
  // Triggers lazy setup on first call.
  // isAudioPlaying: true = audio is playing (show Pause icon), false = audio
  // is paused (show Play icon).
  const updateMetadata = useCallback(
    async (title: string, artist: string, isAudioPlaying: boolean = true) => {
      if (Platform.OS !== 'android') return;
      const ready = await ensureInitialized();
      if (!ready) return;

      // Skip if nothing changed
      if (
        currentMetadataRef.current.title === title &&
        currentMetadataRef.current.artist === artist &&
        currentMetadataRef.current.isPlaying === isAudioPlaying
      ) {
        return;
      }

      currentMetadataRef.current = { title, artist, isPlaying: isAudioPlaying };

      try {
        // `isAudioPlaying` is propagated on purpose, and this is the fix for
        // the wrong-icon bug: the session's player owns no audio, so pushing
        // playback state costs nothing and steals no AudioFocus. Do not
        // reintroduce a "metadata only" variant here.
        MediaNotification.update(title, artist, isAudioPlaying);

        log('[ForegroundService] Updated metadata:', title, '-', artist, '- Playing:', isAudioPlaying);
      } catch (error) {
        handleErrorSilent(error, 'foreground-service', 'Failed to update metadata');
      }
    },
    [ensureInitialized],
  );

  // Start the periodic onSleepTimerTick event (native Handler cadence, not a
  // JS timer - see MediaNotification.startTick for why this matters).
  const startTick = useCallback((intervalMs: number) => {
    if (Platform.OS !== 'android') return;
    try {
      MediaNotification.startTick(intervalMs);
    } catch (error) {
      handleErrorSilent(error, 'foreground-service', 'Failed to start sleep-timer tick');
    }
  }, []);

  // Safe to call even if not currently ticking.
  const stopTick = useCallback(() => {
    if (Platform.OS !== 'android') return;
    try {
      MediaNotification.stopTick();
    } catch (error) {
      handleErrorSilent(error, 'foreground-service', 'Failed to stop sleep-timer tick');
    }
  }, []);

  return {
    startService,
    stopService,
    updateMetadata,
    startTick,
    stopTick,
    isInitialized: isInitialized.current,
  };
};
