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
