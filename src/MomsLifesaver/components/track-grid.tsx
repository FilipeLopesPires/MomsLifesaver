import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import type { TrackId, TrackMetadata } from '@/constants/tracks';
import { TrackButton } from '@/components/track-button';

type TrackListHeaderComponent = React.ComponentType | React.ReactElement | null;

export type TrackGridProps = {
  data: ReadonlyArray<TrackMetadata>;
  selectedTrackIds: TrackId[];
  onTrackPress: (track: TrackMetadata) => void;
  ListHeaderComponent?: TrackListHeaderComponent;
};

const TrackGridComponent = ({
  data,
  selectedTrackIds,
  onTrackPress,
  ListHeaderComponent,
}: TrackGridProps) => {
  const renderItem = useCallback(
    ({ item }: { item: TrackMetadata }) => {
      const isSelected = selectedTrackIds.includes(item.id);

      return (
        <TrackButton
          track={item}
          style={styles.trackButton}
          accessibilityLabel={`${item.title} control`}
          onPress={onTrackPress}
          selected={isSelected}
        />
      );
    },
    [onTrackPress, selectedTrackIds],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.contentContainer}
        ListHeaderComponent={ListHeaderComponent ?? undefined}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        extraData={selectedTrackIds}
      />
    </View>
  );
};

export const TrackGrid = memo(TrackGridComponent);

const styles = StyleSheet.create({
  container: {
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
  trackButton: {
    flex: 1,
    marginHorizontal: 6,
    maxWidth: '48%',
  },
});

