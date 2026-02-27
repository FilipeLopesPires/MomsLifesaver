import { useEffect, useCallback, useRef } from 'react';
import { Platform, DeviceEventEmitter } from 'react-native';
import TrackPlayer, { Capability, AppKilledPlaybackBehavior, RepeatMode } from 'react-native-track-player';
import { FOREGROUND_EVENTS } from '@/services/playback-service';
import { log, logError } from '@/utils/logger';

const SilenceAudio = require('@/assets/audio/silence.mp3');

type ForegroundServiceCallbacks = {
  onTogglePlayPause: () => void;
  onStop: () => void;
};

export const useForegroundService = (callbacks: ForegroundServiceCallbacks) => {
  const isInitialized = useRef(false);
  const isServiceRunning = useRef(false);
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref up to date
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Initialize track-player once (Android only)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const setup = async () => {
      if (isInitialized.current) return;

      try {
        log('[ForegroundService] Setting up TrackPlayer');
        
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: false,
        });

        await TrackPlayer.updateOptions({
          capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
          compactCapabilities: [Capability.Play, Capability.Pause],
          notificationCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
        });

        // Add silent track that will be "played" to maintain foreground service
        await TrackPlayer.add({
          id: 'silence',
          url: SilenceAudio,
          title: "Mom's Lifesaver",
          artist: 'Ready to play',
        });

        // Loop the silent track so it never ends
        await TrackPlayer.setRepeatMode(RepeatMode.Track);
        
        // Set volume to 0 to avoid any audio interference
        await TrackPlayer.setVolume(0);

        isInitialized.current = true;
        log('[ForegroundService] TrackPlayer setup complete');
      } catch (error) {
        logError('[ForegroundService] Failed to setup TrackPlayer:', error);
      }
    };

    setup();

    return () => {
      // Cleanup on unmount
      if (isInitialized.current) {
        TrackPlayer.reset().catch(() => {});
      }
    };
  }, []);

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

    const stopSub = DeviceEventEmitter.addListener(
      FOREGROUND_EVENTS.STOP,
      () => {
        log('[ForegroundService] Received STOP event from notification');
        callbacksRef.current.onStop();
      }
    );

    return () => {
      toggleSub.remove();
      stopSub.remove();
    };
  }, []);

  // Start the foreground service (shows notification)
  const startService = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (!isInitialized.current) {
      log('[ForegroundService] Cannot start - not initialized');
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
      logError('[ForegroundService] Failed to start service:', error);
    }
  }, []);

  // Stop the foreground service (hides notification)
  const stopService = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (!isInitialized.current || !isServiceRunning.current) return;

    try {
      log('[ForegroundService] Stopping foreground service');
      await TrackPlayer.pause();
      isServiceRunning.current = false;
    } catch (error) {
      logError('[ForegroundService] Failed to stop service:', error);
    }
  }, []);

  // Update the notification metadata (title shows track names, artist shows state)
  const updateMetadata = useCallback(async (title: string, artist: string) => {
    if (Platform.OS !== 'android') return;
    if (!isInitialized.current) return;

    try {
      await TrackPlayer.updateNowPlayingMetadata({
        title,
        artist,
      });
      log('[ForegroundService] Updated metadata:', title, '-', artist);
    } catch (error) {
      logError('[ForegroundService] Failed to update metadata:', error);
    }
  }, []);

  return {
    startService,
    stopService,
    updateMetadata,
    isInitialized: isInitialized.current,
  };
};
