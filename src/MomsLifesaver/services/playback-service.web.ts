export const FOREGROUND_EVENTS = {
  TOGGLE_PLAY_PAUSE: 'foreground:togglePlayPause',
} as const;

export async function PlaybackService() {
  // No-op on web - foreground service is Android only
}
