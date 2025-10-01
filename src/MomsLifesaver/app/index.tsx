import { useCallback, useMemo, useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { TRACK_LIBRARY, TRACK_MAP, type TrackId, type TrackMetadata } from '@/constants/tracks';
import { Colors, Typography } from '@/constants/theme';
import { TrackButton } from '@/components/track-button';

export default function HomeScreen() {
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
    <SafeAreaView style={styles.container}>
      <View style={styles.listContainer}>
        <FlatList
          data={TRACK_LIBRARY}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.contentContainer}
          ListHeaderComponent={<FlatListHeader />}
          renderItem={({ item }) => {
            const isSelected = selectedTrackIds.includes(item.id);

            return (
              <TrackButton
                track={item}
                style={styles.trackButton}
                accessibilityLabel={`${item.title} control`}
                onPress={handleTrackPress}
                selected={isSelected}
              />
            );
          }}
          showsVerticalScrollIndicator={false}
          extraData={selectedTrackIds}
        />
      </View>
      <View style={styles.bottomBar}>
        <Text style={styles.bottomBarLabel}>Last selected</Text>
        <Text style={styles.bottomBarTitle} numberOfLines={1}>
          {lastSelectedTrack?.title ?? 'No track selected'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const FlatListHeader = () => {
  return (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle}>Sleep Sound Mixer</Text>
      <Text style={styles.headerSubtitle}>Layer calming tracks to build a bedtime atmosphere.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContainer: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 24,
    rowGap: 18,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  headerContainer: {
    marginBottom: 24,
  },
  headerTitle: {
    ...Typography.title,
    marginBottom: 4,
  },
  headerSubtitle: {
    ...Typography.hint,
  },
  trackButton: {
    flex: 1,
    marginHorizontal: 6,
    maxWidth: '48%',
  },
  bottomBar: {
    backgroundColor: Colors.surfaceActive,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 4,
  },
  bottomBarLabel: {
    ...Typography.hint,
  },
  bottomBarTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
});

