import { memo, useCallback } from 'react';
import { Platform, FlatList, StyleSheet, View } from 'react-native';

import type { TrackId, TrackMetadata } from '@/constants/tracks';
import { TrackButton } from '@/components/track-button';

type TrackListHeaderComponent = React.ComponentType | React.ReactElement | null;

export type TrackGridProps = {
  data: ReadonlyArray<TrackMetadata>;
  selectedTrackIds: TrackId[];
  numColumns: number;
  onTrackPress: (track: TrackMetadata) => void;
  ListHeaderComponent?: TrackListHeaderComponent;
};

const TrackGridComponent = ({ 
  data, 
  selectedTrackIds,
  numColumns,
  onTrackPress,
  ListHeaderComponent,
 }: TrackGridProps) => {
  const paddedData = useMemo(() => {
    const items = [...data];
    const remainder = items.length % numColumns;
    if (remainder) {
      const fillers = numColumns - remainder;
      for (let i = 0; i < fillers; i += 1) items.push(null);
    }
    return items;
  }, [data, numColumns]);

  const renderItem = useCallback(
    ({ item }: { item: TrackMetadata | null }) => {
      const isSelected = selectedTrackIds.includes(item?.id);

      return ( 
        item ? (
          <TrackButton 
            track={item} 
            style={styles.trackButton} 
            accessibilityLabel={`${item.title} control`}
            onPress={onTrackPress}
            selected={isSelected}
          />
        ) : (
          <View pointerEvents="none" style={[styles.trackButton, styles.placeholder]} />
        )
    );
    },
    [onTrackPress, selectedTrackIds],
  );

  return (
    <FlatList
      data={paddedData}
      keyExtractor={(item, index) => (item ? item.id : `placeholder-${index}`)}
      numColumns={numColumns}
      columnWrapperStyle={styles.columnWrapper}
      contentContainerStyle={styles.contentContainer}
      ListHeaderComponent={ListHeaderComponent ?? undefined}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      extraData={selectedTrackIds}
    />
  );
};

export const TrackGrid = memo(TrackGridComponent);

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 24,
    rowGap: 18,
  },
  columnWrapper: {
    gap: 12,
  },
  trackButton: {
    flex: 1,
    aspectRatio: 1,
    ...(Platform.OS === 'web' ? { cursor: 'default' } : null),
  },
  placeholder: {
    opacity: 0,
  },
});

