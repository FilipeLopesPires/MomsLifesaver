import Slider from '@react-native-community/slider';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Typography } from '@/constants/theme';

export type MasterVolumeSliderProps = {
  value: number;
  onChange: (value: number) => void;
};

const MasterVolumeSliderComponent = ({ value, onChange }: MasterVolumeSliderProps) => {
  const percentage = Math.round(value * 100);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Master volume</Text>
        <Text style={styles.percentage}>{percentage}%</Text>
      </View>
      <Slider
        value={value}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        onValueChange={onChange}
        minimumTrackTintColor={Colors.accent}
        maximumTrackTintColor={Colors.border}
        thumbTintColor={Colors.accent}
      />
    </View>
  );
};

export const MasterVolumeSlider = memo(MasterVolumeSliderComponent);

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceActive,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...Typography.hint,
  },
  percentage: {
    ...Typography.hint,
    color: Colors.textSecondary,
  },
});


