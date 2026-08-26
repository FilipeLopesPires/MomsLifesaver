/**
 * Tests for app/settings.tsx.
 *
 * The screen wires the preferences + notification-permission hooks to a small
 * set of rows. Both hooks are mocked so the tests focus on the screen's own
 * logic: which rows show per platform, the notification button's label/action
 * by status, the foreground toggle, and the reset confirmation flow (Alert on
 * native, window.confirm on web).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});

const mockPrefs = {
  foregroundServiceEnabled: true,
  setForegroundServiceEnabled: jest.fn(),
  resetPreferences: jest.fn().mockResolvedValue(undefined),
};
jest.mock('@/hooks/use-preferences', () => ({
  usePreferences: () => mockPrefs,
}));

const mockPermission = {
  available: true,
  status: 'denied' as string,
  request: jest.fn().mockResolvedValue('granted'),
  openSettings: jest.fn().mockResolvedValue(undefined),
  refresh: jest.fn(),
};
jest.mock('@/hooks/use-notification-permission', () => ({
  useNotificationPermission: () => mockPermission,
}));

import { Alert, Platform } from 'react-native';
import SettingsScreen from '@/app/settings';

const setPlatform = (os: 'web' | 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
};

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform('android');
  mockPrefs.foregroundServiceEnabled = true;
  mockPermission.available = true;
  mockPermission.status = 'denied';
});

describe('layout', () => {
  it('renders notification, background-audio and reset rows on Android', () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId('settings-notification-row')).toBeTruthy();
    expect(screen.getByTestId('settings-foreground-row')).toBeTruthy();
    expect(screen.getByTestId('settings-reset-row')).toBeTruthy();
  });

  it('hides the Android-only rows on web', () => {
    setPlatform('web');
    mockPermission.available = false;
    render(<SettingsScreen />);
    expect(screen.queryByTestId('settings-notification-row')).toBeNull();
    expect(screen.queryByTestId('settings-foreground-row')).toBeNull();
    expect(screen.getByTestId('settings-reset-row')).toBeTruthy();
  });
});

describe('notification permission control', () => {
  it('labels the button "Allow" when not yet granted and requests on press', () => {
    mockPermission.status = 'denied';
    render(<SettingsScreen />);

    expect(screen.getByText('Allow')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-notification-button'));
    expect(mockPermission.request).toHaveBeenCalledTimes(1);
    expect(mockPermission.openSettings).not.toHaveBeenCalled();
  });

  it('labels the button "Allowed" when granted', () => {
    mockPermission.status = 'granted';
    render(<SettingsScreen />);
    expect(screen.getByText('Allowed')).toBeTruthy();
  });

  it('labels the button "Open settings" and opens settings when blocked', () => {
    mockPermission.status = 'blocked';
    render(<SettingsScreen />);

    expect(screen.getByText('Open settings')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-notification-button'));
    expect(mockPermission.openSettings).toHaveBeenCalledTimes(1);
    expect(mockPermission.request).not.toHaveBeenCalled();
  });
});

describe('background-audio toggle', () => {
  it('flips the foreground preference on press', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-foreground-switch'));
    expect(mockPrefs.setForegroundServiceEnabled).toHaveBeenCalledWith(false);
  });
});

describe('reset preferences', () => {
  it('confirms via Alert then resets on native', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const reset = buttons?.find((button) => button.style === 'destructive');
      reset?.onPress?.();
    });

    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-reset-button'));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(mockPrefs.resetPreferences).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('does not reset when the native confirmation is cancelled', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      // User dismisses without pressing "Reset".
    });

    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-reset-button'));

    expect(mockPrefs.resetPreferences).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('confirms via window.confirm then resets on web', () => {
    setPlatform('web');
    mockPermission.available = false;
    render(<SettingsScreen />);

    const originalWindow = (global as { window?: unknown }).window;
    const confirm = jest.fn(() => true);
    (global as { window?: unknown }).window = { confirm };

    fireEvent.press(screen.getByTestId('settings-reset-button'));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mockPrefs.resetPreferences).toHaveBeenCalledTimes(1);
    (global as { window?: unknown }).window = originalWindow;
  });

  it('does not reset when the web confirmation is declined', () => {
    setPlatform('web');
    mockPermission.available = false;
    render(<SettingsScreen />);

    const originalWindow = (global as { window?: unknown }).window;
    const confirm = jest.fn(() => false);
    (global as { window?: unknown }).window = { confirm };

    fireEvent.press(screen.getByTestId('settings-reset-button'));

    expect(mockPrefs.resetPreferences).not.toHaveBeenCalled();
    (global as { window?: unknown }).window = originalWindow;
  });
});
