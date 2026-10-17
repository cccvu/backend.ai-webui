/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import { sessionActionExtensionTagsState } from '../hooks/useSessionActionExtensions';
import { SESSION_ACTION_EXTENSION_VERSION } from '../types/sessionActionExtension';
import type { SessionActionExtensionContext } from '../types/sessionActionExtension';
import SessionNodes from './SessionNodes';
import { render } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

// How a session list wires in the elements page plugins contribute to a
// session's actions (types/sessionActionExtension.ts): one per row the
// signed-in user owns, in a column right after the name, and no column at all
// when no plugin declares one.

// Fragments are given their data directly.
vi.mock('react-relay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-relay')>()),
  useFragment: (_fragment: unknown, data: unknown) => data,
}));

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../hooks', () => ({
  useSuspendedBackendaiClient: () => ({
    _config: {},
    isManagerVersionCompatibleWith: () => true,
  }),
}));

const currentUser = vi.hoisted(() => ({
  uuid: undefined as string | undefined,
}));
vi.mock('../hooks/backendai', () => ({
  useCurrentUserInfo: () => [{ uuid: currentUser.uuid }, vi.fn()],
  useCurrentUserRole: () => 'user',
}));

vi.mock('../hooks/useAppTemplate', () => ({
  useSuspendedAppTemplateConfig: () => ({ hideAppsOnBatchSession: false }),
}));

// The cells that read their own fragments render nothing here.
vi.mock('backend.ai-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('backend.ai-ui')>()),
  BAISessionAgentIds: () => null,
  BAISessionTypeTag: () => null,
  BAISessionClusterMode: () => null,
}));
vi.mock('./ComputeSessionNodeItems/AppLauncherModal', () => ({
  default: () => null,
}));
vi.mock('./ComputeSessionNodeItems/SessionReclamationStatusCell', () => ({
  default: () => null,
}));
vi.mock('./ComputeSessionNodeItems/SessionReservation', () => ({
  default: () => null,
}));
vi.mock('./ComputeSessionNodeItems/SessionSlotCell', () => ({
  default: () => null,
}));
vi.mock('./ComputeSessionNodeItems/SessionStatusTag', () => ({
  default: () => null,
}));
vi.mock('./ComputeSessionNodeItems/TerminateSessionModal', () => ({
  default: () => null,
}));
vi.mock('./ImageNodeSimpleTag', () => ({ default: () => null }));

// jsdom does not provide ResizeObserver; the table's cells need it.
global.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const OWNER = 'a1b2c3d4-0000-4000-8000-000000000001';
const SOMEONE_ELSE = 'a1b2c3d4-0000-4000-8000-000000000002';
const TAG = 'session-nodes-test-action';

// Records the context it is given, and every context it was ever given.
class RecordingAction extends HTMLElement {
  given: SessionActionExtensionContext[] = [];
  #context: SessionActionExtensionContext | undefined;
  get context() {
    return this.#context;
  }
  set context(value: SessionActionExtensionContext | undefined) {
    this.#context = value;
    if (value) this.given.push(value);
  }
}
if (!customElements.get(TAG)) customElements.define(TAG, RecordingAction);

const sessionOf = (
  n: number,
  fields: Partial<Record<string, unknown>> = {},
) => ({
  id: `U2Vzc2lvbk5vZGU6${n}`,
  row_id: `3b8e2f4a-1c2d-4e5f-8a9b-0c1d2e3f4a5${n}`,
  name: `session-${n}`,
  status: 'RUNNING',
  type: 'interactive',
  service_ports: '[]',
  user_id: OWNER,
  agent_ids: [],
  kernel_nodes: { edges: [] },
  created_at: '2026-01-01T00:00:00Z',
  scaling_group: 'default',
  project_id: null,
  owner: null,
  dependees: { edges: [], count: 0 },
  dependents: { edges: [], count: 0 },
  ...fields,
});

const renderList = (
  uuid: string | undefined,
  sessions: ReturnType<typeof sessionOf>[],
  tags: string[] = [TAG],
) => {
  currentUser.uuid = uuid;
  const store = createStore();
  store.set(sessionActionExtensionTagsState, tags);
  const list = (rows: ReturnType<typeof sessionOf>[]) => (
    <Provider store={store}>
      <SessionNodes sessionsFrgmt={rows as never} />
    </Provider>
  );
  const result = render(list(sessions));
  return {
    ...result,
    rerenderWith: (rows: ReturnType<typeof sessionOf>[]) =>
      result.rerender(list(rows)),
  };
};

const mounted = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(TAG)) as RecordingAction[];

const headers = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('thead th')).map(
    (th) => th.textContent,
  );

describe('SessionNodes', () => {
  it('mounts one extension in each row the signed-in user owns', () => {
    const { container } = renderList(OWNER, [sessionOf(1), sessionOf(2)]);
    const elements = mounted(container);
    expect(elements).toHaveLength(2);
    expect(elements.map((element) => element.context?.id)).toEqual([
      sessionOf(1).row_id,
      sessionOf(2).row_id,
    ]);
  });

  it('gives each extension its session id, name, status and type only', () => {
    const { container } = renderList(OWNER, [sessionOf(1)]);
    expect(mounted(container)[0].context).toEqual({
      version: SESSION_ACTION_EXTENSION_VERSION,
      id: sessionOf(1).row_id,
      name: 'session-1',
      status: 'RUNNING',
      type: 'interactive',
    });
  });

  it('mounts no extension in a row someone else owns', () => {
    const { container } = renderList(OWNER, [
      sessionOf(1),
      sessionOf(2, { user_id: SOMEONE_ELSE }),
    ]);
    const elements = mounted(container);
    expect(elements).toHaveLength(1);
    expect(elements[0].context?.id).toBe(sessionOf(1).row_id);
  });

  it('mounts no extension while the signed-in user is unknown', () => {
    const { container } = renderList(undefined, [
      sessionOf(1, { user_id: null }),
      sessionOf(2, { user_id: undefined }),
    ]);
    expect(mounted(container)).toHaveLength(0);
    expect(
      container.querySelector('[data-session-action-extension]'),
    ).toBeNull();
  });

  it('puts the extension column right after the name', () => {
    const { container } = renderList(OWNER, [sessionOf(1)]);
    const names = headers(container);
    const name = names.indexOf('session.SessionName');
    expect(name).toBeGreaterThanOrEqual(0);
    expect(names[name + 1]).toBe('general.Control');
    const cells = container.querySelectorAll('tbody tr.ant-table-row td');
    const nameCellIndex = Array.from(cells).findIndex((cell) =>
      cell.textContent?.includes('session-1'),
    );
    expect(cells[nameCellIndex + 1].querySelector(TAG)).not.toBeNull();
  });

  it('renders no extension column when no plugin declares one', () => {
    const { container } = renderList(OWNER, [sessionOf(1)], []);
    expect(headers(container)).not.toContain('general.Control');
    expect(
      container.querySelector('[data-session-action-extension]'),
    ).toBeNull();
  });

  it('gives a row its new status without mounting its element again', () => {
    const { container, rerenderWith } = renderList(OWNER, [
      sessionOf(1, { status: 'PENDING' }),
    ]);
    const [element] = mounted(container);
    expect(element.context?.status).toBe('PENDING');
    rerenderWith([sessionOf(1, { status: 'RUNNING' })]);
    expect(mounted(container)).toHaveLength(1);
    expect(mounted(container)[0]).toBe(element);
    expect(element.isConnected).toBe(true);
    expect(element.context?.status).toBe('RUNNING');
    expect(element.given.map((context) => context.status)).toEqual([
      'PENDING',
      'RUNNING',
    ]);
  });

  it('gives a row the same context again on a refresh that changes nothing', () => {
    const { container, rerenderWith } = renderList(OWNER, [sessionOf(1)]);
    const [element] = mounted(container);
    rerenderWith([sessionOf(1)]);
    expect(mounted(container)).toHaveLength(1);
    expect(mounted(container)[0]).toBe(element);
    expect(element.isConnected).toBe(true);
    expect(element.given).toHaveLength(1);
  });

  it('keeps each row its own element when the rows are reordered', () => {
    const { container, rerenderWith } = renderList(OWNER, [
      sessionOf(1),
      sessionOf(2),
    ]);
    const [first, second] = mounted(container);
    rerenderWith([sessionOf(2), sessionOf(1)]);
    const after = mounted(container);
    expect(after).toHaveLength(2);
    expect(after[0]).toBe(second);
    expect(after[1]).toBe(first);
    expect(first.context?.id).toBe(sessionOf(1).row_id);
    expect(second.context?.id).toBe(sessionOf(2).row_id);
    expect(first.given).toHaveLength(1);
    expect(second.given).toHaveLength(1);
  });
});
