import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Typography } from '@/constants/theme';

export type GlobalPlayPauseBarProps = {
  isPlaying: boolean;
  onToggle: () => void;
  selectedTracksCount: number;
};

const GlobalPlayPauseBarComponent = ({ isPlaying, onToggle, selectedTracksCount }: GlobalPlayPauseBarProps) => {
  const getButtonText = () => {
    if (selectedTracksCount === 0) {
      return 'No tracks selected';
    }
    return isPlaying ? `Pause ${selectedTracksCount} track${selectedTracksCount > 1 ? 's' : ''}` : `Play ${selectedTracksCount} track${selectedTracksCount > 1 ? 's' : ''}`;
  };

  const isDisabled = selectedTracksCount === 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.button, isDisabled && styles.buttonDisabled]} 
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
    </View>
  );
};

export const GlobalPlayPauseBar = memo(GlobalPlayPauseBarComponent);

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceActive,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  button: {
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
});
