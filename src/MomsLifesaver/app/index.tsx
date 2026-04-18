import PlaylistScreen from '@/app/playlist';
import { setLoggingEnabled, setVerboseEnabled } from '@/utils/logger';

// Global logger configuration. See `utils/README.md` for the full matrix.
// - setLoggingEnabled(false) -> errors only
// - setLoggingEnabled(true) + setVerboseEnabled(false) -> warnings + errors
// - setLoggingEnabled(true) + setVerboseEnabled(true)  -> everything
setLoggingEnabled(true);
setVerboseEnabled(true);

export default PlaylistScreen;

