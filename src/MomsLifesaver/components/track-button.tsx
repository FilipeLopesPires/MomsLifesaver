import { forwardRef, memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, type TouchableOpacityProps, View } from 'react-native';

import type { TrackMetadata } from '@/constants/tracks';
import { Colors, Typography } from '@/constants/theme';

export type TrackButtonProps = {
  track: TrackMetadata;
} & TouchableOpacityProps;

const TrackButtonComponent = forwardRef<TouchableOpacity, TrackButtonProps>(
  ({ track, onPress, style, ...touchableProps }, ref) => {
    return (
      <TouchableOpacity
        ref={ref}
        activeOpacity={0.85}
        onPress={(event) => {
          touchableProps.onPress?.(event);
          onPress?.(track);
        }}
        style={[styles.container, style]}
        {...touchableProps}
      >
        <View style={styles.iconBackground}>
          <Image source={track.iconModule} style={styles.icon} resizeMode="contain" />
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {track.title}
        </Text>
      </TouchableOpacity>
    );
  },
);

TrackButtonComponent.displayName = 'TrackButton';

export const TrackButton = memo(TrackButtonComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  iconBackground: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.surfaceActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: '70%',
    height: '70%',
  },
  label: {
    ...Typography.label,
    textAlign: 'center',
  },
});

