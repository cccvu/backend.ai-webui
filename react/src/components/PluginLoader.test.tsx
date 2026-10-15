/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import { sessionActionExtensionTagsState } from '../hooks/useSessionActionExtensions';
import { sessionLauncherExtensionTagsState } from '../hooks/useSessionLauncherExtensions';
import { configLoadedState, rawConfigState } from '../hooks/useWebUIConfig';
import { pluginLoadedState } from '../hooks/useWebUIPluginState';
import PluginLoader from './PluginLoader';
import { render, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

// PluginLoader records the session action extension each page plugin declares
// (types/sessionActionExtension.ts), in configuration order.

vi.mock('../hooks/useRouteScope', () => ({
  useCurrentMenuKey: () => undefined,
}));

const define = (tag: string, elementClass: CustomElementConstructor) => {
  if (!customElements.get(tag)) customElements.define(tag, elementClass);
};

// Each plugin module defines its page element, as a page plugin does.
vi.mock('/dist/plugins/loader-test-first.js', () => {
  define('loader-test-first-action', class extends HTMLElement {});
  define(
    'loader-test-first',
    class extends HTMLElement {
      static sessionActionExtension = 'loader-test-first-action';
    },
  );
  return {};
});
vi.mock('/dist/plugins/loader-test-second.js', () => {
  define('loader-test-second-action', class extends HTMLElement {});
  define(
    'loader-test-second',
    class extends HTMLElement {
      static sessionActionExtension = 'loader-test-second-action';
    },
  );
  return {};
});
// Declares the same element as the first.
vi.mock('/dist/plugins/loader-test-twin.js', () => {
  define('loader-test-first-action', class extends HTMLElement {});
  define(
    'loader-test-twin',
    class extends HTMLElement {
      static sessionActionExtension = 'loader-test-first-action';
    },
  );
  return {};
});
vi.mock('/dist/plugins/loader-test-plain.js', () => {
  define('loader-test-plain', class extends HTMLElement {});
  return {};
});
vi.mock('/dist/plugins/loader-test-undefined.js', () => {
  define(
    'loader-test-undefined',
    class extends HTMLElement {
      static sessionActionExtension = 'loader-test-never-defined';
    },
  );
  return {};
});
vi.mock('/dist/plugins/loader-test-launcher.js', () => {
  define('loader-test-launcher-extension', class extends HTMLElement {});
  define(
    'loader-test-launcher',
    class extends HTMLElement {
      static sessionLauncherExtension = 'loader-test-launcher-extension';
    },
  );
  return {};
});

const load = async (page: string) => {
  const store = createStore();
  store.set(rawConfigState, { plugin: { page } } as never);
  store.set(configLoadedState, true);
  render(
    <Provider store={store}>
      <PluginLoader />
    </Provider>,
  );
  await waitFor(() => expect(store.get(pluginLoadedState)).toBe(true));
  return store;
};

describe('PluginLoader', () => {
  it('records the session action extension a page plugin declares', async () => {
    const store = await load('loader-test-first');
    expect(store.get(sessionActionExtensionTagsState)).toEqual([
      'loader-test-first-action',
    ]);
  });

  it('records them in configuration order, once each', async () => {
    const store = await load(
      'loader-test-second,loader-test-plain,loader-test-first,loader-test-twin',
    );
    expect(store.get(sessionActionExtensionTagsState)).toEqual([
      'loader-test-second-action',
      'loader-test-first-action',
    ]);
  });

  it('records nothing for a page that declares none', async () => {
    const store = await load('loader-test-plain');
    expect(store.get(sessionActionExtensionTagsState)).toEqual([]);
  });

  it('ignores a declared tag that is not a defined element', async () => {
    const store = await load('loader-test-undefined,loader-test-first');
    expect(store.get(sessionActionExtensionTagsState)).toEqual([
      'loader-test-first-action',
    ]);
  });

  it('records nothing for a plugin whose module fails to load', async () => {
    // No module is served at this plugin's path.
    const store = await load('loader-test-missing,loader-test-first');
    expect(store.get(sessionActionExtensionTagsState)).toEqual([
      'loader-test-first-action',
    ]);
  });

  it('keeps the launcher and action extensions apart', async () => {
    const store = await load('loader-test-launcher,loader-test-first');
    expect(store.get(sessionActionExtensionTagsState)).toEqual([
      'loader-test-first-action',
    ]);
    expect(store.get(sessionLauncherExtensionTagsState)).toEqual([
      'loader-test-launcher-extension',
    ]);
  });
});
