/**
 * Tests for hooks/use-preferences.ts.
 *
 * The provider is a persistence coordinator: it hydrates once, exposes seeds,
 * and writes changes back with a debounce. Guards:
 *   - hydration seeds selection/volumes/foreground toggle from storage;
 *   - continuous inputs (volume drags) coalesce to one debounced write;
 *   - discrete actions (selection, toggle) flush immediately;
 *   - reset clears storage, restores defaults, bumps resetNonce, and cancels a
 *     pending debounced write;
 *   - the app is flushed before background (native) / tab-hide (web) so a drag
 *     just before close is not lost.
 *
 * Storage I/O is mocked so flushes are observable as savePreferences calls.
 */
import { createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('@/services/preferences-storage', () => ({
  defaultPreferences: () => ({
    version: 1,
    selectedTrackIds: [],
    trackVolumes: {},
    masterVolume: 1,
    foregroundServiceEnabled: true,
  }),
  loadPreferences: jest.fn(),
  savePreferences: jest.fn(),
  clearPreferences: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({ log: jest.fn() }));
jest.mock('@/utils/error-handler', () => ({ handleErrorSilent: jest.fn() }));

import { AppState, Platform } from 'react-native';
import {
  clearPreferences,
  loadPreferences,
  savePreferences,
} from '@/services/preferences-storage';
import { PreferencesProvider, usePreferences } from '@/hooks/use-preferences';

type MutablePlatform = { OS: 'ios' | 'android' | 'web' };
const mutablePlatform = Platform as unknown as MutablePlatform;

const mockLoad = loadPreferences as jest.Mock;
const mockSave = savePreferences as jest.Mock;
const mockClear = clearPreferences as jest.Mock;

const snapshot = (overrides = {}) => ({
  version: 1,
  selectedTrackIds: [],
  trackVolumes: {},
  masterVolume: 1,
  foregroundServiceEnabled: true,
  ...overrides,
});

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(PreferencesProvider, null, children);

// Flush the async hydration chain (loadPreferences → setState) under act.
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mountHydrated = async () => {
  const view = renderHook(() => usePreferences(), { wrapper });
  await flush();
  expect(view.result.current.hydrated).toBe(true);
  return view;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mutablePlatform.OS = 'web';
  mockLoad.mockResolvedValue(snapshot());
  mockSave.mockResolvedValue(undefined);
  mockClear.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePreferences guard', () => {
  it('throws when used outside a provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => usePreferences())).toThrow(
      /must be used within a PreferencesProvider/,
    );
    spy.mockRestore();
  });
});

describe('hydration', () => {
  it('starts un-hydrated and flips hydrated true after loading', async () => {
    const view = renderHook(() => usePreferences(), { wrapper });
    expect(view.result.current.hydrated).toBe(false);
    await flush();
    expect(view.result.current.hydrated).toBe(true);
  });

  it('seeds selection, volumes and the foreground toggle from storage', async () => {
    mockLoad.mockResolvedValue(
      snapshot({
        selectedTrackIds: ['rain'],
        trackVolumes: { rain: 0.3 },
        masterVolume: 0.6,
        foregroundServiceEnabled: false,
      }),
    );
    const view = await mountHydrated();

    expect(view.result.current.getInitialSelection()).toEqual(['rain']);
    expect(view.result.current.getSeed()).toEqual({
      masterVolume: 0.6,
      trackVolumes: { rain: 0.3 },
    });
    expect(view.result.current.initialForegroundServiceEnabled).toBe(false);
    expect(view.result.current.foregroundServiceEnabled).toBe(false);
  });

  it('returns copies from the seed getters so callers cannot mutate the snapshot', async () => {
    mockLoad.mockResolvedValue(snapshot({ selectedTrackIds: ['rain'] }));
    const view = await mountHydrated();

    view.result.current.getInitialSelection().push('heartbeat');
    expect(view.result.current.getInitialSelection()).toEqual(['rain']);
  });
});

describe('debounced writes', () => {
  it('coalesces rapid volume writes into a single trailing flush', async () => {
    const view = await mountHydrated();

    act(() => {
      view.result.current.persistTrackVolume('rain', 0.1);
      view.result.current.persistMasterVolume(0.2);
      view.result.current.persistTrackVolume('rain', 0.3);
    });
    expect(mockSave).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ masterVolume: 0.2, trackVolumes: { rain: 0.3 } }),
    );
  });

  it('flushes selection changes immediately (discrete action)', async () => {
    const view = await mountHydrated();

    act(() => {
      view.result.current.persistSelection(['rain', 'heartbeat']);
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedTrackIds: ['rain', 'heartbeat'] }),
    );
  });

  it('flushes the foreground toggle immediately and reflects it in state', async () => {
    const view = await mountHydrated();

    act(() => {
      view.result.current.setForegroundServiceEnabled(false);
    });

    expect(view.result.current.foregroundServiceEnabled).toBe(false);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ foregroundServiceEnabled: false }),
    );
  });

  it('flushes a pending debounced write on unmount', async () => {
    const view = await mountHydrated();

    act(() => {
      view.result.current.persistMasterVolume(0.42);
    });
    expect(mockSave).not.toHaveBeenCalled();

    view.unmount();

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenLastCalledWith(expect.objectContaining({ masterVolume: 0.42 }));
  });
});

describe('reset', () => {
  it('clears storage, restores defaults, bumps resetNonce and cancels a pending write', async () => {
    mockLoad.mockResolvedValue(
      snapshot({ selectedTrackIds: ['rain'], foregroundServiceEnabled: false }),
    );
    const view = await mountHydrated();
    expect(view.result.current.resetNonce).toBe(0);

    // Start a debounced write, then reset before it fires.
    act(() => {
      view.result.current.persistMasterVolume(0.1);
    });

    await act(async () => {
      await view.result.current.resetPreferences();
    });

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(view.result.current.resetNonce).toBe(1);
    expect(view.result.current.foregroundServiceEnabled).toBe(true);
    expect(view.result.current.getInitialSelection()).toEqual([]);

    // The pending debounced flush must have been cancelled.
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('flush before close', () => {
  it('flushes on web pagehide', async () => {
    const view = await mountHydrated();

    act(() => {
      view.result.current.persistMasterVolume(0.5);
    });
    expect(mockSave).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenLastCalledWith(expect.objectContaining({ masterVolume: 0.5 }));
  });

  it('flushes on native AppState background', async () => {
    mutablePlatform.OS = 'android';
    const view = await mountHydrated();

    // Grab the handler the provider registered with AppState.
    const handler = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)?.[1] as (
      state: string,
    ) => void;
    expect(handler).toBeDefined();

    act(() => {
      view.result.current.persistTrackVolume('rain', 0.7);
    });
    act(() => {
      handler('background');
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ trackVolumes: { rain: 0.7 } }),
    );
  });
});
