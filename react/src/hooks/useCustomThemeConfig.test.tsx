/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import type {
  CustomThemeConfig,
  ThemeFamilyConfig,
} from '../helper/customThemeConfig';
import {
  DEFAULT_THEME_FAMILY,
  useCustomThemeConfig,
} from './useCustomThemeConfig';
import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect, type ReactNode } from 'react';

// Avoid importing the real useBAISetting (which pulls in DefaultProviders and
// the whole app graph). Mirror its localStorage layout so tests can seed
// user settings (e.g. custom_primary_color) via setUserSetting below.
vi.mock('./useBAISetting', () => ({
  useBAISettingUserState: (key: string) => {
    const raw = localStorage.getItem(`backendaiwebui.settings.user.${key}`);
    return [raw ? JSON.parse(raw) : undefined, vi.fn()];
  },
}));

// Control what theme.json "loaded" into the module-level cache.
const mockGetCustomTheme = vi.fn();
vi.mock('../helper/customThemeConfig', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../helper/customThemeConfig')>();
  return {
    ...actual,
    getCustomTheme: () => mockGetCustomTheme(),
  };
});

// theme.json `families` block (single source of the selectable catalog).
const families: Record<string, ThemeFamilyConfig> = {
  stained: {
    light: { token: { colorPrimary: '#8b5cf6' } },
    dark: { token: { colorPrimary: '#7c3aed' } },
    label: 'Stained',
  },
  glass: {
    light: { token: { colorPrimary: '#007aff' } },
    dark: { token: { colorPrimary: '#0a84ff' } },
  },
};

const baseConfig: CustomThemeConfig = {
  light: { token: { colorPrimary: '#FF7A00' } },
  dark: { token: { colorPrimary: '#DC6B03' } },
  logo: { src: '', srcCollapsed: '' },
  families,
};

const setStored = (key: string, value: string) =>
  localStorage.setItem(`backendaiwebui.settings.${key}`, JSON.stringify(value));

const setUserSetting = (key: string, value: unknown) =>
  localStorage.setItem(
    `backendaiwebui.settings.user.${key}`,
    JSON.stringify(value),
  );

describe('useCustomThemeConfig', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.removeAttribute('data-theme-family');
    mockGetCustomTheme.mockReturnValue(baseConfig);
  });

  it('builds the catalog from theme.json families plus a synthesized default', () => {
    const { result } = renderHook(() => useCustomThemeConfig());
    expect(Object.keys(result.current.themeFamilies).sort()).toEqual([
      'default',
      'glass',
      'stained',
    ]);
    expect(result.current.activeThemeFamily).toBe(DEFAULT_THEME_FAMILY);
  });

  it('ignores a families.default entry in favor of the top-level light/dark', () => {
    mockGetCustomTheme.mockReturnValue({
      ...baseConfig,
      families: {
        ...families,
        default: {
          light: { token: { colorPrimary: '#ABC123' } },
          dark: { token: { colorPrimary: '#321CBA' } },
        },
      },
    });
    const { result } = renderHook(() => useCustomThemeConfig());
    expect(result.current.activeThemeFamily).toBe(DEFAULT_THEME_FAMILY);
    expect(result.current.themeConfig?.light?.token?.colorPrimary).toBe(
      '#FF7A00',
    );
    expect(result.current.themeConfig?.dark?.token?.colorPrimary).toBe(
      '#DC6B03',
    );
  });

  it('synthesizes the default family from the top-level light/dark', () => {
    // baseConfig.families defines stained/glass but no `default`.
    const { result } = renderHook(() => useCustomThemeConfig());
    expect(result.current.activeThemeFamily).toBe(DEFAULT_THEME_FAMILY);
    expect(result.current.themeConfig?.light?.token?.colorPrimary).toBe(
      '#FF7A00',
    );
  });

  it('resolves the user-selected family', () => {
    setStored('themeFamily', 'glass');
    const { result } = renderHook(() => useCustomThemeConfig());
    expect(result.current.activeThemeFamily).toBe('glass');
    expect(result.current.themeConfig?.light?.token?.colorPrimary).toBe(
      '#007aff',
    );
  });

  it('falls back to default when the selected family is absent', () => {
    setStored('themeFamily', 'nonexistent');
    const { result } = renderHook(() => useCustomThemeConfig());
    expect(result.current.activeThemeFamily).toBe(DEFAULT_THEME_FAMILY);
  });

  it('drops structurally invalid family entries from the catalog', () => {
    mockGetCustomTheme.mockReturnValue({
      ...baseConfig,
      families: {
        ...families,
        broken: { light: { token: { colorPrimary: '#000000' } } },
      },
    });
    const { result } = renderHook(() => useCustomThemeConfig());
    expect(Object.keys(result.current.themeFamilies).sort()).toEqual([
      'default',
      'glass',
      'stained',
    ]);
  });

  it('applies the custom primary color without mutating the source config', () => {
    setStored('themeFamily', 'stained');
    setUserSetting('custom_primary_color', {
      light: '#11aa22',
      dark: '#33bb44',
    });
    const { result } = renderHook(() => useCustomThemeConfig());
    const config = result.current.themeConfig;
    expect(config?.light?.token?.colorPrimary).toBe('#11aa22');
    expect(config?.dark?.token?.colorPrimary).toBe('#33bb44');
    // Only colorPrimary is overridden; colorLink/headerBg stay family-owned.
    expect(config?.light?.token?.colorLink).toBeUndefined();
    expect(
      (config?.light?.components?.Layout as { headerBg?: string } | undefined)
        ?.headerBg,
    ).toBeUndefined();
    // Source family config is untouched (cloneDeep before _.set).
    expect(families.stained.light.token?.colorPrimary).toBe('#8b5cf6');
  });

  it('applies a scheme-specific accent only to that scheme', () => {
    setStored('themeFamily', 'stained');
    setUserSetting('custom_primary_color', { light: '#11aa22' });
    const { result } = renderHook(() => useCustomThemeConfig());
    const config = result.current.themeConfig;
    expect(config?.light?.token?.colorPrimary).toBe('#11aa22');
    // The dark scheme keeps the family-owned color.
    expect(config?.dark?.token?.colorPrimary).toBe('#7c3aed');
  });

  it('ignores the family selection and custom primary color in preview mode', () => {
    sessionStorage.setItem('isThemePreviewMode', 'true');
    // In preview mode the raw source is the edited default-theme draft. The
    // draft may carry a stale `families.default` copy (seeded from an older
    // theme.json); it must not shadow the edited top-level light/dark.
    setUserSetting('custom_theme_config', {
      ...baseConfig,
      light: { token: { colorPrimary: '#ABCDEF' } },
      families: {
        ...families,
        default: {
          light: { token: { colorPrimary: '#FF7A00' } },
          dark: { token: { colorPrimary: '#DC6B03' } },
        },
      },
    });
    setStored('themeFamily', 'stained');
    setUserSetting('custom_primary_color', { light: '#11aa22' });
    const { result } = renderHook(() => useCustomThemeConfig());
    // Preview shows the edited default-theme draft as-is.
    expect(result.current.activeThemeFamily).toBe(DEFAULT_THEME_FAMILY);
    expect(result.current.themeConfig?.light?.token?.colorPrimary).toBe(
      '#ABCDEF',
    );
  });

  it('writes the data-theme-family attribute on body', () => {
    setStored('themeFamily', 'stained');
    renderHook(() => useCustomThemeConfig());
    expect(document.body.getAttribute('data-theme-family')).toBe('stained');
  });

  it('backward compat: a theme.json without families yields a single-entry catalog', () => {
    mockGetCustomTheme.mockReturnValue({
      light: { token: { colorPrimary: '#FF7A00' } },
      dark: { token: { colorPrimary: '#DC6B03' } },
      logo: { src: '', srcCollapsed: '' },
    });
    const { result } = renderHook(() => useCustomThemeConfig());
    expect(Object.keys(result.current.themeFamilies)).toEqual(['default']);
    expect(result.current.activeThemeFamily).toBe('default');
    expect(result.current.themeConfig?.light?.token?.colorPrimary).toBe(
      '#FF7A00',
    );
  });
});

describe('useCustomThemeConfig when theme.json settles', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.removeAttribute('data-theme-family');
    mockGetCustomTheme.mockReturnValue(undefined);
  });

  const settle = () => {
    mockGetCustomTheme.mockReturnValue(baseConfig);
    document.dispatchEvent(new CustomEvent('custom-theme-loaded'));
  };

  // A sibling rendered after the hook: its layout effect runs after the
  // hook's render but before the hook's passive effects, the same gap in
  // which the theme.json fetch can settle in production. A hook that only
  // subscribes from a passive effect misses this event for good, and the
  // root provider never remounts to read the theme again.
  const SettleInTheGap = () => {
    useLayoutEffect(() => {
      settle();
    }, []);
    return null;
  };
  const settleInTheGap = ({ children }: { children: ReactNode }) => (
    <>
      {children}
      <SettleInTheGap />
    </>
  );

  it('picks up a theme.json that settles between the first render and the subscription', () => {
    const { result } = renderHook(() => useCustomThemeConfig(), {
      wrapper: settleInTheGap,
    });
    expect(result.current.themeConfig?.light?.token?.colorPrimary).toBe(
      '#FF7A00',
    );
  });

  it('applies a theme.json that settles after mount', () => {
    const { result } = renderHook(() => useCustomThemeConfig());
    expect(result.current.themeConfig).toBeUndefined();
    act(() => {
      settle();
    });
    expect(result.current.themeConfig?.light?.token?.colorPrimary).toBe(
      '#FF7A00',
    );
  });

  const countCalls = (spy: { mock: { calls: unknown[][] } }, type: string) =>
    spy.mock.calls.filter(([eventType]) => eventType === type).length;

  it('removes its listeners on unmount', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    try {
      const { unmount } = renderHook(() => useCustomThemeConfig());
      unmount();
      const adds = countCalls(add, 'custom-theme-loaded');
      expect(adds).toBeGreaterThanOrEqual(1);
      expect(countCalls(remove, 'custom-theme-loaded')).toBe(adds);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('removes its preview-mode storage listener on unmount', () => {
    sessionStorage.setItem('isThemePreviewMode', 'true');
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      const { unmount } = renderHook(() => useCustomThemeConfig());
      unmount();
      const adds = countCalls(add, 'storage');
      expect(adds).toBeGreaterThanOrEqual(1);
      expect(countCalls(remove, 'storage')).toBe(adds);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });
});
