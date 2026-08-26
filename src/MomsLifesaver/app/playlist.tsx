import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { TRACK_LIBRARY, TRACK_MAP, type TrackId, type TrackMetadata } from '@/constants/tracks';
import { Colors } from '@/constants/theme';
import { TrackGrid } from '@/components/track-grid';
import { TrackListHeader } from '@/components/track-list-header';
import { PlaybackControlsBar } from '@/components/playback-controls-bar';
import { SleepTimerBar } from '@/components/sleep-timer-bar';
import { useAudioController } from '@/hooks/use-audio-controller';
import { useForegroundService } from '@/hooks/use-foreground-service';
import { useWebMediaSession } from '@/hooks/use-web-media-session';
import { useSleepTimer } from '@/hooks/use-sleep-timer';
import { usePreferences } from '@/hooks/use-preferences';
import { clampDurationSeconds } from '@/utils/duration';
import { log } from '@/utils/logger';

export default function PlaylistScreen() {
  const router = useRouter();
  const preferences = usePreferences();
  const {
    persistSelection,
    persistTrackVolume,
    persistMasterVolume,
    persistTimerDuration,
    initialTimerDurationSec,
    foregroundServiceEnabled,
    resetNonce,
  } = preferences;

  // Seed selection + volumes from persisted preferences. The provider gates
  // first paint on hydration, so these are the restored values, not defaults.
  const [selectedTrackIds, setSelectedTrackIds] = useState<TrackId[]>(() =>
    preferences.getInitialSelection(),
  );
  const initialSeed = useMemo(() => preferences.getSeed(), [preferences]);
  const {
    toggleTrack,
    stopTrack,
    setGlobalVolume,
    globalVolume,
    setTrackVolume,
    tracks,
    toggleSelectedTracksPlayPause,
    pauseSelectedTracks,
  } = useAudioController(initialSeed);

  // Refs for stable foreground service callbacks
  const selectedTrackIdsRef = useRef<TrackId[]>(selectedTrackIds);
  const tracksRef = useRef(tracks);
  const globalVolumeRef = useRef(globalVolume);
  // Live mirror of the background-audio toggle so the selection callbacks below
  // keep stable identities (same ref pattern as use-audio-controller).
  const foregroundEnabledRef = useRef(foregroundServiceEnabled);
  // Whether the foreground service has been started this session. Gates the
  // paused-metadata push so a restored (paused) selection at launch does not
  // trigger the POST_NOTIFICATIONS prompt before the user plays anything.
  const hasStartedServiceRef = useRef(false);
  // Forward reference: useForegroundService (below) is called before
  // useSleepTimer exists, but its onTick callback needs to reach
  // sleepTimer.advance. Populated once the sleep timer is constructed.
  const sleepTimerAdvanceRef = useRef<() => void>(() => {});

  // Keep refs up to date
  useEffect(() => {
    selectedTrackIdsRef.current = selectedTrackIds;
  }, [selectedTrackIds]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    globalVolumeRef.current = globalVolume;
  }, [globalVolume]);

  useEffect(() => {
    foregroundEnabledRef.current = foregroundServiceEnabled;
  }, [foregroundServiceEnabled]);

  // Persist the selection whenever it changes. Selection changes are discrete
  // taps, so the hook writes them eagerly. The first run harmlessly re-writes
  // the seeded value.
  useEffect(() => {
    persistSelection(selectedTrackIds);
  }, [selectedTrackIds, persistSelection]);

  // Foreground service callbacks (handle notification button presses)
  const handleForegroundToggle = useCallback(() => {
    log("[MomsLifesaver] Foreground service: toggle play/pause");
    const currentSelected = selectedTrackIdsRef.current;
    if (currentSelected.length > 0) {
      toggleSelectedTracksPlayPause(currentSelected);
    }
  }, [toggleSelectedTracksPlayPause]);

  const handleStopAll = useCallback(async () => {
    try {
      // Stop all selected tracks using the dedicated stopTrack function
      await Promise.all(
        selectedTrackIdsRef.current.map(async (trackId) => {
          try {
            await stopTrack(trackId);
          } catch (error) {
            log("[MomsLifesaver] Error stopping track:", trackId, error);
          }
        })
      );

      // Clear selection
      setSelectedTrackIds([]);
    } catch (error) {
      log("[MomsLifesaver] Error stopping all tracks:", error);
    }
  }, [stopTrack]);

  // Initialize foreground service (Android only)
  const { startService, stopService, updateMetadata, startTick, stopTick } = useForegroundService({
    onTogglePlayPause: handleForegroundToggle,
    onStop: handleStopAll,
    onTick: () => sleepTimerAdvanceRef.current(),
  });

  // Check if any selected track is currently playing
  const isAnySelectedTrackPlaying = useMemo(() => {
    return selectedTrackIds.some(trackId => {
      const trackState = tracks[trackId];
      return trackState?.isPlaying && !trackState.isPaused;
    });
  }, [selectedTrackIds, tracks]);

  // Get names of selected tracks for notification
  const selectedTrackNames = useMemo(() => {
    return selectedTrackIds.map(trackId => TRACK_MAP[trackId]?.title).filter(Boolean);
  }, [selectedTrackIds]);

  // Web Media Session API integration (for browser media controls)
  useWebMediaSession(
    {
      onTogglePlayPause: handleForegroundToggle,
      onStop: handleStopAll,
    },
    isAnySelectedTrackPlaying,
    selectedTrackNames as string[]
  );

  // Keep the notification's metadata and play/pause icon in step with
  // playback. The session's player owns no audio, so pushing state here is
  // free - see hooks/use-foreground-service.ts. Gated on the user's
  // background-audio preference; when it is off, we neither start nor paint the
  // notification (stopService is handled by the toggle-off effect below).
  useEffect(() => {
    if (!foregroundServiceEnabled) {
      return;
    }

    if (isAnySelectedTrackPlaying) {
      // Ensure the service is running before pushing "playing" metadata. Covers
      // resuming a restored selection via the global play button, where
      // handleTrackPress never ran to start it.
      if (!hasStartedServiceRef.current) {
        startService();
        hasStartedServiceRef.current = true;
      }
      const trackNamesText = selectedTrackNames.length > 0
        ? selectedTrackNames.join(', ')
        : "Mom's Lifesaver";
      updateMetadata(trackNamesText, 'Playing', true);
    } else if (selectedTrackIds.length > 0) {
      // Tracks selected but paused. Only push metadata once the service has
      // actually started this session, so a restored paused selection does not
      // prompt for notifications at launch.
      if (hasStartedServiceRef.current) {
        const trackNamesText = selectedTrackNames.join(', ') || "Mom's Lifesaver";
        updateMetadata(trackNamesText, 'Paused', false);
      }
    } else {
      // No tracks selected, stop the service
      stopService();
    }
  }, [foregroundServiceEnabled, isAnySelectedTrackPlaying, selectedTrackNames, selectedTrackIds.length, startService, stopService, updateMetadata]);

  // Turning the background-audio setting off stops any running service and
  // clears the started flag so it can start again if the user re-enables it.
  useEffect(() => {
    if (!foregroundServiceEnabled) {
      stopService();
      hasStartedServiceRef.current = false;
    }
  }, [foregroundServiceEnabled, stopService]);

  // Get safe area insets to account for OS UI elements
  const insets = useSafeAreaInsets();

  const handleTrackPress = useCallback((track: TrackMetadata) => {
    // Fire-and-forget: the service exists to keep background audio alive and
    // to carry the notification, and it requests no AudioFocus of its own, so
    // nothing depends on it starting before playback does. It used to have to
    // win a focus race against expo-audio, which is why this was awaited.
    // startService() is a no-op once the service is running. Gated on the
    // user's background-audio preference (read through a ref to keep this
    // callback's identity stable).
    if (foregroundEnabledRef.current && !selectedTrackIdsRef.current.includes(track.id)) {
      startService();
      hasStartedServiceRef.current = true;
    }

    setSelectedTrackIds((previous) => {
      const isAlreadySelected = previous.includes(track.id);

      if (isAlreadySelected) {
        // Check if all selected tracks are currently paused
        const allSelectedTracksPaused = previous.every(trackId => {
          const trackState = tracksRef.current[trackId];
          return !trackState?.isPlaying || trackState.isPaused;
        });

        if (allSelectedTracksPaused) {
          // All tracks are paused, just deselect in UI without audio changes
          return previous.filter((id) => id !== track.id);
        } else {
          // Some tracks are playing, stop the track and deselect
          toggleTrack(track.id).catch(() => {
            // noop for now; could surface an error toast later
          });
          return previous.filter((id) => id !== track.id);
        }
      } else {
        // Selecting a new track
        toggleTrack(track.id).catch(() => {
          // noop for now; could surface an error toast later
        });
        return [...previous, track.id];
      }
    });
  }, [toggleTrack, startService]);

  const handleTrackVolumeChange = useCallback(
    (track: TrackMetadata, value: number) => {
      setTrackVolume(track.id, value);
      persistTrackVolume(track.id, value);
    },
    [setTrackVolume, persistTrackVolume],
  );

  // Rebuilt only when a volume actually changes, so TrackGrid's memo and its
  // extraData both stay meaningful. Previously this object was recreated on
  // every render, which alone was enough to re-render all seven tiles.
  const volumes = useMemo(
    () =>
      Object.fromEntries(
        TRACK_LIBRARY.map((track) => [track.id, tracks[track.id]?.volume ?? track.defaultVolume]),
      ) as Record<TrackId, number>,
    [tracks],
  );

  const handleGlobalPlayPause = useCallback(async () => {
    try {
      await toggleSelectedTracksPlayPause(selectedTrackIdsRef.current);
    } catch (error) {
      // Handle error if needed
      log("[MomsLifesaver] Error toggling selected tracks play/pause:", error);
    }
  }, [toggleSelectedTracksPlayPause]);

  // Sleep timer: fades the master volume to silence over a chosen duration,
  // then pauses the selected tracks and restores the slider. `getMasterVolume`
  // reads the live value through a ref so the callbacks stay stable. Wired on
  // all platforms (see the footer below).
  const sleepTimer = useSleepTimer(
    {
      getMasterVolume: () => globalVolumeRef.current,
      setMasterVolume: setGlobalVolume,
      onExpire: () => pauseSelectedTracks(selectedTrackIdsRef.current),
      startBackgroundTicking: startTick,
      stopBackgroundTicking: stopTick,
    },
    initialTimerDurationSec,
  );
  const { reanchorMasterVolume, setDurationSec, advance } = sleepTimer;

  useEffect(() => {
    sleepTimerAdvanceRef.current = advance;
  }, [advance]);

  // Route master-volume drags so a manual change during an active fade
  // re-anchors it, rather than being yanked back by the next fade tick. Only
  // this user-drag path persists the master volume, so the sleep timer's fade
  // ticks (which call setGlobalVolume directly) are never written.
  const handleMasterVolumeChange = useCallback(
    (value: number) => {
      setGlobalVolume(value);
      reanchorMasterVolume(value);
      persistMasterVolume(value);
    },
    [setGlobalVolume, reanchorMasterVolume, persistMasterVolume],
  );

  // Persist the user's chosen fade duration so it survives an app restart.
  const handleChangeDuration = useCallback(
    (seconds: number) => {
      setDurationSec(seconds);
      persistTimerDuration(clampDurationSeconds(seconds));
    },
    [setDurationSec, persistTimerDuration],
  );

  // Reset preferences: stop playback and restore volumes/selection to defaults.
  // Stopping first avoids orphaning audio that would keep playing with no UI
  // handle once the selection is cleared.
  useEffect(() => {
    if (resetNonce === 0) {
      return;
    }
    void (async () => {
      await handleStopAll();
      await setGlobalVolume(1);
      await Promise.all(
        TRACK_LIBRARY.map((track) => setTrackVolume(track.id, track.defaultVolume)),
      );
    })();
  }, [resetNonce, handleStopAll, setGlobalVolume, setTrackVolume]);

  return (
    <View style={styles.container}>
      <TrackGrid
        data={TRACK_LIBRARY}
        selectedTrackIds={selectedTrackIds}
        onTrackPress={handleTrackPress}
        onTrackVolumeChange={handleTrackVolumeChange}
        volumes={volumes}
        numColumns={3}
        ListHeaderComponent={TrackListHeader}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <PlaybackControlsBar
          selectedTracksCount={selectedTrackIds.length}
          selectedTrackNames={selectedTrackNames}
          isPlaying={isAnySelectedTrackPlaying}
          onToggle={handleGlobalPlayPause}
          onStop={handleStopAll}
          volume={globalVolume}
          onVolumeChange={handleMasterVolumeChange}
        />
        <SleepTimerBar
          enabled={sleepTimer.enabled}
          status={sleepTimer.status}
          durationSec={sleepTimer.durationSec}
          remainingMs={sleepTimer.remainingMs}
          canStart={isAnySelectedTrackPlaying}
          onToggleEnabled={sleepTimer.setEnabled}
          onChangeDuration={handleChangeDuration}
          onStart={sleepTimer.start}
          onCancel={sleepTimer.cancel}
        />
      </View>
      <TouchableOpacity
        testID="settings-button"
        // insets.top + 18, plus the button's own 6px padding, lands the icon's
        // actual top edge at insets.top + 24 - matching TrackGrid's
        // contentContainer paddingTop (24), which is also the "Mom's
        // Lifesaver" title's top margin.
        style={[styles.settingsButton, { top: insets.top + 18 }]}
        onPress={() => router.push('/settings')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <Ionicons name="settings-outline" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  footer: {
    backgroundColor: Colors.surfaceActive,
  },
  settingsButton: {
    position: 'absolute',
    // The button's own 6px padding sits between this edge and the icon, so
    // 14 here lands the icon's actual right edge at 20px from the screen
    // edge - matching TrackGrid's contentContainer paddingHorizontal (20),
    // which is also the "Mom's Lifesaver" title's left margin.
    right: 14,
    zIndex: 10,
    padding: 6,
    borderRadius: 20,
  },
});
