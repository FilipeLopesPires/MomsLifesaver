/**
 * Global logging utility for MomsLifesaver app
 * Allows enabling/disabling all console logs with a single flag
 */

/**
 * Global logging utility for MomsLifesaver app
 * Allows enabling/disabling all console logs with a single flag
 * Supports verbosity levels for granular control
 */

// Global flags to control logging
// It's overridden by app/index.tsx
let LOGGING_ENABLED = true;
let VERBOSE_ENABLED = true;

/**
 * Enable or disable all logging
 * @param enabled - Whether logging should be enabled
 */
export const setLoggingEnabled = (enabled: boolean): void => {
  LOGGING_ENABLED = enabled;
};

/**
 * Enable or disable verbose logging
 * @param enabled - Whether verbose logging should be enabled
 */
export const setVerboseEnabled = (enabled: boolean): void => {
  VERBOSE_ENABLED = enabled;
};

/**
 * Get current logging status
 * @returns Whether logging is currently enabled
 */
export const isLoggingEnabled = (): boolean => {
  return LOGGING_ENABLED;
};

/**
 * Get current verbose logging status
 * @returns Whether verbose logging is currently enabled
 */
export const isVerboseEnabled = (): boolean => {
  return VERBOSE_ENABLED;
};

/**
 * Log a message only if logging is enabled and verbose mode is on
 * Rules:
 * - If LOGGING_ENABLED == false: Only logError prints
 * - If LOGGING_ENABLED == true && VERBOSE_ENABLED == true: log, logWarn, logError print
 * - If LOGGING_ENABLED == true && VERBOSE_ENABLED == false: logWarn, logError print (not standard logs)
 * @param message - The message to log
 * @param optionalParams - Additional parameters to log
 */
export const log = (message?: any, ...optionalParams: any[]): void => {
  if (LOGGING_ENABLED && VERBOSE_ENABLED) {
    console.log(message, ...optionalParams);
  }
};

/**
 * Log an error message - always prints regardless of logging settings
 * @param message - The error message to log
 * @param optionalParams - Additional parameters to log
 */
export const logError = (message?: any, ...optionalParams: any[]): void => {
  console.error(message, ...optionalParams);
};

/**
 * Log a warning message - prints if LOGGING_ENABLED is true
 * @param message - The warning message to log
 * @param optionalParams - Additional parameters to log
 */
export const logWarn = (message?: any, ...optionalParams: any[]): void => {
  if (LOGGING_ENABLED) {
    console.warn(message, ...optionalParams);
  }
};

/**
 * Log an info message - prints if LOGGING_ENABLED is true and verbose mode is on
 * @param message - The info message to log
 * @param optionalParams - Additional parameters to log
 */
export const logInfo = (message?: any, ...optionalParams: any[]): void => {
  if (LOGGING_ENABLED && VERBOSE_ENABLED) {
    console.info(message, ...optionalParams);
  }
};

/**
 * Log a debug message - prints if LOGGING_ENABLED is true and verbose mode is on
 * @param message - The debug message to log
 * @param optionalParams - Additional parameters to log
 */
export const logDebug = (message?: any, ...optionalParams: any[]): void => {
  if (LOGGING_ENABLED && VERBOSE_ENABLED) {
    console.debug(message, ...optionalParams);
  }
};
