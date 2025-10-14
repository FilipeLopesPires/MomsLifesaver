import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';

import { TRACK_LIBRARY, type TrackId, type TrackMetadata } from '@/constants/tracks';
import { log, logWarn, logError } from '@/utils/logger';

type LoadedTrack = {
  metadata: TrackMetadata;
  sound: Audio.Sound;
  isPlaying: boolean;
  volume: number;
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

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    interruptionModeIOS: InterruptionModeIOS.DuckOthers,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: true,
  });
};

const parseStartTime = (value: string): number | null => {
  const match = value.trim().match(/^([0-9]{1,2}):([0-9]{2})$/);
  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);

  if (Number.isNaN(minutes) || Number.isNaN(seconds) || seconds >= 60) {
    return null;
  }

  return (minutes * 60 + seconds) * 1000;
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
  log("[MomsLifesaver] useAudioController hook called");
  const [state, setState] = useState<ControllerState>(INITIAL_STATE);
  const mountedRef = useRef(true);

  useEffect(() => {
    log("[MomsLifesaver] useAudioController useEffect started");
    mountedRef.current = true;

    const loadAsync = async () => {
      try {
        log("[MomsLifesaver] loadAsync function started");
        await configureAudioModeAsync();
        log("[MomsLifesaver] Audio mode configured successfully");

        const entries = await Promise.all(
          TRACK_LIBRARY.map(async (track) => {
            try {
              log("[MomsLifesaver] Loading audio for track:", track.id);
              const { sound } = await Audio.Sound.createAsync(track.audioModule, {
                volume: track.defaultVolume,
                isLooping: true,
                shouldPlay: false,
              });
              log("[MomsLifesaver] Successfully loaded audio for track:", track.id);
              return [track.id, {
                metadata: track,
                sound,
                isPlaying: false,
                volume: track.defaultVolume,
              }] as const;
              } catch (error) {
                logError("[MomsLifesaver] Failed to load audio for track:", track.id, error);
                throw error;
              }
          }),
        );

        if (!mountedRef.current) {
          await Promise.all(entries.map(async ([, track]) => track.sound.unloadAsync()));
          return;
        }

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
    };
  }, []);

  const toggleTrack = useCallback(async (trackId: TrackId) => {
    const track = state.tracks[trackId];
    if (!track) return null;

    const nextIsPlaying = !track.isPlaying;

    try {
      if (nextIsPlaying) {
        log("[MomsLifesaver] Starting playback for track:", trackId);
        const startPositionMillis = await computeStartPositionAsync(track);
        if (startPositionMillis > 0) {
          await track.sound.setPositionAsync(startPositionMillis);
        } else {
          await track.sound.setPositionAsync(0);
        }
        await track.sound.setVolumeAsync(track.volume * state.globalVolume);
        log("[MomsLifesaver] Playing track:", trackId, "at volume:", track.volume * state.globalVolume);
        await track.sound.playAsync();
        log("[MomsLifesaver] Successfully started playback for track:", trackId);
      } else {
        log("[MomsLifesaver] Pausing track:", trackId);
        await track.sound.pauseAsync();
        log("[MomsLifesaver] Successfully paused track:", trackId);
      }
    } catch (error) {
      logError("[MomsLifesaver] Error in toggleTrack for:", trackId, error);
    }

    setState((previous) => ({
      ...previous,
      tracks: {
        ...previous.tracks,
        [trackId]: {
          ...previous.tracks[trackId]!,
          isPlaying: nextIsPlaying,
        },
      },
    }));

    return nextIsPlaying;
  }, [state.globalVolume, state.tracks]);

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

  const pauseAllTracks = useCallback(async () => {
    log("[MomsLifesaver] Pausing all tracks");
    await Promise.all(
      Object.values(state.tracks).map(async (track) => {
        if (track?.isPlaying) {
          try {
            await track.sound.pauseAsync();
            log("[MomsLifesaver] Paused track:", track.metadata.id);
          } catch (error) {
            logError("[MomsLifesaver] Error pausing track:", track.metadata.id, error);
          }
        }
      }),
    );

    setState((previous) => ({
      ...previous,
      tracks: Object.fromEntries(
        Object.entries(previous.tracks).map(([id, track]) => [
          id,
          track ? { ...track, isPlaying: false } : track,
        ]),
      ),
    }));
  }, [state.tracks]);

  const playAllTracks = useCallback(async () => {
    log("[MomsLifesaver] Playing all tracks");
    await Promise.all(
      Object.values(state.tracks).map(async (track) => {
        if (track && !track.isPlaying) {
          try {
            const startPositionMillis = await computeStartPositionAsync(track);
            if (startPositionMillis > 0) {
              await track.sound.setPositionAsync(startPositionMillis);
            } else {
              await track.sound.setPositionAsync(0);
            }
            await track.sound.setVolumeAsync(track.volume * state.globalVolume);
            await track.sound.playAsync();
            log("[MomsLifesaver] Playing track:", track.metadata.id);
          } catch (error) {
            logError("[MomsLifesaver] Error playing track:", track.metadata.id, error);
          }
        }
      }),
    );

    setState((previous) => ({
      ...previous,
      tracks: Object.fromEntries(
        Object.entries(previous.tracks).map(([id, track]) => [
          id,
          track ? { ...track, isPlaying: true } : track,
        ]),
      ),
    }));
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
          track && trackIds.includes(id as TrackId) ? { ...track, isPlaying: false } : track,
        ]),
      ),
    }));
  }, [state.tracks]);

  const playSelectedTracks = useCallback(async (trackIds: TrackId[]) => {
    log("[MomsLifesaver] Playing selected tracks:", trackIds);
    await Promise.all(
      trackIds.map(async (trackId) => {
        const track = state.tracks[trackId];
        if (track && !track.isPlaying) {
          try {
            // Only set start position if the track hasn't been played before
            // Check if track is at position 0 (never played) to determine if we should use start position
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
          track && trackIds.includes(id as TrackId) ? { ...track, isPlaying: true } : track,
        ]),
      ),
    }));
  }, [state.tracks, state.globalVolume]);

  const toggleSelectedTracksPlayPause = useCallback(async (trackIds: TrackId[]) => {
    const hasPlayingSelectedTracks = trackIds.some(trackId => state.tracks[trackId]?.isPlaying);
    
    if (hasPlayingSelectedTracks) {
      await pauseSelectedTracks(trackIds);
    } else {
      await playSelectedTracks(trackIds);
    }
  }, [state.tracks, pauseSelectedTracks, playSelectedTracks]);

  const teardown = useCallback(async () => {
    await Promise.all(Object.values(state.tracks).map((track) => track?.sound.unloadAsync()));
  }, [state.tracks]);

  const publicTracks = useMemo(() => {
    return Object.fromEntries(
      Object.entries(state.tracks).map(([id, track]) => [
        id,
        {
          metadata: track!.metadata,
          isPlaying: track!.isPlaying,
          volume: track!.volume,
        },
      ]),
    ) as Record<TrackId, {
      metadata: TrackMetadata;
      isPlaying: boolean;
      volume: number;
    }>;
  }, [state.tracks]);

  return {
    tracks: publicTracks,
    globalVolume: state.globalVolume,
    setGlobalVolume,
    toggleTrack,
    setTrackVolume,
    pauseSelectedTracks,
    playSelectedTracks,
    toggleSelectedTracksPlayPause,
    teardown,
  };
};

