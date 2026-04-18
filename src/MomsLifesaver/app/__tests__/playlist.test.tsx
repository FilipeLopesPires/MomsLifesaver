/**
 * Integration tests for app/playlist.tsx (Batch 8).
 *
 * Wires together TrackGrid, PlaybackControlsBar, the audio controller, the
 * foreground service, and the web media session. Child components and hooks
 * are stubbed so the tests focus on the screen's orchestration: selection
 * management, toggleTrack routing (including the all-paused deselection
 * optimization), the global play/stop buttons, and foreground-service
 * metadata transitions driven by playback state.
 */

import React from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

// Audio controller: mutable state we can advance between rerenders to simulate
// playback transitions. All names are prefixed with `mock` so that jest's
// factory-hoisting rule permits references from the jest.mock() factory below.
type TrackState = { isPlaying: boolean; isPaused: boolean; volume: number };
const mockAudioState: {
  tracks: Record<string, TrackState>;
  globalVolume: number;
} = {
  tracks: {},
  globalVolume: 1,
};
const mockToggleTrack = jest.fn().mockResolvedValue(undefined);
const mockStopTrack = jest.fn().mockResolvedValue(undefined);
const mockSetTrackVolume = jest.fn();
const mockSetGlobalVolume = jest.fn();
const mockToggleSelectedTracksPlayPause = jest.fn().mockResolvedValue(undefined);

jest.mock('@/hooks/use-audio-controller', () => ({
  useAudioController: () => ({
    tracks: mockAudioState.tracks,
    globalVolume: mockAudioState.globalVolume,
    toggleTrack: mockToggleTrack,
    stopTrack: mockStopTrack,
    setTrackVolume: mockSetTrackVolume,
    setGlobalVolume: mockSetGlobalVolume,
    toggleSelectedTracksPlayPause: mockToggleSelectedTracksPlayPause,
  }),
}));

// Foreground service: capture the wiring + calls.
const mockStartService = jest.fn();
const mockStopService = jest.fn();
const mockUpdateMetadata = jest.fn();
const mockForegroundCapture: { onTogglePlayPause: (() => void) | null } = {
  onTogglePlayPause: null,
};

jest.mock('@/hooks/use-foreground-service', () => ({
  useForegroundService: ({ onTogglePlayPause }: { onTogglePlayPause: () => void }) => {
    mockForegroundCapture.onTogglePlayPause = onTogglePlayPause;
    return {
      startService: mockStartService,
      stopService: mockStopService,
      updateMetadata: mockUpdateMetadata,
    };
  },
}));

// Web media session: capture the args for assertions.
const mockWebMediaCapture: {
  value: {
    callbacks: { onTogglePlayPause: () => void; onStop: () => void };
    isPlaying: boolean;
    trackNames: string[];
  } | null;
} = { value: null };

jest.mock('@/hooks/use-web-media-session', () => ({
  useWebMediaSession: (
    callbacks: { onTogglePlayPause: () => void; onStop: () => void },
    isPlaying: boolean,
    trackNames: string[],
  ) => {
    mockWebMediaCapture.value = { callbacks, isPlaying, trackNames };
  },
}));

// TrackGrid stub: render a pressable per track so tests can trigger
// onTrackPress / onTrackVolumeChange via user-facing interactions.
jest.mock('@/components/track-grid', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    TrackGrid: ({
      data,
      selectedTrackIds,
      onTrackPress,
      onTrackVolumeChange,
      volumes,
    }: any) => (
      <View testID="track-grid">
        <Text testID="grid-selected-ids">{selectedTrackIds.join(',')}</Text>
        {data.map((track: any) => (
          <View key={track.id}>
            <Pressable
              testID={`grid-press-${track.id}`}
              onPress={() => onTrackPress(track)}
            />
            <Pressable
              testID={`grid-vol-${track.id}`}
              onPress={() => onTrackVolumeChange(track, 0.12)}
            />
            <Text testID={`grid-vol-read-${track.id}`}>
              {String(volumes[track.id])}
            </Text>
          </View>
        ))}
      </View>
    ),
  };
});

jest.mock('@/components/track-list-header', () => ({
  TrackListHeader: () => null,
}));

// PlaybackControlsBar stub: expose props as text and pressables so tests can
// fire the global controls.
jest.mock('@/components/playback-controls-bar', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    PlaybackControlsBar: ({
      selectedTracksCount,
      selectedTrackNames,
      isPlaying,
      onToggle,
      onStop,
      volume,
      onVolumeChange,
    }: any) => (
      <View testID="footer">
        <Text testID="footer-count">{String(selectedTracksCount)}</Text>
        <Text testID="footer-names">{selectedTrackNames.join(',')}</Text>
        <Text testID="footer-playing">{String(isPlaying)}</Text>
        <Text testID="footer-volume">{String(volume)}</Text>
        <Pressable testID="footer-toggle" onPress={onToggle} />
        <Pressable testID="footer-stop" onPress={onStop} />
        <Pressable
          testID="footer-volume-change"
          onPress={() => onVolumeChange(0.33)}
        />
      </View>
    ),
  };
});

import { TRACK_LIBRARY } from '@/constants/tracks';
import PlaylistScreen from '@/app/playlist';

const FIRST_TRACK = TRACK_LIBRARY[0];
const SECOND_TRACK = TRACK_LIBRARY[1];

const resetAudioState = () => {
  mockAudioState.tracks = Object.fromEntries(
    TRACK_LIBRARY.map((track) => [
      track.id,
      { isPlaying: false, isPaused: false, volume: track.defaultVolume },
    ]),
  );
  mockAudioState.globalVolume = 1;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockForegroundCapture.onTogglePlayPause = null;
  mockWebMediaCapture.value = null;
  resetAudioState();
});

describe('PlaylistScreen initial render', () => {
  it('renders with no tracks selected', () => {
    render(<PlaylistScreen />);
    expect(screen.getByTestId('footer-count').children[0]).toBe('0');
    expect(screen.getByTestId('grid-selected-ids').children[0] ?? '').toBe('');
  });

  it('forwards the global volume to the footer', () => {
    mockAudioState.globalVolume = 0.65;
    render(<PlaylistScreen />);
    expect(screen.getByTestId('footer-volume').children[0]).toBe('0.65');
  });
});

describe('PlaylistScreen track selection', () => {
  it('calls toggleTrack and marks the track as selected on first press', () => {
    render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));

    expect(mockToggleTrack).toHaveBeenCalledTimes(1);
    expect(mockToggleTrack).toHaveBeenCalledWith(FIRST_TRACK.id);
    expect(screen.getByTestId('footer-count').children[0]).toBe('1');
    expect(screen.getByTestId('grid-selected-ids').children[0]).toBe(FIRST_TRACK.id);
  });

  it('accumulates multiple selections', () => {
    render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));
    fireEvent.press(screen.getByTestId(`grid-press-${SECOND_TRACK.id}`));

    expect(mockToggleTrack).toHaveBeenCalledTimes(2);
    expect(mockToggleTrack).toHaveBeenNthCalledWith(1, FIRST_TRACK.id);
    expect(mockToggleTrack).toHaveBeenNthCalledWith(2, SECOND_TRACK.id);
    expect(screen.getByTestId('footer-count').children[0]).toBe('2');
  });

  it('deselects a playing track and calls toggleTrack to stop it', () => {
    const { rerender } = render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));

    mockAudioState.tracks[FIRST_TRACK.id] = {
      isPlaying: true,
      isPaused: false,
      volume: FIRST_TRACK.defaultVolume,
    };
    rerender(<PlaylistScreen />);

    mockToggleTrack.mockClear();
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));

    expect(mockToggleTrack).toHaveBeenCalledTimes(1);
    expect(mockToggleTrack).toHaveBeenCalledWith(FIRST_TRACK.id);
    expect(screen.getByTestId('footer-count').children[0]).toBe('0');
  });

  it('deselects a paused track WITHOUT calling toggleTrack (all-paused optimization)', () => {
    const { rerender } = render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));

    mockAudioState.tracks[FIRST_TRACK.id] = {
      isPlaying: true,
      isPaused: true,
      volume: FIRST_TRACK.defaultVolume,
    };
    rerender(<PlaylistScreen />);

    mockToggleTrack.mockClear();
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));

    expect(mockToggleTrack).not.toHaveBeenCalled();
    expect(screen.getByTestId('footer-count').children[0]).toBe('0');
  });
});

describe('PlaylistScreen global controls', () => {
  it('routes the footer toggle button to toggleSelectedTracksPlayPause with the current selection', async () => {
    render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));
    fireEvent.press(screen.getByTestId(`grid-press-${SECOND_TRACK.id}`));

    await act(async () => {
      fireEvent.press(screen.getByTestId('footer-toggle'));
    });

    expect(mockToggleSelectedTracksPlayPause).toHaveBeenCalledTimes(1);
    expect(mockToggleSelectedTracksPlayPause).toHaveBeenCalledWith([
      FIRST_TRACK.id,
      SECOND_TRACK.id,
    ]);
  });

  it('routes the footer stop button to stopTrack for each selected track and clears selection', async () => {
    render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));
    fireEvent.press(screen.getByTestId(`grid-press-${SECOND_TRACK.id}`));

    await act(async () => {
      fireEvent.press(screen.getByTestId('footer-stop'));
    });

    expect(mockStopTrack).toHaveBeenCalledTimes(2);
    expect(mockStopTrack).toHaveBeenCalledWith(FIRST_TRACK.id);
    expect(mockStopTrack).toHaveBeenCalledWith(SECOND_TRACK.id);
    expect(screen.getByTestId('footer-count').children[0]).toBe('0');
  });

  it('routes the footer volume slider to setGlobalVolume', () => {
    render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId('footer-volume-change'));
    expect(mockSetGlobalVolume).toHaveBeenCalledWith(0.33);
  });

  it('forwards per-track volume changes to setTrackVolume', () => {
    render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId(`grid-vol-${FIRST_TRACK.id}`));
    expect(mockSetTrackVolume).toHaveBeenCalledWith(FIRST_TRACK.id, 0.12);
  });
});

describe('PlaylistScreen foreground-service integration', () => {
  it('stops the foreground service when no tracks are selected', () => {
    render(<PlaylistScreen />);
    expect(mockStopService).toHaveBeenCalled();
    expect(mockStartService).not.toHaveBeenCalled();
  });

  it('starts the service (after the 300ms delay) and sets "Playing" metadata when a selected track begins playing', () => {
    jest.useFakeTimers();
    try {
      const { rerender } = render(<PlaylistScreen />);

      fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));

      mockAudioState.tracks = {
        ...mockAudioState.tracks,
        [FIRST_TRACK.id]: {
          isPlaying: true,
          isPaused: false,
          volume: FIRST_TRACK.defaultVolume,
        },
      };
      rerender(<PlaylistScreen />);

      mockStartService.mockClear();
      mockUpdateMetadata.mockClear();

      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(mockStartService).toHaveBeenCalledTimes(1);
      expect(mockUpdateMetadata).toHaveBeenCalledWith(
        FIRST_TRACK.title,
        'Playing',
        true,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('updates metadata to "Paused" when tracks are selected but none is playing', () => {
    render(<PlaylistScreen />);

    mockUpdateMetadata.mockClear();
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));

    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      FIRST_TRACK.title,
      'Paused',
      false,
    );
  });

  it('invokes toggleSelectedTracksPlayPause through the foreground onTogglePlayPause callback when tracks are selected', () => {
    render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));

    expect(mockForegroundCapture.onTogglePlayPause).not.toBeNull();
    mockForegroundCapture.onTogglePlayPause!();

    expect(mockToggleSelectedTracksPlayPause).toHaveBeenCalledWith([FIRST_TRACK.id]);
  });

  it('does nothing when the foreground onTogglePlayPause callback fires with no selection', () => {
    render(<PlaylistScreen />);
    expect(mockForegroundCapture.onTogglePlayPause).not.toBeNull();
    mockForegroundCapture.onTogglePlayPause!();
    expect(mockToggleSelectedTracksPlayPause).not.toHaveBeenCalled();
  });
});

describe('PlaylistScreen web media session integration', () => {
  it('reports isPlaying=false and empty trackNames at rest', () => {
    render(<PlaylistScreen />);
    expect(mockWebMediaCapture.value).not.toBeNull();
    expect(mockWebMediaCapture.value!.isPlaying).toBe(false);
    expect(mockWebMediaCapture.value!.trackNames).toEqual([]);
  });

  it('reports isPlaying=true and the selected track names when a track is playing', () => {
    const { rerender } = render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));

    mockAudioState.tracks = {
      ...mockAudioState.tracks,
      [FIRST_TRACK.id]: {
        isPlaying: true,
        isPaused: false,
        volume: FIRST_TRACK.defaultVolume,
      },
    };
    rerender(<PlaylistScreen />);

    expect(mockWebMediaCapture.value!.isPlaying).toBe(true);
    expect(mockWebMediaCapture.value!.trackNames).toEqual([FIRST_TRACK.title]);
  });

  it('clears selection and calls stopTrack when the media-session onStop fires', async () => {
    render(<PlaylistScreen />);
    fireEvent.press(screen.getByTestId(`grid-press-${FIRST_TRACK.id}`));
    fireEvent.press(screen.getByTestId(`grid-press-${SECOND_TRACK.id}`));

    await act(async () => {
      mockWebMediaCapture.value!.callbacks.onStop();
    });

    expect(mockStopTrack).toHaveBeenCalledWith(FIRST_TRACK.id);
    expect(mockStopTrack).toHaveBeenCalledWith(SECOND_TRACK.id);
    expect(screen.getByTestId('footer-count').children[0]).toBe('0');
  });
});
