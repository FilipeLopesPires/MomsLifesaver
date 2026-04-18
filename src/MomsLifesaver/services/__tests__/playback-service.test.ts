/**
 * Tests for services/playback-service.ts (Batch 5).
 *
 * The playback service is the Android TrackPlayer event registrar that
 * translates RemotePlay / RemotePause notification button presses into
 * an internal DeviceEventEmitter event the hook listens for.
 */

jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    emit: jest.fn(),
  },
}));

jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(),
  },
  Event: { RemotePlay: 'remote-play', RemotePause: 'remote-pause' },
}));

import { DeviceEventEmitter } from 'react-native';
import TrackPlayer, { Event } from 'react-native-track-player';

import { FOREGROUND_EVENTS, PlaybackService } from '@/services/playback-service';

const mockedAddEventListener = (TrackPlayer as unknown as {
  addEventListener: jest.Mock;
}).addEventListener;

const mockedEmit = DeviceEventEmitter.emit as unknown as jest.Mock;

beforeEach(() => {
  mockedAddEventListener.mockClear();
  mockedEmit.mockClear();
});

describe('PlaybackService', () => {
  it('registers listeners for RemotePlay and RemotePause', async () => {
    await PlaybackService();

    expect(mockedAddEventListener).toHaveBeenCalledWith(
      Event.RemotePlay,
      expect.any(Function),
    );
    expect(mockedAddEventListener).toHaveBeenCalledWith(
      Event.RemotePause,
      expect.any(Function),
    );
  });

  it('emits TOGGLE_PLAY_PAUSE on RemotePlay', async () => {
    await PlaybackService();

    const entry = mockedAddEventListener.mock.calls.find(
      ([event]) => event === Event.RemotePlay,
    );
    expect(entry).toBeDefined();
    const [, handler] = entry!;

    handler();

    expect(mockedEmit).toHaveBeenCalledWith(FOREGROUND_EVENTS.TOGGLE_PLAY_PAUSE);
  });

  it('emits TOGGLE_PLAY_PAUSE on RemotePause', async () => {
    await PlaybackService();

    const entry = mockedAddEventListener.mock.calls.find(
      ([event]) => event === Event.RemotePause,
    );
    expect(entry).toBeDefined();
    const [, handler] = entry!;

    handler();

    expect(mockedEmit).toHaveBeenCalledWith(FOREGROUND_EVENTS.TOGGLE_PLAY_PAUSE);
  });
});
