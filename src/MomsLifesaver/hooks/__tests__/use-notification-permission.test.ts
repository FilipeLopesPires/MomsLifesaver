/**
 * Tests for hooks/use-notification-permission.{ts,web.ts,ios.ts}.
 *
 * The Android hook is the "smart" Settings control: re-request the permission,
 * and if Android reports it permanently denied (NEVER_ASK_AGAIN) fall back to
 * opening the OS app-settings page. Below Android 13 the permission is
 * install-time, so there is nothing to prompt. Web/iOS resolve to no-op shims;
 * a parity test guards that the shims keep the Android hook's shape.
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS' },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
    request: jest.fn().mockResolvedValue('granted'),
    check: jest.fn().mockResolvedValue(false),
  },
  Linking: { openSettings: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/utils/logger', () => ({ log: jest.fn() }));
jest.mock('@/utils/error-handler', () => ({ handleErrorSilent: jest.fn() }));

import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react';

import { useNotificationPermission } from '@/hooks/use-notification-permission';
import { handleErrorSilent } from '@/utils/error-handler';

type MutablePlatform = { OS: 'ios' | 'android' | 'web'; Version: number };
const mutablePlatform = Platform as unknown as MutablePlatform;
const mockedRequest = PermissionsAndroid.request as unknown as jest.Mock;
const mockedCheck = PermissionsAndroid.check as unknown as jest.Mock;
const mockedOpenSettings = Linking.openSettings as unknown as jest.Mock;

// Mounts the hook and lets its initial check() effect settle.
const mount = async () => {
  const view = renderHook(() => useNotificationPermission());
  await act(async () => {
    await Promise.resolve();
  });
  return view;
};

beforeEach(() => {
  jest.clearAllMocks();
  mutablePlatform.OS = 'android';
  mutablePlatform.Version = 34;
  mockedRequest.mockResolvedValue('granted');
  mockedCheck.mockResolvedValue(false);
  mockedOpenSettings.mockResolvedValue(undefined);
});

describe('availability', () => {
  it('is available on Android', async () => {
    const { result } = await mount();
    expect(result.current.available).toBe(true);
  });

  it.each(['ios', 'web'] as const)('is not available on %s', async (os) => {
    mutablePlatform.OS = os;
    const { result } = await mount();
    expect(result.current.available).toBe(false);
  });
});

describe('initial status check', () => {
  it('reports granted when the OS already granted the permission', async () => {
    mockedCheck.mockResolvedValue(true);
    const { result } = await mount();
    expect(result.current.status).toBe('granted');
  });

  it('reports denied when the OS has not granted it', async () => {
    mockedCheck.mockResolvedValue(false);
    const { result } = await mount();
    expect(result.current.status).toBe('denied');
  });

  it('reports granted below Android 13 without touching PermissionsAndroid', async () => {
    mutablePlatform.Version = 32;
    const { result } = await mount();
    expect(result.current.status).toBe('granted');
    expect(mockedCheck).not.toHaveBeenCalled();
  });

  it('reports unknown when the check throws', async () => {
    mockedCheck.mockRejectedValueOnce(new Error('boom'));
    const { result } = await mount();
    expect(result.current.status).toBe('unknown');
    expect(handleErrorSilent).toHaveBeenCalled();
  });
});

describe('request', () => {
  it('returns granted and updates status when the user allows', async () => {
    const { result } = await mount();
    mockedRequest.mockResolvedValue('granted');

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.request();
    });

    expect(outcome).toBe('granted');
    expect(result.current.status).toBe('granted');
    expect(mockedRequest).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    expect(mockedOpenSettings).not.toHaveBeenCalled();
  });

  it('returns denied when the user dismisses the prompt', async () => {
    const { result } = await mount();
    mockedRequest.mockResolvedValue('denied');

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.request();
    });

    expect(outcome).toBe('denied');
    expect(result.current.status).toBe('denied');
    expect(mockedOpenSettings).not.toHaveBeenCalled();
  });

  it('falls back to opening OS settings when permanently denied', async () => {
    const { result } = await mount();
    mockedRequest.mockResolvedValue('never_ask_again');

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.request();
    });

    expect(outcome).toBe('blocked');
    expect(result.current.status).toBe('blocked');
    expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('returns granted below Android 13 without prompting', async () => {
    mutablePlatform.Version = 32;
    const { result } = await mount();

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.request();
    });

    expect(outcome).toBe('granted');
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it.each(['ios', 'web'] as const)('returns unsupported on %s', async (os) => {
    mutablePlatform.OS = os;
    const { result } = await mount();

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.request();
    });

    expect(outcome).toBe('unsupported');
    expect(result.current.status).toBe('unsupported');
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('returns unknown and reports the error when the request throws', async () => {
    const { result } = await mount();
    mockedRequest.mockRejectedValueOnce(new Error('boom'));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.request();
    });

    expect(outcome).toBe('unknown');
    expect(handleErrorSilent).toHaveBeenCalled();
  });
});

describe('openSettings', () => {
  it('opens the OS app settings', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.openSettings();
    });
    expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('swallows an openSettings failure', async () => {
    mockedOpenSettings.mockRejectedValueOnce(new Error('no activity'));
    const { result } = await mount();
    await act(async () => {
      await result.current.openSettings();
    });
    expect(handleErrorSilent).toHaveBeenCalled();
  });
});

describe('platform variant parity', () => {
  // The Settings screen destructures this hook without knowing which platform
  // file Metro resolved. If the Android hook grows a member and the shims do
  // not, the web/iOS builds break at runtime with a green suite.
  it.each([
    ['web', '@/hooks/use-notification-permission.web'],
    ['ios', '@/hooks/use-notification-permission.ios'],
  ])('the %s shim returns the same keys as the Android hook', async (_platform, modulePath) => {
    const shim = require(modulePath).useNotificationPermission as typeof useNotificationPermission;

    // Render synchronously so result.current is populated, then capture keys
    // (the async mount check only changes `status`, never the key set).
    const androidKeys = Object.keys(renderHook(() => useNotificationPermission()).result.current);
    const variantKeys = Object.keys(renderHook(() => shim()).result.current);

    // Settle the Android hook's mount-time check so its setStatus runs inside
    // act rather than warning.
    await act(async () => {
      await Promise.resolve();
    });

    expect(variantKeys.sort()).toEqual(androidKeys.sort());
  });

  it('the web shim is inert', async () => {
    const shim = require('@/hooks/use-notification-permission.web')
      .useNotificationPermission as typeof useNotificationPermission;
    const { result } = renderHook(() => shim());

    expect(result.current.available).toBe(false);
    expect(result.current.status).toBe('unsupported');
    await act(async () => {
      await expect(result.current.request()).resolves.toBe('unsupported');
      await result.current.openSettings();
      await result.current.refresh();
    });
  });
});
