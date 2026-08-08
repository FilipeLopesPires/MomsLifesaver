/**
 * Tests for hooks/use-foreground-service.ts.
 *
 * Android-only notification/service lifecycle. Guards:
 *   - No-ops on non-Android.
 *   - Setup is LAZY: TrackPlayer.setupPlayer only runs the first time a
 *     caller invokes startService/updateMetadata (never on mount).
 *   - Setup installs the silent "holding" track (volume 0, duration 0, loop).
 *   - start/stop service guard rails.
 *   - updateMetadata uses TrackPlayer.updateNowPlayingMetadata and does
 *     NOT call reset/add: the silent queue is kept intact so expo-audio
 *     does not lose AudioFocus while the user adds/removes tracks.
 *   - updateMetadata is debounced on identical (title, artist, isPlaying).
 *   - updateMetadata resyncs the TrackPlayer play/pause state so the
 *     notification's Play/Pause icon matches the real audio state.
 *   - DeviceEventEmitter subscription uses the latest callbacks ref.
 *   - Unmount resets TrackPlayer only if setup actually ran.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  DeviceEventEmitter: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    emit: jest.fn(),
  },
}));

jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    setupPlayer: jest.fn().mockResolvedValue(undefined),
    updateOptions: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    setRepeatMode: jest.fn().mockResolvedValue(undefined),
    setVolume: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    updateNowPlayingMetadata: jest.fn().mockResolvedValue(undefined),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    registerPlaybackService: jest.fn(),
  },
  Capability: { Play: 'play', Pause: 'pause' },
  RepeatMode: { Track: 'track', Queue: 'queue', Off: 'off' },
  AppKilledPlaybackBehavior: {
    StopPlaybackAndRemoveNotification: 'stop',
    ContinuePlayback: 'continue',
  },
  Event: { RemotePlay: 'remote-play', RemotePause: 'remote-pause' },
}));

jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
}));

jest.mock('@/utils/error-handler', () => ({
  handleError: jest.fn(),
  handleErrorSilent: jest.fn(),
}));

import { DeviceEventEmitter, Platform } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react';
import TrackPlayer, { RepeatMode } from 'react-native-track-player';

import { useForegroundService } from '@/hooks/use-foreground-service';
import { FOREGROUND_EVENTS } from '@/services/playback-service';
import { handleError } from '@/utils/error-handler';

type MutablePlatform = { OS: 'ios' | 'android' | 'web' };
const mutablePlatform = Platform as unknown as MutablePlatform;

const mockedPlayer = TrackPlayer as unknown as {
  setupPlayer: jest.Mock;
  updateOptions: jest.Mock;
  add: jest.Mock;
  setRepeatMode: jest.Mock;
  setVolume: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  reset: jest.Mock;
  updateNowPlayingMetadata: jest.Mock;
  addEventListener: jest.Mock;
  registerPlaybackService: jest.Mock;
};

const mockedAddListener = DeviceEventEmitter.addListener as unknown as jest.Mock;

const callbacks = () => ({ onTogglePlayPause: jest.fn() });

// Mounts the hook and triggers lazy setup by calling startService once,
// matching how the playlist screen actually exercises the service.
const mountAndWaitForSetup = async (cb = callbacks()) => {
  const view = renderHook(({ callbacks: c }) => useForegroundService(c), {
    initialProps: { callbacks: cb },
  });
  await act(async () => {
    await view.result.current.startService();
  });
  await waitFor(() => {
    expect(mockedPlayer.setVolume).toHaveBeenCalledWith(0);
  });
  return { view, cb };
};

// Mounts the hook without triggering setup, for tests that exercise the
// lazy-init contract itself.
const mountWithoutSetup = (cb = callbacks()) => {
  const view = renderHook(({ callbacks: c }) => useForegroundService(c), {
    initialProps: { callbacks: cb },
  });
  return { view, cb };
};

beforeEach(() => {
  mutablePlatform.OS = 'android';
  jest.clearAllMocks();
  // Re-apply default resolutions clearAllMocks preserves implementations,
  // but mockRejectedValueOnce from a prior test is still one-time, so no
  // explicit restore is needed.
  mockedAddListener.mockImplementation(() => ({ remove: jest.fn() }));
});

describe('non-Android platforms', () => {
  it.each(['ios', 'web'] as const)('is a no-op on %s', async (os) => {
    mutablePlatform.OS = os;

    const { result } = renderHook(() => useForegroundService(callbacks()));

    await act(async () => {
      await result.current.startService();
      await result.current.stopService();
      await result.current.updateMetadata('T', 'A', true);
    });

    expect(mockedPlayer.setupPlayer).not.toHaveBeenCalled();
    expect(mockedPlayer.add).not.toHaveBeenCalled();
    expect(mockedPlayer.play).not.toHaveBeenCalled();
    expect(mockedPlayer.pause).not.toHaveBeenCalled();
    expect(mockedPlayer.reset).not.toHaveBeenCalled();
    expect(mockedPlayer.updateNowPlayingMetadata).not.toHaveBeenCalled();
  });
});

describe('setup', () => {
  it('does NOT run setup on mount (lazy init)', async () => {
    mountWithoutSetup();

    // Flush any microtasks so we're sure nothing queued on mount has fired.
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedPlayer.setupPlayer).not.toHaveBeenCalled();
    expect(mockedPlayer.updateOptions).not.toHaveBeenCalled();
    expect(mockedPlayer.add).not.toHaveBeenCalled();
    expect(mockedPlayer.setVolume).not.toHaveBeenCalled();
  });

  it('configures TrackPlayer with the silent holding track on the first startService() call', async () => {
    await mountAndWaitForSetup();

    expect(mockedPlayer.setupPlayer).toHaveBeenCalledTimes(1);
    expect(mockedPlayer.updateOptions).toHaveBeenCalledTimes(1);
    expect(mockedPlayer.add).toHaveBeenCalledTimes(1);

    const addCall = mockedPlayer.add.mock.calls[0][0];
    expect(addCall).toMatchObject({
      id: 'silence',
      title: "Mom's Lifesaver",
      artist: 'Ready to play',
      duration: 0,
    });

    expect(mockedPlayer.setRepeatMode).toHaveBeenCalledWith(RepeatMode.Track);
    expect(mockedPlayer.setVolume).toHaveBeenCalledWith(0);
  });

  it('also runs setup lazily from the first updateMetadata() call', async () => {
    const { view } = mountWithoutSetup();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });

    expect(mockedPlayer.setupPlayer).toHaveBeenCalledTimes(1);
    expect(mockedPlayer.setVolume).toHaveBeenCalledWith(0);
  });

  it('does not re-run setup across re-renders of the same mount', async () => {
    const { view } = await mountAndWaitForSetup();

    view.rerender({ callbacks: callbacks() });
    view.rerender({ callbacks: callbacks() });

    expect(mockedPlayer.setupPlayer).toHaveBeenCalledTimes(1);
    expect(mockedPlayer.add).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent setup calls so setupPlayer runs once', async () => {
    const { view } = mountWithoutSetup();

    await act(async () => {
      await Promise.all([
        view.result.current.startService(),
        view.result.current.startService(),
        view.result.current.updateMetadata('Rain', 'Playing', true),
      ]);
    });

    expect(mockedPlayer.setupPlayer).toHaveBeenCalledTimes(1);
  });

  it('surfaces setup errors via handleError and leaves the service uninitialised', async () => {
    mockedPlayer.setupPlayer.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useForegroundService(callbacks()));

    await act(async () => {
      await result.current.startService();
    });

    expect(handleError).toHaveBeenCalled();

    mockedPlayer.play.mockClear();
    await act(async () => {
      await result.current.stopService();
    });
    expect(mockedPlayer.pause).not.toHaveBeenCalled();
  });
});

describe('startService', () => {
  it('plays the holding track on the happy path', async () => {
    // mountAndWaitForSetup already calls startService to trigger lazy setup.
    await mountAndWaitForSetup();

    expect(mockedPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the service is already running', async () => {
    const { view } = await mountAndWaitForSetup();
    mockedPlayer.play.mockClear();

    await act(async () => {
      await view.result.current.startService();
    });

    expect(mockedPlayer.play).not.toHaveBeenCalled();
  });
});

describe('stopService', () => {
  it('pauses on the happy path', async () => {
    const { view } = await mountAndWaitForSetup();

    await act(async () => {
      await view.result.current.startService();
    });
    mockedPlayer.pause.mockClear();

    await act(async () => {
      await view.result.current.stopService();
    });

    expect(mockedPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the service was never started (lazy setup never ran)', async () => {
    const { view } = mountWithoutSetup();

    mockedPlayer.pause.mockClear();
    await act(async () => {
      await view.result.current.stopService();
    });

    expect(mockedPlayer.pause).not.toHaveBeenCalled();
    expect(mockedPlayer.setupPlayer).not.toHaveBeenCalled();
  });
});

describe('updateMetadata', () => {
  it('updates the now-playing metadata in place and plays when isAudioPlaying=true', async () => {
    const { view } = await mountAndWaitForSetup();

    mockedPlayer.reset.mockClear();
    mockedPlayer.add.mockClear();
    mockedPlayer.updateNowPlayingMetadata.mockClear();
    mockedPlayer.play.mockClear();
    mockedPlayer.pause.mockClear();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });

    // Non-destructive path: no reset, no re-add of the silent track.
    // Tearing the queue down here would re-request AudioFocus and
    // disturb the expo-audio players that are producing the real audio.
    expect(mockedPlayer.reset).not.toHaveBeenCalled();
    expect(mockedPlayer.add).not.toHaveBeenCalled();
    expect(mockedPlayer.updateNowPlayingMetadata).toHaveBeenCalledTimes(1);
    expect(mockedPlayer.updateNowPlayingMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Rain',
        artist: 'Playing',
        duration: 0,
      }),
    );
    expect(mockedPlayer.play).toHaveBeenCalledTimes(1);
    expect(mockedPlayer.pause).not.toHaveBeenCalled();
  });

  it('pauses when isAudioPlaying=false', async () => {
    const { view } = await mountAndWaitForSetup();

    mockedPlayer.play.mockClear();
    mockedPlayer.pause.mockClear();
    mockedPlayer.updateNowPlayingMetadata.mockClear();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Paused', false);
    });

    expect(mockedPlayer.updateNowPlayingMetadata).toHaveBeenCalledTimes(1);
    expect(mockedPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockedPlayer.play).not.toHaveBeenCalled();
    expect(mockedPlayer.reset).not.toHaveBeenCalled();
  });

  it('is debounced on identical (title, artist, isAudioPlaying)', async () => {
    const { view } = await mountAndWaitForSetup();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });
    mockedPlayer.reset.mockClear();
    mockedPlayer.add.mockClear();
    mockedPlayer.updateNowPlayingMetadata.mockClear();
    mockedPlayer.play.mockClear();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });

    expect(mockedPlayer.reset).not.toHaveBeenCalled();
    expect(mockedPlayer.add).not.toHaveBeenCalled();
    expect(mockedPlayer.updateNowPlayingMetadata).not.toHaveBeenCalled();
    expect(mockedPlayer.play).not.toHaveBeenCalled();
  });

  it('re-runs when any of title / artist / isAudioPlaying changes', async () => {
    const { view } = await mountAndWaitForSetup();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });
    mockedPlayer.updateNowPlayingMetadata.mockClear();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', false);
    });
    expect(mockedPlayer.updateNowPlayingMetadata).toHaveBeenCalledTimes(1);

    mockedPlayer.updateNowPlayingMetadata.mockClear();
    await act(async () => {
      await view.result.current.updateMetadata('Heartbeat', 'Playing', false);
    });
    expect(mockedPlayer.updateNowPlayingMetadata).toHaveBeenCalledTimes(1);
  });
});

describe('DeviceEventEmitter subscription', () => {
  it('subscribes on mount (independent of lazy setup) and routes events to the latest onTogglePlayPause', async () => {
    const first = callbacks();
    const view = renderHook(
      ({ cb }) => useForegroundService(cb),
      { initialProps: { cb: first } },
    );

    const subscription = mockedAddListener.mock.calls.find(
      ([event]) => event === FOREGROUND_EVENTS.TOGGLE_PLAY_PAUSE,
    );
    expect(subscription).toBeDefined();
    const [, listener] = subscription!;

    act(() => listener());
    expect(first.onTogglePlayPause).toHaveBeenCalledTimes(1);

    const next = callbacks();
    view.rerender({ cb: next });

    act(() => listener());
    expect(next.onTogglePlayPause).toHaveBeenCalledTimes(1);
    expect(first.onTogglePlayPause).toHaveBeenCalledTimes(1);
  });
});

describe('unmount cleanup', () => {
  it('calls TrackPlayer.reset when the hook unmounts after a successful setup', async () => {
    const { view } = await mountAndWaitForSetup();

    mockedPlayer.reset.mockClear();
    view.unmount();

    expect(mockedPlayer.reset).toHaveBeenCalledTimes(1);
  });

  it('does NOT call TrackPlayer.reset on unmount when setup never ran', async () => {
    const { view } = mountWithoutSetup();

    // Ensure no setup has been triggered.
    await act(async () => {
      await Promise.resolve();
    });
    mockedPlayer.reset.mockClear();

    view.unmount();

    expect(mockedPlayer.reset).not.toHaveBeenCalled();
  });
});
