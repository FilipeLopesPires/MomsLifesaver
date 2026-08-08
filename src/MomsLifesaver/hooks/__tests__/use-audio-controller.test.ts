/**
 * Tests for hooks/use-audio-controller.ts.
 *
 * Covers the brain of the app: load lifecycle, toggleTrack state machine,
 * volume multiplication invariants, selection-scoped operations, and the
 * unmount-safety contract.
 *
 * We mock every heavy leaf dependency at module scope so the test keeps
 * running in the jsdom environment without pulling in real react-native,
 * expo-audio, or the Web Audio service. The native-sound factory is
 * mocked to return a plain SoundHandle-shaped object so the tests can
 * observe the controller's behaviour without caring about the
 * underlying `expo-audio` AudioPlayer instance.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  createAudioPlayer: jest.fn(),
}));

jest.mock('@/services/web-sound', () => ({
  WebSoundFactory: { createAsync: jest.fn() },
}));

jest.mock('@/services/native-sound', () => ({
  NativeSoundFactory: { createAsync: jest.fn() },
}));

jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

import { act, renderHook, waitFor } from '@testing-library/react';

import { TRACK_LIBRARY, type TrackId } from '@/constants/tracks';
import { useAudioController } from '@/hooks/use-audio-controller';
import { NativeSoundFactory } from '@/services/native-sound';

type MockHandle = {
  playAsync: jest.Mock;
  pauseAsync: jest.Mock;
  stopAsync: jest.Mock;
  setVolumeAsync: jest.Mock;
  setPositionAsync: jest.Mock;
  getStatusAsync: jest.Mock;
  unloadAsync: jest.Mock;
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
});

const createAsync = NativeSoundFactory.createAsync as unknown as jest.Mock;

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

  it('unloads every sound when the hook unmounts after a successful load', async () => {
    const view = await mount();
    expect(load.handles.size).toBe(TRACK_LIBRARY.length);

    view.unmount();

    // Without the unmount cleanup these handles outlive the hook, each
    // holding an open native player (or <audio> element on web).
    await waitFor(() => {
      for (const handle of load.handles.values()) {
        expect(handle.unloadAsync).toHaveBeenCalledTimes(1);
      }
    });
  });

  it('unloads the survivors even when one track failed to load', async () => {
    load.rejectFor.add('rain');
    const view = await mount();

    view.unmount();

    await waitFor(() => {
      for (const handle of load.handles.values()) {
        expect(handle.unloadAsync).toHaveBeenCalledTimes(1);
      }
    });
    expect(load.handles.has('rain')).toBe(false);
  });

  it('still unloads the rest when one sound rejects while unloading', async () => {
    const view = await mount();
    getHandle('rain').unloadAsync.mockRejectedValueOnce(new Error('remove failed'));

    expect(() => view.unmount()).not.toThrow();

    // Promise.all would abandon the batch at the first rejection; every
    // handle after it would leak.
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
