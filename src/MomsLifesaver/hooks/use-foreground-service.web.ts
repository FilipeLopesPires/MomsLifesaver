type ForegroundServiceCallbacks = {
  onTogglePlayPause: () => void;
  onStop?: () => void;
  onTick?: () => void;
};

export const useForegroundService = (_callbacks: ForegroundServiceCallbacks) => {
  const startService = async () => {};
  const stopService = async () => {};
  const updateMetadata = async (_title: string, _artist: string, _isAudioPlaying?: boolean) => {};
  const startTick = (_intervalMs: number) => {};
  const stopTick = () => {};

  return {
    startService,
    stopService,
    updateMetadata,
    startTick,
    stopTick,
    isInitialized: false,
  };
};
