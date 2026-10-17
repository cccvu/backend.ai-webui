/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import { NotificationState } from '../../hooks/useBAINotification';
import { sessionActionExtensionTagsState } from '../../hooks/useSessionActionExtensions';
import { SESSION_ACTION_EXTENSION_VERSION } from '../../types/sessionActionExtension';
import type { SessionActionExtensionContext } from '../../types/sessionActionExtension';
import BAIComputeSessionNodeNotificationItem from '../BAIComputeSessionNodeNotificationItem';
import SessionActionButtons from './SessionActionButtons';
import { render, screen, within } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// How the session action buttons wire in the elements page plugins contribute
// (types/sessionActionExtension.ts): only for the session's owner, and never
// where a caller hides them, as the compact notification item does.

// Fragments are given their data directly.
vi.mock('react-relay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-relay')>()),
  useFragment: (_fragment: unknown, data: unknown) => data,
  useSubscription: () => {},
}));

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  // Keeps an interpolated app name, so a swapped name fails a test.
  useTranslation: () => ({
    t: (key: string, options?: { appName?: string }) =>
      options?.appName ? `${key}:${options.appName}` : key,
  }),
}));

const clientConfig = vi.hoisted(() => ({
  enableContainerCommit: false,
}));
vi.mock('../../hooks', () => ({
  useSuspendedBackendaiClient: () => ({ _config: clientConfig }),
  useWebUINavigate: () => vi.fn(),
}));

const currentUser = vi.hoisted(() => ({
  uuid: undefined as string | undefined,
}));
vi.mock('../../hooks/backendai', () => ({
  useCurrentUserInfo: () => [{ uuid: currentUser.uuid }, vi.fn()],
}));

vi.mock('../../hooks/useAppTemplate', () => ({
  useSuspendedAppTemplateConfig: () => ({ hideAppsOnBatchSession: false }),
}));

vi.mock('../../hooks/useBackendAIAppLauncher', () => ({
  useBackendAIAppLauncher: () => ({}),
}));

vi.mock('../../hooks/useBAINotification', () => ({
  useSetBAINotification: () => ({ closeNotification: vi.fn() }),
}));

vi.mock('../../hooks/useRouteScope', () => ({
  useProjectPath: () => () => '/session',
}));

vi.mock('./SessionStatusTag', () => ({ default: () => null }));
vi.mock('./AppLauncherModal', () => ({ default: () => null }));
vi.mock('./ContainerCommitModal', () => ({ default: () => null }));
vi.mock('./ContainerLogModal', () => ({ default: () => null }));
vi.mock('./SFTPConnectionInfoModal', () => ({ default: () => null }));
vi.mock('./TerminateSessionModal', () => ({ default: () => null }));

const OWNER = 'a1b2c3d4-0000-4000-8000-000000000001';
const SOMEONE_ELSE = 'a1b2c3d4-0000-4000-8000-000000000002';
const TAG = 'buttons-test-action';

// Records the context it is given.
class RecordingAction extends HTMLElement {
  context: SessionActionExtensionContext | undefined;
}
if (!customElements.get(TAG)) customElements.define(TAG, RecordingAction);

const session = {
  id: 'Q29tcHV0ZVNlc3Npb25Ob2RlOjE=',
  row_id: '3b8e2f4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  name: 'my-session',
  type: 'interactive',
  status: 'RUNNING',
  access_key: 'not-given-to-the-extension',
  service_ports: '[]',
  commit_status: null,
  user_id: OWNER,
  status_info: null,
  status_data: null,
};

const renderAs = (
  uuid: string | undefined,
  element: React.ReactElement,
  tags: string[] = [TAG],
) => {
  currentUser.uuid = uuid;
  const store = createStore();
  store.set(sessionActionExtensionTagsState, tags);
  return render(<Provider store={store}>{element}</Provider>);
};

const buttons = (
  props: Partial<React.ComponentProps<typeof SessionActionButtons>> = {},
) => <SessionActionButtons sessionFrgmt={session as never} {...props} />;

const mounted = (container: HTMLElement) =>
  container.querySelector(TAG) as RecordingAction | null;

describe('SessionActionButtons', () => {
  it('mounts an extension for the session owner, after the buttons', () => {
    const { container } = renderAs(OWNER, buttons());
    const element = mounted(container);
    expect(element).toBeInstanceOf(RecordingAction);
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
    const lastButton = Array.from(container.querySelectorAll('button')).pop()!;
    expect(
      lastButton.compareDocumentPosition(element!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('gives the extension the session id, name, status and type only', () => {
    const { container } = renderAs(OWNER, buttons());
    expect(mounted(container)?.context).toEqual({
      version: SESSION_ACTION_EXTENSION_VERSION,
      id: session.row_id,
      name: 'my-session',
      status: 'RUNNING',
      type: 'interactive',
    });
  });

  it('mounts no extension for a session someone else owns', () => {
    const { container } = renderAs(SOMEONE_ELSE, buttons());
    expect(mounted(container)).toBeNull();
    expect(
      container.querySelector('[data-session-action-extension]'),
    ).toBeNull();
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it.each([null, undefined])(
    'mounts no extension while the signed-in user is unknown (user_id %s)',
    (userId) => {
      const { container } = renderAs(
        undefined,
        <SessionActionButtons
          sessionFrgmt={{ ...session, user_id: userId } as never}
        />,
      );
      expect(mounted(container)).toBeNull();
    },
  );

  it('mounts no extension where the caller hides them', () => {
    const { container } = renderAs(
      OWNER,
      buttons({ hiddenButtonKeys: ['extensions'] }),
    );
    expect(mounted(container)).toBeNull();
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('renders the buttons alone, as before, when no plugin declares one', () => {
    const withNone = renderAs(OWNER, buttons({ compact: true }), []);
    const withOne = renderAs(OWNER, buttons({ compact: true }));
    expect(withNone.container.childElementCount).toBe(1);
    expect(withNone.container.firstElementChild?.className).toContain(
      'ant-space-compact',
    );
    expect(mounted(withNone.container)).toBeNull();
    expect(withOne.container.querySelectorAll('button')).toHaveLength(
      withNone.container.querySelectorAll('button').length,
    );
  });
});

// Each button is named by its tooltip's text, never by its icon's default
// label ('app', 'terminal', ...); the app launcher, the one button that shows
// text beside the icons, is named by that text (WCAG 2.5.3).
describe('SessionActionButtons accessible names', () => {
  afterEach(() => {
    clientConfig.enableContainerCommit = false;
  });

  const ICON_LABELS = [
    'app',
    'jupyter',
    'file browser',
    'sftp',
    'terminal',
    'session log',
    'container commit',
    'terminate',
  ];

  const names = (container: HTMLElement) =>
    within(container)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));

  it('shows the app launcher label and names it by that label', () => {
    const { container } = renderAs(OWNER, buttons({ size: 'large' }));
    const launcher = within(container).getByRole('button', {
      name: 'session.appLauncher.App',
    });
    expect(launcher.textContent).toBe('session.appLauncher.App');
  });

  it('keeps the app launcher an icon named by its title at size small', () => {
    const { container } = renderAs(OWNER, buttons({ size: 'small' }));
    const launcher = within(container).getByRole('button', {
      name: 'session.SeeAppDialog',
    });
    expect(launcher.textContent).toBe('');
    expect(launcher.getAttribute('title')).toBe('session.SeeAppDialog');
    expect(
      within(container).queryByRole('button', {
        name: 'session.appLauncher.App',
      }),
    ).toBeNull();
  });

  it.each(['small', 'middle', 'large'] as const)(
    'names every button by its tooltip key at size %s',
    (size) => {
      clientConfig.enableContainerCommit = true;
      const { container } = renderAs(
        OWNER,
        buttons({ size, primaryAppOption: { appName: 'jupyter' } }),
      );
      expect(names(container)).toEqual([
        'session.ExecuteSpecificApp:Jupyter Notebook',
        size === 'small' ? 'session.SeeAppDialog' : 'session.appLauncher.App',
        'session.ExecuteTerminalApp',
        'session.SeeContainerLogs',
        'session.RequestContainerCommit',
        'session.TerminateSession',
      ]);
      for (const label of ICON_LABELS) {
        expect(
          within(container).queryByRole('button', { name: label }),
        ).toBeNull();
      }
    },
  );

  it('names the file browser and SFTP buttons', () => {
    const { container } = renderAs(
      OWNER,
      <SessionActionButtons
        sessionFrgmt={{ ...session, type: 'system' } as never}
        size="large"
        primaryAppOption={{ appName: 'filebrowser' }}
      />,
    );
    expect(names(container)).toEqual([
      'session.ExecuteSpecificApp:File browser',
      'data.explorer.RunSSH/SFTPserver',
      'session.SeeContainerLogs',
      'session.TerminateSession',
    ]);
  });

  it('leaves each icon its own label', () => {
    renderAs(OWNER, buttons({ size: 'large' }));
    for (const label of ['app', 'terminal', 'session log', 'terminate']) {
      expect(screen.getByLabelText(label).tagName).toBe('SPAN');
    }
  });
});

describe('BAIComputeSessionNodeNotificationItem', () => {
  // jsdom does not provide ResizeObserver; the item's BAIText needs it.
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const notification = {
    key: 'session-notification',
    created: '2026-01-01T00:00:00Z',
  } as NotificationState;

  it('shows the compact action buttons without the extension', () => {
    const { container } = renderAs(
      OWNER,
      <BAIComputeSessionNodeNotificationItem
        notification={notification}
        sessionFrgmt={session as never}
      />,
    );
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
    expect(container.querySelector('.ant-space-compact')).not.toBeNull();
    expect(mounted(container)).toBeNull();
    expect(
      container.querySelector('[data-session-action-extension]'),
    ).toBeNull();
  });
});
