# Logging System

## Overview

The Mom's Lifesaver app routes every console call through a centralized
logger (`utils/logger.ts`). Two runtime flags control what actually
reaches the console:

- `LOGGING_ENABLED` - master switch for everything except errors.
- `VERBOSE_ENABLED` - opens the gate to `log`, `logInfo`, and `logDebug`.

Both flags default to `true` inside `logger.ts` and are overridden at
startup by `app/index.tsx` (see [Configuration](#configuration) below).

## Verbosity Levels

| `LOGGING_ENABLED` | `VERBOSE_ENABLED` | `log` | `logWarn` | `logError` | `logInfo` | `logDebug` |
| ----------------- | ----------------- | ----- | --------- | ---------- | --------- | ---------- |
| false             | any               | no    | no        | yes        | no        | no         |
| true              | false             | no    | yes       | yes        | no        | no         |
| true              | true              | yes   | yes       | yes        | yes       | yes        |

- **Level 1 (errors only)** - good for production builds.
- **Level 2 (warnings + errors)** - useful for production debugging.
- **Level 3 (full verbose)** - the default during development.

`logError` always prints because it is reserved for genuine failures the
user or developer needs to know about.

## Configuration

### At app startup

Edit `app/index.tsx` to pick the verbosity level used for the running app:

```ts
import { setLoggingEnabled, setVerboseEnabled } from '@/utils/logger';

// Level 1: errors only
setLoggingEnabled(false);

// Level 2: warnings and errors
setLoggingEnabled(true);
setVerboseEnabled(false);

// Level 3: full verbose logging
setLoggingEnabled(true);
setVerboseEnabled(true);
```

### At runtime

The same functions can be called from anywhere at runtime - e.g. from a
debug overlay, tests, or the React Native DevTools console:

```ts
import {
  setLoggingEnabled,
  setVerboseEnabled,
  isLoggingEnabled,
  isVerboseEnabled,
} from '@/utils/logger';

console.log('Logging enabled:', isLoggingEnabled());
console.log('Verbose enabled:', isVerboseEnabled());

setLoggingEnabled(true);
setVerboseEnabled(false); // warnings and errors only
```

## API

- `log(message, ...params)` - general logging; requires verbose mode.
- `logError(message, ...params)` - always prints.
- `logWarn(message, ...params)` - prints if logging is enabled.
- `logInfo(message, ...params)` - requires verbose mode.
- `logDebug(message, ...params)` - requires verbose mode.

## Example

```ts
import { log, logWarn, logError } from '@/utils/logger';

log('User clicked button');
log('Processing data:', data);

logWarn('Low memory warning');
logError('Failed to load audio:', error);
```

## Why a wrapper?

1. **Performance** - when disabled, the guarded branches short-circuit
   before calling `console.*`.
2. **Clean production output** - one flag silences the entire app.
3. **Granular control** - errors, warnings, and verbose logs can be
   toggled independently.
4. **Consistency** - every call site uses the same API, which makes it
   straightforward to search, filter, or redirect log output later.
