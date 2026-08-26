/**
 * Persisted user-preferences store.
 *
 * Owns the on-device serialization of the handful of choices that must
 * outlive a session: which tracks are selected to play together, each track's
 * volume, the master volume, and whether the Android background-audio
 * foreground service is allowed to run.
 *
 * The whole thing is a single versioned JSON blob under one key, so a write is
 * atomic and the debounced flush in `hooks/use-preferences.ts` has just one
 * target. `parsePreferences` is pure and defensive: any shape it does not
 * recognise - missing key, wrong type, out-of-range volume, unknown track id,
 * or a future/foreign schema version - degrades to defaults instead of
 * throwing, so a corrupt or stale blob can never brick startup.
 *
 * AsyncStorage abstracts the backing store (native key-value store on Android,
 * `localStorage` on web), so no platform split is needed here.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TRACK_MAP, type TrackId } from '@/constants/tracks';

export const STORAGE_KEY = 'momslifesaver:preferences:v1';
export const SCHEMA_VERSION = 1;

export type PreferencesV1 = {
  version: typeof SCHEMA_VERSION;
  /** Tracks the user selected to play together (order preserved). */
  selectedTrackIds: TrackId[];
  /** Per-track volume overrides (0-1). Missing id ⇒ fall back to defaultVolume. */
  trackVolumes: Partial<Record<TrackId, number>>;
  /** Master volume (0-1). */
  masterVolume: number;
  /** Whether the Android foreground service may run (background audio). */
  foregroundServiceEnabled: boolean;
};

/** A fresh defaults object. Callers own the result and may mutate it. */
export const defaultPreferences = (): PreferencesV1 => ({
  version: SCHEMA_VERSION,
  selectedTrackIds: [],
  trackVolumes: {},
  masterVolume: 1,
  foregroundServiceEnabled: true,
});

/** Frozen reference copy for comparisons; use `defaultPreferences()` for a mutable one. */
export const DEFAULT_PREFERENCES: Readonly<PreferencesV1> = Object.freeze(defaultPreferences());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// `in` walks the prototype chain, so 'toString'/'constructor' would falsely
// pass as track ids. Own-property check keeps the allow-list to real ids.
const isTrackId = (key: string): key is TrackId =>
  Object.prototype.hasOwnProperty.call(TRACK_MAP, key);

const normalizeVolume = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
};

const normalizeSelection = (value: unknown): TrackId[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<TrackId>();
  for (const entry of value) {
    if (typeof entry === 'string' && isTrackId(entry)) {
      seen.add(entry);
    }
  }
  return [...seen];
};

const normalizeTrackVolumes = (value: unknown): Partial<Record<TrackId, number>> => {
  if (!isRecord(value)) return {};
  const result: Partial<Record<TrackId, number>> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isTrackId(key)) continue;
    const volume = normalizeVolume(raw);
    if (volume === null) continue;
    result[key] = volume;
  }
  return result;
};

/**
 * Up-convert a persisted blob from an older/unknown schema version to the
 * current shape. Returns null when the version cannot be migrated, so the
 * caller falls back to defaults. No prior versions exist yet - this is the
 * seam for when they do.
 */
const migrate = (
  _version: unknown,
  _data: Record<string, unknown>,
): Record<string, unknown> | null => null;

/**
 * Parse a raw stored string into a valid `PreferencesV1`. Pure and total:
 * never throws, always returns a fresh, fully-normalized object.
 */
export const parsePreferences = (raw: string | null): PreferencesV1 => {
  if (raw == null) return defaultPreferences();

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaultPreferences();
  }

  if (!isRecord(data)) return defaultPreferences();

  // Version gate + migration seam. Anything that is not the current version
  // (older, newer, or missing) is routed through migrate(); an unmigratable
  // blob becomes defaults.
  if (data.version !== SCHEMA_VERSION) {
    const migrated = migrate(data.version, data);
    if (!migrated) return defaultPreferences();
    data = migrated;
  }

  const record = data as Record<string, unknown>;
  return {
    version: SCHEMA_VERSION,
    selectedTrackIds: normalizeSelection(record.selectedTrackIds),
    trackVolumes: normalizeTrackVolumes(record.trackVolumes),
    masterVolume: normalizeVolume(record.masterVolume) ?? DEFAULT_PREFERENCES.masterVolume,
    foregroundServiceEnabled:
      typeof record.foregroundServiceEnabled === 'boolean'
        ? record.foregroundServiceEnabled
        : DEFAULT_PREFERENCES.foregroundServiceEnabled,
  };
};

export const serializePreferences = (preferences: PreferencesV1): string =>
  JSON.stringify(preferences);

/**
 * Read + parse the persisted preferences. A storage read can reject (private
 * mode, quota, a locked store); startup must still succeed, so failures resolve
 * to defaults rather than propagate.
 */
export const loadPreferences = async (): Promise<PreferencesV1> => {
  try {
    return parsePreferences(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultPreferences();
  }
};

export const savePreferences = async (preferences: PreferencesV1): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, serializePreferences(preferences));
};

export const clearPreferences = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEY);
};
