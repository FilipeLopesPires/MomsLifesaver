import PlaylistScreen from '@/app/playlist';
import { setLoggingEnabled, setVerboseEnabled } from '@/utils/logger';

// Global logger configuration. See `utils/README.md` for the full matrix.
// - setLoggingEnabled(false) -> errors only
// - setLoggingEnabled(true) + setVerboseEnabled(false) -> warnings + errors
// - setLoggingEnabled(true) + setVerboseEnabled(true)  -> everything
//
// Gated on __DEV__ so release builds stay quiet. The playback paths log on
// every play/pause/seek/volume change, which is useful in Metro and
// `adb logcat` but is pure overhead - and a small privacy leak of listening
// habits into the device log - in a shipped app. logError always prints
// regardless, so genuine failures are still reported in production.
setLoggingEnabled(__DEV__);
setVerboseEnabled(__DEV__);

export default PlaylistScreen;

