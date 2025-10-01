import { FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { TRACK_LIBRARY } from '@/constants/tracks';
import { Colors, Typography } from '@/constants/theme';
import { TrackButton } from '@/components/track-button';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={TRACK_LIBRARY}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.contentContainer}
        ListHeaderComponent={<FlatListHeader />}
        renderItem={({ item }) => (
          <TrackButton
            track={item}
            style={styles.trackButton}
            accessibilityLabel={`${item.title} control`}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
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
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
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
  },
});

