/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import AppLauncherModal from './AppLauncherModal';
import { render, screen, within } from '@testing-library/react';
import { App } from 'antd';
import { describe, expect, it, vi } from 'vitest';

// Each app tile is a button named by the app's title, the text shown under it,
// not by its image's alt text (the raw service name, for example 'ttyd').

vi.mock('react-relay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-relay')>()),
  useFragment: (_fragment: unknown, data: unknown) => data,
}));

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../hooks', () => ({
  useSuspendedBackendaiClient: () => ({ _config: {} }),
}));

vi.mock('../../hooks/useAppTemplate', () => ({
  useSuspendedFilteredAppTemplate: () => ({
    baseAppTemplate: {
      '2.Development': [
        {
          name: 'jupyter',
          title: 'Jupyter Notebook',
          category: '2.Development',
          src: './resources/icons/jupyter.png',
        },
      ],
      '99.Custom': [
        {
          name: 'ttyd',
          title: 'Console',
          category: '99.Custom',
          src: './resources/icons/terminal.svg',
        },
        {
          name: 'my-service',
          title: '',
          category: '99.Custom',
          src: './resources/icons/default_app.svg',
        },
      ],
    },
    preOpenAppTemplate: [
      {
        name: 'preopen-web',
        title: 'preopen-web',
        src: '/resources/icons/default_app.svg',
        ports: [8080, 8081],
      },
      {
        name: 'preopen-none',
        title: 'preopen-none',
        src: '/resources/icons/default_app.svg',
        ports: [],
      },
    ],
  }),
}));

vi.mock('../../hooks/useBackendAIAppLauncher', () => ({
  TCP_APPS: [],
  useBackendAIAppLauncher: () => ({ launchAppWithNotification: vi.fn() }),
}));

vi.mock('./AppLaunchConfirmationModal', () => ({ default: () => null }));
vi.mock('./SFTPConnectionInfoModal', () => ({ default: () => null }));
vi.mock('./TCPConnectionInfoModal', () => ({ default: () => null }));
vi.mock('./TensorboardPathModal', () => ({ default: () => null }));
vi.mock('./VNCConnectionInfoModal', () => ({ default: () => null }));
vi.mock('./VSCodeDesktopConnectionModal', () => ({ default: () => null }));
vi.mock('./XRDPConnectionInfoModal', () => ({ default: () => null }));

// jsdom does not provide ResizeObserver; the modal title's BAIText needs it.
global.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const session = {
  id: 'Q29tcHV0ZVNlc3Npb25Ob2RlOjE=',
  row_id: '3b8e2f4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  name: 'my-session',
  service_ports: '[]',
  access_key: 'not-used',
};

const renderModal = () =>
  render(
    <App>
      <AppLauncherModal
        open
        sessionFrgmt={session as never}
        onRequestClose={() => {}}
      />
    </App>,
  );

describe('AppLauncherModal', () => {
  it('names each app tile by its title', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Console' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Jupyter Notebook' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ttyd' })).toBeNull();
  });

  it('names a tile without a title by the app name', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'my-service' })).toBeTruthy();
  });

  it('names a pre-open tile as it is shown, with its ports', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'preopen-web (8080, 8081)' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'preopen-none' })).toBeTruthy();
  });

  it('keeps the tiles test ids', () => {
    renderModal();
    const tile = screen.getByTestId('app-ttyd');
    expect(within(tile).getByRole('button', { name: 'Console' })).toBeTruthy();
    expect(screen.getByTestId('app-jupyter')).toBeTruthy();
  });
});
