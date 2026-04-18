/**
 * Tests for hooks/use-web-media-session.ts (Batch 4).
 *
 * Guards the iOS Safari / lock-screen controls integration:
 *   - No-op on native platforms.
 *   - No-op on web when navigator.mediaSession is not available.
 *   - Metadata + playbackState + three action handlers wired up on web.
 *   - Action handlers always dispatch to the latest callbacks
 *     (regression guard: rebinding via useRef on callback change).
 *   - Handlers cleared on unmount.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: (_module: unknown) => ({
      uri: '/MomsLifesaver/assets/icon.png',
      localUri: null,
    }),
  },
}));

import { Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react';

import { useWebMediaSession } from '@/hooks/use-web-media-session';

type MutablePlatform = { OS: 'ios' | 'android' | 'web' };
const mutablePlatform = Platform as unknown as MutablePlatform;

type ActionType = 'play' | 'pause' | 'stop';

type FakeMediaSession = {
  metadata: unknown;
  playbackState: string;
  handlers: Map<ActionType, ((...args: unknown[]) => void) | null>;
  setActionHandler: jest.Mock;
};

type FakeMetadata = {
  title: string;
  artist: string;
  album: string;
  artwork?: { src: string; sizes?: string; type?: string }[];
};

let fakeMediaSession: FakeMediaSession;
let metadataInstances: FakeMetadata[];

const installMediaSession = () => {
  fakeMediaSession = {
    metadata: null,
    playbackState: 'none',
    handlers: new Map(),
    setActionHandler: jest.fn(
      (type: ActionType, handler: ((...args: unknown[]) => void) | null) => {
        fakeMediaSession.handlers.set(type, handler);
      },
    ),
  };
  Object.defineProperty(navigator, 'mediaSession', {
    value: fakeMediaSession,
    configurable: true,
    writable: true,
  });
  metadataInstances = [];
  (globalThis as unknown as { MediaMetadata: unknown }).MediaMetadata =
    class MockMediaMetadata {
      title: string;
      artist: string;
      album: string;
      artwork?: { src: string; sizes?: string; type?: string }[];
      constructor(init: {
        title: string;
        artist: string;
        album: string;
        artwork?: { src: string; sizes?: string; type?: string }[];
      }) {
        this.title = init.title;
        this.artist = init.artist;
        this.album = init.album;
        this.artwork = init.artwork;
        metadataInstances.push(this);
      }
    };
};

const uninstallMediaSession = () => {
  try {
    delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;
  } catch {
    // ignore - non-configurable property in some jsdom versions
  }
  delete (globalThis as unknown as { MediaMetadata?: unknown }).MediaMetadata;
};

beforeEach(() => {
  mutablePlatform.OS = 'web';
  installMediaSession();
});

afterEach(() => {
  uninstallMediaSession();
});

const defaultCallbacks = () => ({
  onTogglePlayPause: jest.fn(),
  onStop: jest.fn(),
});

describe('no-ops on non-web platforms', () => {
  it.each(['ios', 'android'] as const)('is a no-op on %s', (os) => {
    mutablePlatform.OS = os;

    renderHook(() =>
      useWebMediaSession(defaultCallbacks(), true, ['Rain']),
    );

    expect(fakeMediaSession.setActionHandler).not.toHaveBeenCalled();
    expect(fakeMediaSession.metadata).toBeNull();
    expect(fakeMediaSession.playbackState).toBe('none');
    expect(metadataInstances).toHaveLength(0);
  });
});

describe('no-op on web without mediaSession support', () => {
  it('does not throw when navigator.mediaSession is missing', () => {
    delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;

    expect(() => {
      renderHook(() =>
        useWebMediaSession(defaultCallbacks(), true, ['Rain']),
      );
    }).not.toThrow();
    expect(metadataInstances).toHaveLength(0);
  });
});

describe('web happy path', () => {
  it('sets metadata, playbackState, and all three action handlers', () => {
    renderHook(() =>
      useWebMediaSession(defaultCallbacks(), true, ['Rain', 'Heartbeat']),
    );

    expect(fakeMediaSession.setActionHandler).toHaveBeenCalledWith(
      'play',
      expect.any(Function),
    );
    expect(fakeMediaSession.setActionHandler).toHaveBeenCalledWith(
      'pause',
      expect.any(Function),
    );
    expect(fakeMediaSession.setActionHandler).toHaveBeenCalledWith(
      'stop',
      expect.any(Function),
    );

    expect(metadataInstances).toHaveLength(1);
    expect(metadataInstances[0]).toMatchObject({
      title: 'Rain, Heartbeat',
      artist: 'Playing',
      album: "Mom's Lifesaver",
    });
    expect(fakeMediaSession.playbackState).toBe('playing');
  });

  it('includes artwork in metadata so the iOS lock-screen card renders', () => {
    renderHook(() =>
      useWebMediaSession(defaultCallbacks(), true, ['Rain']),
    );

    const latest = metadataInstances.at(-1);
    expect(latest?.artwork).toBeDefined();
    expect(Array.isArray(latest?.artwork)).toBe(true);
    expect(latest?.artwork?.length).toBeGreaterThan(0);
    expect(latest?.artwork?.[0]?.src).toEqual(expect.any(String));
    expect(latest?.artwork?.[0]?.src.length).toBeGreaterThan(0);
  });

  it('falls back to the app name when trackNames is empty', () => {
    renderHook(() => useWebMediaSession(defaultCallbacks(), false, []));

    expect(metadataInstances.at(-1)).toMatchObject({
      title: "Mom's Lifesaver",
      artist: 'Paused',
    });
    expect(fakeMediaSession.playbackState).toBe('paused');
  });

  it('re-runs metadata when trackNames or isPlaying changes', () => {
    const { rerender } = renderHook(
      ({ isPlaying, names }) =>
        useWebMediaSession(defaultCallbacks(), isPlaying, names),
      { initialProps: { isPlaying: false, names: ['Rain'] as string[] } },
    );

    const first = metadataInstances.length;
    rerender({ isPlaying: true, names: ['Rain'] });
    expect(metadataInstances.length).toBeGreaterThan(first);
    expect(metadataInstances.at(-1)?.artist).toBe('Playing');

    const second = metadataInstances.length;
    rerender({ isPlaying: true, names: ['Rain', 'Heartbeat'] });
    expect(metadataInstances.length).toBeGreaterThan(second);
    expect(metadataInstances.at(-1)?.title).toBe('Rain, Heartbeat');
  });
});

describe('action handlers dispatch to the latest callbacks', () => {
  it('invokes the current onTogglePlayPause when play/pause fires, across rerenders', () => {
    const first = defaultCallbacks();
    const { rerender } = renderHook(
      ({ cb }) => useWebMediaSession(cb, false, []),
      { initialProps: { cb: first } },
    );

    act(() => fakeMediaSession.handlers.get('play')!());
    expect(first.onTogglePlayPause).toHaveBeenCalledTimes(1);

    const next = defaultCallbacks();
    rerender({ cb: next });

    act(() => fakeMediaSession.handlers.get('pause')!());
    expect(next.onTogglePlayPause).toHaveBeenCalledTimes(1);
    expect(first.onTogglePlayPause).toHaveBeenCalledTimes(1);
  });

  it('invokes onStop when the stop handler fires', () => {
    const cb = defaultCallbacks();
    renderHook(() => useWebMediaSession(cb, false, []));

    act(() => fakeMediaSession.handlers.get('stop')!());
    expect(cb.onStop).toHaveBeenCalledTimes(1);
    expect(cb.onTogglePlayPause).not.toHaveBeenCalled();
  });
});

describe('unmount cleanup', () => {
  it('clears all three action handlers', () => {
    const view = renderHook(() =>
      useWebMediaSession(defaultCallbacks(), true, ['Rain']),
    );

    fakeMediaSession.setActionHandler.mockClear();
    view.unmount();

    expect(fakeMediaSession.setActionHandler).toHaveBeenCalledWith('play', null);
    expect(fakeMediaSession.setActionHandler).toHaveBeenCalledWith('pause', null);
    expect(fakeMediaSession.setActionHandler).toHaveBeenCalledWith('stop', null);
  });
});
