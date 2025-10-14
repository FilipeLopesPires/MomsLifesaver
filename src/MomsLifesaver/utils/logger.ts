/**
 * Global logging utility for MomsLifesaver app
 * Allows enabling/disabling all console logs with a single flag
 */

// Global flag to control logging
// It's overridden by app/index.tsx
let LOGGING_ENABLED = true;

/**
 * Enable or disable all logging
 * @param enabled - Whether logging should be enabled
 */
export const setLoggingEnabled = (enabled: boolean): void => {
  LOGGING_ENABLED = enabled;
};

/**
 * Get current logging status
 * @returns Whether logging is currently enabled
 */
export const isLoggingEnabled = (): boolean => {
  return LOGGING_ENABLED;
};

/**
 * Log a message only if logging is enabled
 * @param message - The message to log
 * @param optionalParams - Additional parameters to log
 */
export const log = (message?: any, ...optionalParams: any[]): void => {
  if (LOGGING_ENABLED) {
    console.log(message, ...optionalParams);
  }
};

/**
 * Log an error message only if logging is enabled
 * @param message - The error message to log
 * @param optionalParams - Additional parameters to log
 */
export const logError = (message?: any, ...optionalParams: any[]): void => {
  if (LOGGING_ENABLED) {
    console.error(message, ...optionalParams);
  }
};

/**
 * Log a warning message only if logging is enabled
 * @param message - The warning message to log
 * @param optionalParams - Additional parameters to log
 */
export const logWarn = (message?: any, ...optionalParams: any[]): void => {
  if (LOGGING_ENABLED) {
    console.warn(message, ...optionalParams);
  }
};

/**
 * Log an info message only if logging is enabled
 * @param message - The info message to log
 * @param optionalParams - Additional parameters to log
 */
export const logInfo = (message?: any, ...optionalParams: any[]): void => {
  if (LOGGING_ENABLED) {
    console.info(message, ...optionalParams);
  }
};

/**
 * Log a debug message only if logging is enabled
 * @param message - The debug message to log
 * @param optionalParams - Additional parameters to log
 */
export const logDebug = (message?: any, ...optionalParams: any[]): void => {
  if (LOGGING_ENABLED) {
    console.debug(message, ...optionalParams);
  }
};
