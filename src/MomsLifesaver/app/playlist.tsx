import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TRACK_LIBRARY, TRACK_MAP, type TrackId, type TrackMetadata } from '@/constants/tracks';
import { Colors } from '@/constants/theme';
import { TrackGrid } from '@/components/track-grid';
import { TrackListHeader } from '@/components/track-list-header';
import { PlaybackControlsBar } from '@/components/playback-controls-bar';
import { useAudioController } from '@/hooks/use-audio-controller';
import { log } from '@/utils/logger';

export default function PlaylistScreen() {
  log("[MomsLifesaver] PlaylistScreen component loaded");
  const [selectedTrackIds, setSelectedTrackIds] = useState<TrackId[]>([]);
  log("[MomsLifesaver] About to call useAudioController");
  const { toggleTrack, stopTrack, setGlobalVolume, globalVolume, setTrackVolume, tracks, toggleSelectedTracksPlayPause } = useAudioController();
  log("[MomsLifesaver] useAudioController returned:", { tracksCount: Object.keys(tracks).length });
  
  // Get safe area insets to account for OS UI elements
  const insets = useSafeAreaInsets();

  const handleTrackPress = useCallback((track: TrackMetadata) => {
    setSelectedTrackIds((previous) => {
      const isAlreadySelected = previous.includes(track.id);

      if (isAlreadySelected) {
        // Check if all selected tracks are currently paused
        const allSelectedTracksPaused = previous.every(trackId => {
          const trackState = tracks[trackId];
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
  }, [toggleTrack, tracks]);

  const lastSelectedTrack = useMemo(() => {
    if (selectedTrackIds.length === 0) {
      return undefined;
    }

    const lastId = selectedTrackIds[selectedTrackIds.length - 1];
    return TRACK_MAP[lastId];
  }, [selectedTrackIds]);

  const isAnySelectedTrackPlaying = useMemo(() => {
    return selectedTrackIds.some(trackId => {
      const trackState = tracks[trackId];
      return trackState?.isPlaying && !trackState.isPaused;
    });
  }, [selectedTrackIds, tracks]);

  const selectedTrackNames = useMemo(() => {
    return selectedTrackIds.map(trackId => TRACK_MAP[trackId]?.title).filter(Boolean);
  }, [selectedTrackIds]);

  const handleGlobalPlayPause = useCallback(async () => {
    try {
      await toggleSelectedTracksPlayPause(selectedTrackIds);
    } catch (error) {
      // Handle error if needed
      log("[MomsLifesaver] Error toggling selected tracks play/pause:", error);
    }
  }, [toggleSelectedTracksPlayPause, selectedTrackIds]);

  const handleStopAll = useCallback(async () => {
    try {
      // Stop all selected tracks using the dedicated stopTrack function
      await Promise.all(
        selectedTrackIds.map(async (trackId) => {
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
  }, [selectedTrackIds, stopTrack]);

  return (
    <View style={styles.container}>
      <TrackGrid
        data={TRACK_LIBRARY}
        selectedTrackIds={selectedTrackIds}
        onTrackPress={handleTrackPress}
        onTrackVolumeChange={(track, value) => setTrackVolume(track.id, value)}
        volumes={Object.fromEntries(
          TRACK_LIBRARY.map((track) => [track.id, tracks[track.id]?.volume ?? track.defaultVolume]),
        ) as Record<TrackId, number>}
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

