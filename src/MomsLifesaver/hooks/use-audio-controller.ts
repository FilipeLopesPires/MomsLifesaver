/**
 * Core audio controller hook.
 *
 * Owns the in-memory playback state for every track in `TRACK_LIBRARY`:
 *   - loads each track once into a platform-appropriate `Sound` handle
 *     (`expo-audio` on native, `WebSound` on web),
 *   - tracks per-track `isPlaying` / `isPaused` / `volume` flags,
 *   - exposes toggle / play / pause / stop / volume helpers that operate
 *     either on a single track id or on an arbitrary subset of ids,
 *   - configures the native audio mode so playback continues in the
 *     background.
 *
 * `TrackMetadata.startTimes` (when provided) is used to pick a random
 * starting cue on fresh plays; resumed tracks keep their position.
 *
 * Native playback is backed by `expo-audio` (AndroidX Media3 on Android,
 * AVAudioEngine on iOS). This shares a single MediaSession with
 * `react-native-track-player`'s foreground-service notification, so the
 * two stacks no longer fight over AudioFocus the way expo-av + RNTP
 * used to.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';

import { TRACK_LIBRARY, type TrackId, type TrackMetadata } from '@/constants/tracks';
import { log, logError } from '@/utils/logger';
import { parseStartTime } from '@/utils/start-time';
import { WebSoundFactory } from '@/services/web-sound';
import { NativeSoundFactory } from '@/services/native-sound';

export { parseStartTime };

type SoundStatus = {
  isLoaded: boolean;
  positionMillis: number;
  durationMillis?: number;
};

type SoundHandle = {
  playAsync: () => Promise<unknown>;
  pauseAsync: () => Promise<unknown>;
  stopAsync: () => Promise<unknown>;
  setVolumeAsync: (value: number) => Promise<unknown>;
  setPositionAsync: (positionMillis: number) => Promise<unknown>;
  getStatusAsync: () => Promise<SoundStatus>;
  unloadAsync: () => Promise<unknown>;
};

type LoadedTrack = {
  metadata: TrackMetadata;
  sound: SoundHandle;
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;
};

type CreateOptions = {
  volume: number;
  isLooping: boolean;
  shouldPlay: boolean;
  debugLabel?: string;
};

const createSoundAsync = async (
  audioModule: number,
  options: CreateOptions,
): Promise<{ sound: SoundHandle }> => {
  if (Platform.OS === 'web') {
    return WebSoundFactory.createAsync(audioModule, options);
  }
  return NativeSoundFactory.createAsync(audioModule, options);
};

/**
 * Release a batch of sound handles, tolerating individual failures.
 * `Promise.all` would abandon the rest of the batch on the first
 * rejection, leaking every player after it - which matters most on the
 * unmount path, where nothing will ever retry.
 */
const unloadAllAsync = async (sounds: SoundHandle[]): Promise<void> => {
  await Promise.allSettled(sounds.map((sound) => sound.unloadAsync()));
};

type ControllerState = {
  tracks: Partial<Record<TrackId, LoadedTrack>>;
  globalVolume: number;
};

const INITIAL_STATE: ControllerState = {
  tracks: {},
  globalVolume: 1,
};

const configureAudioModeAsync = async () => {
  if (Platform.OS === 'web') {
    return;
  }

  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'duckOthers',
    interruptionModeAndroid: 'duckOthers',
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  });
};

const computeStartPositionAsync = async (track: LoadedTrack): Promise<number> => {
  const { startTimes } = track.metadata;

  if (!startTimes || startTimes.length === 0) {
    return 0;
  }

  const candidate = startTimes[Math.floor(Math.random() * startTimes.length)];
  const parsed = parseStartTime(candidate ?? '');

  if (parsed == null) {
    return 0;
  }

  const status = await track.sound.getStatusAsync();
  if (!status.isLoaded || typeof status.durationMillis !== 'number') {
    return parsed;
  }

  if (parsed >= status.durationMillis) {
    return 0;
  }

  return parsed;
};

export const useAudioController = () => {
  const [state, setState] = useState<ControllerState>(INITIAL_STATE);
  const mountedRef = useRef(true);
  const togglingTracksRef = useRef<Set<TrackId>>(new Set());
  // Mirrors the loaded sound handles so the unmount cleanup can release
  // them. A ref rather than `state.tracks` because the cleanup closure is
  // created once (empty deps) and would otherwise capture the initial,
  // empty state and unload nothing. The handles are assigned once at load
  // and never replaced, so a plain array stays accurate.
  const loadedSoundsRef = useRef<SoundHandle[]>([]);

  useEffect(() => {
    mountedRef.current = true;

    const loadAsync = async () => {
      try {
        log("[MomsLifesaver] loadAsync function started");
        await configureAudioModeAsync();
        log("[MomsLifesaver] Audio mode configured successfully");

        const rawEntries = await Promise.all(
          TRACK_LIBRARY.map(async (track) => {
            try {
              log("[MomsLifesaver] Loading audio for track:", track.id);
              const { sound } = await createSoundAsync(track.audioModule, {
                volume: track.defaultVolume,
                isLooping: true,
                shouldPlay: false,
                debugLabel: track.id,
              });
              log("[MomsLifesaver] Successfully loaded audio for track:", track.id);
              return [track.id, {
                metadata: track,
                sound,
                isPlaying: false,
                isPaused: false,
                volume: track.defaultVolume,
              }] as const;
              } catch (error) {
                // A single track failing to load must not block the other
                // tracks from being available. Log and skip it.
                logError("[MomsLifesaver] Failed to load audio for track:", track.id, error);
                return null;
              }
          }),
        );

        const entries = rawEntries.filter(
          (entry): entry is NonNullable<typeof entry> => entry !== null,
        );

        if (!mountedRef.current) {
          await unloadAllAsync(entries.map(([, track]) => track.sound));
          return;
        }

      loadedSoundsRef.current = entries.map(([, track]) => track.sound);

      setState({
        tracks: Object.fromEntries(entries) as ControllerState['tracks'],
        globalVolume: 1,
      });
      log("[MomsLifesaver] All tracks loaded successfully");
      } catch (error) {
        logError("[MomsLifesaver] Error in loadAsync:", error);
      }
    };

    loadAsync();

    return () => {
      mountedRef.current = false;
      // Release every player we managed to load. Without this the
      // handles outlive the hook: on native each one holds an open
      // Media3/AVAudioEngine player, and on web an <audio> element that
      // keeps its buffer alive.
      const sounds = loadedSoundsRef.current;
      loadedSoundsRef.current = [];
      void unloadAllAsync(sounds);
    };
  }, []);

  // Handle app state changes to maintain background audio
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      log("[MomsLifesaver] App state changed to:", nextAppState);
      
      if (nextAppState === 'background') {
        log("[MomsLifesaver] App went to background - ensuring audio continues");
        // Audio should continue playing in background due to our configuration
      } else if (nextAppState === 'active') {
        log("[MomsLifesaver] App became active - checking audio state");
        // App is back in foreground, audio should still be playing
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, []);

  const toggleTrack = useCallback(async (trackId: TrackId) => {
    // Prevent multiple simultaneous toggles on the same track
    if (togglingTracksRef.current.has(trackId)) {
      log("[MomsLifesaver] Toggle already in progress for track:", trackId);
      return null;
    }
    
    const track = state.tracks[trackId];
    if (!track) return null;

    togglingTracksRef.current.add(trackId);

    try {
      if (track.isPlaying && !track.isPaused) {
        // Track is currently playing - stop it completely
        log("[MomsLifesaver] Stopping track:", trackId);
        await track.sound.stopAsync();
        await track.sound.setPositionAsync(0);
        
        setState((previous) => ({
          ...previous,
          tracks: {
            ...previous.tracks,
            [trackId]: {
              ...previous.tracks[trackId]!,
              isPlaying: false,
              isPaused: false,
            },
          },
        }));
        
        togglingTracksRef.current.delete(trackId);
        return false;
      } else if (track.isPaused) {
        // Track is paused - resume it
        log("[MomsLifesaver] Resuming track:", trackId);
        await track.sound.setVolumeAsync(track.volume * state.globalVolume);
        await track.sound.playAsync();
        
        setState((previous) => ({
          ...previous,
          tracks: {
            ...previous.tracks,
            [trackId]: {
              ...previous.tracks[trackId]!,
              isPlaying: true,
              isPaused: false,
            },
          },
        }));
        
        togglingTracksRef.current.delete(trackId);
        return true;
      } else {
        // Track is stopped - start it
        log("[MomsLifesaver] Starting track:", trackId);
        const startPositionMillis = await computeStartPositionAsync(track);
        if (startPositionMillis > 0) {
          await track.sound.setPositionAsync(startPositionMillis);
        } else {
          await track.sound.setPositionAsync(0);
        }
        await track.sound.setVolumeAsync(track.volume * state.globalVolume);
        await track.sound.playAsync();
        
        setState((previous) => ({
          ...previous,
          tracks: {
            ...previous.tracks,
            [trackId]: {
              ...previous.tracks[trackId]!,
              isPlaying: true,
              isPaused: false,
            },
          },
        }));
        
        togglingTracksRef.current.delete(trackId);
        return true;
      }
    } catch (error) {
      logError("[MomsLifesaver] Error in toggleTrack for:", trackId, error);
      togglingTracksRef.current.delete(trackId);
      return track.isPlaying;
    }
  }, [state.globalVolume, state.tracks]);

  const stopTrack = useCallback(async (trackId: TrackId) => {
    const track = state.tracks[trackId];
    if (!track) return;

    try {
      // Always stop the track regardless of current state
      log("[MomsLifesaver] Stopping track:", trackId);
      await track.sound.stopAsync();
      await track.sound.setPositionAsync(0);
      
      setState((previous) => ({
        ...previous,
        tracks: {
          ...previous.tracks,
          [trackId]: {
            ...previous.tracks[trackId]!,
            isPlaying: false,
            isPaused: false,
          },
        },
      }));
    } catch (error) {
      logError("[MomsLifesaver] Error stopping track:", trackId, error);
    }
  }, [state.tracks]);

  const setTrackVolume = useCallback(async (trackId: TrackId, volume: number) => {
    const track = state.tracks[trackId];
    if (!track) return;

    await track.sound.setVolumeAsync(volume * state.globalVolume);

    setState((previous) => ({
      ...previous,
      tracks: {
        ...previous.tracks,
        [trackId]: {
          ...previous.tracks[trackId]!,
          volume,
        },
      },
    }));
  }, [state.globalVolume, state.tracks]);

  const setGlobalVolume = useCallback(async (value: number) => {
    setState((previous) => ({
      ...previous,
      globalVolume: value,
    }));

    await Promise.all(
      Object.values(state.tracks).map((track) =>
        track?.sound.setVolumeAsync(track.volume * value),
      ),
    );
  }, [state.tracks]);

  const pauseSelectedTracks = useCallback(async (trackIds: TrackId[]) => {
    log("[MomsLifesaver] Pausing selected tracks:", trackIds);
    await Promise.all(
      trackIds.map(async (trackId) => {
        const track = state.tracks[trackId];
        if (track?.isPlaying) {
          try {
            await track.sound.pauseAsync();
            log("[MomsLifesaver] Paused track:", trackId);
          } catch (error) {
            logError("[MomsLifesaver] Error pausing track:", trackId, error);
          }
        }
      }),
    );

    setState((previous) => ({
      ...previous,
      tracks: Object.fromEntries(
        Object.entries(previous.tracks).map(([id, track]) => [
          id,
          track && trackIds.includes(id as TrackId) ? { ...track, isPlaying: false, isPaused: true } : track,
        ]),
      ),
    }));
  }, [state.tracks]);

  const playSelectedTracks = useCallback(async (trackIds: TrackId[]) => {
    log("[MomsLifesaver] Playing selected tracks:", trackIds);
    await Promise.all(
      trackIds.map(async (trackId) => {
        const track = state.tracks[trackId];
        if (track && (!track.isPlaying || track.isPaused)) {
          try {
            if (track.isPaused) {
              // Resume paused track
              await track.sound.setVolumeAsync(track.volume * state.globalVolume);
              await track.sound.playAsync();
              log("[MomsLifesaver] Resuming track:", trackId);
            } else {
              // Start stopped track
              const status = await track.sound.getStatusAsync();
              if (status.isLoaded && status.positionMillis === 0) {
                // Track hasn't been played before, use computed start position
                const startPositionMillis = await computeStartPositionAsync(track);
                if (startPositionMillis > 0) {
                  await track.sound.setPositionAsync(startPositionMillis);
                }
              }
              // If track has been played before (positionMillis > 0), don't reset position
              
              await track.sound.setVolumeAsync(track.volume * state.globalVolume);
              await track.sound.playAsync();
              log("[MomsLifesaver] Playing track:", trackId);
            }
          } catch (error) {
            logError("[MomsLifesaver] Error playing track:", trackId, error);
          }
        }
      }),
    );

    setState((previous) => ({
      ...previous,
      tracks: Object.fromEntries(
        Object.entries(previous.tracks).map(([id, track]) => [
          id,
          track && trackIds.includes(id as TrackId) ? { ...track, isPlaying: true, isPaused: false } : track,
        ]),
      ),
    }));
  }, [state.tracks, state.globalVolume]);

  const toggleSelectedTracksPlayPause = useCallback(async (trackIds: TrackId[]) => {
    const hasPlayingSelectedTracks = trackIds.some(trackId => {
      const track = state.tracks[trackId];
      return track?.isPlaying && !track.isPaused;
    });
    
    if (hasPlayingSelectedTracks) {
      // Pause all selected tracks that are currently playing
      await pauseSelectedTracks(trackIds);
    } else {
      // Play all selected tracks (resume paused ones, start stopped ones)
      await playSelectedTracks(trackIds);
    }
  }, [state.tracks, pauseSelectedTracks, playSelectedTracks]);

  const publicTracks = useMemo(() => {
    return Object.fromEntries(
      Object.entries(state.tracks).map(([id, track]) => [
        id,
        {
          metadata: track!.metadata,
          isPlaying: track!.isPlaying,
          isPaused: track!.isPaused,
          volume: track!.volume,
        },
      ]),
    ) as Record<TrackId, {
      metadata: TrackMetadata;
      isPlaying: boolean;
      isPaused: boolean;
      volume: number;
    }>;
  }, [state.tracks]);

  return {
    tracks: publicTracks,
    globalVolume: state.globalVolume,
    setGlobalVolume,
    toggleTrack,
    stopTrack,
    setTrackVolume,
    pauseSelectedTracks,
    playSelectedTracks,
    toggleSelectedTracksPlayPause,
  };
};

