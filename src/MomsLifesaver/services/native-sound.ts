/**
 * Native (iOS / Android) replacement for `expo-av`'s `Audio.Sound`.
 *
 * Wraps an `expo-audio` AudioPlayer and exposes the subset of the
 * `Sound` API that `useAudioController` relies on: `playAsync`,
 * `pauseAsync`, `stopAsync`, `setVolumeAsync`, `setPositionAsync`,
 * `getStatusAsync`, and `unloadAsync`. This adapter lets the
 * controller share a single SoundHandle interface with `WebSound`.
 *
 * Loading semantics: unlike `expo-audio`'s `createAudioPlayer`, which
 * returns synchronously with an un-loaded player, `createAsync` here
 * awaits the first `playbackStatusUpdate` event that reports
 * `isLoaded: true`. This restores the contract `expo-av`'s
 * `Audio.Sound.createAsync` used to provide, so callers can treat
 * "createAsync resolved" as "the handle is ready to play". A safety
 * timeout guards against a silent load failure blocking the app.
 *
 * We also subscribe to further status updates to emit one-shot
 * diagnostic logs per player: first time it becomes loaded, first
 * time it starts playing, and any transition to ended/stalled. This
 * makes the native behaviour visible in Metro logs and `adb logcat`
 * without needing to attach a debugger to the JVM.
 */
import { createAudioPlayer } from 'expo-audio';

import { log, logError, logWarn } from '@/utils/logger';

type CreateOptions = {
  volume?: number;
  isLooping?: boolean;
  shouldPlay?: boolean;
  /**
   * Optional human-readable tag included in diagnostic logs. Useful
   * so that per-track messages in `adb logcat` / Metro say "rain"
   * instead of an anonymous "AudioPlayer".
   */
  debugLabel?: string;
};

type PlaybackStatus = {
  isLoaded: boolean;
  positionMillis: number;
  durationMillis?: number;
};

export type NativeSoundHandle = {
  playAsync: () => Promise<unknown>;
  pauseAsync: () => Promise<unknown>;
  stopAsync: () => Promise<unknown>;
  setVolumeAsync: (value: number) => Promise<unknown>;
  setPositionAsync: (positionMillis: number) => Promise<unknown>;
  getStatusAsync: () => Promise<PlaybackStatus>;
  unloadAsync: () => Promise<unknown>;
};

type StatusEvent = {
  isLoaded?: boolean;
  playing?: boolean;
  playbackState?: string;
  didJustFinish?: boolean;
  isBuffering?: boolean;
};

type Subscription = { remove: () => void };

type AudioPlayerLike = {
  loop: boolean;
  volume: number;
  isLoaded?: boolean;
  currentTime?: number;
  duration?: number;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => Promise<void> | void;
  remove: () => void;
  addListener?: (
    event: 'playbackStatusUpdate',
    listener: (status: StatusEvent) => void,
  ) => Subscription;
};

/**
 * How long we wait for the player's first `isLoaded: true` status
 * event before resolving anyway. Resolving late (but not forever)
 * keeps the UI responsive even when an asset silently fails to load.
 */
const LOAD_TIMEOUT_MS = 15_000;

const awaitLoaded = (
  player: AudioPlayerLike,
  label: string,
): Promise<void> => {
  // Already loaded (rare but possible if the player was reused).
  if (player.isLoaded === true) {
    return Promise.resolve();
  }

  if (typeof player.addListener !== 'function') {
    // Old runtimes / test stubs without an emitter: fall back to
    // treating the player as loaded. The safety timeout below still
    // protects real devices.
    logWarn(
      '[NativeSound]',
      label,
      'no addListener available; resolving immediately',
    );
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    let subscription: Subscription | null = null;

    const finish = (reason: 'loaded' | 'timeout') => {
      if (settled) {
        return;
      }
      settled = true;
      subscription?.remove();
      if (reason === 'timeout') {
        logWarn(
          '[NativeSound]',
          label,
          `load timeout after ${LOAD_TIMEOUT_MS}ms - resolving anyway`,
        );
      }
      clearTimeout(timeoutId);
      resolve();
    };

    const timeoutId = setTimeout(() => finish('timeout'), LOAD_TIMEOUT_MS);

    subscription = player.addListener!('playbackStatusUpdate', (status) => {
      if (status?.isLoaded === true) {
        log('[NativeSound]', label, 'loaded');
        finish('loaded');
      }
    });
  });
};

/**
 * Subscribe to per-player status transitions we care about for
 * debugging, emitting at most one log per transition type per
 * player. This is deliberately chatty only on the first occurrence
 * so the logs stay readable when tracks loop many times.
 */
const attachDiagnosticLogs = (
  player: AudioPlayerLike,
  label: string,
): void => {
  if (typeof player.addListener !== 'function') {
    return;
  }

  let loggedPlaying = false;
  let loggedEnded = false;

  player.addListener('playbackStatusUpdate', (status) => {
    if (status?.playing === true && !loggedPlaying) {
      loggedPlaying = true;
      log('[NativeSound]', label, 'playing=true (audio output should start)');
    }
    if (status?.playbackState === 'ended' && !loggedEnded) {
      loggedEnded = true;
      log('[NativeSound]', label, 'playbackState=ended');
    }
    if (status?.playbackState === 'idle') {
      log('[NativeSound]', label, 'playbackState=idle (player in idle state)');
    }
  });
};

export const NativeSoundFactory = {
  createAsync: async (
    audioModule: number,
    options: CreateOptions,
  ): Promise<{ sound: NativeSoundHandle }> => {
    const label = options.debugLabel ?? `audio#${audioModule}`;

    log('[NativeSound]', label, 'creating player');
    const player = createAudioPlayer(audioModule) as unknown as AudioPlayerLike;
    player.loop = options.isLooping ?? false;
    player.volume = options.volume ?? 1;

    attachDiagnosticLogs(player, label);

    await awaitLoaded(player, label);

    if (options.shouldPlay) {
      log('[NativeSound]', label, 'calling play() after initial load');
      player.play();
    }

    const sound: NativeSoundHandle = {
      playAsync: async () => {
        log('[NativeSound]', label, 'play()');
        player.play();
      },
      pauseAsync: async () => {
        log('[NativeSound]', label, 'pause()');
        player.pause();
      },
      stopAsync: async () => {
        log('[NativeSound]', label, 'stop()');
        player.pause();
        try {
          await player.seekTo(0);
        } catch {
          // seekTo can reject if the source is not fully loaded; the
          // pause above is the important part.
        }
      },
      setVolumeAsync: async (value: number) => {
        player.volume = value;
      },
      setPositionAsync: async (positionMillis: number) => {
        try {
          await player.seekTo(positionMillis / 1000);
        } catch (error) {
          logError('[NativeSound]', label, 'seek error:', error);
        }
      },
      getStatusAsync: async () => ({
        isLoaded: player.isLoaded === true,
        positionMillis: (player.currentTime ?? 0) * 1000,
        durationMillis:
          typeof player.duration === 'number' &&
          Number.isFinite(player.duration) &&
          player.duration > 0
            ? player.duration * 1000
            : undefined,
      }),
      unloadAsync: async () => {
        try {
          player.remove();
        } catch (error) {
          logError('[NativeSound]', label, 'remove error:', error);
        }
      },
    };

    return { sound };
  },
};
