import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TRACK_LIBRARY, TRACK_MAP, type TrackId, type TrackMetadata } from '@/constants/tracks';
import { Colors } from '@/constants/theme';
import { TrackGrid } from '@/components/track-grid';
import { TrackListHeader } from '@/components/track-list-header';
import { PlaybackControlsBar } from '@/components/playback-controls-bar';
import { useAudioController } from '@/hooks/use-audio-controller';
import { useForegroundService } from '@/hooks/use-foreground-service';
import { useWebMediaSession } from '@/hooks/use-web-media-session';
import { log } from '@/utils/logger';

export default function PlaylistScreen() {
  const [selectedTrackIds, setSelectedTrackIds] = useState<TrackId[]>([]);
  const { toggleTrack, stopTrack, setGlobalVolume, globalVolume, setTrackVolume, tracks, toggleSelectedTracksPlayPause } = useAudioController();
  
  // Refs for stable foreground service callbacks
  const selectedTrackIdsRef = useRef<TrackId[]>(selectedTrackIds);
  const tracksRef = useRef(tracks);
  
  // Keep refs up to date
  useEffect(() => {
    selectedTrackIdsRef.current = selectedTrackIds;
  }, [selectedTrackIds]);
  
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  // Foreground service callbacks (handle notification button presses)
  const handleForegroundToggle = useCallback(() => {
    log("[MomsLifesaver] Foreground service: toggle play/pause");
    const currentSelected = selectedTrackIdsRef.current;
    if (currentSelected.length > 0) {
      toggleSelectedTracksPlayPause(currentSelected);
    }
  }, [toggleSelectedTracksPlayPause]);

  // Initialize foreground service (Android only)
  const { startService, stopService, updateMetadata } = useForegroundService({
    onTogglePlayPause: handleForegroundToggle,
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
      onStop: () => {
        const currentSelected = selectedTrackIdsRef.current;
        Promise.all(currentSelected.map(trackId => stopTrack(trackId)));
        setSelectedTrackIds([]);
      },
    },
    isAnySelectedTrackPlaying,
    selectedTrackNames as string[]
  );

  // Track if foreground service has been started for current session
  const serviceStartedRef = useRef(false);

  // Manage foreground service based on playback state
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (isAnySelectedTrackPlaying) {
      const trackNamesText = selectedTrackNames.length > 0 
        ? selectedTrackNames.join(', ') 
        : "Mom's Lifesaver";
      
      if (!serviceStartedRef.current) {
        // First time starting - delay to avoid race condition with track toggle
        timeoutId = setTimeout(() => {
          log("[MomsLifesaver] Starting foreground service (delayed)");
          startService();
          updateMetadata(trackNamesText, 'Playing', true);
          serviceStartedRef.current = true;
        }, 300);
      } else {
        // Service already running, just update metadata
        updateMetadata(trackNamesText, 'Playing', true);
      }
    } else if (selectedTrackIds.length > 0) {
      // Tracks selected but paused
      const trackNamesText = selectedTrackNames.join(', ') || "Mom's Lifesaver";
      updateMetadata(trackNamesText, 'Paused', false);
    } else {
      // No tracks selected, stop the service
      stopService();
      serviceStartedRef.current = false;
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isAnySelectedTrackPlaying, selectedTrackNames, selectedTrackIds.length, startService, stopService, updateMetadata]);

  // Get safe area insets to account for OS UI elements
  const insets = useSafeAreaInsets();

  const handleTrackPress = useCallback((track: TrackMetadata) => {
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
  }, [toggleTrack]);

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
          onVolumeChange={setGlobalVolume}
        />
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

