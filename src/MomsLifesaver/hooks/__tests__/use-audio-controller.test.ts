/**
 * Tests for hooks/use-audio-controller.ts (Batch 1).
 *
 * Covers the brain of the app: load lifecycle, toggleTrack state machine,
 * volume multiplication invariants, selection-scoped operations, and the
 * load-resilience / unmount-safety contracts.
 *
 * We mock every heavy leaf dependency at module scope so the test keeps
 * running in the jsdom environment without pulling in real react-native,
 * expo-av, or the Web Audio service.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    Sound: { createAsync: jest.fn() },
  },
  InterruptionModeIOS: { DuckOthers: 1 },
  InterruptionModeAndroid: { DuckOthers: 1 },
}));

jest.mock('@/services/web-sound', () => ({
  WebSoundFactory: { createAsync: jest.fn() },
}));

jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import { Audio } from 'expo-av';

import { TRACK_LIBRARY, type TrackId } from '@/constants/tracks';
import { useAudioController } from '@/hooks/use-audio-controller';

type MockHandle = {
  playAsync: jest.Mock;
  pauseAsync: jest.Mock;
  stopAsync: jest.Mock;
  setVolumeAsync: jest.Mock;
  setPositionAsync: jest.Mock;
  getStatusAsync: jest.Mock;
  unloadAsync: jest.Mock;
  setOnPlaybackStatusUpdate: jest.Mock;
};

const makeHandle = (): MockHandle => ({
  playAsync: jest.fn().mockResolvedValue(undefined),
  pauseAsync: jest.fn().mockResolvedValue(undefined),
  stopAsync: jest.fn().mockResolvedValue(undefined),
  setVolumeAsync: jest.fn().mockResolvedValue(undefined),
  setPositionAsync: jest.fn().mockResolvedValue(undefined),
  getStatusAsync: jest.fn().mockResolvedValue({
    isLoaded: true,
    positionMillis: 0,
    durationMillis: 60_000,
  }),
  unloadAsync: jest.fn().mockResolvedValue(undefined),
  setOnPlaybackStatusUpdate: jest.fn(),
});

const createAsync = Audio.Sound.createAsync as unknown as jest.Mock;

type LoadHooks = {
  rejectFor: Set<TrackId>;
  deferred: { promise: Promise<void>; resolve: () => void } | null;
  handles: Map<TrackId, MockHandle>;
};

let load: LoadHooks;

beforeEach(() => {
  load = {
    rejectFor: new Set(),
    deferred: null,
    handles: new Map(),
  };
  createAsync.mockReset();
  createAsync.mockImplementation(async () => {
    const callIndex = createAsync.mock.calls.length - 1;
    const trackId = TRACK_LIBRARY[callIndex].id;
    if (load.deferred) {
      await load.deferred.promise;
    }
    if (load.rejectFor.has(trackId)) {
      throw new Error(`simulated load failure: ${trackId}`);
    }
    const handle = makeHandle();
    load.handles.set(trackId, handle);
    return { sound: handle };
  });
});

const getHandle = (id: TrackId): MockHandle => {
  const handle = load.handles.get(id);
  if (!handle) {
    throw new Error(`No mock handle was created for "${id}"`);
  }
  return handle;
};

const mount = async () => {
  const view = renderHook(() => useAudioController());
  await waitFor(() => {
    expect(Object.keys(view.result.current.tracks).length).toBeGreaterThan(0);
  });
  return view;
};

describe('loadAsync', () => {
  it('loads every track into state with default volume and not-playing state', async () => {
    const { result } = await mount();

    const tracks = result.current.tracks;
    for (const track of TRACK_LIBRARY) {
      expect(tracks[track.id]).toBeDefined();
      expect(tracks[track.id].isPlaying).toBe(false);
      expect(tracks[track.id].isPaused).toBe(false);
      expect(tracks[track.id].volume).toBe(track.defaultVolume);
    }
    expect(result.current.globalVolume).toBe(1);
  });

  it('does not block the other tracks when one track fails to load', async () => {
    load.rejectFor.add('rain');

    const { result } = await mount();

    expect(result.current.tracks['rain']).toBeUndefined();
    for (const track of TRACK_LIBRARY.filter((t) => t.id !== 'rain')) {
      expect(result.current.tracks[track.id]).toBeDefined();
    }
  });

  it('unloads every already-loaded sound if the hook unmounts mid-load', async () => {
    let release!: () => void;
    load.deferred = {
      promise: new Promise<void>((resolve) => {
        release = resolve;
      }),
      resolve: () => release(),
    };

    const view = renderHook(() => useAudioController());

    // Unmount while createAsync calls are still pending.
    view.unmount();

    // Now let every pending createAsync resolve.
    release();

    await waitFor(() => {
      expect(load.handles.size).toBe(TRACK_LIBRARY.length);
    });
    await waitFor(() => {
      for (const handle of load.handles.values()) {
        expect(handle.unloadAsync).toHaveBeenCalledTimes(1);
      }
    });
  });
});

describe('toggleTrack: start-stopped branch', () => {
  it('sets position 0 for a track with no startTimes, then applies volume and plays', async () => {
    const { result } = await mount();
    const handle = getHandle('rain'); // TRACK_LIBRARY entry with startTimes: []

    await act(async () => {
      const outcome = await result.current.toggleTrack('rain');
      expect(outcome).toBe(true);
    });

    expect(handle.setPositionAsync).toHaveBeenCalledWith(0);
    expect(handle.setVolumeAsync).toHaveBeenCalledWith(1); // volume * globalVolume = 1 * 1
    expect(handle.playAsync).toHaveBeenCalledTimes(1);
    expect(result.current.tracks['rain'].isPlaying).toBe(true);
    expect(result.current.tracks['rain'].isPaused).toBe(false);
  });

  it('honours a parsed startTime from the track library', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // pick first entry ("00:22")
    const { result } = await mount();
    const handle = getHandle('kalimba');

    await act(async () => {
      await result.current.toggleTrack('kalimba');
    });

    expect(handle.setPositionAsync).toHaveBeenCalledWith(22_000);
    (Math.random as jest.Mock).mockRestore();
  });

  it('falls back to position 0 when the parsed startTime is >= durationMillis', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // "00:22" → 22_000 ms
    const { result } = await mount();
    const handle = getHandle('kalimba');
    handle.getStatusAsync.mockResolvedValue({
      isLoaded: true,
      positionMillis: 0,
      durationMillis: 10_000, // shorter than 22_000
    });

    await act(async () => {
      await result.current.toggleTrack('kalimba');
    });

    expect(handle.setPositionAsync).toHaveBeenCalledWith(0);
    (Math.random as jest.Mock).mockRestore();
  });

  it('keeps the parsed position when getStatusAsync reports unloaded', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = await mount();
    const handle = getHandle('kalimba');
    handle.getStatusAsync.mockResolvedValue({ isLoaded: false, positionMillis: 0 });

    await act(async () => {
      await result.current.toggleTrack('kalimba');
    });

    expect(handle.setPositionAsync).toHaveBeenCalledWith(22_000);
    (Math.random as jest.Mock).mockRestore();
  });
});

describe('toggleTrack: stop-playing branch', () => {
  it('calls stopAsync + setPositionAsync(0) and flips state to stopped', async () => {
    const { result } = await mount();
    const handle = getHandle('rain');

    await act(async () => {
      await result.current.toggleTrack('rain'); // start
    });

    await act(async () => {
      const outcome = await result.current.toggleTrack('rain'); // stop
      expect(outcome).toBe(false);
    });

    expect(handle.stopAsync).toHaveBeenCalledTimes(1);
    expect(handle.setPositionAsync).toHaveBeenCalledWith(0);
    expect(result.current.tracks['rain'].isPlaying).toBe(false);
    expect(result.current.tracks['rain'].isPaused).toBe(false);
  });
});

describe('toggleTrack: resume-paused branch', () => {
  it('calls setVolumeAsync + playAsync without touching setPositionAsync', async () => {
    const { result } = await mount();
    const handle = getHandle('rain');

    await act(async () => {
      await result.current.toggleTrack('rain'); // start
    });
    await act(async () => {
      await result.current.pauseSelectedTracks(['rain']); // pause
    });

    expect(result.current.tracks['rain'].isPaused).toBe(true);

    handle.setPositionAsync.mockClear();
    handle.setVolumeAsync.mockClear();
    handle.playAsync.mockClear();

    await act(async () => {
      const outcome = await result.current.toggleTrack('rain'); // resume
      expect(outcome).toBe(true);
    });

    expect(handle.setPositionAsync).not.toHaveBeenCalled();
    expect(handle.setVolumeAsync).toHaveBeenCalledWith(1);
    expect(handle.playAsync).toHaveBeenCalledTimes(1);
    expect(result.current.tracks['rain'].isPlaying).toBe(true);
    expect(result.current.tracks['rain'].isPaused).toBe(false);
  });
});

describe('toggleTrack: concurrency and failure guards', () => {
  it('ignores a second toggle while the first is still in flight', async () => {
    const { result } = await mount();
    const handle = getHandle('rain');

    let releasePlay!: () => void;
    handle.playAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releasePlay = resolve;
        }),
    );

    let first: Promise<boolean | null>;
    let second: Promise<boolean | null>;
    act(() => {
      first = result.current.toggleTrack('rain') as Promise<boolean | null>;
      second = result.current.toggleTrack('rain') as Promise<boolean | null>;
    });

    await act(async () => {
      await expect(second!).resolves.toBeNull();
    });

    expect(handle.playAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      releasePlay();
      await first!;
    });
  });

  it('leaves the toggling ref empty and returns the previous isPlaying when play rejects', async () => {
    const { result } = await mount();
    const handle = getHandle('rain');
    handle.playAsync.mockRejectedValueOnce(new Error('play failed'));

    await act(async () => {
      const outcome = await result.current.toggleTrack('rain');
      expect(outcome).toBe(false); // was not playing before the failed toggle
    });

    // The guard must release so a subsequent toggle can proceed.
    handle.playAsync.mockResolvedValueOnce(undefined);
    await act(async () => {
      const outcome = await result.current.toggleTrack('rain');
      expect(outcome).toBe(true);
    });
  });
});

describe('volume invariants', () => {
  it('multiplies track volume by globalVolume in setTrackVolume', async () => {
    const { result } = await mount();
    const handle = getHandle('rain');

    await act(async () => {
      await result.current.setGlobalVolume(0.5);
    });
    handle.setVolumeAsync.mockClear();

    await act(async () => {
      await result.current.setTrackVolume('rain', 0.4);
    });

    expect(handle.setVolumeAsync).toHaveBeenCalledWith(0.2);
    expect(result.current.tracks['rain'].volume).toBe(0.4);
    expect(result.current.globalVolume).toBe(0.5);
  });

  it('multiplies every loaded track volume by the new globalVolume', async () => {
    const { result } = await mount();

    await act(async () => {
      await result.current.setGlobalVolume(0.25);
    });

    for (const track of TRACK_LIBRARY) {
      const handle = getHandle(track.id);
      expect(handle.setVolumeAsync).toHaveBeenLastCalledWith(track.defaultVolume * 0.25);
    }
  });

  it('applies (volume * globalVolume) on every start path', async () => {
    const { result } = await mount();
    const handle = getHandle('rain');

    await act(async () => {
      await result.current.setGlobalVolume(0.5);
    });
    await act(async () => {
      await result.current.setTrackVolume('rain', 0.8);
    });
    handle.setVolumeAsync.mockClear();

    await act(async () => {
      await result.current.toggleTrack('rain');
    });

    expect(handle.setVolumeAsync).toHaveBeenCalledWith(0.4);
    expect(handle.playAsync).toHaveBeenCalledTimes(1);
  });
});

describe('selection-scoped operations', () => {
  it('pauseSelectedTracks only pauses tracks in the selection that are playing', async () => {
    const { result } = await mount();

    await act(async () => {
      await result.current.toggleTrack('rain');
    });
    await act(async () => {
      await result.current.toggleTrack('heartbeat');
    });

    const rain = getHandle('rain');
    const heart = getHandle('heartbeat');
    const shush = getHandle('sh-sh-sh');

    await act(async () => {
      await result.current.pauseSelectedTracks(['rain']);
    });

    expect(rain.pauseAsync).toHaveBeenCalledTimes(1);
    expect(heart.pauseAsync).not.toHaveBeenCalled();
    expect(shush.pauseAsync).not.toHaveBeenCalled();
    expect(result.current.tracks['rain'].isPaused).toBe(true);
    expect(result.current.tracks['heartbeat'].isPaused).toBe(false);
    expect(result.current.tracks['heartbeat'].isPlaying).toBe(true);
  });

  it('playSelectedTracks uses computeStartPosition when positionMillis === 0', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // first start time
    const { result } = await mount();
    const kalimba = getHandle('kalimba');
    kalimba.getStatusAsync.mockResolvedValue({
      isLoaded: true,
      positionMillis: 0,
      durationMillis: 60_000,
    });

    await act(async () => {
      await result.current.playSelectedTracks(['kalimba']);
    });

    expect(kalimba.setPositionAsync).toHaveBeenCalledWith(22_000);
    expect(kalimba.playAsync).toHaveBeenCalledTimes(1);
    (Math.random as jest.Mock).mockRestore();
  });

  it('playSelectedTracks continues from the current position when positionMillis > 0', async () => {
    const { result } = await mount();
    const rain = getHandle('rain');
    rain.getStatusAsync.mockResolvedValue({
      isLoaded: true,
      positionMillis: 5_000,
      durationMillis: 60_000,
    });

    await act(async () => {
      await result.current.playSelectedTracks(['rain']);
    });

    expect(rain.setPositionAsync).not.toHaveBeenCalled();
    expect(rain.playAsync).toHaveBeenCalledTimes(1);
  });

  it('toggleSelectedTracksPlayPause pauses when any selected track is playing', async () => {
    const { result } = await mount();
    const rain = getHandle('rain');
    const heart = getHandle('heartbeat');

    await act(async () => {
      await result.current.toggleTrack('rain');
    });

    await act(async () => {
      await result.current.toggleSelectedTracksPlayPause(['rain', 'heartbeat']);
    });

    expect(rain.pauseAsync).toHaveBeenCalledTimes(1);
    expect(heart.pauseAsync).not.toHaveBeenCalled();
    expect(result.current.tracks['rain'].isPaused).toBe(true);
  });

  it('toggleSelectedTracksPlayPause plays when nothing in the selection is playing', async () => {
    const { result } = await mount();
    const rain = getHandle('rain');
    const heart = getHandle('heartbeat');

    await act(async () => {
      await result.current.toggleSelectedTracksPlayPause(['rain', 'heartbeat']);
    });

    expect(rain.playAsync).toHaveBeenCalledTimes(1);
    expect(heart.playAsync).toHaveBeenCalledTimes(1);
    expect(result.current.tracks['rain'].isPlaying).toBe(true);
    expect(result.current.tracks['heartbeat'].isPlaying).toBe(true);
  });
});

describe('stopTrack', () => {
  it('calls stopAsync + setPositionAsync(0) and flips state', async () => {
    const { result } = await mount();
    const handle = getHandle('rain');

    await act(async () => {
      await result.current.toggleTrack('rain');
    });
    await act(async () => {
      await result.current.stopTrack('rain');
    });

    expect(handle.stopAsync).toHaveBeenCalled();
    expect(handle.setPositionAsync).toHaveBeenCalledWith(0);
    expect(result.current.tracks['rain'].isPlaying).toBe(false);
    expect(result.current.tracks['rain'].isPaused).toBe(false);
  });
});

/**
 * Regression suite for the Android "Player does not exist." silent
 * tear-down bug: expo-av's native AVManager silently removes a sound
 * from its internal map if the underlying ExoPlayer errors out after
 * load (for example when another media session, like
 * react-native-track-player, grabs audio focus). Subsequent calls then
 * reject with { code: 'E_AUDIO_NOPLAYER', message: 'Player does not exist.' }.
 *
 * The controller must recover by reloading the sound once and retrying
 * the call, so user-visible playback keeps working.
 */
describe('expo-av silent tear-down recovery', () => {
  const makeNoPlayerError = () => {
    const error = new Error('Player does not exist.') as Error & { code?: string };
    error.code = 'E_AUDIO_NOPLAYER';
    return error;
  };

  it('recovers when playAsync rejects with E_AUDIO_NOPLAYER by reloading and retrying', async () => {
    const { result } = await mount();
    const original = getHandle('rain');

    // First call rejects as if the native player was silently torn down.
    original.playAsync.mockRejectedValueOnce(makeNoPlayerError());

    // The controller should call createAsync again to rebuild the sound.
    // Capture the replacement handle that createAsync returns on retry.
    const replacement = makeHandle();
    createAsync.mockImplementationOnce(async (_m: unknown, opts: unknown) => {
      load.handles.set('rain', replacement);
      // Reload must pass the current volume via CreateOptions so the
      // restored sound starts at the right level.
      expect(opts).toMatchObject({ volume: 1, isLooping: true });
      return { sound: replacement };
    });

    await act(async () => {
      const outcome = await result.current.toggleTrack('rain');
      expect(outcome).toBe(true);
    });

    // A fresh sound was created for 'rain' after the tear-down, and the
    // failed playAsync call was retried on it.
    expect(replacement.playAsync).toHaveBeenCalledTimes(1);
    expect(result.current.tracks['rain'].isPlaying).toBe(true);
    expect(result.current.tracks['rain'].isPaused).toBe(false);
  });

  it('recovers when setVolumeAsync rejects with E_AUDIO_NOPLAYER during start', async () => {
    const { result } = await mount();
    const original = getHandle('rain');

    original.setVolumeAsync.mockRejectedValueOnce(makeNoPlayerError());

    const replacement = makeHandle();
    createAsync.mockImplementationOnce(async () => {
      load.handles.set('rain', replacement);
      return { sound: replacement };
    });

    await act(async () => {
      const outcome = await result.current.toggleTrack('rain');
      expect(outcome).toBe(true);
    });

    // The failing op (setVolumeAsync) is retried on the replacement,
    // and the subsequent playAsync call then lands on the replacement
    // since it is now the current handle.
    expect(replacement.setVolumeAsync).toHaveBeenCalledWith(1);
    expect(replacement.playAsync).toHaveBeenCalledTimes(1);
  });

  it('restores the user\'s most recent volume on a reload (not the original default)', async () => {
    const { result } = await mount();
    const original = getHandle('rain');

    // User lowers volume first (this updates the wrapper's remembered options).
    await act(async () => {
      await result.current.setTrackVolume('rain', 0.4);
    });

    original.playAsync.mockRejectedValueOnce(makeNoPlayerError());

    const replacement = makeHandle();
    let reloadOptions: unknown = null;
    createAsync.mockImplementationOnce(async (_m: unknown, opts: unknown) => {
      reloadOptions = opts;
      load.handles.set('rain', replacement);
      return { sound: replacement };
    });

    await act(async () => {
      await result.current.toggleTrack('rain');
    });

    expect(reloadOptions).toMatchObject({ volume: 0.4 });
  });

  it('only retries once per call so a permanently broken sound does not loop', async () => {
    const { result } = await mount();
    const original = getHandle('rain');
    original.playAsync.mockRejectedValue(makeNoPlayerError());

    const replacement = makeHandle();
    replacement.playAsync.mockRejectedValue(makeNoPlayerError());
    createAsync.mockImplementationOnce(async () => {
      load.handles.set('rain', replacement);
      return { sound: replacement };
    });

    await act(async () => {
      const outcome = await result.current.toggleTrack('rain');
      expect(outcome).toBe(false); // matches existing error fallback semantics
    });

    // Exactly one reload attempt (one extra createAsync beyond the initial load pass).
    const extraLoads = createAsync.mock.calls.length - TRACK_LIBRARY.length;
    expect(extraLoads).toBe(1);
    expect(replacement.playAsync).toHaveBeenCalledTimes(1);
  });

  it('does not reload for unrelated playAsync errors', async () => {
    const { result } = await mount();
    const original = getHandle('rain');
    original.playAsync.mockRejectedValueOnce(new Error('some other failure'));

    const loadsBefore = createAsync.mock.calls.length;

    await act(async () => {
      const outcome = await result.current.toggleTrack('rain');
      expect(outcome).toBe(false);
    });

    const loadsAfter = createAsync.mock.calls.length;
    expect(loadsAfter - loadsBefore).toBe(0); // no reload on generic errors
  });

  // Regression: on a real Android device, expo-av periodically pushes
  // status-update callbacks while a track is playing. If the native
  // stack hiccups (audio-focus blip, transient codec error, etc.) the
  // callback can carry { isLoaded: false, error: ... } even though the
  // app still wants the sound to keep playing. A previous "best-effort"
  // proactive-reload listener inside the resilient wrapper would react
  // to that by unloading the current sound and re-creating it with
  // shouldPlay: false, which silently killed playback ~0.1 s in while
  // the JS-side isPlaying state stayed true. The wrapper must not
  // self-reload from a status callback; recovery only happens reactively
  // when a caller-issued operation rejects with E_AUDIO_NOPLAYER.
  it('does not reload the sound from a transient isLoaded:false status update', async () => {
    const { result } = await mount();
    const handle = getHandle('rain');

    await act(async () => {
      const outcome = await result.current.toggleTrack('rain');
      expect(outcome).toBe(true);
    });

    const loadsAfterStart = createAsync.mock.calls.length;

    // Grab whatever status callback the wrapper may have registered
    // and fire the kind of payload that native expo-av produces when
    // it briefly flags an error on the ExoPlayer instance.
    const statusCalls = handle.setOnPlaybackStatusUpdate.mock.calls;
    const listener = statusCalls.length > 0
      ? (statusCalls[statusCalls.length - 1][0] as ((s: unknown) => void) | null)
      : null;

    if (listener) {
      await act(async () => {
        listener({ isLoaded: false, error: 'transient native glitch' });
        // Let any microtasks scheduled by the listener settle.
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    // No extra createAsync call (no proactive reload) and the original
    // handle was not unloaded behind the caller's back.
    expect(createAsync.mock.calls.length).toBe(loadsAfterStart);
    expect(handle.unloadAsync).not.toHaveBeenCalled();
    expect(result.current.tracks['rain'].isPlaying).toBe(true);
  });
});
