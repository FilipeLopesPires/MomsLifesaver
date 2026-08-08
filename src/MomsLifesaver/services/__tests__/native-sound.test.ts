/**
 * Regression tests for services/native-sound.ts
 *
 * These exercise the expo-audio `AudioPlayer` adapter that
 * `useAudioController` relies on for native playback.
 *
 * The main invariant under test: unlike `createAudioPlayer` from
 * `expo-audio` (which returns an un-loaded player synchronously),
 * `NativeSoundFactory.createAsync` must not resolve until the
 * underlying player reports `isLoaded: true`, so that callers can
 * rely on "createAsync resolved" === "the handle is ready to play".
 *
 * This mirrors the contract expo-av's `Audio.Sound.createAsync` used
 * to provide before the expo-audio migration.
 */

type StatusListener = (status: { isLoaded?: boolean; playing?: boolean }) => void;

type PlayerStub = {
  loop: boolean;
  volume: number;
  isLoaded: boolean;
  currentTime: number;
  duration: number;
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock<Promise<void>, [number]>;
  remove: jest.Mock;
  addListener: jest.Mock;
  __emit: (status: { isLoaded?: boolean; playing?: boolean }) => void;
};

const makePlayerStub = (): PlayerStub => {
  const listeners: StatusListener[] = [];
  const stub: PlayerStub = {
    loop: false,
    volume: 1,
    isLoaded: false,
    currentTime: 0,
    duration: 0,
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn(),
    addListener: jest.fn((event: string, listener: StatusListener) => {
      if (event === 'playbackStatusUpdate') {
        listeners.push(listener);
      }
      return {
        remove: () => {
          const index = listeners.indexOf(listener);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        },
      };
    }),
    __emit: (status) => {
      if (status.isLoaded) {
        stub.isLoaded = true;
      }
      listeners.slice().forEach((listener) => listener(status));
    },
  };
  return stub;
};

const mockCreateAudioPlayer = jest.fn();

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
}));

jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

import { NativeSoundFactory } from '@/services/native-sound';

const flushMicrotasks = async () => {
  // Give any chained .then() handlers a chance to run before we assert.
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  mockCreateAudioPlayer.mockReset();
});

describe('NativeSoundFactory.createAsync', () => {
  it('does not resolve until the underlying player reports isLoaded: true', async () => {
    const stub = makePlayerStub();
    mockCreateAudioPlayer.mockReturnValue(stub);

    let resolved = false;
    const pending = NativeSoundFactory.createAsync(123, {
      volume: 1,
      isLooping: true,
      shouldPlay: false,
    }).then((result) => {
      resolved = true;
      return result;
    });

    // Give any synchronous .then() callbacks a chance to run.
    await flushMicrotasks();
    await flushMicrotasks();

    expect(resolved).toBe(false);
    expect(stub.addListener).toHaveBeenCalledWith(
      'playbackStatusUpdate',
      expect.any(Function),
    );

    // Simulate the native layer reporting that the media is loaded.
    stub.__emit({ isLoaded: true });

    const { sound } = await pending;
    expect(resolved).toBe(true);
    expect(sound).toBeDefined();
  });

  it('applies loop / volume before resolving', async () => {
    const stub = makePlayerStub();
    mockCreateAudioPlayer.mockReturnValue(stub);

    const pending = NativeSoundFactory.createAsync(123, {
      volume: 0.4,
      isLooping: true,
      shouldPlay: false,
    });

    stub.__emit({ isLoaded: true });
    await pending;

    expect(stub.loop).toBe(true);
    expect(stub.volume).toBe(0.4);
    expect(stub.play).not.toHaveBeenCalled();
  });

  it('calls play() only after load when shouldPlay is true', async () => {
    const stub = makePlayerStub();
    mockCreateAudioPlayer.mockReturnValue(stub);

    const pending = NativeSoundFactory.createAsync(123, {
      volume: 1,
      isLooping: false,
      shouldPlay: true,
    });

    // Before load completes, play() must not have been invoked yet.
    await flushMicrotasks();
    expect(stub.play).not.toHaveBeenCalled();

    stub.__emit({ isLoaded: true });
    await pending;

    expect(stub.play).toHaveBeenCalledTimes(1);
  });

  it('resolves with a handle whose methods forward to the underlying player', async () => {
    const stub = makePlayerStub();
    mockCreateAudioPlayer.mockReturnValue(stub);

    const pending = NativeSoundFactory.createAsync(123, {
      volume: 1,
      isLooping: false,
      shouldPlay: false,
    });
    stub.__emit({ isLoaded: true });
    const { sound } = await pending;

    await sound.playAsync();
    expect(stub.play).toHaveBeenCalledTimes(1);

    await sound.pauseAsync();
    expect(stub.pause).toHaveBeenCalledTimes(1);

    await sound.setVolumeAsync(0.25);
    expect(stub.volume).toBe(0.25);

    await sound.setPositionAsync(5000);
    expect(stub.seekTo).toHaveBeenCalledWith(5);

    await sound.unloadAsync();
    expect(stub.remove).toHaveBeenCalledTimes(1);
  });

  it('resolves (does not hang) even if the load signal never arrives, after a safety timeout', async () => {
    jest.useFakeTimers();
    try {
      const stub = makePlayerStub();
      mockCreateAudioPlayer.mockReturnValue(stub);

      const pending = NativeSoundFactory.createAsync(123, {
        volume: 1,
        isLooping: false,
        shouldPlay: false,
      });

      // Advance past any reasonable load timeout and flush microtasks.
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();

      const { sound } = await pending;
      expect(sound).toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
