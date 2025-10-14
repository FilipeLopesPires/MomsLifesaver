import PlaylistScreen from '@/app/playlist';
import { setLoggingEnabled, setVerboseEnabled } from '@/utils/logger';

// Enable/disable logging globally
// Set to false to disable all console logs from the app (except errors)
setLoggingEnabled(true);

// Enable/disable verbose logging
// Set to true to enable detailed logs (log, logInfo, logDebug)
// Set to false to only show warnings and errors
setVerboseEnabled(true);

export default PlaylistScreen;

