/**
 * Tests for components/sleep-timer-bar.tsx.
 *
 * Guards the sleep-timer footer bar's three visual states (disabled, idle with
 * steppers, running with countdown) and that its controls forward the right
 * values: toggle, per-field duration steps, start (with the canStart gate), and
 * cancel. Icons are stubbed so the test focuses on this component.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

import { SleepTimerBar, type SleepTimerBarProps } from '@/components/sleep-timer-bar';
import { MAX_DURATION_SEC, MIN_DURATION_SEC } from '@/utils/duration';

const baseProps = (overrides: Partial<SleepTimerBarProps> = {}): SleepTimerBarProps => ({
  enabled: false,
  status: 'idle',
  durationSec: 900, // 00h 15m 00s
  remainingMs: 0,
  canStart: true,
  onToggleEnabled: jest.fn(),
  onChangeDuration: jest.fn(),
  onStart: jest.fn(),
  onCancel: jest.fn(),
  ...overrides,
});

describe('disabled state', () => {
  it('shows only the header + toggle, no steppers or start', () => {
    render(<SleepTimerBar {...baseProps({ enabled: false })} />);

    expect(screen.getByText('Sleep timer')).toBeTruthy();
    expect(screen.getByTestId('sleep-timer-toggle')).toBeTruthy();
    expect(screen.queryByTestId('sleep-timer-hours-inc')).toBeNull();
    expect(screen.queryByTestId('sleep-timer-start')).toBeNull();
  });

  it('requests enabling when the toggle is pressed', () => {
    const onToggleEnabled = jest.fn();
    render(<SleepTimerBar {...baseProps({ enabled: false, onToggleEnabled })} />);

    fireEvent.press(screen.getByTestId('sleep-timer-toggle'));
    expect(onToggleEnabled).toHaveBeenCalledWith(true);
  });

  it('requests disabling when the toggle is pressed while enabled', () => {
    const onToggleEnabled = jest.fn();
    render(<SleepTimerBar {...baseProps({ enabled: true, onToggleEnabled })} />);

    fireEvent.press(screen.getByTestId('sleep-timer-toggle'));
    expect(onToggleEnabled).toHaveBeenCalledWith(false);
  });
});

describe('idle state (enabled)', () => {
  it('renders the H/M/S steppers for the current duration', () => {
    render(<SleepTimerBar {...baseProps({ enabled: true, durationSec: 900 })} />);

    expect(screen.getByText('hrs')).toBeTruthy();
    expect(screen.getByText('min')).toBeTruthy();
    expect(screen.getByText('sec')).toBeTruthy();
    // 00h 15m 00s
    expect(screen.getByText('15')).toBeTruthy();
  });

  it.each([
    ['sleep-timer-hours-inc', 900 + 3600],
    ['sleep-timer-hours-dec', 900 - 3600],
    ['sleep-timer-minutes-inc', 900 + 60],
    ['sleep-timer-minutes-dec', 900 - 60],
    ['sleep-timer-seconds-inc', 900 + 5],
    ['sleep-timer-seconds-dec', 900 - 5],
  ] as const)('%s asks the parent for %i seconds', (testID, expected) => {
    const onChangeDuration = jest.fn();
    render(<SleepTimerBar {...baseProps({ enabled: true, durationSec: 900, onChangeDuration })} />);

    fireEvent.press(screen.getByTestId(testID));
    expect(onChangeDuration).toHaveBeenCalledWith(expected);
  });

  it('starts the timer when Start is pressed and something is playing', () => {
    const onStart = jest.fn();
    render(<SleepTimerBar {...baseProps({ enabled: true, canStart: true, onStart })} />);

    fireEvent.press(screen.getByTestId('sleep-timer-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('does not start when nothing is playing (canStart=false)', () => {
    const onStart = jest.fn();
    render(<SleepTimerBar {...baseProps({ enabled: true, canStart: false, onStart })} />);

    fireEvent.press(screen.getByTestId('sleep-timer-start'));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('disables the increment steppers at the maximum duration', () => {
    const onChangeDuration = jest.fn();
    render(
      <SleepTimerBar
        {...baseProps({ enabled: true, durationSec: MAX_DURATION_SEC, onChangeDuration })}
      />,
    );

    fireEvent.press(screen.getByTestId('sleep-timer-hours-inc'));
    fireEvent.press(screen.getByTestId('sleep-timer-minutes-inc'));
    expect(onChangeDuration).not.toHaveBeenCalled();
    // Decrement is still available at the top of the range.
    fireEvent.press(screen.getByTestId('sleep-timer-hours-dec'));
    expect(onChangeDuration).toHaveBeenCalledWith(MAX_DURATION_SEC - 3600);
  });

  it('disables the decrement steppers at the minimum duration', () => {
    const onChangeDuration = jest.fn();
    render(
      <SleepTimerBar
        {...baseProps({ enabled: true, durationSec: MIN_DURATION_SEC, onChangeDuration })}
      />,
    );

    fireEvent.press(screen.getByTestId('sleep-timer-seconds-dec'));
    fireEvent.press(screen.getByTestId('sleep-timer-minutes-dec'));
    expect(onChangeDuration).not.toHaveBeenCalled();
    // Increment is still available at the bottom of the range.
    fireEvent.press(screen.getByTestId('sleep-timer-seconds-inc'));
    expect(onChangeDuration).toHaveBeenCalledWith(MIN_DURATION_SEC + 5);
  });
});

describe('running state', () => {
  it('shows the countdown and the original duration', () => {
    render(
      <SleepTimerBar
        {...baseProps({
          enabled: true,
          status: 'running',
          durationSec: 900,
          remainingMs: 125_000, // 2m 05s left
        })}
      />,
    );

    expect(screen.getByTestId('sleep-timer-countdown').children[0]).toBe('02:05');
    expect(screen.getByText('of 15:00')).toBeTruthy();
    expect(screen.queryByTestId('sleep-timer-hours-inc')).toBeNull();
  });

  it('cancels when Cancel is pressed', () => {
    const onCancel = jest.fn();
    render(
      <SleepTimerBar
        {...baseProps({ enabled: true, status: 'running', remainingMs: 5_000, onCancel })}
      />,
    );

    fireEvent.press(screen.getByTestId('sleep-timer-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
