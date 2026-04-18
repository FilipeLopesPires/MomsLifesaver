/**
 * Tests for utils/error-handler.ts.
 *
 * Contract:
 *   - handleError always calls logError.
 *   - handleError shows Alert.alert on iOS/Android, NEVER on web
 *     (regression guard for the "alert spam on web" bug class).
 *   - handleErrorSilent never shows Alert.alert.
 *   - Each ErrorContext maps to a specific user-facing message.
 */

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
}));

import { Alert, Platform } from 'react-native';

import {
  handleError,
  handleErrorSilent,
  testErrorAlert,
} from '../error-handler';

type MutablePlatform = { OS: 'ios' | 'android' | 'web' };

const mockAlert = Alert.alert as unknown as jest.Mock;
const mutablePlatform = Platform as unknown as MutablePlatform;

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockAlert.mockClear();
  mutablePlatform.OS = 'ios';
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('handleError', () => {
  it('logs the technical message and the error on every platform', () => {
    mutablePlatform.OS = 'web';
    const err = new Error('boom');

    handleError(err, 'audio', 'failed to play');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [prefix, captured] = errorSpy.mock.calls[0];
    expect(prefix).toBe('[audio] failed to play:');
    expect(captured).toBe(err);
  });

  it.each(['ios', 'android'] as const)(
    'shows an Alert on %s',
    (os) => {
      mutablePlatform.OS = os;

      handleError(new Error('x'), 'audio', 'msg');

      expect(mockAlert).toHaveBeenCalledTimes(1);
      const [title, body] = mockAlert.mock.calls[0];
      expect(title).toBe('Oops!');
      expect(body).toBe('Unable to play audio. Please try again.');
    },
  );

  it('does NOT show an Alert on web', () => {
    mutablePlatform.OS = 'web';

    handleError(new Error('x'), 'audio', 'msg');

    expect(mockAlert).not.toHaveBeenCalled();
  });

  it.each([
    ['audio', 'Unable to play audio. Please try again.'],
    [
      'foreground-service',
      'Background playback encountered an issue. Audio may stop when the app is minimized.',
    ],
    ['general', 'Something went wrong. Please try again.'],
  ] as const)('maps ErrorContext "%s" to the expected user message', (context, expected) => {
    mutablePlatform.OS = 'ios';

    handleError(new Error('x'), context, 'msg');

    const [, body] = mockAlert.mock.calls[0];
    expect(body).toBe(expected);
  });
});

describe('handleErrorSilent', () => {
  it('logs the error', () => {
    const err = new Error('silent');

    handleErrorSilent(err, 'general', 'bg task failed');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [prefix, captured] = errorSpy.mock.calls[0];
    expect(prefix).toBe('[general] bg task failed:');
    expect(captured).toBe(err);
  });

  it.each(['ios', 'android', 'web'] as const)(
    'never shows an Alert on %s',
    (os) => {
      mutablePlatform.OS = os;

      handleErrorSilent(new Error('x'), 'audio', 'msg');

      expect(mockAlert).not.toHaveBeenCalled();
    },
  );
});

describe('testErrorAlert', () => {
  it('routes through handleError with the given context', () => {
    mutablePlatform.OS = 'ios';

    testErrorAlert('foreground-service');

    expect(mockAlert).toHaveBeenCalledTimes(1);
    const [, body] = mockAlert.mock.calls[0];
    expect(body).toBe(
      'Background playback encountered an issue. Audio may stop when the app is minimized.',
    );
  });

  it('defaults to the "general" context', () => {
    mutablePlatform.OS = 'ios';

    testErrorAlert();

    const [, body] = mockAlert.mock.calls[0];
    expect(body).toBe('Something went wrong. Please try again.');
  });
});
