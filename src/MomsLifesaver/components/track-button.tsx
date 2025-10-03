import { forwardRef, memo } from 'react';
import { Image, Platform, StyleSheet, TouchableOpacity, View, type TouchableOpacityProps } from 'react-native';

import type { TrackMetadata } from '@/constants/tracks';
import { Colors } from '@/constants/theme';

export type TrackButtonProps = {
  track: TrackMetadata;
  selected?: boolean;
  onPress?: (track: TrackMetadata) => void;
} & Omit<TouchableOpacityProps, 'onPress'>;

const TrackButtonComponent = forwardRef<TouchableOpacity, TrackButtonProps>(
  ({ track, onPress, selected = false, style, ...touchableProps }, ref) => {
    const { onPress: touchableOnPress, ...restTouchableProps } = touchableProps;

    return (
      <TouchableOpacity
        ref={ref}
        activeOpacity={0.85}
        onPress={(event) => {
          touchableOnPress?.(event);
          onPress?.(track);
        }}
        accessibilityState={{ selected }}
        style={[styles.container, style]}
        {...restTouchableProps}
      >
        <Image source={track.iconModule} style={[styles.icon, styles.iconTint]} resizeMode="cover" />
        {selected ? <View pointerEvents="none" style={styles.selectionOutline} /> : null}
      </TouchableOpacity>
    );
  },
);

TrackButtonComponent.displayName = 'TrackButton';

export const TrackButton = memo(TrackButtonComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { cursor: 'default' } : null),
  },
  icon: {
    width: '100%',
    height: '100%',
  },
  iconTint: {
    tintColor: Colors.textPrimary, 
  },
  selectionOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderRadius: 24,
    borderColor: Colors.borderActive,
  },
});

