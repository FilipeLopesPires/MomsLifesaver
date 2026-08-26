/**
 * Tests for hooks/use-foreground-service.ts.
 *
 * Android-only notification/service lifecycle, backed by the local
 * `media-notification` Expo module. Guards:
 *   - No-ops on non-Android.
 *   - Setup is LAZY: the POST_NOTIFICATIONS prompt only runs the first time a
 *     caller invokes startService/updateMetadata (never on mount).
 *   - A DENIED notification permission still starts the service. The service
 *     is what keeps background audio alive; only the notification is hidden.
 *   - updateMetadata DOES propagate isPlaying. This is the inverse of the old
 *     track-player contract and it is the fix for the wrong-icon bug - see the
 *     comment on that test before "restoring" the old behaviour.
 *   - updateMetadata is deduped on identical (title, artist, isPlaying).
 *   - Remote-control events route to the latest callbacks ref.
 *   - Unmount stops the service only if it was actually started.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS' },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
    request: jest.fn().mockResolvedValue('granted'),
  },
}));

jest.mock('@/modules/media-notification', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    update: jest.fn(),
    stop: jest.fn(),
    startTick: jest.fn(),
    stopTick: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
}));

jest.mock('@/utils/error-handler', () => ({
  handleError: jest.fn(),
  handleErrorSilent: jest.fn(),
}));

import { PermissionsAndroid, Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react';

import MediaNotification from '@/modules/media-notification';
import { useForegroundService } from '@/hooks/use-foreground-service';
import { handleError } from '@/utils/error-handler';

type MutablePlatform = { OS: 'ios' | 'android' | 'web'; Version: number };
const mutablePlatform = Platform as unknown as MutablePlatform;

const mockedModule = MediaNotification as unknown as {
  start: jest.Mock;
  update: jest.Mock;
  stop: jest.Mock;
  startTick: jest.Mock;
  stopTick: jest.Mock;
  addListener: jest.Mock;
};

const mockedRequest = PermissionsAndroid.request as unknown as jest.Mock;

const callbacks = () => ({ onTogglePlayPause: jest.fn(), onStop: jest.fn() });

// Mounts the hook and triggers lazy setup by calling startService once,
// matching how the playlist screen actually exercises the service.
const mountAndStart = async (cb = callbacks()) => {
  const view = renderHook(({ callbacks: c }) => useForegroundService(c), {
    initialProps: { callbacks: cb },
  });
  await act(async () => {
    await view.result.current.startService();
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

// Pulls the handler the hook registered for a given native event.
const listenerFor = (event: string) => {
  const entry = mockedModule.addListener.mock.calls.find(([name]) => name === event);
  expect(entry).toBeDefined();
  return entry![1] as (payload?: { playWhenReady: boolean }) => void;
};

beforeEach(() => {
  mutablePlatform.OS = 'android';
  mutablePlatform.Version = 34;
  jest.clearAllMocks();
  // clearAllMocks keeps implementations, so these only need re-stating where a
  // test installed a one-shot override.
  mockedModule.addListener.mockImplementation(() => ({ remove: jest.fn() }));
  mockedRequest.mockResolvedValue('granted');
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
    act(() => {
      result.current.startTick(250);
      result.current.stopTick();
    });

    expect(mockedRequest).not.toHaveBeenCalled();
    expect(mockedModule.start).not.toHaveBeenCalled();
    expect(mockedModule.update).not.toHaveBeenCalled();
    expect(mockedModule.stop).not.toHaveBeenCalled();
    expect(mockedModule.startTick).not.toHaveBeenCalled();
    expect(mockedModule.stopTick).not.toHaveBeenCalled();
    expect(mockedModule.addListener).not.toHaveBeenCalled();
  });
});

describe('setup', () => {
  it('does NOT prompt for notifications on mount (lazy init)', async () => {
    mountWithoutSetup();

    // Flush any microtasks so we're sure nothing queued on mount has fired.
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedRequest).not.toHaveBeenCalled();
    expect(mockedModule.start).not.toHaveBeenCalled();
  });

  it('requests POST_NOTIFICATIONS on the first startService() call', async () => {
    await mountAndStart();

    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(mockedRequest).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  });

  it('skips the runtime prompt below Android 13, where the permission is install-time', async () => {
    mutablePlatform.Version = 32;

    await mountAndStart();

    expect(mockedRequest).not.toHaveBeenCalled();
    expect(mockedModule.start).toHaveBeenCalledTimes(1);
  });

  it('still starts the service when the notification permission is DENIED', async () => {
    // Degrading gracefully is the contract: the foreground service is what
    // keeps background audio alive, and only the notification is hidden.
    // Refusing to start here would trade a missing notification for silence.
    mockedRequest.mockResolvedValue('denied');

    await mountAndStart();

    expect(mockedModule.start).toHaveBeenCalledTimes(1);
  });

  it('also runs setup lazily from the first updateMetadata() call', async () => {
    const { view } = mountWithoutSetup();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });

    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('does not re-run setup across re-renders of the same mount', async () => {
    const { view } = await mountAndStart();

    view.rerender({ callbacks: callbacks() });
    view.rerender({ callbacks: callbacks() });

    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent setup calls so the permission is requested once', async () => {
    const { view } = mountWithoutSetup();

    await act(async () => {
      await Promise.all([
        view.result.current.startService(),
        view.result.current.startService(),
        view.result.current.updateMetadata('Rain', 'Playing', true),
      ]);
    });

    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('surfaces setup errors via handleError and leaves the service unstarted', async () => {
    mockedRequest.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useForegroundService(callbacks()));

    await act(async () => {
      await result.current.startService();
    });

    expect(handleError).toHaveBeenCalled();
    // Discriminating assertion: stopService() early-returns on
    // !isServiceRunning regardless of whether setup failed, so asserting only
    // on `stop` would pass even if setup had succeeded. `start` is reached
    // only when ensureInitialized() returned true.
    expect(mockedModule.start).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.stopService();
    });
    expect(mockedModule.stop).not.toHaveBeenCalled();
  });

  it('retries setup on a later startService() after the first attempt failed', async () => {
    mockedRequest.mockRejectedValueOnce(new Error('boom'));
    const { view } = mountWithoutSetup();

    await act(async () => {
      await view.result.current.startService();
    });
    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(mockedModule.start).not.toHaveBeenCalled();

    // The cached rejected promise must NOT be reused: without the
    // `setupPromiseRef.current = null` reset on failure, one transient error
    // would leave the notification permanently dead for the whole session.
    await act(async () => {
      await view.result.current.startService();
    });

    expect(mockedRequest).toHaveBeenCalledTimes(2);
    expect(mockedModule.start).toHaveBeenCalledTimes(1);
  });

  it('retries setup from updateMetadata() too, not just startService()', async () => {
    mockedRequest.mockRejectedValueOnce(new Error('boom'));
    const { view } = mountWithoutSetup();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });
    expect(mockedModule.update).not.toHaveBeenCalled();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });

    expect(mockedRequest).toHaveBeenCalledTimes(2);
    expect(mockedModule.update).toHaveBeenCalledTimes(1);
  });
});

describe('startService', () => {
  it('seeds the session with the current metadata on the happy path', async () => {
    await mountAndStart();

    expect(mockedModule.start).toHaveBeenCalledTimes(1);
    expect(mockedModule.start).toHaveBeenCalledWith("Mom's Lifesaver", 'Ready to play', false);
  });

  it('seeds from the metadata already pushed by an earlier updateMetadata()', async () => {
    const { view } = mountWithoutSetup();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
      await view.result.current.startService();
    });

    expect(mockedModule.start).toHaveBeenCalledWith('Rain', 'Playing', true);
  });

  it('is a no-op when the service is already running', async () => {
    const { view } = await mountAndStart();
    mockedModule.start.mockClear();

    await act(async () => {
      await view.result.current.startService();
    });

    expect(mockedModule.start).not.toHaveBeenCalled();
  });
});

describe('stopService', () => {
  it('stops the service on the happy path', async () => {
    const { view } = await mountAndStart();

    await act(async () => {
      await view.result.current.stopService();
    });

    expect(mockedModule.stop).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the service was never started (lazy setup never ran)', async () => {
    const { view } = mountWithoutSetup();

    await act(async () => {
      await view.result.current.stopService();
    });

    expect(mockedModule.stop).not.toHaveBeenCalled();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('clears the cached metadata so the first update after a restart is not deduped', async () => {
    const { view } = await mountAndStart();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
      await view.result.current.stopService();
      await view.result.current.startService();
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });

    expect(mockedModule.update).toHaveBeenCalledTimes(2);
  });
});

describe('updateMetadata', () => {
  it('propagates isPlaying=true so the notification shows the Pause icon', async () => {
    const { view } = await mountAndStart();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });

    // The opposite of the old track-player contract, and deliberately so.
    // Back then, syncing the icon meant driving a real ExoPlayer, which
    // re-requested AUDIOFOCUS_GAIN and silenced every expo-audio track. The
    // session's player now owns no audio and requests no focus, so playback
    // state is free to push - and pushing it is the entire fix for the
    // permanently-wrong icon. Do not reintroduce a "metadata only" variant.
    expect(mockedModule.update).toHaveBeenCalledTimes(1);
    expect(mockedModule.update).toHaveBeenCalledWith('Rain', 'Playing', true);
  });

  it('propagates isPlaying=false so the notification shows the Play icon', async () => {
    const { view } = await mountAndStart();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Paused', false);
    });

    expect(mockedModule.update).toHaveBeenCalledWith('Rain', 'Paused', false);
    // Pausing the icon must not tear the service down - background audio can
    // resume from the notification, and only stopService() removes it.
    expect(mockedModule.stop).not.toHaveBeenCalled();
  });

  it('defaults isAudioPlaying to true when omitted', async () => {
    const { view } = await mountAndStart();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing');
    });

    expect(mockedModule.update).toHaveBeenCalledWith('Rain', 'Playing', true);
  });

  it('is deduped on identical (title, artist, isAudioPlaying)', async () => {
    const { view } = await mountAndStart();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });
    mockedModule.update.mockClear();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });

    expect(mockedModule.update).not.toHaveBeenCalled();
  });

  it('re-runs when any of title / artist / isAudioPlaying changes', async () => {
    const { view } = await mountAndStart();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', true);
    });
    mockedModule.update.mockClear();

    await act(async () => {
      await view.result.current.updateMetadata('Rain', 'Playing', false);
    });
    expect(mockedModule.update).toHaveBeenCalledTimes(1);

    mockedModule.update.mockClear();
    await act(async () => {
      await view.result.current.updateMetadata('Heartbeat', 'Playing', false);
    });
    expect(mockedModule.update).toHaveBeenCalledTimes(1);
  });
});

describe('remote-control events', () => {
  it('subscribes on mount (independent of lazy setup) and routes to the latest callbacks', () => {
    const first = callbacks();
    const view = renderHook(({ cb }) => useForegroundService(cb), {
      initialProps: { cb: first },
    });

    const toggle = listenerFor('onTogglePlayPause');

    act(() => toggle({ playWhenReady: true }));
    expect(first.onTogglePlayPause).toHaveBeenCalledTimes(1);

    const next = callbacks();
    view.rerender({ cb: next });

    act(() => toggle({ playWhenReady: false }));
    expect(next.onTogglePlayPause).toHaveBeenCalledTimes(1);
    expect(first.onTogglePlayPause).toHaveBeenCalledTimes(1);
  });

  it('routes onStop to the caller', () => {
    const cb = callbacks();
    renderHook(() => useForegroundService(cb));

    act(() => listenerFor('onStop')({ playWhenReady: false }));

    expect(cb.onStop).toHaveBeenCalledTimes(1);
  });

  it('tolerates a caller that supplies no onStop handler', () => {
    renderHook(() => useForegroundService({ onTogglePlayPause: jest.fn() }));

    expect(() => act(() => listenerFor('onStop')({ playWhenReady: false }))).not.toThrow();
  });

  it('routes onSleepTimerTick to the caller', () => {
    const onTick = jest.fn();
    renderHook(() => useForegroundService({ ...callbacks(), onTick }));

    act(() => listenerFor('onSleepTimerTick')());

    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('tolerates a caller that supplies no onTick handler', () => {
    renderHook(() => useForegroundService(callbacks()));

    expect(() => act(() => listenerFor('onSleepTimerTick')())).not.toThrow();
  });

  it('removes all three subscriptions on unmount', () => {
    const removals: jest.Mock[] = [];
    mockedModule.addListener.mockImplementation(() => {
      const remove = jest.fn();
      removals.push(remove);
      return { remove };
    });

    const view = mountWithoutSetup();
    view.view.unmount();

    expect(removals).toHaveLength(3);
    removals.forEach((remove) => expect(remove).toHaveBeenCalledTimes(1));
  });
});

describe('startTick / stopTick', () => {
  it('starts the native tick with the given interval', () => {
    const { result } = renderHook(() => useForegroundService(callbacks()));

    act(() => result.current.startTick(250));

    expect(mockedModule.startTick).toHaveBeenCalledWith(250);
  });

  it('stops the native tick', () => {
    const { result } = renderHook(() => useForegroundService(callbacks()));

    act(() => result.current.stopTick());

    expect(mockedModule.stopTick).toHaveBeenCalledTimes(1);
  });
});

describe('unmount cleanup', () => {
  it('stops the service when the hook unmounts while it is running', async () => {
    const { view } = await mountAndStart();

    mockedModule.stop.mockClear();
    view.unmount();

    expect(mockedModule.stop).toHaveBeenCalledTimes(1);
  });

  it('does NOT stop the service on unmount when it was never started', async () => {
    const { view } = mountWithoutSetup();

    await act(async () => {
      await Promise.resolve();
    });

    view.unmount();

    expect(mockedModule.stop).not.toHaveBeenCalled();
  });
});

describe('platform variant parity', () => {
  // playlist.tsx destructures this hook's result without knowing which
  // platform file Metro resolved. If the Android hook grows a method and the
  // shims do not, the web and iOS builds break at runtime with a green
  // suite. Asserted here because this file already installs every mock the
  // Android hook needs.
  it.each([
    ['web', '@/hooks/use-foreground-service.web'],
    ['ios', '@/hooks/use-foreground-service.ios'],
  ])('the %s shim returns the same keys as the Android hook', (_platform, modulePath) => {
    const shim = require(modulePath).useForegroundService as typeof useForegroundService;

    const android = renderHook(() => useForegroundService(callbacks())).result.current;
    const variant = renderHook(() => shim(callbacks())).result.current;

    expect(Object.keys(variant).sort()).toEqual(Object.keys(android).sort());
  });
});
