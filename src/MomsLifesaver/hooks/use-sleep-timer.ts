/**
 * Sleep-timer hook: gently fades the master volume to silence, then pauses.
 *
 * Once started, it linearly ramps the master volume from its level at start
 * (the "anchor") down to `0` across the configured duration, then pauses
 * playback and restores the master slider to the anchor so the next session
 * isn't left muted. The idea: soothing background audio helps a baby fall
 * asleep, but shouldn't run all night - it should taper off on its own.
 *
 * It owns no audio itself. The parent wires it to the audio controller through
 * three callbacks (read/write master volume, pause on expiry), mirroring the
 * callbacks-in-a-ref shape of `hooks/use-foreground-service.ts`. The fade is
 * driven by a single `setInterval` computing elapsed time from `Date.now()`,
 * so a throttled/suspended interval (backgrounded tab, locked screen) still
 * resolves to the correct volume when it next fires.
 *
 * v1 is wired up on Web only (see `app/playlist.tsx`); the hook itself is
 * platform-agnostic and inert until `start()` is called.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_DURATION_SEC,
  clampDurationSeconds,
} from '@/utils/duration';

/** How often the fade recomputes the target volume and countdown. */
const TICK_MS = 250;
/**
 * Only push a new master volume once it has moved this far from the last
 * written value. A 0.005 step is inaudible, and it bounds the work to ~200
 * volume writes (and footer re-renders) across the whole fade regardless of
 * whether it runs for 10 seconds or 8 hours.
 */
const VOLUME_WRITE_EPSILON = 0.005;
/** Below this remaining-fraction, treat the fade as effectively finished. */
const FRACTION_EPSILON = 1e-6;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export type SleepTimerStatus = 'idle' | 'running';

export type SleepTimerCallbacks = {
  /** Read the current master volume (0-1) to capture the fade anchor. */
  getMasterVolume: () => number;
  /** Write the master volume (0-1). Wraps the controller's setGlobalVolume. */
  setMasterVolume: (value: number) => void;
  /** Pause playback when the timer reaches zero. May be async. */
  onExpire: () => void | Promise<void>;
};

type SleepTimerState = {
  enabled: boolean;
  status: SleepTimerStatus;
  durationSec: number;
  remainingMs: number;
};

const INITIAL_STATE: SleepTimerState = {
  enabled: false,
  status: 'idle',
  durationSec: DEFAULT_DURATION_SEC,
  remainingMs: 0,
};

export const useSleepTimer = (callbacks: SleepTimerCallbacks) => {
  const [state, setState] = useState<SleepTimerState>(INITIAL_STATE);

  // Live mirrors so the user-event callbacks below stay stable for the life of
  // the hook (same rationale as use-audio-controller): they only ever run long
  // after the commit that refreshed the ref.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Fade bookkeeping, all in refs so the interval reads live values without
  // being re-created.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const anchorRef = useRef(0); // master volume captured at start
  const startedAtRef = useRef(0); // Date.now() at start
  const durationMsRef = useRef(0);
  const lastWrittenVolumeRef = useRef(0);
  const lastDisplaySecRef = useRef(-1);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Reached zero: silence, pause, then restore the slider to the anchor. The
  // restore only happens after the pause resolves so playback is already
  // silent - otherwise a resumed-at-anchor blip could leak before the pause
  // lands.
  const finish = useCallback(async () => {
    clearTimer();
    const cb = callbacksRef.current;
    cb.setMasterVolume(0);
    setState((previous) => ({ ...previous, status: 'idle', remainingMs: 0 }));
    try {
      await cb.onExpire();
    } finally {
      cb.setMasterVolume(clamp01(anchorRef.current));
    }
  }, [clearTimer]);

  const tick = useCallback(() => {
    const durationMs = durationMsRef.current;
    const remaining = Math.max(0, durationMs - (Date.now() - startedAtRef.current));
    const target = clamp01((anchorRef.current * remaining) / durationMs);

    // Write volume on a meaningful move, and always on the final frame so the
    // fade lands exactly on 0.
    if (remaining <= 0 || Math.abs(target - lastWrittenVolumeRef.current) >= VOLUME_WRITE_EPSILON) {
      lastWrittenVolumeRef.current = target;
      callbacksRef.current.setMasterVolume(target);
    }

    // Refresh the countdown only when the displayed whole second changes.
    const displaySec = Math.ceil(remaining / 1000);
    if (displaySec !== lastDisplaySecRef.current) {
      lastDisplaySecRef.current = displaySec;
      setState((previous) => ({ ...previous, remainingMs: remaining }));
    }

    if (remaining <= 0) {
      void finish();
    }
  }, [finish]);

  const start = useCallback(() => {
    clearTimer();
    const durationSec = clampDurationSeconds(stateRef.current.durationSec);
    anchorRef.current = clamp01(callbacksRef.current.getMasterVolume());
    startedAtRef.current = Date.now();
    durationMsRef.current = durationSec * 1000;
    lastWrittenVolumeRef.current = anchorRef.current;
    lastDisplaySecRef.current = durationSec;
    setState((previous) => ({
      ...previous,
      status: 'running',
      durationSec,
      remainingMs: durationSec * 1000,
    }));
    intervalRef.current = setInterval(tick, TICK_MS);
  }, [clearTimer, tick]);

  // Abort a running fade and hand the master volume back to the user at its
  // pre-fade level. Playback keeps going.
  const cancel = useCallback(() => {
    clearTimer();
    callbacksRef.current.setMasterVolume(clamp01(anchorRef.current));
    setState((previous) => ({ ...previous, status: 'idle', remainingMs: 0 }));
  }, [clearTimer]);

  const setEnabled = useCallback(
    (value: boolean) => {
      if (!value && stateRef.current.status === 'running') {
        cancel();
      }
      setState((previous) => ({ ...previous, enabled: value }));
    },
    [cancel],
  );

  const setDurationSec = useCallback((sec: number) => {
    setState((previous) => ({ ...previous, durationSec: clampDurationSeconds(sec) }));
  }, []);

  // The user grabbed the master slider mid-fade. Re-anchor so the fade
  // continues linearly from the value they just set down to 0 over whatever
  // time is left, instead of the next tick yanking the volume back.
  const reanchorMasterVolume = useCallback((value: number) => {
    if (stateRef.current.status !== 'running') {
      return;
    }
    const durationMs = durationMsRef.current;
    const remaining = Math.max(0, durationMs - (Date.now() - startedAtRef.current));
    const fraction = remaining / durationMs;
    anchorRef.current = fraction <= FRACTION_EPSILON ? 0 : value / fraction;
    lastWrittenVolumeRef.current = clamp01(value);
  }, []);

  // Stop the fade if the screen unmounts mid-countdown.
  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    enabled: state.enabled,
    status: state.status,
    durationSec: state.durationSec,
    remainingMs: state.remainingMs,
    setEnabled,
    setDurationSec,
    start,
    cancel,
    reanchorMasterVolume,
  };
};
