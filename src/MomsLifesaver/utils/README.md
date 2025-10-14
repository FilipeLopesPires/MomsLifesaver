# Logging System Usage

## Overview
The MomsLifesaver app now uses a centralized logging system that allows you to enable/disable all console logs with granular verbosity control.

## Verbosity Levels

The logging system supports three levels of verbosity:

### Level 1: Errors Only
- **When**: `LOGGING_ENABLED = false`
- **What prints**: Only `logError()` calls (always prints regardless of settings)
- **Use case**: Production builds, minimal logging

### Level 2: Warnings and Errors
- **When**: `LOGGING_ENABLED = true` AND `VERBOSE_ENABLED = false`
- **What prints**: `logWarn()` and `logError()` calls
- **Use case**: Production debugging, important issues only

### Level 3: Full Verbose Logging
- **When**: `LOGGING_ENABLED = true` AND `VERBOSE_ENABLED = true`
- **What prints**: `log()`, `logWarn()`, `logError()`, `logInfo()`, `logDebug()` calls
- **Use case**: Development, full debugging

## How to Control Logging

### Method 1: Edit the main app file
Edit `/src/MomsLifesaver/app/index.tsx`:

```typescript
// Level 1: Errors only
setLoggingEnabled(false);

// Level 2: Warnings and errors
setLoggingEnabled(true);
setVerboseEnabled(false);

// Level 3: Full verbose logging
setLoggingEnabled(true);
setVerboseEnabled(true);
```

### Method 2: Runtime control (for development)
```typescript
import { setLoggingEnabled, setVerboseEnabled, isLoggingEnabled, isVerboseEnabled } from '@/utils/logger';

// Check current status
console.log('Logging enabled:', isLoggingEnabled());
console.log('Verbose enabled:', isVerboseEnabled());

// Set verbosity levels
setLoggingEnabled(true);
setVerboseEnabled(false); // Only warnings and errors
```

## Available Logging Functions

- `log(message, ...params)` - General logging (requires verbose mode)
- `logError(message, ...params)` - Error logging (always prints regardless of settings)
- `logWarn(message, ...params)` - Warning logging (prints if logging enabled)
- `logInfo(message, ...params)` - Info logging (requires verbose mode)
- `logDebug(message, ...params)` - Debug logging (requires verbose mode)

## Verbosity Rules Summary

| LOGGING_ENABLED | VERBOSE_ENABLED | log() | logWarn() | logError() | logInfo() | logDebug() |
|----------------|-----------------|-------|-----------|------------|-----------|------------|
| false          | any             | ❌    | ❌        | ✅         | ❌        | ❌         |
| true           | false           | ❌    | ✅        | ✅         | ❌        | ❌         |
| true           | true            | ✅    | ✅        | ✅         | ✅        | ✅         |

## Benefits

1. **Performance**: When disabled, no console operations are performed
2. **Clean Production**: Easy to disable all logs for production builds
3. **Granular Control**: Choose between errors-only, warnings+errors, or full verbose
4. **Debugging**: Easy to enable/disable during development
5. **Consistent**: All logging goes through the same system

## Example Usage

```typescript
import { log, logWarn, logError } from '@/utils/logger';

// This will only log if logging is enabled AND verbose mode is on
log('User clicked button');
log('Processing data:', data);

// This will log if logging is enabled (regardless of verbose mode)
logWarn('Low memory warning');
logError('Failed to load audio:', error);
```

## Current Status
All console.log calls in the app have been replaced with the new logging system with verbosity support.
