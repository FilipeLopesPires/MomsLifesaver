/**
 * Tests for components/track-card.tsx (Batch 7).
 *
 * Guards the per-track tile: icon image rendering, press -> onPress(track)
 * forwarding, the 300 ms press-debounce that protects toggleTrack from double
 * triggers, volume-slider visibility tied to selection, and slider
 * onValueChange -> onVolumeChange(track, value) wiring.
 */

import React from 'react';
import { Image, TouchableOpacity } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/components/cross-platform-slider', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    CrossPlatformSlider: ({
      value,
      onValueChange,
    }: {
      value: number;
      onValueChange?: (value: number) => void;
    }) => (
      <View testID="mock-slider">
        <Text testID="mock-slider-value">{`value:${value}`}</Text>
        <Pressable
          testID="mock-slider-change"
          onPress={() => onValueChange?.(0.42)}
        />
      </View>
    ),
  };
});

import { TrackCard, type TrackCardProps } from '@/components/track-card';
import type { TrackMetadata } from '@/constants/tracks';

const ICON = { __stub: 'icon' } as unknown as number;

const makeTrack = (overrides: Partial<TrackMetadata> = {}): TrackMetadata =>
  ({
    id: 'rain',
    title: 'Rain',
    iconModule: ICON,
    audioModule: 1 as unknown as TrackMetadata['audioModule'],
    defaultVolume: 0.8,
    startTimes: [],
    ...overrides,
  }) as TrackMetadata;

const renderCard = (overrides: Partial<TrackCardProps> = {}) => {
  const props: TrackCardProps = {
    track: makeTrack(),
    isSelected: false,
    volume: 0.5,
    onPress: jest.fn(),
    onVolumeChange: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<TrackCard {...props} />) };
};

describe('TrackCard rendering', () => {
  it('renders the track icon from track.iconModule', () => {
    const track = makeTrack();
    renderCard({ track });
    const image = screen.UNSAFE_getByType(Image);
    expect(image.props.source).toBe(track.iconModule);
  });

  it('does not render the slider when not selected', () => {
    renderCard({ isSelected: false });
    expect(screen.queryByTestId('mock-slider')).toBeNull();
  });

  it('renders the slider with the current volume when selected', () => {
    renderCard({ isSelected: true, volume: 0.73 });
    expect(screen.getByTestId('mock-slider')).toBeTruthy();
    expect(screen.getByTestId('mock-slider-value').children[0]).toBe('value:0.73');
  });
});

describe('TrackCard press handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls onPress with the track on tap', () => {
    const onPress = jest.fn();
    const track = makeTrack();
    renderCard({ track, onPress });

    fireEvent.press(screen.UNSAFE_getByType(TouchableOpacity));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(track);
  });

  it('ignores a second press within the 300ms debounce window', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);

    const onPress = jest.fn();
    renderCard({ onPress });

    const touchable = screen.UNSAFE_getByType(TouchableOpacity);
    fireEvent.press(touchable);

    nowSpy.mockReturnValue(1_100);
    fireEvent.press(touchable);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires again after the 300ms debounce window elapses', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);

    const onPress = jest.fn();
    renderCard({ onPress });

    const touchable = screen.UNSAFE_getByType(TouchableOpacity);
    fireEvent.press(touchable);

    nowSpy.mockReturnValue(1_500);
    fireEvent.press(touchable);

    expect(onPress).toHaveBeenCalledTimes(2);
  });
});

describe('TrackCard volume forwarding', () => {
  it('calls onVolumeChange with the track and slider value when selected', () => {
    const onVolumeChange = jest.fn();
    const track = makeTrack();
    renderCard({ track, isSelected: true, onVolumeChange });

    fireEvent.press(screen.getByTestId('mock-slider-change'));

    expect(onVolumeChange).toHaveBeenCalledTimes(1);
    expect(onVolumeChange).toHaveBeenCalledWith(track, 0.42);
  });
});
