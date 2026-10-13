/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import { AppWindow, followLaunch, openAppWindow } from './appWindow';
import { afterEach, describe, expect, it, vi } from 'vitest';

const APP_URL = 'https://app.example.test/session/';

const fakeWindow = () =>
  ({
    opener: {},
    closed: false,
    close: vi.fn(),
    location: { replace: vi.fn() },
  }) as unknown as Window & {
    close: ReturnType<typeof vi.fn>;
    location: { replace: ReturnType<typeof vi.fn> };
  };

describe('openAppWindow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens a blank window at once and navigates that same window on show', () => {
    const pending = fakeWindow();
    const open = vi.spyOn(window, 'open').mockReturnValue(pending);

    const appWindow = openAppWindow();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('', '_blank');

    appWindow.show(APP_URL);
    expect(pending.location.replace).toHaveBeenCalledWith(APP_URL);
    expect(open).toHaveBeenCalledTimes(1);
    expect(pending.close).not.toHaveBeenCalled();
  });

  it('cuts the pending window off from this tab', () => {
    const pending = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(pending);

    openAppWindow();
    expect(pending.opener).toBeNull();
  });

  it('opens the app directly when the blank window was blocked', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const appWindow = openAppWindow();
    appWindow.show(APP_URL);
    expect(open).toHaveBeenLastCalledWith(APP_URL, '_blank', 'noopener');
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('opens nothing ahead in Electron and opens the app on show', () => {
    vi.stubGlobal('isElectron', true);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const appWindow = openAppWindow();
    expect(open).not.toHaveBeenCalled();

    appWindow.show(APP_URL);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(APP_URL, '_blank', 'noopener');
  });

  it('closes the pending window on close', () => {
    const pending = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(pending);

    openAppWindow().close();
    expect(pending.close).toHaveBeenCalledTimes(1);
  });

  it('opens a new window when the user already closed the pending one', () => {
    const pending = fakeWindow();
    const open = vi.spyOn(window, 'open').mockReturnValue(pending);

    const appWindow = openAppWindow();
    (pending as { closed: boolean }).closed = true;
    appWindow.show(APP_URL);
    expect(pending.location.replace).not.toHaveBeenCalled();
    expect(open).toHaveBeenLastCalledWith(APP_URL, '_blank', 'noopener');
  });

  it('never closes the app once it is shown', () => {
    const pending = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(pending);

    const appWindow = openAppWindow();
    appWindow.show(APP_URL);
    appWindow.close();
    expect(pending.close).not.toHaveBeenCalled();
  });

  it('opens the app in a new window when shown after close', () => {
    const pending = fakeWindow();
    const open = vi.spyOn(window, 'open').mockReturnValue(pending);

    const appWindow = openAppWindow();
    appWindow.close();
    appWindow.show(APP_URL);
    expect(pending.location.replace).not.toHaveBeenCalled();
    expect(open).toHaveBeenLastCalledWith(APP_URL, '_blank', 'noopener');
  });

  it('tolerates a window whose opener cannot be set', () => {
    const pending = fakeWindow();
    Object.defineProperty(pending, 'opener', {
      get: () => ({}),
      set: () => {
        throw new Error('not settable');
      },
    });
    vi.spyOn(window, 'open').mockReturnValue(pending);

    const appWindow = openAppWindow();
    appWindow.show(APP_URL);
    expect(pending.location.replace).toHaveBeenCalledWith(APP_URL);
  });

  it('closes nothing when the blank window was blocked, then still opens the app', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const appWindow = openAppWindow();
    expect(() => appWindow.close()).not.toThrow();
    appWindow.show(APP_URL);
    expect(open).toHaveBeenLastCalledWith(APP_URL, '_blank', 'noopener');
  });
});

describe('followLaunch', () => {
  const spyWindow = () =>
    ({ show: vi.fn(), close: vi.fn() }) satisfies AppWindow;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the URL after the delay, not before', async () => {
    vi.useFakeTimers();
    const appWindow = spyWindow();

    followLaunch(
      appWindow,
      Promise.resolve({ url: APP_URL }),
      (r) => r.url,
      1000,
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(appWindow.show).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(appWindow.show).toHaveBeenCalledWith(APP_URL);
    expect(appWindow.close).not.toHaveBeenCalled();
  });

  it('closes the window when the launch gives no URL', async () => {
    vi.useFakeTimers();
    const appWindow = spyWindow();

    followLaunch(appWindow, Promise.resolve({}), () => undefined, 1000);
    await vi.runAllTimersAsync();
    expect(appWindow.close).toHaveBeenCalledTimes(1);
    expect(appWindow.show).not.toHaveBeenCalled();
  });

  it('closes the window when the launch fails, and passes the failure on', async () => {
    const appWindow = spyWindow();
    const launch = Promise.reject(new Error('launch failed'));

    await expect(
      followLaunch(appWindow, launch, () => APP_URL),
    ).rejects.toThrow('launch failed');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(appWindow.close).toHaveBeenCalledTimes(1);
    expect(appWindow.show).not.toHaveBeenCalled();
  });

  it('leaves no unhandled rejection behind', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const appWindow = spyWindow();
      // Neither result is awaited: followLaunch must handle its own branch.
      followLaunch(
        appWindow,
        Promise.reject(new Error('launch failed')),
        () => APP_URL,
      );
      followLaunch(appWindow, Promise.resolve({}), () => {
        throw new Error('bad URL');
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(appWindow.close).toHaveBeenCalledTimes(2);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('closes the window when the URL cannot be built', async () => {
    const appWindow = spyWindow();

    await followLaunch(appWindow, Promise.resolve({}), () => {
      throw new Error('bad URL');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(appWindow.close).toHaveBeenCalledTimes(1);
    expect(appWindow.show).not.toHaveBeenCalled();
  });

  it('returns the launch itself', () => {
    const launch = Promise.resolve({ url: APP_URL });

    expect(followLaunch(spyWindow(), launch, (r) => r.url)).toBe(launch);
  });
});
