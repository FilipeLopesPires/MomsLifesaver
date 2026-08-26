/**
 * Tests for services/preferences-storage.ts.
 *
 * The parser is the safety net for startup: it must be total (never throw) and
 * defensive (any unrecognised shape degrades to defaults), so a corrupt or
 * stale blob can never brick the app. AsyncStorage is the package's in-memory
 * mock (installed globally in jest.setup.ts), so load/save/clear round-trip
 * against a real key-value store here.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_PREFERENCES,
  SCHEMA_VERSION,
  STORAGE_KEY,
  clearPreferences,
  defaultPreferences,
  loadPreferences,
  parsePreferences,
  savePreferences,
  serializePreferences,
  type PreferencesV1,
} from '@/services/preferences-storage';
import { DEFAULT_DURATION_SEC, MAX_DURATION_SEC, MIN_DURATION_SEC } from '@/utils/duration';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

const validBlob = (): PreferencesV1 => ({
  version: SCHEMA_VERSION,
  selectedTrackIds: ['rain', 'heartbeat'],
  trackVolumes: { rain: 0.8, heartbeat: 0.5 },
  masterVolume: 0.4,
  foregroundServiceEnabled: false,
  timerDurationSec: 1800,
});

describe('parsePreferences', () => {
  it('returns fresh defaults for null (no stored value)', () => {
    expect(parsePreferences(null)).toEqual(defaultPreferences());
  });

  it('returns a NEW object each call, never the frozen reference', () => {
    const a = parsePreferences(null);
    const b = parsePreferences(null);
    expect(a).not.toBe(b);
    expect(a).not.toBe(DEFAULT_PREFERENCES);
    a.selectedTrackIds.push('rain');
    expect(b.selectedTrackIds).toEqual([]); // mutation did not leak
  });

  it('falls back to defaults on invalid JSON', () => {
    expect(parsePreferences('{not json')).toEqual(defaultPreferences());
  });

  it('falls back to defaults when the JSON is not an object', () => {
    expect(parsePreferences('123')).toEqual(defaultPreferences());
    expect(parsePreferences('"a string"')).toEqual(defaultPreferences());
    expect(parsePreferences('[1,2,3]')).toEqual(defaultPreferences());
    expect(parsePreferences('null')).toEqual(defaultPreferences());
  });

  it('falls back to defaults for an unknown schema version', () => {
    const blob = JSON.stringify({ ...validBlob(), version: 999 });
    expect(parsePreferences(blob)).toEqual(defaultPreferences());
  });

  it('falls back to defaults when version is missing', () => {
    const { version: _omit, ...rest } = validBlob();
    expect(parsePreferences(JSON.stringify(rest))).toEqual(defaultPreferences());
  });

  it('round-trips a fully valid blob unchanged', () => {
    const blob = validBlob();
    expect(parsePreferences(serializePreferences(blob))).toEqual(blob);
  });

  it('fills missing fields with defaults', () => {
    const parsed = parsePreferences(JSON.stringify({ version: SCHEMA_VERSION }));
    expect(parsed).toEqual(defaultPreferences());
  });

  it('clamps volumes into [0, 1]', () => {
    const parsed = parsePreferences(
      JSON.stringify({
        version: SCHEMA_VERSION,
        masterVolume: 5,
        trackVolumes: { rain: -2, heartbeat: 0.5 },
      }),
    );
    expect(parsed.masterVolume).toBe(1);
    expect(parsed.trackVolumes.rain).toBe(0);
    expect(parsed.trackVolumes.heartbeat).toBe(0.5);
  });

  it('defaults masterVolume to 1 when it is not a finite number', () => {
    for (const bad of ['null', 'NaN', '"x"'] as const) {
      const parsed = parsePreferences(
        `{"version":${SCHEMA_VERSION},"masterVolume":${bad === 'NaN' ? 'null' : bad}}`,
      );
      expect(parsed.masterVolume).toBe(1);
    }
  });

  it('drops selected track ids that are not in the library and dedupes the rest', () => {
    const parsed = parsePreferences(
      JSON.stringify({
        version: SCHEMA_VERSION,
        selectedTrackIds: ['rain', 'not-a-track', 'rain', 'heartbeat', 42],
      }),
    );
    expect(parsed.selectedTrackIds).toEqual(['rain', 'heartbeat']);
  });

  it('drops track-volume keys that are not in the library or not numbers', () => {
    const parsed = parsePreferences(
      JSON.stringify({
        version: SCHEMA_VERSION,
        trackVolumes: { rain: 0.3, bogus: 0.9, heartbeat: 'loud' },
      }),
    );
    expect(parsed.trackVolumes).toEqual({ rain: 0.3 });
  });

  it('ignores inherited/polluted keys posing as track ids', () => {
    const parsed = parsePreferences(
      JSON.stringify({
        version: SCHEMA_VERSION,
        selectedTrackIds: ['toString', 'constructor'],
        trackVolumes: { toString: 0.5, hasOwnProperty: 1 },
      }),
    );
    expect(parsed.selectedTrackIds).toEqual([]);
    expect(parsed.trackVolumes).toEqual({});
  });

  it('defaults foregroundServiceEnabled to true when not a boolean', () => {
    const parsed = parsePreferences(
      JSON.stringify({ version: SCHEMA_VERSION, foregroundServiceEnabled: 'yes' }),
    );
    expect(parsed.foregroundServiceEnabled).toBe(true);
  });

  it('preserves a false foregroundServiceEnabled', () => {
    const parsed = parsePreferences(
      JSON.stringify({ version: SCHEMA_VERSION, foregroundServiceEnabled: false }),
    );
    expect(parsed.foregroundServiceEnabled).toBe(false);
  });

  it('clamps timerDurationSec into [MIN_DURATION_SEC, MAX_DURATION_SEC]', () => {
    const tooLow = parsePreferences(
      JSON.stringify({ version: SCHEMA_VERSION, timerDurationSec: 1 }),
    );
    expect(tooLow.timerDurationSec).toBe(MIN_DURATION_SEC);

    const tooHigh = parsePreferences(
      JSON.stringify({ version: SCHEMA_VERSION, timerDurationSec: 999999 }),
    );
    expect(tooHigh.timerDurationSec).toBe(MAX_DURATION_SEC);
  });

  it('defaults timerDurationSec when missing, non-numeric, or NaN', () => {
    for (const bad of ['null', 'NaN', '"x"'] as const) {
      const parsed = parsePreferences(
        `{"version":${SCHEMA_VERSION},"timerDurationSec":${bad === 'NaN' ? 'null' : bad}}`,
      );
      expect(parsed.timerDurationSec).toBe(DEFAULT_DURATION_SEC);
    }
    const missing = parsePreferences(JSON.stringify({ version: SCHEMA_VERSION }));
    expect(missing.timerDurationSec).toBe(DEFAULT_DURATION_SEC);
  });
});

describe('load / save / clear', () => {
  it('save then load round-trips through storage', async () => {
    const blob = validBlob();
    await savePreferences(blob);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, serializePreferences(blob));
    await expect(loadPreferences()).resolves.toEqual(blob);
  });

  it('load returns defaults when nothing is stored', async () => {
    await expect(loadPreferences()).resolves.toEqual(defaultPreferences());
  });

  it('load returns defaults (never throws) when the read rejects', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    await expect(loadPreferences()).resolves.toEqual(defaultPreferences());
  });

  it('clear removes the stored key', async () => {
    await savePreferences(validBlob());
    await clearPreferences();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    await expect(loadPreferences()).resolves.toEqual(defaultPreferences());
  });
});
