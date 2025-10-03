import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Typography } from '@/constants/theme';

export type TrackSelectionBarProps = {
  lastSelectedTrackTitle?: string;
};

const TrackSelectionBarComponent = ({ lastSelectedTrackTitle }: TrackSelectionBarProps) => {
  return (
    <View style={styles.bottomBar}>
      <Text style={styles.bottomBarLabel}>Last selected</Text>
      <Text style={styles.bottomBarTitle} numberOfLines={1}>
        {lastSelectedTrackTitle ?? 'No track selected'}
      </Text>
    </View>
  );
};

export const TrackSelectionBar = memo(TrackSelectionBarComponent);

const styles = StyleSheet.create({
  bottomBar: {
    backgroundColor: Colors.surfaceActive,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 12,
  },
  bottomBarLabel: {
    ...Typography.hint,
  },
  bottomBarTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
});

