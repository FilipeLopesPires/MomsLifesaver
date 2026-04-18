/**
 * Tests for components/cross-platform-slider.tsx on native platforms (Batch 6).
 *
 * The community slider is mocked so the test can verify prop forwarding and
 * onValueChange plumbing without relying on the native host component.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@react-native-community/slider', () => {
  const { Pressable, Text, View } = require('react-native');
  const Slider = (props: {
    value: number;
    minimumValue: number;
    maximumValue: number;
    onValueChange?: (value: number) => void;
    minimumTrackTintColor?: string;
    maximumTrackTintColor?: string;
    thumbTintColor?: string;
  }) => (
    <View testID="native-slider">
      <Text testID="native-slider-value">{`value:${props.value}`}</Text>
      <Text testID="native-slider-min">{`min:${props.minimumValue}`}</Text>
      <Text testID="native-slider-max">{`max:${props.maximumValue}`}</Text>
      <Text testID="native-slider-min-tint">{`minTint:${props.minimumTrackTintColor ?? ''}`}</Text>
      <Text testID="native-slider-max-tint">{`maxTint:${props.maximumTrackTintColor ?? ''}`}</Text>
      <Text testID="native-slider-thumb-tint">{`thumbTint:${props.thumbTintColor ?? ''}`}</Text>
      <Pressable
        testID="native-slider-change"
        onPress={() => props.onValueChange?.(0.75)}
      />
    </View>
  );
  return { __esModule: true, default: Slider };
});

import { CrossPlatformSlider } from '@/components/cross-platform-slider';

describe('CrossPlatformSlider (native)', () => {
  it('renders the native community slider', () => {
    render(<CrossPlatformSlider value={0.4} minimumValue={0} maximumValue={1} />);
    expect(screen.getByTestId('native-slider')).toBeTruthy();
  });

  it('forwards value, minimumValue, and maximumValue', () => {
    render(<CrossPlatformSlider value={0.4} minimumValue={0} maximumValue={1} />);
    expect(screen.getByTestId('native-slider-value').children[0]).toBe('value:0.4');
    expect(screen.getByTestId('native-slider-min').children[0]).toBe('min:0');
    expect(screen.getByTestId('native-slider-max').children[0]).toBe('max:1');
  });

  it('forwards tint-color props through to the community slider', () => {
    render(
      <CrossPlatformSlider
        value={0.5}
        minimumValue={0}
        maximumValue={1}
        minimumTrackTintColor="#111111"
        maximumTrackTintColor="#222222"
        thumbTintColor="#333333"
      />,
    );
    expect(screen.getByTestId('native-slider-min-tint').children[0]).toBe('minTint:#111111');
    expect(screen.getByTestId('native-slider-max-tint').children[0]).toBe('maxTint:#222222');
    expect(screen.getByTestId('native-slider-thumb-tint').children[0]).toBe('thumbTint:#333333');
  });

  it('forwards onValueChange invocations from the native slider', () => {
    const onValueChange = jest.fn();
    render(
      <CrossPlatformSlider
        value={0.5}
        minimumValue={0}
        maximumValue={1}
        onValueChange={onValueChange}
      />,
    );
    fireEvent.press(screen.getByTestId('native-slider-change'));
    expect(onValueChange).toHaveBeenCalledWith(0.75);
  });
});
