/**
 * Tests for utils/logger.ts.
 *
 * Pins the log-level contract:
 *   - log / logInfo / logDebug are the "verbose" tier
 *   - logWarn is the "enabled" tier
 *   - logError is always-on (regression guard: errors must never be silenced)
 */

import {
  isLoggingEnabled,
  isVerboseEnabled,
  log,
  logDebug,
  logError,
  logInfo,
  logWarn,
  setLoggingEnabled,
  setVerboseEnabled,
} from '../logger';

type ConsoleSpies = {
  log: jest.SpyInstance;
  info: jest.SpyInstance;
  debug: jest.SpyInstance;
  warn: jest.SpyInstance;
  error: jest.SpyInstance;
};

let spies: ConsoleSpies;

beforeEach(() => {
  setLoggingEnabled(true);
  setVerboseEnabled(true);
  spies = {
    log: jest.spyOn(console, 'log').mockImplementation(() => {}),
    info: jest.spyOn(console, 'info').mockImplementation(() => {}),
    debug: jest.spyOn(console, 'debug').mockImplementation(() => {}),
    warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
    error: jest.spyOn(console, 'error').mockImplementation(() => {}),
  };
});

afterEach(() => {
  spies.log.mockRestore();
  spies.info.mockRestore();
  spies.debug.mockRestore();
  spies.warn.mockRestore();
  spies.error.mockRestore();
  // Leave flags in the default state for the next file.
  setLoggingEnabled(true);
  setVerboseEnabled(true);
});

describe('logger: default state (logging on, verbose on)', () => {
  it('log prints to console.log', () => {
    log('hello', 1);
    expect(spies.log).toHaveBeenCalledWith('hello', 1);
  });

  it('logInfo prints to console.info', () => {
    logInfo('info', 2);
    expect(spies.info).toHaveBeenCalledWith('info', 2);
  });

  it('logDebug prints to console.debug', () => {
    logDebug('debug', 3);
    expect(spies.debug).toHaveBeenCalledWith('debug', 3);
  });

  it('logWarn prints to console.warn', () => {
    logWarn('warn');
    expect(spies.warn).toHaveBeenCalledWith('warn');
  });

  it('logError prints to console.error', () => {
    logError('error');
    expect(spies.error).toHaveBeenCalledWith('error');
  });
});

describe('logger: setLoggingEnabled(false)', () => {
  beforeEach(() => {
    setLoggingEnabled(false);
  });

  it('silences log, logInfo, logDebug, logWarn', () => {
    log('x');
    logInfo('x');
    logDebug('x');
    logWarn('x');
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
  });

  it('does NOT silence logError', () => {
    logError('boom');
    expect(spies.error).toHaveBeenCalledWith('boom');
  });
});

describe('logger: setVerboseEnabled(false) (logging still on)', () => {
  beforeEach(() => {
    setVerboseEnabled(false);
  });

  it('silences log, logInfo, logDebug', () => {
    log('x');
    logInfo('x');
    logDebug('x');
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.debug).not.toHaveBeenCalled();
  });

  it('leaves logWarn on', () => {
    logWarn('warn');
    expect(spies.warn).toHaveBeenCalledWith('warn');
  });

  it('leaves logError on', () => {
    logError('error');
    expect(spies.error).toHaveBeenCalledWith('error');
  });
});

describe('logger: isLoggingEnabled / isVerboseEnabled reflect setters', () => {
  it('defaults to true/true', () => {
    expect(isLoggingEnabled()).toBe(true);
    expect(isVerboseEnabled()).toBe(true);
  });

  it('tracks setLoggingEnabled', () => {
    setLoggingEnabled(false);
    expect(isLoggingEnabled()).toBe(false);
    setLoggingEnabled(true);
    expect(isLoggingEnabled()).toBe(true);
  });

  it('tracks setVerboseEnabled', () => {
    setVerboseEnabled(false);
    expect(isVerboseEnabled()).toBe(false);
    setVerboseEnabled(true);
    expect(isVerboseEnabled()).toBe(true);
  });
});
