/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */

/**
 * The browser window an app launch opens, opened before its URL is known.
 *
 * Browsers only let `window.open` through while a user gesture is being
 * handled, and Safari loses that gesture across most asynchronous work
 * (network requests, timers longer than a second). A window opened once an
 * app launch has finished is therefore blocked as a pop-up there. Open the
 * window synchronously in the click handler instead, then navigate it with
 * `show` once the URL is ready, or `close` it if the launch opens no app.
 */
export interface AppWindow {
  /**
   * Navigate the pre-opened window to `url`, or open a new window when there
   * is none (Electron, blocked, or already closed by the user).
   */
  show: (url: string) => void;
  /** Close the pre-opened window, unless it has already been shown. */
  close: () => void;
}

/**
 * Must be called synchronously in the click handler, before any `await`.
 */
export function openAppWindow(): AppWindow {
  // Electron denies `window.open` and opens its own window for the URL, so a
  // blank window opened now could never be navigated: open the app directly.
  let pending = globalThis.isElectron ? null : window.open('', '_blank');
  if (pending) {
    try {
      // The app runs on another origin: it must not navigate this tab.
      pending.opener = null;
    } catch {
      // Not settable here; the window is still usable.
    }
  }
  return {
    show: (url) => {
      const appWindow = pending;
      pending = null;
      if (appWindow && !appWindow.closed) {
        // `replace` keeps the blank page out of the window's history.
        appWindow.location.replace(url);
      } else {
        window.open(url, '_blank');
      }
    },
    close: () => {
      pending?.close();
      pending = null;
    },
  };
}
