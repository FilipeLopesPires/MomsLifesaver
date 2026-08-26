import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { log } from '@/utils/logger';

export default function PlaylistScreen() {
  const [selectedTrackIds, setSelectedTrackIds] = useState<TrackId[]>([]);
  const { toggleTrack, stopTrack, setGlobalVolume, globalVolume, setTrackVolume, tracks, toggleSelectedTracksPlayPause, pauseSelectedTracks } = useAudioController();

  // Refs for stable foreground service callbacks
  const selectedTrackIdsRef = useRef<TrackId[]>(selectedTrackIds);
  const tracksRef = useRef(tracks);
  const globalVolumeRef = useRef(globalVolume);

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
  const { startService, stopService, updateMetadata } = useForegroundService({
    onTogglePlayPause: handleForegroundToggle,
    onStop: handleStopAll,
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
  // free - see hooks/use-foreground-service.ts.
  useEffect(() => {
    if (isAnySelectedTrackPlaying) {
      const trackNamesText = selectedTrackNames.length > 0
        ? selectedTrackNames.join(', ')
        : "Mom's Lifesaver";
      updateMetadata(trackNamesText, 'Playing', true);
    } else if (selectedTrackIds.length > 0) {
      // Tracks selected but paused
      const trackNamesText = selectedTrackNames.join(', ') || "Mom's Lifesaver";
      updateMetadata(trackNamesText, 'Paused', false);
    } else {
      // No tracks selected, stop the service
      stopService();
    }
  }, [isAnySelectedTrackPlaying, selectedTrackNames, selectedTrackIds.length, stopService, updateMetadata]);

  // Get safe area insets to account for OS UI elements
  const insets = useSafeAreaInsets();

  const handleTrackPress = useCallback((track: TrackMetadata) => {
    // Fire-and-forget: the service exists to keep background audio alive and
    // to carry the notification, and it requests no AudioFocus of its own, so
    // nothing depends on it starting before playback does. It used to have to
    // win a focus race against expo-audio, which is why this was awaited.
    // startService() is a no-op once the service is running.
    if (!selectedTrackIdsRef.current.includes(track.id)) {
      startService();
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
    (track: TrackMetadata, value: number) => setTrackVolume(track.id, value),
    [setTrackVolume],
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
  // Web only for v1 (see the footer below).
  const sleepTimer = useSleepTimer({
    getMasterVolume: () => globalVolumeRef.current,
    setMasterVolume: setGlobalVolume,
    onExpire: () => pauseSelectedTracks(selectedTrackIdsRef.current),
  });
  const { reanchorMasterVolume } = sleepTimer;

  // Route master-volume drags so a manual change during an active fade
  // re-anchors it, rather than being yanked back by the next fade tick.
  const handleMasterVolumeChange = useCallback(
    (value: number) => {
      setGlobalVolume(value);
      reanchorMasterVolume(value);
    },
    [setGlobalVolume, reanchorMasterVolume],
  );

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
        {Platform.OS === 'web' && (
          <SleepTimerBar
            enabled={sleepTimer.enabled}
            status={sleepTimer.status}
            durationSec={sleepTimer.durationSec}
            remainingMs={sleepTimer.remainingMs}
            canStart={isAnySelectedTrackPlaying}
            onToggleEnabled={sleepTimer.setEnabled}
            onChangeDuration={sleepTimer.setDurationSec}
            onStart={sleepTimer.start}
            onCancel={sleepTimer.cancel}
          />
        )}
      </View>
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
});

