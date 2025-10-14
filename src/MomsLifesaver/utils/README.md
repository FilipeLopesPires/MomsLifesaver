# Logging System Usage

## Overview
The MomsLifesaver app now uses a centralized logging system that allows you to enable/disable all console logs with a single flag.

## How to Control Logging

### Method 1: Edit the main app file
Edit `/src/MomsLifesaver/app/index.tsx` and change:
```typescript
setLoggingEnabled(true);  // Enable logging
setLoggingEnabled(false); // Disable logging
```

### Method 2: Runtime control (for development)
You can also control logging at runtime by importing the logger:
```typescript
import { setLoggingEnabled, isLoggingEnabled } from '@/utils/logger';

// Check current status
console.log('Logging enabled:', isLoggingEnabled());

// Disable logging
setLoggingEnabled(false);

// Enable logging
setLoggingEnabled(true);
```

## Available Logging Functions

- `log(message, ...params)` - General logging
- `logError(message, ...params)` - Error logging
- `logWarn(message, ...params)` - Warning logging
- `logInfo(message, ...params)` - Info logging
- `logDebug(message, ...params)` - Debug logging

## Benefits

1. **Performance**: When disabled, no console operations are performed
2. **Clean Production**: Easy to disable all logs for production builds
3. **Debugging**: Easy to enable/disable during development
4. **Consistent**: All logging goes through the same system

## Example Usage

```typescript
import { log, logError } from '@/utils/logger';

// This will only log if logging is enabled
log('User clicked button');
log('Processing data:', data);

// This will only log errors if logging is enabled
logError('Failed to load audio:', error);
```

## Current Status
All console.log calls in the app have been replaced with the new logging system.
