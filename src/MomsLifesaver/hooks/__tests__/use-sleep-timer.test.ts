/**
 * Tests for hooks/use-sleep-timer.ts.
 *
 * Drives the fade state machine with fake timers: the ramp from the anchor
 * volume down to 0, the expiry sequence (silence -> pause -> restore), cancel,
 * disable-while-running, duration clamping, and mid-fade re-anchoring.
 *
 * The hook has no react-native/expo imports, so it runs in the web/jsdom
 * project with no platform mocks.
 */

import { act, renderHook } from '@testing-library/react';

import { useSleepTimer, type SleepTimerCallbacks } from '@/hooks/use-sleep-timer';
import { DEFAULT_DURATION_SEC, MAX_DURATION_SEC, MIN_DURATION_SEC } from '@/utils/duration';

type Harness = {
  master: { value: number };
  callbacks: SleepTimerCallbacks & {
    getMasterVolume: jest.Mock;
    setMasterVolume: jest.Mock;
    onExpire: jest.Mock;
  };
};

const makeHarness = (initialVolume = 1): Harness => {
  const master = { value: initialVolume };
  const setMasterVolume = jest.fn((value: number) => {
    master.value = value;
  });
  const getMasterVolume = jest.fn(() => master.value);
  const onExpire = jest.fn(() => undefined);
  return { master, callbacks: { getMasterVolume, setMasterVolume, onExpire } };
};

const writtenVolumes = (harness: Harness): number[] =>
  harness.callbacks.setMasterVolume.mock.calls.map((call) => call[0] as number);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('initial state', () => {
  it('is disabled and idle with the default duration', () => {
    const { callbacks } = makeHarness();
    const { result } = renderHook(() => useSleepTimer(callbacks));

    expect(result.current.enabled).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(result.current.durationSec).toBe(DEFAULT_DURATION_SEC);
    expect(result.current.remainingMs).toBe(0);
  });
});

describe('enable + duration config', () => {
  it('toggles enabled', () => {
    const { callbacks } = makeHarness();
    const { result } = renderHook(() => useSleepTimer(callbacks));

    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
  });

  it('clamps the duration into [10s, 8h]', () => {
    const { callbacks } = makeHarness();
    const { result } = renderHook(() => useSleepTimer(callbacks));

    act(() => result.current.setDurationSec(5));
    expect(result.current.durationSec).toBe(MIN_DURATION_SEC);

    act(() => result.current.setDurationSec(999_999));
    expect(result.current.durationSec).toBe(MAX_DURATION_SEC);

    act(() => result.current.setDurationSec(1800));
    expect(result.current.durationSec).toBe(1800);
  });

  it('disabling while idle leaves the volume untouched', () => {
    const harness = makeHarness(1);
    const { result } = renderHook(() => useSleepTimer(harness.callbacks));

    act(() => result.current.setEnabled(true));
    act(() => result.current.setEnabled(false));

    expect(result.current.enabled).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(harness.callbacks.setMasterVolume).not.toHaveBeenCalled();
  });
});

describe('running the fade', () => {
  it('ramps the master volume down and updates the countdown', () => {
    const harness = makeHarness(1);
    const { result } = renderHook(() => useSleepTimer(harness.callbacks));

    act(() => result.current.setDurationSec(10));
    act(() => result.current.start());

    expect(result.current.status).toBe('running');
    expect(result.current.remainingMs).toBe(10_000);
    expect(harness.callbacks.getMasterVolume).toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2_000);
    });

    // Two seconds in: countdown shows 8s left, still running, volume dropped.
    expect(result.current.status).toBe('running');
    expect(result.current.remainingMs).toBe(8_000);
    expect(harness.master.value).toBeCloseTo(0.8, 1);
    expect(harness.master.value).toBeLessThan(1);
  });

  it('skips redundant volume writes on a long fade', () => {
    const harness = makeHarness(1);
    const { result } = renderHook(() => useSleepTimer(harness.callbacks));

    // Over 8 hours a 250ms step moves the volume far less than the write
    // epsilon, so the fade should hold its writes instead of firing every tick.
    act(() => result.current.setDurationSec(MAX_DURATION_SEC));
    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(result.current.status).toBe('running');
    expect(harness.callbacks.setMasterVolume).not.toHaveBeenCalled();
  });

  it('lands on silence, pauses, then restores the slider at expiry', async () => {
    const harness = makeHarness(1);
    const { result } = renderHook(() => useSleepTimer(harness.callbacks));

    act(() => result.current.setDurationSec(10));
    act(() => result.current.start());

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });

    const volumes = writtenVolumes(harness);
    // The fade actually ramped (a mid value strictly between 0 and 1).
    expect(volumes.some((v) => v > 0 && v < 1)).toBe(true);
    // It hit exactly 0 at some point.
    expect(volumes).toContain(0);
    // Playback was paused, then the slider was restored to the pre-fade anchor.
    expect(harness.callbacks.onExpire).toHaveBeenCalledTimes(1);
    expect(volumes[volumes.length - 1]).toBe(1);
    expect(result.current.status).toBe('idle');
    expect(result.current.remainingMs).toBe(0);
  });
});

describe('cancel', () => {
  it('stops the fade and restores the anchor while leaving playback alone', () => {
    const harness = makeHarness(1);
    const { result } = renderHook(() => useSleepTimer(harness.callbacks));

    act(() => result.current.setDurationSec(10));
    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(2_000);
    });

    act(() => result.current.cancel());

    expect(result.current.status).toBe('idle');
    expect(harness.master.value).toBe(1);
    expect(harness.callbacks.onExpire).not.toHaveBeenCalled();

    // Interval is cleared: further time does nothing.
    const callsAfterCancel = harness.callbacks.setMasterVolume.mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(harness.callbacks.setMasterVolume.mock.calls.length).toBe(callsAfterCancel);
  });
});

describe('disable while running', () => {
  it('cancels the fade and restores the volume', () => {
    const harness = makeHarness(1);
    const { result } = renderHook(() => useSleepTimer(harness.callbacks));

    act(() => result.current.setEnabled(true));
    act(() => result.current.setDurationSec(10));
    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(3_000);
    });

    act(() => result.current.setEnabled(false));

    expect(result.current.enabled).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(harness.master.value).toBe(1);
    expect(harness.callbacks.onExpire).not.toHaveBeenCalled();
  });
});

describe('reanchorMasterVolume', () => {
  it('is a no-op when the timer is not running', () => {
    const harness = makeHarness(1);
    const { result } = renderHook(() => useSleepTimer(harness.callbacks));

    act(() => result.current.reanchorMasterVolume(0.5));
    expect(harness.callbacks.setMasterVolume).not.toHaveBeenCalled();
  });

  it('re-anchors so the fade continues from the dragged value', () => {
    const harness = makeHarness(1);
    const { result } = renderHook(() => useSleepTimer(harness.callbacks));

    act(() => result.current.setDurationSec(10));
    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    // Halfway: without a re-anchor the target would be ~0.5.
    expect(harness.master.value).toBeCloseTo(0.5, 1);

    act(() => result.current.reanchorMasterVolume(0.8));
    act(() => {
      jest.advanceTimersByTime(250);
    });

    // Continues downward from ~0.8 rather than snapping back to ~0.5.
    expect(harness.master.value).toBeGreaterThan(0.5);
    expect(harness.master.value).toBeLessThan(0.8);
  });

  it('pins to silence without dividing by zero when re-anchored at the end', () => {
    const harness = makeHarness(1);
    const { result } = renderHook(() => useSleepTimer(harness.callbacks));

    act(() => result.current.setDurationSec(10));
    act(() => result.current.start());
    // Jump the clock past the end WITHOUT firing the interval, so the status is
    // still 'running' while the remaining fraction is exactly 0.
    act(() => {
      jest.setSystemTime(20_000);
    });

    expect(() => {
      act(() => result.current.reanchorMasterVolume(0.5));
    }).not.toThrow();
    expect(result.current.status).toBe('running');
  });
});

describe('cleanup', () => {
  it('clears the fade interval on unmount so no further ticks fire', () => {
    const harness = makeHarness(1);
    const { result, unmount } = renderHook(() => useSleepTimer(harness.callbacks));

    act(() => result.current.setDurationSec(10));
    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    const callsBeforeUnmount = harness.callbacks.setMasterVolume.mock.calls.length;
    unmount();
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(harness.callbacks.setMasterVolume.mock.calls.length).toBe(callsBeforeUnmount);
    expect(harness.callbacks.onExpire).not.toHaveBeenCalled();
  });
});
