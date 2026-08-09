/**
 * Contract tests for the non-Android resolutions of the media-notification
 * module.
 *
 * `index.ts` calls `requireNativeModule('MediaNotification')` at module scope,
 * so on web (and iOS, which has no native counterpart) merely importing it
 * throws during evaluation. Metro avoids that by resolving `index.web.ts` /
 * `index.ios.ts` instead - but nothing checks that those shims still match the
 * Android surface, and a mismatch surfaces as a runtime TypeError in the
 * browser with a green suite.
 */

import WebModule from '@/modules/media-notification/index.web';
import IosModule from '@/modules/media-notification/index.ios';

// Mirrors the `MediaNotificationNativeModule` declaration in index.ts plus the
// EventEmitter surface the hook uses (`addListener`).
const EXPECTED_SURFACE = ['addListener', 'removeAllListeners', 'start', 'stop', 'update'];

const variants = [
  ['web', WebModule],
  ['ios', IosModule],
] as const;

describe.each(variants)('%s media-notification shim', (_platform, module) => {
  it('exposes the surface the Android module declares', () => {
    expect(Object.keys(module).sort()).toEqual(EXPECTED_SURFACE);
  });

  it('is a real no-op: every method returns undefined and throws nothing', () => {
    expect(module.start('Rain', 'Playing', true)).toBeUndefined();
    expect(module.update('Rain', 'Paused', false)).toBeUndefined();
    expect(module.stop()).toBeUndefined();
    expect(module.removeAllListeners('onTogglePlayPause')).toBeUndefined();
  });

  it('returns a removable subscription so callers can clean up unconditionally', () => {
    const subscription = module.addListener('onTogglePlayPause', jest.fn());

    expect(typeof subscription.remove).toBe('function');
    expect(() => subscription.remove()).not.toThrow();
  });

  it('never invokes a registered listener (there is no session to press)', () => {
    const listener = jest.fn();
    module.addListener('onStop', listener);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('ios shim', () => {
  it('re-exports the web shim rather than copying it, so the two cannot drift', () => {
    expect(IosModule).toBe(WebModule);
  });
});
