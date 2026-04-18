/**
 * Tests for utils/start-time.ts (parseStartTime).
 *
 * Split out from the audio-controller test suite because the regex is a pure
 * leaf helper and this file needs no RN/expo mocks.
 */

import { parseStartTime } from '../start-time';

describe('parseStartTime: valid inputs', () => {
  it.each([
    ['00:00', 0],
    ['00:01', 1_000],
    ['01:30', 90_000],
    ['10:00', 600_000],
    ['59:59', 3_599_000],
    ['  1:30 ', 90_000],
  ] as const)('returns %i ms for "%s"', (input, expected) => {
    expect(parseStartTime(input)).toBe(expected);
  });
});

describe('parseStartTime: invalid inputs', () => {
  it.each([
    '',
    ' ',
    '1:2',
    '00:60',
    '00:99',
    'abc',
    '12:34:56',
    '1',
    ':30',
    '01-30',
    '1.30',
  ])('returns null for %j', (input) => {
    expect(parseStartTime(input)).toBeNull();
  });
});
