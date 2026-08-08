/**
 * Single-track tile rendered inside the playlist grid.
 *
 * Tapping the icon toggles selection (delegated to `onPress`). When
 * selected, the card reveals a per-track volume slider. Taps are
 * debounced by `PRESS_DEBOUNCE_MS` to avoid double-toggle glitches when
 * users press the icon rapidly.
 */
import { memo, useCallback, useRef } from 'react';
import { Image, type ImageStyle, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { CrossPlatformSlider } from '@/components/cross-platform-slider';

import type { TrackMetadata } from '@/constants/tracks';
import { Colors } from '@/constants/theme';

const PRESS_DEBOUNCE_MS = 300;

export type TrackCardProps = {
  track: TrackMetadata;
  isSelected: boolean;
  volume: number;
  onPress: (track: TrackMetadata) => void;
  onVolumeChange: (track: TrackMetadata, value: number) => void;
};

const TrackCardComponent = ({ track, isSelected, volume, onPress, onVolumeChange }: TrackCardProps) => {
  const lastPressTime = useRef(0);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastPressTime.current < PRESS_DEBOUNCE_MS) {
      return;
    }
    lastPressTime.current = now;
    onPress(track);
  }, [onPress, track]);

  const handleVolumeChange = useCallback(
    (value: number) => {
      onVolumeChange(track, value);
    },
    [onVolumeChange, track],
  );

  return (
    <View style={styles.container}>
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
        </View>
        <View style={styles.sliderSlot}>
            {isSelected ? (
                <CrossPlatformSlider
                    value={volume}
                    minimumValue={0}
                    maximumValue={1}
                    onValueChange={handleVolumeChange}
                    minimumTrackTintColor={Colors.accent}
                    maximumTrackTintColor={Colors.border}
                    thumbTintColor={Colors.accent}
                />
            ) : null}
        </View>
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
    // react-native-web honours `cursor` on images at runtime, but expo's
    // web type augmentation only adds it to ViewStyle/TextStyle - never to
    // ImageStyle - so the cast is closing a types gap, not silencing a bug.
    ...(Platform.OS === 'web' ? { cursor: 'default' } : null),
  } as ImageStyle,
  iconTint: {
    tintColor: Colors.textPrimary,
  },
  selectionOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderRadius: 16,
    borderColor: Colors.borderActive,
  },
  sliderSlot: {
    height: 15,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
});


