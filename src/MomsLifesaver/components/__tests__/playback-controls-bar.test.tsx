/**
 * Tests for components/playback-controls-bar.tsx (Batch 6).
 *
 * Guards the user-facing footer bar: selected-count copy, names fallback,
 * disabled state when nothing is selected, play/pause icon flip, volume %
 * rendering, and onVolumeChange forwarding.
 *
 * The slider and icons are stubbed so the test focuses on this component.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => (
      <Text testID={`icon-${name}`}>{name}</Text>
    ),
  };
});

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
        <Pressable
          testID="mock-slider-change"
          onPress={() => onValueChange?.(0.5)}
        >
          <Text>{`value:${value}`}</Text>
        </Pressable>
      </View>
    ),
  };
});

import { PlaybackControlsBar, type PlaybackControlsBarProps } from '@/components/playback-controls-bar';

const baseProps = (
  overrides: Partial<PlaybackControlsBarProps> = {},
): PlaybackControlsBarProps => ({
  selectedTracksCount: 0,
  selectedTrackNames: [],
  isPlaying: false,
  onToggle: jest.fn(),
  onStop: jest.fn(),
  volume: 1,
  onVolumeChange: jest.fn(),
  ...overrides,
});

describe('track-count copy', () => {
  it('shows "No tracks selected" when count is 0', () => {
    render(<PlaybackControlsBar {...baseProps({ selectedTracksCount: 0 })} />);
    expect(screen.getByText('No tracks selected')).toBeTruthy();
  });

  it('shows "1 track selected" when count is 1', () => {
    render(<PlaybackControlsBar {...baseProps({ selectedTracksCount: 1, selectedTrackNames: ['Rain'] })} />);
    expect(screen.getByText('1 track selected')).toBeTruthy();
  });

  it('shows "N tracks selected" when count is > 1', () => {
    render(<PlaybackControlsBar {...baseProps({ selectedTracksCount: 5 })} />);
    expect(screen.getByText('5 tracks selected')).toBeTruthy();
  });
});

describe('selected-names fallback', () => {
  it('shows the prompt when no tracks are named', () => {
    render(<PlaybackControlsBar {...baseProps()} />);
    expect(screen.getByText('Press on a track above to select it')).toBeTruthy();
  });

  it('joins the selected track names with ", "', () => {
    render(
      <PlaybackControlsBar
        {...baseProps({
          selectedTracksCount: 2,
          selectedTrackNames: ['Rain', 'Heartbeat'],
        })}
      />,
    );
    expect(screen.getByText('Rain, Heartbeat')).toBeTruthy();
  });
});

describe('disabled state when nothing is selected', () => {
  it('does not call onToggle when the play button is pressed', () => {
    const onToggle = jest.fn();
    render(
      <PlaybackControlsBar
        {...baseProps({ selectedTracksCount: 0, onToggle })}
      />,
    );

    const playIcon = screen.getByTestId('icon-play');
    // TouchableOpacity is the parent of the icon. Press it.
    fireEvent.press(playIcon.parent!);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not call onStop when the stop button is pressed', () => {
    const onStop = jest.fn();
    render(
      <PlaybackControlsBar
        {...baseProps({ selectedTracksCount: 0, onStop })}
      />,
    );

    const stopIcon = screen.getByTestId('icon-stop');
    fireEvent.press(stopIcon.parent!);

    expect(onStop).not.toHaveBeenCalled();
  });
});

describe('enabled state (at least one selected)', () => {
  it('calls onToggle when the play/pause button is pressed', () => {
    const onToggle = jest.fn();
    render(
      <PlaybackControlsBar
        {...baseProps({ selectedTracksCount: 1, selectedTrackNames: ['Rain'], onToggle })}
      />,
    );

    const icon = screen.getByTestId('icon-play');
    fireEvent.press(icon.parent!);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onStop when the stop button is pressed', () => {
    const onStop = jest.fn();
    render(
      <PlaybackControlsBar
        {...baseProps({ selectedTracksCount: 2, onStop })}
      />,
    );

    const icon = screen.getByTestId('icon-stop');
    fireEvent.press(icon.parent!);

    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe('play/pause icon', () => {
  it('renders the pause icon when isPlaying is true', () => {
    render(
      <PlaybackControlsBar {...baseProps({ selectedTracksCount: 1, isPlaying: true })} />,
    );
    expect(screen.getByTestId('icon-pause')).toBeTruthy();
    expect(screen.queryByTestId('icon-play')).toBeNull();
  });

  it('renders the play icon when isPlaying is false', () => {
    render(
      <PlaybackControlsBar {...baseProps({ selectedTracksCount: 1, isPlaying: false })} />,
    );
    expect(screen.getByTestId('icon-play')).toBeTruthy();
    expect(screen.queryByTestId('icon-pause')).toBeNull();
  });
});

describe('volume', () => {
  it('renders the volume percentage rounded to the nearest integer', () => {
    render(<PlaybackControlsBar {...baseProps({ volume: 0.42 })} />);
    expect(screen.getByText('42%')).toBeTruthy();
  });

  it('renders 0% at the lower bound', () => {
    render(<PlaybackControlsBar {...baseProps({ volume: 0 })} />);
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('renders 100% at the upper bound', () => {
    render(<PlaybackControlsBar {...baseProps({ volume: 1 })} />);
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('forwards the slider value to onVolumeChange', () => {
    const onVolumeChange = jest.fn();
    render(<PlaybackControlsBar {...baseProps({ volume: 0.25, onVolumeChange })} />);

    fireEvent.press(screen.getByTestId('mock-slider-change'));

    expect(onVolumeChange).toHaveBeenCalledWith(0.5);
  });
});
