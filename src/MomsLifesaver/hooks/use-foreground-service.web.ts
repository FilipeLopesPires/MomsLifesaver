type ForegroundServiceCallbacks = {
  onTogglePlayPause: () => void;
  onStop?: () => void;
};

export const useForegroundService = (_callbacks: ForegroundServiceCallbacks) => {
  const startService = async () => {};
  const stopService = async () => {};
  const updateMetadata = async (_title: string, _artist: string, _isAudioPlaying?: boolean) => {};

  return {
    startService,
    stopService,
    updateMetadata,
    isInitialized: false,
  };
};
