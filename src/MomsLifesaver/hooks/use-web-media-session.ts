/**
 * Web-only hook that wires browser media controls to our playback state.
 *
 * When running on the web, it registers `play`, `pause`, and `stop`
 * action handlers on `navigator.mediaSession` and keeps the session
 * metadata (title, artist, playback state) in sync with the currently
 * selected tracks. This makes the app respond to keyboard media keys,
 * the OS media widget, and Bluetooth headset buttons in browsers that
 * expose the Media Session API.
 *
 * No-op on native platforms.
 */
import { useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

type MediaSessionCallbacks = {
  onTogglePlayPause: () => void;
  onStop: () => void;
};

export const useWebMediaSession = (
  callbacks: MediaSessionCallbacks,
  isPlaying: boolean,
  trackNames: string[]
) => {
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref up to date
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Update media session metadata
  const updateMetadata = useCallback(() => {
    if (Platform.OS !== 'web' || !('mediaSession' in navigator)) return;

    const title = trackNames.length > 0 
      ? trackNames.join(', ')
      : "Mom's Lifesaver";

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: isPlaying ? 'Playing' : 'Paused',
      album: "Mom's Lifesaver",
    });

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying, trackNames]);

  // Set up media session handlers
  useEffect(() => {
    if (Platform.OS !== 'web' || !('mediaSession' in navigator)) return;

    const handlePlay = () => {
      callbacksRef.current.onTogglePlayPause();
    };

    const handlePause = () => {
      callbacksRef.current.onTogglePlayPause();
    };

    const handleStop = () => {
      callbacksRef.current.onStop();
    };

    navigator.mediaSession.setActionHandler('play', handlePlay);
    navigator.mediaSession.setActionHandler('pause', handlePause);
    navigator.mediaSession.setActionHandler('stop', handleStop);

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
    };
  }, []);

  // Update metadata when state changes
  useEffect(() => {
    updateMetadata();
  }, [updateMetadata]);
};
