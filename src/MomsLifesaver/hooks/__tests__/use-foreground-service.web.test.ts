/**
 * Contract tests for the non-Android resolutions of the foreground-service
 * hook: `use-foreground-service.web.ts` and `use-foreground-service.ios.ts`.
 *
 * Metro picks these by file extension, which Jest's resolver does not
 * emulate, so they are imported here by explicit path. That is deliberate:
 * what needs protecting is the *content* of the shims - that they are real
 * no-ops, that their export surface matches the Android hook, and that they
 * never drag react-native-track-player into a build that has no such native
 * module. Whether Metro selects the right file is Metro's job, and is
 * already exercised by `expo export -p web` and the EAS iOS build.
 */

import { act, renderHook } from '@testing-library/react';

import { useForegroundService as webForegroundService } from '@/hooks/use-foreground-service.web';
import { useForegroundService as iosForegroundService } from '@/hooks/use-foreground-service.ios';

const EXPECTED_SURFACE = ['isInitialized', 'startService', 'stopService', 'updateMetadata'];

const variants = [
  ['web', webForegroundService],
  ['ios', iosForegroundService],
] as const;

describe.each(variants)('%s foreground-service shim', (_platform, useShim) => {
  const makeCallbacks = () => ({ onTogglePlayPause: jest.fn() });

  it('exposes exactly the public surface the Android hook returns', () => {
    const { result } = renderHook(() => useShim(makeCallbacks()));

    expect(Object.keys(result.current).sort()).toEqual(EXPECTED_SURFACE);
    expect(result.current.isInitialized).toBe(false);
  });

  it('resolves every method to undefined without throwing', async () => {
    const { result } = renderHook(() => useShim(makeCallbacks()));

    await act(async () => {
      await expect(result.current.startService()).resolves.toBeUndefined();
      await expect(result.current.stopService()).resolves.toBeUndefined();
      await expect(
        result.current.updateMetadata('Rain', 'Playing', true),
      ).resolves.toBeUndefined();
    });
  });

  it('never invokes the caller callbacks (no notification exists to press)', async () => {
    const callbacks = makeCallbacks();
    const { result } = renderHook(() => useShim(callbacks));

    await act(async () => {
      await result.current.startService();
      await result.current.updateMetadata('Rain', 'Playing', true);
      await result.current.stopService();
    });

    expect(callbacks.onTogglePlayPause).not.toHaveBeenCalled();
  });
});

describe('foreground-service shims stay free of react-native-track-player', () => {
  // The Android module calls TrackPlayer.registerPlaybackService() at module
  // scope, so re-exporting from it by mistake would blow up at import time on
  // any platform without the native module. Making the import itself throw is
  // the only way to catch that.
  it.each([
    ['web', '@/hooks/use-foreground-service.web'],
    ['ios', '@/hooks/use-foreground-service.ios'],
  ])('%s shim does not import RNTP', (_platform, modulePath) => {
    jest.isolateModules(() => {
      jest.doMock('react-native-track-player', () => {
        throw new Error('react-native-track-player must never be imported here');
      });

      expect(() => require(modulePath)).not.toThrow();
    });
  });
});
