/**
 * Preferences coordinator: hydrates persisted user choices on startup, seeds
 * the two live state owners from them, and writes changes back with a debounce.
 *
 * It is a persistence *coordinator*, not a state store. `useAudioController`
 * still owns the live volumes and playback; `PlaylistScreen` still owns the
 * live selection. This provider owns only:
 *   - the hydrated snapshot used to seed those owners once, at mount;
 *   - the debounced write pipeline (`persist*`);
 *   - the one genuinely app-wide live setting, `foregroundServiceEnabled`,
 *     which the Settings screen flips and PlaylistScreen reacts to; and
 *   - `resetPreferences()` + a `resetNonce` the owners watch to restore defaults.
 *
 * Provider is built with `createElement` (no JSX) so the file stays a plain
 * `.ts` module and is collected by the hooks coverage glob (which globs .ts).
 *
 * Fade safety: master-volume writes come only from the user-drag path in
 * `app/playlist.tsx` (`persistMasterVolume`). The sleep timer's fade writes
 * `setGlobalVolume` directly and never touches this hook, so a mid-fade `0` is
 * never persisted.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import type { TrackId } from '@/constants/tracks';
import {
  clearPreferences,
  defaultPreferences,
  loadPreferences,
  savePreferences,
  type PreferencesV1,
} from '@/services/preferences-storage';
import { handleErrorSilent } from '@/utils/error-handler';
import { log } from '@/utils/logger';

/** Trailing debounce for continuous inputs (slider drags). */
const FLUSH_DEBOUNCE_MS = 300;

export type PreferencesSeed = {
  masterVolume: number;
  trackVolumes: Partial<Record<TrackId, number>>;
};

export type PreferencesContextValue = {
  /** True once the persisted snapshot has loaded. Gate first paint on this. */
  hydrated: boolean;
  /** Seed getters, read once by the owners at mount (post-hydration). */
  getInitialSelection: () => TrackId[];
  getSeed: () => PreferencesSeed;
  initialForegroundServiceEnabled: boolean;
  /** Last-selected sleep-timer fade duration, in whole seconds, seeded once at mount. */
  initialTimerDurationSec: number;
  /** Live app-wide toggle for the Android background-audio service. */
  foregroundServiceEnabled: boolean;
  setForegroundServiceEnabled: (value: boolean) => void;
  /** Write-through setters used by the state owners. */
  persistSelection: (ids: TrackId[]) => void;
  persistTrackVolume: (id: TrackId, volume: number) => void;
  persistMasterVolume: (volume: number) => void;
  persistTimerDuration: (seconds: number) => void;
  /** Clear storage + restore defaults; bumps `resetNonce`. */
  resetPreferences: () => Promise<void>;
  /** Incremented on every reset so owners can react (stop playback, etc.). */
  resetNonce: number;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
  // The snapshot is the single source of truth for what gets written. Kept in a
  // ref (not state) so slider-rate writes never trigger a provider re-render.
  const snapshotRef = useRef<PreferencesV1>(defaultPreferences());
  const [hydrated, setHydrated] = useState(false);
  const [foregroundServiceEnabled, setForegroundServiceEnabledState] = useState(
    () => defaultPreferences().foregroundServiceEnabled,
  );
  const [resetNonce, setResetNonce] = useState(0);
  const initialForegroundServiceEnabledRef = useRef(
    defaultPreferences().foregroundServiceEnabled,
  );
  const initialTimerDurationSecRef = useRef(defaultPreferences().timerDurationSec);

  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writeSnapshot = useCallback(() => {
    void savePreferences(snapshotRef.current).catch((error) =>
      handleErrorSilent(error, 'general', 'Failed to persist preferences'),
    );
  }, []);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  // Write immediately (discrete actions, background/close hooks).
  const flushNow = useCallback(() => {
    clearFlushTimer();
    writeSnapshot();
  }, [clearFlushTimer, writeSnapshot]);

  // Coalesce continuous inputs into ~1 write per debounce window.
  const scheduleFlush = useCallback(() => {
    clearFlushTimer();
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      writeSnapshot();
    }, FLUSH_DEBOUNCE_MS);
  }, [clearFlushTimer, writeSnapshot]);

  // Hydrate once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadPreferences();
      if (cancelled) return;
      snapshotRef.current = loaded;
      initialForegroundServiceEnabledRef.current = loaded.foregroundServiceEnabled;
      initialTimerDurationSecRef.current = loaded.timerDurationSec;
      setForegroundServiceEnabledState(loaded.foregroundServiceEnabled);
      setHydrated(true);
      log('[Preferences] Hydrated from storage');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flush any pending write before the app is backgrounded or the tab is
  // discarded, so a drag immediately before close is not lost.
  useEffect(() => {
    if (Platform.OS === 'web') {
      const onHidden = () => flushNow();
      const onVisibility = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          flushNow();
        }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', onHidden);
      }
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility);
      }
      return () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('pagehide', onHidden);
        }
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibility);
        }
      };
    }

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        flushNow();
      }
    });
    return () => subscription.remove();
  }, [flushNow]);

  // Don't lose a pending debounced write when the provider unmounts.
  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) {
        flushNow();
      }
    },
    [flushNow],
  );

  const persistSelection = useCallback(
    (ids: TrackId[]) => {
      snapshotRef.current = { ...snapshotRef.current, selectedTrackIds: [...ids] };
      // Selection changes are discrete taps, not a stream - write straight away.
      flushNow();
    },
    [flushNow],
  );

  const persistTrackVolume = useCallback(
    (id: TrackId, volume: number) => {
      snapshotRef.current = {
        ...snapshotRef.current,
        trackVolumes: { ...snapshotRef.current.trackVolumes, [id]: volume },
      };
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const persistMasterVolume = useCallback(
    (volume: number) => {
      snapshotRef.current = { ...snapshotRef.current, masterVolume: volume };
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const persistTimerDuration = useCallback(
    (seconds: number) => {
      snapshotRef.current = { ...snapshotRef.current, timerDurationSec: seconds };
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const setForegroundServiceEnabled = useCallback(
    (value: boolean) => {
      snapshotRef.current = { ...snapshotRef.current, foregroundServiceEnabled: value };
      setForegroundServiceEnabledState(value);
      flushNow();
    },
    [flushNow],
  );

  const resetPreferences = useCallback(async () => {
    clearFlushTimer();
    snapshotRef.current = defaultPreferences();
    setForegroundServiceEnabledState(snapshotRef.current.foregroundServiceEnabled);
    setResetNonce((previous) => previous + 1);
    try {
      await clearPreferences();
    } catch (error) {
      handleErrorSilent(error, 'general', 'Failed to clear preferences');
    }
  }, [clearFlushTimer]);

  const getInitialSelection = useCallback(() => [...snapshotRef.current.selectedTrackIds], []);
  const getSeed = useCallback(
    (): PreferencesSeed => ({
      masterVolume: snapshotRef.current.masterVolume,
      trackVolumes: { ...snapshotRef.current.trackVolumes },
    }),
    [],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({
      hydrated,
      getInitialSelection,
      getSeed,
      initialForegroundServiceEnabled: initialForegroundServiceEnabledRef.current,
      initialTimerDurationSec: initialTimerDurationSecRef.current,
      foregroundServiceEnabled,
      setForegroundServiceEnabled,
      persistSelection,
      persistTrackVolume,
      persistMasterVolume,
      persistTimerDuration,
      resetPreferences,
      resetNonce,
    }),
    [
      hydrated,
      getInitialSelection,
      getSeed,
      foregroundServiceEnabled,
      setForegroundServiceEnabled,
      persistSelection,
      persistTrackVolume,
      persistMasterVolume,
      persistTimerDuration,
      resetPreferences,
      resetNonce,
    ],
  );

  return createElement(PreferencesContext.Provider, { value }, children);
};

export const usePreferences = (): PreferencesContextValue => {
  const context = useContext(PreferencesContext);
  if (context === null) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};
