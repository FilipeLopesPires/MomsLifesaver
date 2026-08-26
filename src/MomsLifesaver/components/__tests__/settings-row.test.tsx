/**
 * Tests for components/settings-row.tsx.
 *
 * Pure presentation: SettingsRow lays out title/subtitle/control; SettingsSwitch
 * toggles; SettingsButton fires onPress. We assert the rendered structure and
 * the interaction wiring, not styling.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});

import { SettingsButton, SettingsRow, SettingsSwitch } from '@/components/settings-row';

describe('SettingsRow', () => {
  it('renders title, subtitle and control', () => {
    render(
      <SettingsRow
        testID="row"
        title="Background audio"
        subtitle="Keep playing in the background"
        control={<SettingsSwitch value={false} onValueChange={jest.fn()} testID="sw" />}
      />,
    );

    expect(screen.getByText('Background audio')).toBeTruthy();
    expect(screen.getByText('Keep playing in the background')).toBeTruthy();
    expect(screen.getByTestId('sw')).toBeTruthy();
  });

  it('renders without a subtitle or control', () => {
    render(<SettingsRow testID="row" title="Just a title" />);
    expect(screen.getByText('Just a title')).toBeTruthy();
    expect(screen.queryByText('Keep playing in the background')).toBeNull();
  });
});

describe('SettingsSwitch', () => {
  it('reflects its value via accessibilityState', () => {
    render(<SettingsSwitch value onValueChange={jest.fn()} testID="sw" />);
    expect(screen.getByTestId('sw').props.accessibilityState).toEqual({ checked: true });
  });

  it('toggles to the opposite value on press', () => {
    const onValueChange = jest.fn();
    render(<SettingsSwitch value={false} onValueChange={onValueChange} testID="sw" />);
    fireEvent.press(screen.getByTestId('sw'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('toggles from on to off', () => {
    const onValueChange = jest.fn();
    render(<SettingsSwitch value onValueChange={onValueChange} testID="sw" />);
    fireEvent.press(screen.getByTestId('sw'));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });
});

describe('SettingsButton', () => {
  it('renders its label and fires onPress', () => {
    const onPress = jest.fn();
    render(<SettingsButton label="Allow" onPress={onPress} testID="btn" />);
    expect(screen.getByText('Allow')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders an icon when provided', () => {
    render(
      <SettingsButton label="Reset" icon="refresh-outline" destructive onPress={jest.fn()} testID="btn" />,
    );
    expect(screen.getByTestId('icon-refresh-outline')).toBeTruthy();
  });

  it('renders without an icon', () => {
    render(<SettingsButton label="Plain" onPress={jest.fn()} testID="btn" />);
    expect(screen.getByText('Plain')).toBeTruthy();
    expect(screen.queryByTestId('icon-refresh-outline')).toBeNull();
  });
});
