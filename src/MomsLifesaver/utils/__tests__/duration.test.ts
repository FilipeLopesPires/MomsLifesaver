/**
 * Tests for utils/duration.ts.
 *
 * Pure leaf helpers for the sleep timer: range clamping, H/M/S conversion, and
 * countdown formatting. No RN/expo mocks needed (runs in the web/jsdom project).
 */

import {
  DEFAULT_DURATION_SEC,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  clampDurationSeconds,
  formatDuration,
  hmsToSeconds,
  secondsToHms,
} from '../duration';

describe('range constants', () => {
  it('spans 10 seconds to 8 hours with a 15-minute default', () => {
    expect(MIN_DURATION_SEC).toBe(10);
    expect(MAX_DURATION_SEC).toBe(28_800);
    expect(DEFAULT_DURATION_SEC).toBe(900);
  });
});

describe('clampDurationSeconds', () => {
  it.each([
    [5, MIN_DURATION_SEC],
    [10, 10],
    [900, 900],
    [28_800, 28_800],
    [30_000, MAX_DURATION_SEC],
    [-100, MIN_DURATION_SEC],
  ] as const)('clamps %i to %i', (input, expected) => {
    expect(clampDurationSeconds(input)).toBe(expected);
  });

  it('rounds fractional values to whole seconds', () => {
    expect(clampDurationSeconds(900.4)).toBe(900);
    expect(clampDurationSeconds(900.6)).toBe(901);
  });

  it('collapses NaN to the minimum', () => {
    expect(clampDurationSeconds(Number.NaN)).toBe(MIN_DURATION_SEC);
  });
});

describe('secondsToHms', () => {
  it.each([
    [0, { h: 0, m: 0, s: 0 }],
    [59, { h: 0, m: 0, s: 59 }],
    [900, { h: 0, m: 15, s: 0 }],
    [3661, { h: 1, m: 1, s: 1 }],
    [28_800, { h: 8, m: 0, s: 0 }],
  ] as const)('splits %i seconds', (input, expected) => {
    expect(secondsToHms(input)).toEqual(expected);
  });

  it('floors fractional and negative input', () => {
    expect(secondsToHms(90.9)).toEqual({ h: 0, m: 1, s: 30 });
    expect(secondsToHms(-5)).toEqual({ h: 0, m: 0, s: 0 });
  });
});

describe('hmsToSeconds', () => {
  it('is the inverse of secondsToHms', () => {
    for (const total of [0, 59, 900, 3661, 28_800]) {
      expect(hmsToSeconds(secondsToHms(total))).toBe(total);
    }
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '00:00'],
    [5, '00:05'],
    [65, '01:05'],
    [900, '15:00'],
    [3600, '1:00:00'],
    [3661, '1:01:01'],
    [28_800, '8:00:00'],
  ] as const)('formats %i seconds as "%s"', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  it('floors fractional seconds and clamps negatives to zero', () => {
    expect(formatDuration(65.9)).toBe('01:05');
    expect(formatDuration(-10)).toBe('00:00');
  });
});
