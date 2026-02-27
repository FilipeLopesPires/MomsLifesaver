import TrackPlayer, { Event } from 'react-native-track-player';
import { DeviceEventEmitter } from 'react-native';

export const FOREGROUND_EVENTS = {
  TOGGLE_PLAY_PAUSE: 'foreground:togglePlayPause',
  STOP: 'foreground:stop',
} as const;

export async function PlaybackService() {
  // Only handle RemotePause - the notification always shows pause button
  // because TrackPlayer is always "playing" the silent loop.
  // RemotePlay fires when we programmatically start, so we ignore it.
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    console.log('[PlaybackService] RemotePause received - toggling audio');
    DeviceEventEmitter.emit(FOREGROUND_EVENTS.TOGGLE_PLAY_PAUSE);
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    console.log('[PlaybackService] RemoteStop received - stopping audio');
    DeviceEventEmitter.emit(FOREGROUND_EVENTS.STOP);
  });
}
