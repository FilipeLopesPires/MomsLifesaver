import Slider from '@react-native-community/slider';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Typography } from '@/constants/theme';

export type PlaybackControlsBarProps = {
  // Track selection info
  selectedTracksCount: number;
  selectedTrackNames: string[];
  // Play/Pause controls
  isPlaying: boolean;
  onToggle: () => void;
  onStop: () => void;
  // Volume controls
  volume: number;
  onVolumeChange: (value: number) => void;
};

const PlaybackControlsBarComponent = ({ 
  selectedTracksCount,
  selectedTrackNames,
  isPlaying, 
  onToggle, 
  onStop,
  volume, 
  onVolumeChange 
}: PlaybackControlsBarProps) => {
  const isDisabled = selectedTracksCount === 0;
  const volumePercentage = Math.round(volume * 100);

  const getTrackCountText = () => {
    if (selectedTracksCount === 0) {
      return 'No tracks selected';
    }
    return `${selectedTracksCount} track${selectedTracksCount > 1 ? 's' : ''} selected`;
  };

  return (
    <View style={styles.container}>
      {/* Track Selection Section */}
      <View style={styles.trackSelectionSection}>
        <Text style={styles.trackSelectionTitle} numberOfLines={1}>
          {getTrackCountText()}
        </Text>
        <Text style={styles.trackSelectionLabel} numberOfLines={2}>
          {selectedTrackNames.length > 0 ? selectedTrackNames.join(', ') : 'Press on a track above to select it'}
        </Text>
      </View>

      {/* Play/Pause Button and Volume Control Section */}
      <View style={styles.controlsRow}>
        <TouchableOpacity 
          style={[styles.playButton, isDisabled && styles.buttonDisabled]} 
          onPress={onToggle} 
          activeOpacity={0.7}
          disabled={isDisabled}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={24}
            color={isDisabled ? Colors.textSecondary : Colors.accent}
          />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.stopButton, isDisabled && styles.buttonDisabled]} 
          onPress={onStop} 
          activeOpacity={0.7}
          disabled={isDisabled}
        >
          <Ionicons
            name="stop"
            size={24}
            color={isDisabled ? Colors.textSecondary : Colors.accent}
          />
        </TouchableOpacity>

        <View style={styles.volumeSection}>
          <View style={styles.volumeHeader}>
            <Text style={styles.volumeLabel}>Master volume</Text>
            <Text style={styles.volumePercentage}>{volumePercentage}%</Text>
          </View>
          <Slider
            value={volume}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            onValueChange={onVolumeChange}
            minimumTrackTintColor={Colors.accent}
            maximumTrackTintColor={Colors.border}
            thumbTintColor={Colors.accent}
          />
        </View>
      </View>
    </View>
  );
};

export const PlaybackControlsBar = memo(PlaybackControlsBarComponent);

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceActive,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 16,
  },
  trackSelectionSection: {
    gap: 4,
  },
  trackSelectionLabel: {
    ...Typography.hint,
  },
  trackSelectionTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 48,
  },
  stopButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 48,
  },
  buttonDisabled: {
    backgroundColor: Colors.surface,
    opacity: 0.5,
  },
  volumeSection: {
    flex: 1,
    gap: 8,
  },
  volumeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volumeLabel: {
    ...Typography.hint,
  },
  volumePercentage: {
    ...Typography.hint,
    color: Colors.textSecondary,
  },
});
