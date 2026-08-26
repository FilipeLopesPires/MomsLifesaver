/**
 * Presentational building blocks for the Settings screen.
 *
 * `SettingsRow` lays out a title + optional subtitle with a control on the
 * right. `SettingsSwitch` and `SettingsButton` are the two controls used
 * today. Styling mirrors the switch/row tokens from `sleep-timer-bar.tsx` and
 * the theme in `constants/theme.ts`. Pure presentation - no state lives here.
 */
import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Typography } from '@/constants/theme';

export type SettingsRowProps = {
  title: string;
  subtitle?: string;
  control?: ReactNode;
  testID?: string;
};

const SettingsRowComponent = ({ title, subtitle, control, testID }: SettingsRowProps) => (
  <View style={styles.row} testID={testID}>
    <View style={styles.rowText}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    {control ? <View style={styles.rowControl}>{control}</View> : null}
  </View>
);

export const SettingsRow = memo(SettingsRowComponent);

export type SettingsSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
  accessibilityLabel?: string;
};

export const SettingsSwitch = ({
  value,
  onValueChange,
  testID,
  accessibilityLabel,
}: SettingsSwitchProps) => (
  <TouchableOpacity
    testID={testID}
    style={[styles.switchTrack, value && styles.switchTrackOn]}
    onPress={() => onValueChange(!value)}
    activeOpacity={0.7}
    accessibilityRole="switch"
    accessibilityState={{ checked: value }}
    accessibilityLabel={accessibilityLabel}
  >
    <View style={[styles.switchKnob, value && styles.switchKnobOn]} />
  </TouchableOpacity>
);

export type SettingsButtonProps = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  testID?: string;
};

export const SettingsButton = ({
  label,
  onPress,
  icon,
  destructive,
  testID,
}: SettingsButtonProps) => (
  <TouchableOpacity
    testID={testID}
    style={[styles.button, destructive && styles.buttonDestructive]}
    onPress={onPress}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    {icon ? (
      <Ionicons name={icon} size={18} color={destructive ? Colors.danger : Colors.accent} />
    ) : null}
    <Text style={[styles.buttonLabel, destructive && styles.buttonLabelDestructive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  rowSubtitle: {
    ...Typography.hint,
  },
  rowControl: {
    flexShrink: 0,
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accent,
  },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.textSecondary,
  },
  switchKnobOn: {
    backgroundColor: Colors.accent,
    alignSelf: 'flex-end',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonDestructive: {
    borderColor: Colors.danger,
  },
  buttonLabel: {
    ...Typography.label,
    color: Colors.accent,
  },
  buttonLabelDestructive: {
    color: Colors.danger,
  },
});
