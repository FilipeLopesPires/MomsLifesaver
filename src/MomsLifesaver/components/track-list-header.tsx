import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Typography } from '@/constants/theme';

const TrackListHeaderComponent = () => {
  return (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle}>Moms Lifesaver</Text>
      <Text style={styles.headerSubtitle}>Layer calming tracks to build a bedtime atmosphere.</Text>
    </View>
  );
};

export const TrackListHeader = memo(TrackListHeaderComponent);

const styles = StyleSheet.create({
  headerContainer: {
    marginBottom: 24,
  },
  headerTitle: {
    ...Typography.title,
    marginBottom: 4,
  },
  headerSubtitle: {
    ...Typography.hint,
    color: Colors.textSecondary,
  },
});

