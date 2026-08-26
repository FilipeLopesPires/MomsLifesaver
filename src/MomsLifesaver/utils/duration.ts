/**
 * Duration helpers for the sleep timer.
 *
 * The sleep timer lets the user pick a fade duration between 10 seconds and
 * 8 hours and counts it down. These are the pure, side-effect-free helpers for
 * clamping that range, converting to/from an H/M/S breakdown for the stepper
 * UI, and formatting a whole-second count for display. Sibling to
 * `utils/start-time.ts` (which does the inverse parse of a `MM:SS` string).
 */

/** Smallest timer the user can set. */
export const MIN_DURATION_SEC = 10;
/** Largest timer the user can set (8 hours). */
export const MAX_DURATION_SEC = 8 * 60 * 60;
/** Value a fresh timer starts at (15 minutes). */
export const DEFAULT_DURATION_SEC = 15 * 60;

export type Hms = { h: number; m: number; s: number };

/**
 * Clamp an arbitrary seconds value into `[MIN_DURATION_SEC, MAX_DURATION_SEC]`,
 * rounding to a whole second. `NaN` collapses to the minimum so a bad stepper
 * read can never escape the range.
 */
export const clampDurationSeconds = (sec: number): number => {
  if (Number.isNaN(sec)) {
    return MIN_DURATION_SEC;
  }
  const rounded = Math.round(sec);
  return Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, rounded));
};

/** Split a whole-second count into hours / minutes / seconds. */
export const secondsToHms = (totalSeconds: number): Hms => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return {
    h: Math.floor(safe / 3600),
    m: Math.floor((safe % 3600) / 60),
    s: safe % 60,
  };
};

/** Recombine an H/M/S breakdown into seconds. */
export const hmsToSeconds = ({ h, m, s }: Hms): number => h * 3600 + m * 60 + s;

const pad2 = (value: number): string => value.toString().padStart(2, '0');

/**
 * Format a whole-second count as `H:MM:SS` (when there is at least one hour)
 * or `MM:SS`. Negative or fractional inputs are floored to `0` and whole
 * seconds respectively, so it is safe to pass a raw countdown value.
 */
export const formatDuration = (totalSeconds: number): string => {
  const { h, m, s } = secondsToHms(totalSeconds);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
};
