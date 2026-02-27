import { useEffect, useCallback, useRef } from 'react';
import { Platform, DeviceEventEmitter } from 'react-native';
import TrackPlayer, { Capability, AppKilledPlaybackBehavior, RepeatMode } from 'react-native-track-player';
import { FOREGROUND_EVENTS, PlaybackService } from '@/services/playback-service';
import { log } from '@/utils/logger';
import { handleError, handleErrorSilent } from '@/utils/error-handler';

const SilenceAudio = require('@/assets/audio/silence.mp3');

// Register playback service at module load (Android only)
TrackPlayer.registerPlaybackService(() => PlaybackService);

type ForegroundServiceCallbacks = {
  onTogglePlayPause: () => void;
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
      } catch (error) {
        handleError(error, 'foreground-service', 'Failed to setup TrackPlayer');
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
      handleErrorSilent(error, 'foreground-service', 'Failed to start service');
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
      handleErrorSilent(error, 'foreground-service', 'Failed to stop service');
    }
  }, []);

  // Update the notification metadata by replacing the track
  // isAudioPlaying: true = audio is playing (show Pause icon), false = audio is paused (show Play icon)
  const updateMetadata = useCallback(async (title: string, artist: string, isAudioPlaying: boolean = true) => {
    if (Platform.OS !== 'android') return;
    if (!isInitialized.current) return;

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
  }, []);

  return {
    startService,
    stopService,
    updateMetadata,
    isInitialized: isInitialized.current,
  };
};
