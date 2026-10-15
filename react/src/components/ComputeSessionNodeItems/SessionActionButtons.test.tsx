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
import { render } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

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
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../hooks', () => ({
  useSuspendedBackendaiClient: () => ({ _config: {} }),
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

  it('mounts no extension while the signed-in user is unknown', () => {
    const { container } = renderAs(
      undefined,
      <SessionActionButtons
        sessionFrgmt={{ ...session, user_id: null } as never}
      />,
    );
    expect(mounted(container)).toBeNull();
  });

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
