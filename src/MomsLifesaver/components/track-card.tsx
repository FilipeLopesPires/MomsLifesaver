import Slider from '@react-native-community/slider';
import { memo, useCallback } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { TrackMetadata } from '@/constants/tracks';
import { Colors, Typography } from '@/constants/theme';

export type TrackCardProps = {
  track: TrackMetadata;
  isSelected: boolean;
  volume: number;
  onPress: (track: TrackMetadata) => void;
  onVolumeChange: (track: TrackMetadata, value: number) => void;
};

const TrackCardComponent = ({ track, isSelected, volume, onPress, onVolumeChange }: TrackCardProps) => {
  const handlePress = useCallback(() => {
    onPress(track);
  }, [onPress, track]);

  const handleVolumeChange = useCallback(
    (value: number) => {
      onVolumeChange(track, value);
    },
    [onVolumeChange, track],
  );

  return (
    <View style={[styles.container, isSelected && styles.containerSelected]}>
        <View style={styles.cardContainer}>
            <TouchableOpacity
                activeOpacity={0.85}
                accessibilityState={{ selected: isSelected }}
                onPress={handlePress}
                style={styles.iconWrapper}
            >
                <Image source={track.iconModule} style={[styles.icon, styles.iconTint]} resizeMode="cover" />
                {isSelected ? <View pointerEvents="none" style={styles.selectionOutline} /> : null}
            </TouchableOpacity>
            {isSelected ? (
                <View style={styles.sliderSection}>
                    <View></View>
                    {/*
                    <View style={styles.sliderHeader}>
                        <Text style={styles.sliderLabel}>Volume</Text>
                        <Text style={styles.sliderValue}>{`${Math.round(volume * 100)}%`}</Text>
                    </View>
                    */}
                    <Slider
                        value={volume}
                        minimumValue={0}
                        maximumValue={1}
                        step={0.01}
                        onValueChange={handleVolumeChange}
                        minimumTrackTintColor={Colors.accent}
                        maximumTrackTintColor={Colors.border}
                        thumbTintColor={Colors.accent}
                    />
                </View>
            ) : null}
        </View>
        {isSelected ? null : (<View style={styles.sliderEmptySection}></View>)}
    </View>
  );
};

export const TrackCard = memo(TrackCardComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  cardContainer: {
    borderRadius: 24,
    backgroundColor: Colors.surface,
  },
  containerSelected: {
    paddingBottom: 20,
  },
  iconWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  icon: {
    width: '80%',
    height: '80%',
    alignSelf: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'default' } : null),
  },
  iconTint: {
    tintColor: Colors.textPrimary,
  },
  selectionOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderRadius: 16,
    borderColor: Colors.borderActive,
  },
  sliderSection: {
    paddingLeft: 16,
    paddingRight: 16,
    gap: 8,
    height: 0,
  },
  sliderEmptySection: {
    height: 10,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderLabel: {
    ...Typography.hint,
  },
  sliderValue: {
    ...Typography.hint,
    color: Colors.textSecondary,
  },
});


