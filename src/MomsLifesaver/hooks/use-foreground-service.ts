/**
 * Android-only foreground service hook.
 *
 * Uses `react-native-track-player` to host a long-lived media-style
 * notification while the user has tracks selected. The notification lets
 * Android keep the app alive for background audio and exposes a
 * play/pause remote action that maps back to `onTogglePlayPause`.
 *
 * The real audio is produced by `useAudioController`; this hook only
 * plays a silent looping track at volume 0 so the foreground service
 * stays active and the notification can carry the current metadata.
 *
 * Initialization is lazy: `TrackPlayer.setupPlayer()` and the initial
 * silent-track `add()` only run the first time the caller invokes
 * `startService()` / `updateMetadata()`. This avoids a mount-time race
 * on real devices where RNTP's new MediaSession + AudioFocus request
 * causes expo-av's ExoPlayer instances (loaded in parallel by
 * `useAudioController`) to be torn down silently, producing the
 * `E_AUDIO_NOPLAYER` "Player does not exist." error on the first
 * playAsync. The Android emulator's audio HAL is lax and does not
 * reproduce this, so the bug only shows up on hardware.
 *
 * On web, the companion file `use-foreground-service.web.ts` exports
 * no-op implementations so the rest of the app code stays platform-
 * agnostic.
 */
import { useEffect, useCallback, useRef } from 'react';
import { Platform, DeviceEventEmitter } from 'react-native';
import TrackPlayer, { Capability, AppKilledPlaybackBehavior, RepeatMode } from 'react-native-track-player';
import { FOREGROUND_EVENTS, PlaybackService } from '@/services/playback-service';
import { log } from '@/utils/logger';
import { handleError, handleErrorSilent } from '@/utils/error-handler';

const SilenceAudio = require('@/assets/audio/silence.mp3');

TrackPlayer.registerPlaybackService(() => PlaybackService);

type ForegroundServiceCallbacks = {
  onTogglePlayPause: () => void;
};

export const useForegroundService = (callbacks: ForegroundServiceCallbacks) => {
  const isInitialized = useRef(false);
  const isServiceRunning = useRef(false);
  const setupPromiseRef = useRef<Promise<boolean> | null>(null);
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref up to date
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Lazy setup: the first caller triggers TrackPlayer.setupPlayer() and
  // the silent holding track. Subsequent calls reuse the cached promise.
  // Returns true iff setup succeeded (so callers can short-circuit).
  const ensureInitialized = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    if (isInitialized.current) return true;
    if (setupPromiseRef.current) return setupPromiseRef.current;

    const run = async (): Promise<boolean> => {
      try {
        log('[ForegroundService] Setting up TrackPlayer (lazy)');

        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: false,
        });

        await TrackPlayer.updateOptions({
          capabilities: [Capability.Play, Capability.Pause],
          compactCapabilities: [Capability.Play, Capability.Pause],
          notificationCapabilities: [Capability.Play, Capability.Pause],
          progressUpdateEventInterval: 0,
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
          // Notification accent color (matches app theme #6C8CFF)
          color: 0x6C8CFF,
        });

        // Add silent track that will be "played" to maintain foreground service
        // Duration: 0 hides the progress bar in the notification
        await TrackPlayer.add({
          id: 'silence',
          url: SilenceAudio,
          title: "Mom's Lifesaver",
          artist: 'Ready to play',
          duration: 0,
        });

        // Loop the silent track so it never ends
        await TrackPlayer.setRepeatMode(RepeatMode.Track);

        // Set volume to 0 to avoid any audio interference
        await TrackPlayer.setVolume(0);

        isInitialized.current = true;
        log('[ForegroundService] TrackPlayer setup complete');
        return true;
      } catch (error) {
        handleError(error, 'foreground-service', 'Failed to setup TrackPlayer');
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
      if (isInitialized.current) {
        TrackPlayer.reset().catch(() => {});
      }
    };
  }, []);

  // Store the current metadata for re-applying after track loops
  const currentMetadataRef = useRef({ title: "Mom's Lifesaver", artist: 'Ready to play', isPlaying: false });

  // Listen for notification button events (Android only)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const toggleSub = DeviceEventEmitter.addListener(
      FOREGROUND_EVENTS.TOGGLE_PLAY_PAUSE,
      () => {
        log('[ForegroundService] Received TOGGLE_PLAY_PAUSE event from notification');
        callbacksRef.current.onTogglePlayPause();
      }
    );

    return () => {
      toggleSub.remove();
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
      await TrackPlayer.play();
      isServiceRunning.current = true;
    } catch (error) {
      handleErrorSilent(error, 'foreground-service', 'Failed to start service');
    }
  }, [ensureInitialized]);

  // Stop the foreground service (hides notification).
  // No-op if the service was never started (setup never ran).
  const stopService = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (!isInitialized.current || !isServiceRunning.current) return;

    try {
      log('[ForegroundService] Stopping foreground service');
      await TrackPlayer.pause();
      isServiceRunning.current = false;
    } catch (error) {
      handleErrorSilent(error, 'foreground-service', 'Failed to stop service');
    }
  }, []);

  // Update the notification metadata by replacing the track.
  // Triggers lazy setup on first call.
  // isAudioPlaying: true = audio is playing (show Pause icon), false = audio is paused (show Play icon)
  const updateMetadata = useCallback(async (title: string, artist: string, isAudioPlaying: boolean = true) => {
    if (Platform.OS !== 'android') return;
    const ready = await ensureInitialized();
    if (!ready) return;

    // Skip if metadata hasn't changed
    if (
      currentMetadataRef.current.title === title &&
      currentMetadataRef.current.artist === artist &&
      currentMetadataRef.current.isPlaying === isAudioPlaying
    ) {
      return;
    }

    currentMetadataRef.current = { title, artist, isPlaying: isAudioPlaying };

    try {
      // Remove old track and add new one with updated metadata
      // Duration: 0 hides the progress bar in the notification
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: 'silence',
        url: SilenceAudio,
        title,
        artist,
        duration: 0,
      });
      await TrackPlayer.setRepeatMode(RepeatMode.Track);
      await TrackPlayer.setVolume(0);

      // Sync TrackPlayer state with actual audio state
      // This controls which icon (Play/Pause) is shown in the notification
      if (isAudioPlaying) {
        await TrackPlayer.play();
      } else {
        await TrackPlayer.pause();
      }

      log('[ForegroundService] Updated metadata:', title, '-', artist, '- Playing:', isAudioPlaying);
    } catch (error) {
      handleErrorSilent(error, 'foreground-service', 'Failed to update metadata');
    }
  }, [ensureInitialized]);

  return {
    startService,
    stopService,
    updateMetadata,
    isInitialized: isInitialized.current,
  };
};
