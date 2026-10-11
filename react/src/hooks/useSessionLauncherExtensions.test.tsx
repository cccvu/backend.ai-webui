/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import type {
  SessionLauncherExtensionElement,
  SessionLauncherExtensionLaunch,
} from '../types/sessionLauncherExtension';
import {
  buildSessionLauncherExtensionContext,
  readSessionLauncherExtensionTag,
  runSessionLauncherExtensions,
  sessionLauncherExtensionOutcome,
  sessionLauncherExtensionTagsState,
  useSessionLauncherExtensions,
} from './useSessionLauncherExtensions';
import { renderHook } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

const registryOf = (entries: Record<string, unknown>) => ({
  get: (name: string) => entries[name] as CustomElementConstructor | undefined,
});

describe('readSessionLauncherExtensionTag', () => {
  class Extension {}

  it('returns the tag a page plugin declares when it is defined', () => {
    const registry = registryOf({
      'test-page': { sessionLauncherExtension: 'test-extension' },
      'test-extension': Extension,
    });
    expect(readSessionLauncherExtensionTag('test-page', registry)).toBe(
      'test-extension',
    );
  });

  it('ignores a page without the static property', () => {
    const registry = registryOf({ 'test-page': class {} });
    expect(readSessionLauncherExtensionTag('test-page', registry)).toBe(
      undefined,
    );
  });

  it('ignores a page that is not defined', () => {
    expect(readSessionLauncherExtensionTag('test-page', registryOf({}))).toBe(
      undefined,
    );
  });

  it('refuses a tag that is not defined', () => {
    const registry = registryOf({
      'test-page': { sessionLauncherExtension: 'test-extension' },
    });
    expect(readSessionLauncherExtensionTag('test-page', registry)).toBe(null);
  });

  it.each([
    'noextension',
    'Test-Extension',
    '1test-extension',
    '../test-extension',
    'test-extension"><img',
    '',
  ])('refuses the invalid element name %j', (tag) => {
    const registry = registryOf({
      'test-page': { sessionLauncherExtension: tag },
      [tag]: Extension,
    });
    expect(readSessionLauncherExtensionTag('test-page', registry)).toBe(null);
  });

  it('refuses a value that is not a string', () => {
    const registry = registryOf({
      'test-page': { sessionLauncherExtension: { tag: 'test-extension' } },
      'test-extension': Extension,
    });
    expect(readSessionLauncherExtensionTag('test-page', registry)).toBe(null);
  });
});

describe('buildSessionLauncherExtensionContext', () => {
  const project = { id: 'project-id', name: 'project-a' };

  it('reports the request the launch would send', () => {
    const context = buildSessionLauncherExtensionContext(
      {
        sessionType: 'interactive',
        sessionName: 'my-session',
        resourceGroup: 'group-a',
        cluster_mode: 'single-node',
        cluster_size: 1,
        batch: { enabled: true, scheduleDate: '2026-01-01T00:00:00Z' },
        resource: {
          cpu: 4,
          mem: '16g',
          shmem: '1g',
          acceleratorType: 'cuda.device',
          accelerator: 2,
        },
      },
      project,
      'resource',
    );
    expect(context).toEqual({
      version: 1,
      placement: 'resource',
      sessionType: 'interactive',
      sessionName: 'my-session',
      project: { id: 'project-id', name: 'project-a' },
      resourceGroup: 'group-a',
      onBehalfOfAnotherUser: false,
      // A schedule only applies to batch sessions.
      scheduled: false,
      cluster: { mode: 'single-node', size: 1 },
      resource: {
        cpu: 4,
        mem: '16g',
        shmem: '1g',
        acceleratorType: 'cuda.device',
        accelerator: 2,
      },
    });
  });

  it("uses the owner's project and resource group on behalf of another user", () => {
    const context = buildSessionLauncherExtensionContext(
      {
        resourceGroup: 'group-a',
        owner: {
          enabled: true,
          project: 'project-b',
          resourceGroup: 'group-b',
        },
      },
      project,
      'review',
    );
    expect(context.onBehalfOfAnotherUser).toBe(true);
    expect(context.project).toEqual({ id: null, name: 'project-b' });
    expect(context.resourceGroup).toBe('group-b');
    expect(context.placement).toBe('review');
  });

  it('marks a scheduled batch session', () => {
    const context = buildSessionLauncherExtensionContext(
      {
        sessionType: 'batch',
        batch: { enabled: true, scheduleDate: '2026-01-01T00:00:00Z' },
      },
      project,
      'resource',
    );
    expect(context.scheduled).toBe(true);
  });

  it('has defaults before the form is ready', () => {
    const context = buildSessionLauncherExtensionContext(
      undefined,
      { id: undefined, name: undefined },
      'resource',
    );
    expect(context).toMatchObject({
      sessionType: 'interactive',
      sessionName: '',
      project: { id: null, name: null },
      resourceGroup: null,
      cluster: { mode: 'single-node', size: 1 },
      resource: { acceleratorType: null, accelerator: 0 },
    });
  });
});

describe('sessionLauncherExtensionOutcome', () => {
  const fulfilled = (id: string) => ({
    status: 'fulfilled' as const,
    value: {
      sessionId: id,
      sessionName: `name-${id}`,
      servicePorts: [],
    },
  });
  const rejected = {
    status: 'rejected' as const,
    reason: { error_code: 'session_create_failed', message: 'no capacity' },
  };

  it('reports created sessions', () => {
    expect(
      sessionLauncherExtensionOutcome({ fulfilled: [fulfilled('a')] }),
    ).toEqual({
      status: 'created',
      sessions: [{ id: 'a', name: 'name-a' }],
      errors: [],
    });
  });

  it('reports a partial launch', () => {
    const outcome = sessionLauncherExtensionOutcome({
      fulfilled: [fulfilled('a')],
      rejected: [rejected],
    });
    expect(outcome.status).toBe('partial');
    expect(outcome.errors).toEqual([
      { code: 'session_create_failed', message: 'no capacity' },
    ]);
  });

  it('reports a failed launch', () => {
    expect(
      sessionLauncherExtensionOutcome({ rejected: [rejected] }).status,
    ).toBe('failed');
    expect(sessionLauncherExtensionOutcome(undefined).status).toBe('failed');
  });
});

describe('runSessionLauncherExtensions', () => {
  const context = buildSessionLauncherExtensionContext(
    { resourceGroup: 'group-a' },
    { id: 'p', name: 'project' },
    'resource',
  );
  const launch = { context, numOfSessions: 2 };
  const logger = { warn: vi.fn() };

  const extension = (
    tag: string,
    hooks: Partial<
      Pick<SessionLauncherExtensionElement, 'beforeLaunch' | 'afterLaunch'>
    > = {},
  ) => ({
    tag,
    element: Object.assign(document.createElement('div'), {
      afterLaunch: vi.fn(),
      ...hooks,
    }) as SessionLauncherExtensionElement & {
      afterLaunch: ReturnType<typeof vi.fn>;
    },
  });

  afterEach(() => {
    vi.useRealTimers();
    logger.warn.mockReset();
  });

  it('lets the launch proceed with no extensions', async () => {
    const gate = await runSessionLauncherExtensions([], launch, logger);
    expect(gate.ok).toBe(true);
  });

  it('passes the launch to each extension in order and proceeds', async () => {
    const calls: string[] = [];
    const first = extension('ext-a', {
      beforeLaunch: vi.fn(async (l: SessionLauncherExtensionLaunch) => {
        calls.push('a');
        expect(l.context).toBe(context);
        expect(l.numOfSessions).toBe(2);
        expect(l.signal.aborted).toBe(false);
      }),
    });
    const second = extension('ext-b', {
      beforeLaunch: vi.fn(() => {
        calls.push('b');
      }),
    });
    const gate = await runSessionLauncherExtensions(
      [first, second],
      launch,
      logger,
    );
    expect(calls).toEqual(['a', 'b']);
    expect(gate.ok).toBe(true);
    expect(first.element.afterLaunch).not.toHaveBeenCalled();
  });

  it('stops at a veto, shows its message and tells every extension', async () => {
    const vetoing = extension('ext-a', {
      beforeLaunch: async () => ({ block: 'Choose fewer devices.' }),
    });
    const later = extension('ext-b', { beforeLaunch: vi.fn() });
    const gate = await runSessionLauncherExtensions(
      [vetoing, later],
      launch,
      logger,
    );
    expect(gate).toEqual({ ok: false, message: 'Choose fewer devices.' });
    expect(later.element.beforeLaunch).not.toHaveBeenCalled();
    const aborted = { status: 'aborted', sessions: [], errors: [] };
    expect(vetoing.element.afterLaunch).toHaveBeenCalledWith(aborted);
    expect(later.element.afterLaunch).toHaveBeenCalledWith(aborted);
  });

  it('stops with the generic message when a veto has no text', async () => {
    const gate = await runSessionLauncherExtensions(
      [extension('ext-a', { beforeLaunch: () => ({ block: 42 }) as never })],
      launch,
      logger,
    );
    expect(gate).toEqual({ ok: false, message: undefined });
  });

  it('stops the launch when beforeLaunch throws', async () => {
    const accepted = extension('ext-a', { beforeLaunch: async () => {} });
    const throwing = extension('ext-b', {
      beforeLaunch: () => {
        throw new Error('broken');
      },
    });
    const gate = await runSessionLauncherExtensions(
      [accepted, throwing],
      launch,
      logger,
    );
    expect(gate).toEqual({ ok: false, message: undefined });
    expect(accepted.element.afterLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'aborted' }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('stops the launch when beforeLaunch rejects', async () => {
    const gate = await runSessionLauncherExtensions(
      [
        extension('ext-a', {
          beforeLaunch: () => Promise.reject(new Error('down')),
        }),
      ],
      launch,
      logger,
    );
    expect(gate.ok).toBe(false);
  });

  it('stops the launch and aborts the signal when beforeLaunch hangs', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const hanging = extension('ext-a', {
      beforeLaunch: (l) => {
        signal = l.signal;
        return new Promise(() => {});
      },
    });
    const pending = runSessionLauncherExtensions([hanging], launch, logger);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const gate = await pending;
    expect(gate).toEqual({ ok: false, message: undefined });
    expect(signal?.aborted).toBe(true);
    expect(hanging.element.afterLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'aborted' }),
    );
  });

  it('reports the outcome to every extension exactly once', async () => {
    const withHooks = extension('ext-a', { beforeLaunch: async () => {} });
    const afterOnly = extension('ext-b');
    const gate = await runSessionLauncherExtensions(
      [withHooks, afterOnly],
      launch,
      logger,
    );
    if (!gate.ok) throw new Error('expected the launch to proceed');
    const outcome = {
      status: 'created' as const,
      sessions: [{ id: 's', name: 'n' }],
      errors: [],
    };
    gate.afterLaunch(outcome);
    gate.afterLaunch({ status: 'failed', sessions: [], errors: [] });
    expect(withHooks.element.afterLaunch).toHaveBeenCalledTimes(1);
    expect(withHooks.element.afterLaunch).toHaveBeenCalledWith(outcome);
    expect(afterOnly.element.afterLaunch).toHaveBeenCalledTimes(1);
  });

  it('ignores errors from afterLaunch', async () => {
    const throwing = extension('ext-a', {
      afterLaunch: vi.fn(() => {
        throw new Error('broken');
      }),
    });
    const rejecting = extension('ext-b', {
      afterLaunch: vi.fn(() => Promise.reject(new Error('down')) as never),
    });
    const last = extension('ext-c');
    const gate = await runSessionLauncherExtensions(
      [throwing, rejecting, last],
      launch,
      logger,
    );
    if (!gate.ok) throw new Error('expected the launch to proceed');
    expect(() =>
      gate.afterLaunch({ status: 'failed', sessions: [], errors: [] }),
    ).not.toThrow();
    await Promise.resolve();
    expect(last.element.afterLaunch).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});

describe('useSessionLauncherExtensions', () => {
  const context = buildSessionLauncherExtensionContext(
    undefined,
    { id: 'p', name: 'project' },
    'resource',
  );

  const renderRegistry = (tags: string[]) => {
    const store = createStore();
    store.set(sessionLauncherExtensionTagsState, tags);
    return renderHook(() => useSessionLauncherExtensions(), {
      wrapper: ({ children }) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });
  };

  it('runs only mounted extensions, in plugin order', async () => {
    const { result } = renderRegistry(['ext-a', 'ext-b', 'ext-c']);
    const calls: string[] = [];
    const element = (name: string) =>
      Object.assign(document.createElement('div'), {
        beforeLaunch: () => {
          calls.push(name);
        },
      });
    // Registered out of order; ext-b is never mounted.
    result.current.register('ext-c', element('c'));
    result.current.register('ext-a', element('a'));
    const gate = await result.current.runBeforeLaunch({
      context,
      numOfSessions: 1,
    });
    expect(gate.ok).toBe(true);
    expect(calls).toEqual(['a', 'c']);
  });

  it('forgets an element once it unregisters', async () => {
    const { result } = renderRegistry(['ext-a']);
    const beforeLaunch = vi.fn(() => ({ block: 'no' }));
    const unregister = result.current.register(
      'ext-a',
      Object.assign(document.createElement('div'), { beforeLaunch }),
    );
    unregister();
    const gate = await result.current.runBeforeLaunch({
      context,
      numOfSessions: 1,
    });
    expect(gate.ok).toBe(true);
    expect(beforeLaunch).not.toHaveBeenCalled();
  });
});
