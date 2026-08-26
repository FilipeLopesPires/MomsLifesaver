/**
 * Web resolution of the media-notification module.
 *
 * There is no native module to require here, and importing `index.ts` would
 * call `requireNativeModule('MediaNotification')` at module scope and throw
 * during evaluation. Browsers get their media controls from
 * `hooks/use-web-media-session.ts` instead.
 *
 * The shape must stay in step with the `MediaNotificationNativeModule`
 * declaration in `index.ts`; `__tests__/media-notification.test.ts` asserts it.
 */
export type MediaNotificationEventPayload = {
  playWhenReady: boolean;
};

export type MediaNotificationEvents = {
  onTogglePlayPause: (payload: MediaNotificationEventPayload) => void;
  onStop: (payload: MediaNotificationEventPayload) => void;
  onSleepTimerTick: () => void;
};

const noopSubscription = { remove: () => {} };

const MediaNotificationModule = {
  start(_title: string, _artist: string, _isPlaying: boolean) {},
  update(_title: string, _artist: string, _isPlaying: boolean) {},
  stop() {},
  startTick(_intervalMs: number) {},
  stopTick() {},
  addListener<EventName extends keyof MediaNotificationEvents>(
    _eventName: EventName,
    _listener: MediaNotificationEvents[EventName],
  ) {
    return noopSubscription;
  },
  removeAllListeners(_eventName: keyof MediaNotificationEvents) {},
};

export default MediaNotificationModule;
