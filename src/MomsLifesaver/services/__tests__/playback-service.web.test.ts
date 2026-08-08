/**
 * Contract tests for the non-Android resolutions of the playback service.
 *
 * `FOREGROUND_EVENTS` is hand-duplicated across the platform variants, and
 * the Android hook listens on the value from its own copy while the service
 * emits from another. If those ever drift, the notification's play/pause
 * button silently stops reaching the app - with no type error and no
 * failing test. These assertions are the only thing standing in the way.
 */

jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn() },
  Event: { RemotePlay: 'remote-play', RemotePause: 'remote-pause' },
}));

jest.mock('react-native', () => ({
  DeviceEventEmitter: { addListener: jest.fn(), emit: jest.fn() },
}));

import TrackPlayer from 'react-native-track-player';

import { FOREGROUND_EVENTS as ANDROID_EVENTS } from '@/services/playback-service';
import {
  FOREGROUND_EVENTS as WEB_EVENTS,
  PlaybackService as WebPlaybackService,
} from '@/services/playback-service.web';
import {
  FOREGROUND_EVENTS as IOS_EVENTS,
  PlaybackService as IosPlaybackService,
} from '@/services/playback-service.ios';

describe('FOREGROUND_EVENTS parity across platform variants', () => {
  it('web declares the same event names and values as android', () => {
    expect(WEB_EVENTS).toEqual(ANDROID_EVENTS);
    expect(Object.keys(WEB_EVENTS)).toEqual(Object.keys(ANDROID_EVENTS));
  });

  it('ios declares the same event names and values as android', () => {
    expect(IOS_EVENTS).toEqual(ANDROID_EVENTS);
    expect(Object.keys(IOS_EVENTS)).toEqual(Object.keys(ANDROID_EVENTS));
  });
});

describe.each([
  ['web', WebPlaybackService],
  ['ios', IosPlaybackService],
])('%s PlaybackService is a no-op', (_platform, service) => {
  it('resolves without registering any TrackPlayer listener', async () => {
    (TrackPlayer.addEventListener as jest.Mock).mockClear();

    await expect(service()).resolves.toBeUndefined();

    expect(TrackPlayer.addEventListener).not.toHaveBeenCalled();
  });
});
