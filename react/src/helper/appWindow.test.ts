/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import { openAppWindow } from './appWindow';
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
    expect(open).toHaveBeenLastCalledWith(APP_URL, '_blank');
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('opens nothing ahead in Electron and opens the app on show', () => {
    vi.stubGlobal('isElectron', true);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const appWindow = openAppWindow();
    expect(open).not.toHaveBeenCalled();

    appWindow.show(APP_URL);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(APP_URL, '_blank');
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
    expect(open).toHaveBeenLastCalledWith(APP_URL, '_blank');
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
    expect(open).toHaveBeenLastCalledWith(APP_URL, '_blank');
  });
});
