import Slider from '@react-native-community/slider';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Typography } from '@/constants/theme';

export type PlaybackControlsBarProps = {
  // Track selection info
  lastSelectedTrackTitle?: string;
  // Play/Pause controls
  isPlaying: boolean;
  onToggle: () => void;
  selectedTracksCount: number;
  // Volume controls
  volume: number;
  onVolumeChange: (value: number) => void;
};

const PlaybackControlsBarComponent = ({ 
  lastSelectedTrackTitle,
  isPlaying, 
  onToggle, 
  selectedTracksCount, 
  volume, 
  onVolumeChange 
}: PlaybackControlsBarProps) => {
  const getButtonText = () => {
    if (selectedTracksCount === 0) {
      return 'No tracks selected';
    }
    return isPlaying ? `Pause ${selectedTracksCount} track${selectedTracksCount > 1 ? 's' : ''}` : `Play ${selectedTracksCount} track${selectedTracksCount > 1 ? 's' : ''}`;
  };

  const isDisabled = selectedTracksCount === 0;
  const volumePercentage = Math.round(volume * 100);

  return (
    <View style={styles.container}>
      {/* Track Selection Section */}
      <View style={styles.trackSelectionSection}>
        <Text style={styles.trackSelectionLabel}>Last selected</Text>
        <Text style={styles.trackSelectionTitle} numberOfLines={1}>
          {lastSelectedTrackTitle ?? 'No track selected'}
        </Text>
      </View>

      {/* Play/Pause Button Section */}
      <TouchableOpacity 
        style={[styles.playButton, isDisabled && styles.buttonDisabled]} 
        onPress={onToggle} 
        activeOpacity={0.7}
        disabled={isDisabled}
      >
        <View style={styles.buttonContent}>
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={24}
            color={isDisabled ? Colors.textSecondary : Colors.accent}
          />
          <Text style={[styles.buttonText, isDisabled && styles.buttonTextDisabled]}>
            {getButtonText()}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Volume Control Section */}
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
  playButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    ...Typography.label,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: Colors.surface,
    opacity: 0.5,
  },
  buttonTextDisabled: {
    color: Colors.textSecondary,
  },
  volumeSection: {
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
