/**
 * Android playback service bridge.
 *
 * Registered with `react-native-track-player` by `useForegroundService`.
 * Runs in a separate JS context (the headless service) and forwards the
 * notification's play/pause remote events back to the main React tree
 * via `DeviceEventEmitter`. The main tree listens on
 * `FOREGROUND_EVENTS.TOGGLE_PLAY_PAUSE` and calls the audio controller's
 * toggle on selected tracks.
 *
 * The web companion file (`playback-service.web.ts`) exports a no-op
 * `PlaybackService` so imports stay platform-agnostic.
 */
import TrackPlayer, { Event } from 'react-native-track-player';
import { DeviceEventEmitter } from 'react-native';

export const FOREGROUND_EVENTS = {
  TOGGLE_PLAY_PAUSE: 'foreground:togglePlayPause',
} as const;

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    DeviceEventEmitter.emit(FOREGROUND_EVENTS.TOGGLE_PLAY_PAUSE);
  });

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    DeviceEventEmitter.emit(FOREGROUND_EVENTS.TOGGLE_PLAY_PAUSE);
  });
}
