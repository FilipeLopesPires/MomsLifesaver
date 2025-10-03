import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TRACK_LIBRARY, TRACK_MAP, type TrackId, type TrackMetadata } from '@/constants/tracks';
import { Colors } from '@/constants/theme';
import { TrackGrid } from '@/components/track-grid';
import { TrackListHeader } from '@/components/track-list-header';
import { TrackSelectionBar } from '@/components/track-selection-bar';

export default function PlaylistScreen() {
  const [selectedTrackIds, setSelectedTrackIds] = useState<TrackId[]>([]);

  const handleTrackPress = useCallback((track: TrackMetadata) => {
    setSelectedTrackIds((previous) => {
      const isAlreadySelected = previous.includes(track.id);

      if (isAlreadySelected) {
        return previous.filter((id) => id !== track.id);
      }

      return [...previous, track.id];
    });
  }, []);

  const lastSelectedTrack = useMemo(() => {
    if (selectedTrackIds.length === 0) {
      return undefined;
    }

    const lastId = selectedTrackIds[selectedTrackIds.length - 1];
    return TRACK_MAP[lastId];
  }, [selectedTrackIds]);

  return (
    <View style={styles.container}>
      <TrackGrid
        data={TRACK_LIBRARY}
        selectedTrackIds={selectedTrackIds}
        onTrackPress={handleTrackPress}
        numColumns={3}
        ListHeaderComponent={TrackListHeader}
      />
      <TrackSelectionBar lastSelectedTrackTitle={lastSelectedTrack?.title} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});

