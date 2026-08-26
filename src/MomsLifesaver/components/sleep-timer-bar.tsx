/**
 * Sleep-timer bar shown below the playback controls on the playlist screen.
 *
 * Lets the user enable a fade timer, dial in a duration with H:MM:SS steppers,
 * and start it; while running it shows the countdown and a cancel control. Pure
 * presentation - all state lives in `hooks/use-sleep-timer.ts` and reaches this
 * component through props. Mirrors the layout/tokens of `playback-controls-bar`.
 */
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Typography } from '@/constants/theme';
import type { SleepTimerStatus } from '@/hooks/use-sleep-timer';
import {
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  formatDuration,
  secondsToHms,
} from '@/utils/duration';

export type SleepTimerBarProps = {
  enabled: boolean;
  status: SleepTimerStatus;
  durationSec: number;
  remainingMs: number;
  /** Whether starting makes sense (something is actually playing to fade). */
  canStart: boolean;
  onToggleEnabled: (value: boolean) => void;
  onChangeDuration: (seconds: number) => void;
  onStart: () => void;
  onCancel: () => void;
};

const pad2 = (value: number): string => value.toString().padStart(2, '0');

type StepperColumnProps = {
  label: string;
  value: number;
  incDisabled: boolean;
  decDisabled: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  testIDPrefix: string;
};

const StepperColumn = ({
  label,
  value,
  incDisabled,
  decDisabled,
  onIncrement,
  onDecrement,
  testIDPrefix,
}: StepperColumnProps) => (
  <View style={styles.stepperColumn}>
    <TouchableOpacity
      testID={`${testIDPrefix}-inc`}
      style={[styles.stepperButton, incDisabled && styles.stepperButtonDisabled]}
      onPress={onIncrement}
      activeOpacity={0.7}
      disabled={incDisabled}
    >
      <Ionicons
        name="chevron-up"
        size={20}
        color={incDisabled ? Colors.textSecondary : Colors.accent}
      />
    </TouchableOpacity>

    <Text style={styles.stepperValue}>{pad2(value)}</Text>
    <Text style={styles.stepperUnit}>{label}</Text>

    <TouchableOpacity
      testID={`${testIDPrefix}-dec`}
      style={[styles.stepperButton, decDisabled && styles.stepperButtonDisabled]}
      onPress={onDecrement}
      activeOpacity={0.7}
      disabled={decDisabled}
    >
      <Ionicons
        name="chevron-down"
        size={20}
        color={decDisabled ? Colors.textSecondary : Colors.accent}
      />
    </TouchableOpacity>
  </View>
);

const SleepTimerBarComponent = ({
  enabled,
  status,
  durationSec,
  remainingMs,
  canStart,
  onToggleEnabled,
  onChangeDuration,
  onStart,
  onCancel,
}: SleepTimerBarProps) => {
  const isRunning = status === 'running';
  const { h, m, s } = secondsToHms(durationSec);
  const atMax = durationSec >= MAX_DURATION_SEC;
  const atMin = durationSec <= MIN_DURATION_SEC;

  const changeBy = (deltaSec: number) => onChangeDuration(durationSec + deltaSec);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Sleep timer</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {isRunning ? 'Fading volume to silence' : 'Fades the volume out, then pauses'}
          </Text>
        </View>

        <TouchableOpacity
          testID="sleep-timer-toggle"
          style={[styles.switchTrack, enabled && styles.switchTrackOn]}
          onPress={() => onToggleEnabled(!enabled)}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled }}
        >
          <View style={[styles.switchKnob, enabled && styles.switchKnobOn]} />
        </TouchableOpacity>
      </View>

      {enabled && !isRunning && (
        <View style={styles.controlsRow}>
          <View style={styles.steppers}>
            <StepperColumn
              label="hrs"
              value={h}
              incDisabled={atMax}
              decDisabled={atMin}
              onIncrement={() => changeBy(3600)}
              onDecrement={() => changeBy(-3600)}
              testIDPrefix="sleep-timer-hours"
            />
            <Text style={styles.stepperSeparator}>:</Text>
            <StepperColumn
              label="min"
              value={m}
              incDisabled={atMax}
              decDisabled={atMin}
              onIncrement={() => changeBy(60)}
              onDecrement={() => changeBy(-60)}
              testIDPrefix="sleep-timer-minutes"
            />
            <Text style={styles.stepperSeparator}>:</Text>
            <StepperColumn
              label="sec"
              value={s}
              incDisabled={atMax}
              decDisabled={atMin}
              onIncrement={() => changeBy(5)}
              onDecrement={() => changeBy(-5)}
              testIDPrefix="sleep-timer-seconds"
            />
          </View>

          <TouchableOpacity
            testID="sleep-timer-start"
            style={[styles.actionButton, !canStart && styles.actionButtonDisabled]}
            onPress={onStart}
            activeOpacity={0.7}
            disabled={!canStart}
          >
            <Ionicons
              name="timer-outline"
              size={20}
              color={canStart ? Colors.accent : Colors.textSecondary}
            />
            <Text style={[styles.actionLabel, !canStart && styles.actionLabelDisabled]}>Start</Text>
          </TouchableOpacity>
        </View>
      )}

      {isRunning && (
        <View style={styles.controlsRow}>
          <View style={styles.countdownSection}>
            <Text testID="sleep-timer-countdown" style={styles.countdown}>
              {formatDuration(Math.ceil(remainingMs / 1000))}
            </Text>
            <Text style={styles.countdownTotal}>{`of ${formatDuration(durationSec)}`}</Text>
          </View>

          <TouchableOpacity
            testID="sleep-timer-cancel"
            style={styles.actionButton}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={Colors.accent} />
            <Text style={styles.actionLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export const SleepTimerBar = memo(SleepTimerBarComponent);

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceActive,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.hint,
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  steppers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperColumn: {
    alignItems: 'center',
    gap: 4,
  },
  stepperButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepperButtonDisabled: {
    opacity: 0.5,
  },
  stepperValue: {
    ...Typography.label,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  stepperUnit: {
    ...Typography.hint,
    fontSize: 11,
  },
  stepperSeparator: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  countdownSection: {
    flex: 1,
    gap: 2,
  },
  countdown: {
    ...Typography.title,
    fontVariant: ['tabular-nums'],
  },
  countdownTotal: {
    ...Typography.hint,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    ...Typography.label,
    color: Colors.accent,
  },
  actionLabelDisabled: {
    color: Colors.textSecondary,
  },
});
