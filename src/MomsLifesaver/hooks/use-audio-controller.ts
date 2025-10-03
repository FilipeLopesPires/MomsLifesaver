import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

import { TRACK_LIBRARY, type TrackId, type TrackMetadata } from '@/constants/tracks';

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
    interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: false,
    interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: true,
  });
};

export const useAudioController = () => {
  const [state, setState] = useState<ControllerState>(INITIAL_STATE);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const loadAsync = async () => {
      await configureAudioModeAsync();

      const entries = await Promise.all(
        TRACK_LIBRARY.map(async (track) => {
          const { sound } = await Audio.Sound.createAsync(track.audioModule, {
            volume: track.defaultVolume,
            isLooping: true,
            shouldPlay: false,
          });

          return [track.id, {
            metadata: track,
            sound,
            isPlaying: false,
            volume: track.defaultVolume,
          }] as const;
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

    if (nextIsPlaying) {
      await track.sound.setVolumeAsync(track.volume * state.globalVolume);
      await track.sound.playAsync();
    } else {
      await track.sound.pauseAsync();
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
    teardown,
  };
};

