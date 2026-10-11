/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import {
  SESSION_LAUNCHER_EXTENSION_TIMEOUT_MS,
  SESSION_LAUNCHER_EXTENSION_VERSION,
  type SessionLauncherExtensionContext,
  type SessionLauncherExtensionElement,
  type SessionLauncherExtensionOutcome,
  type SessionLauncherExtensionPlacement,
} from '../types/sessionLauncherExtension';
import type { StartSessionResults } from './useStartSession';
import { useBAILogger } from 'backend.ai-ui';
import { atom, useAtomValue } from 'jotai';
import * as _ from 'lodash-es';
import { useCallback, useRef } from 'react';

/**
 * Tags of the session launcher extension elements declared by the loaded
 * page plugins, in plugin configuration order. Set by PluginLoader.
 */
export const sessionLauncherExtensionTagsState = atom<string[]>([]);

// A valid custom element name: lower case, starts with a letter, has a hyphen.
const CUSTOM_ELEMENT_NAME = /^[a-z][a-z0-9._]*(-[a-z0-9._]*)+$/;

/**
 * Reads the static `sessionLauncherExtension` tag from a page plugin's
 * element class. Returns undefined when the class declares none, and null
 * when the declared tag is not the name of a defined custom element.
 */
export const readSessionLauncherExtensionTag = (
  pageTag: string,
  registry: Pick<CustomElementRegistry, 'get'> = customElements,
): string | null | undefined => {
  const pageClass = registry.get(pageTag) as
    { sessionLauncherExtension?: unknown } | undefined;
  const tag = pageClass?.sessionLauncherExtension;
  if (tag === undefined) return undefined;
  if (
    typeof tag !== 'string' ||
    !CUSTOM_ELEMENT_NAME.test(tag) ||
    !registry.get(tag)
  ) {
    return null;
  }
  return tag;
};

type Logger = {
  warn: (...args: unknown[]) => void;
};

/** The subset of the launcher form that the context is built from. */
export interface SessionLauncherExtensionFormValues {
  sessionType?: SessionLauncherExtensionContext['sessionType'];
  sessionName?: string;
  resourceGroup?: string;
  owner?: { enabled?: boolean; project?: string; resourceGroup?: string };
  batch?: { enabled?: boolean; scheduleDate?: string };
  cluster_mode?: SessionLauncherExtensionContext['cluster']['mode'];
  cluster_size?: number;
  resource?: {
    cpu?: number;
    mem?: string;
    shmem?: string;
    acceleratorType?: string;
    accelerator?: number;
  };
}

/** The form fields the context is built from (what the launcher watches). */
export const SESSION_LAUNCHER_EXTENSION_FIELDS = [
  'sessionType',
  'sessionName',
  'resourceGroup',
  'owner',
  'batch',
  'cluster_mode',
  'cluster_size',
  'resource',
] as const satisfies ReadonlyArray<keyof SessionLauncherExtensionFormValues>;

/**
 * Builds the context an extension sees from the launcher form, following the
 * same rules the session request uses (owner mode, batch scheduling).
 */
export const buildSessionLauncherExtensionContext = (
  values: SessionLauncherExtensionFormValues | undefined,
  currentProject: { id?: string | null; name?: string | null },
  placement: SessionLauncherExtensionPlacement,
): SessionLauncherExtensionContext => {
  const onBehalf = !!values?.owner?.enabled;
  const sessionType = values?.sessionType ?? 'interactive';
  return {
    version: SESSION_LAUNCHER_EXTENSION_VERSION,
    placement,
    sessionType,
    sessionName: values?.sessionName ?? '',
    project: onBehalf
      ? { id: null, name: values?.owner?.project || null }
      : { id: currentProject.id || null, name: currentProject.name || null },
    resourceGroup:
      (onBehalf ? values?.owner?.resourceGroup : values?.resourceGroup) || null,
    onBehalfOfAnotherUser: onBehalf,
    scheduled:
      sessionType === 'batch' &&
      !!values?.batch?.enabled &&
      !!values?.batch?.scheduleDate,
    cluster: {
      mode: values?.cluster_mode ?? 'single-node',
      size: values?.cluster_size ?? 1,
    },
    resource: {
      cpu: values?.resource?.cpu ?? null,
      mem: values?.resource?.mem ?? null,
      shmem: values?.resource?.shmem ?? null,
      acceleratorType: values?.resource?.acceleratorType ?? null,
      accelerator: values?.resource?.accelerator ?? 0,
    },
  };
};

/** Summarises session request results for `afterLaunch`. */
export const sessionLauncherExtensionOutcome = (
  results: StartSessionResults | undefined,
): SessionLauncherExtensionOutcome => {
  const sessions = _.map(results?.fulfilled, (r) => ({
    id: r.value?.sessionId ?? null,
    name: r.value?.sessionName ?? null,
  }));
  const errors = _.map(results?.rejected, (r) =>
    sessionLauncherExtensionError(r.reason),
  );
  return {
    status:
      sessions.length === 0
        ? 'failed'
        : errors.length === 0
          ? 'created'
          : 'partial',
    sessions,
    errors,
  };
};

export const sessionLauncherExtensionError = (
  error: unknown,
): SessionLauncherExtensionOutcome['errors'][number] => {
  const e = error as { error_code?: unknown; message?: unknown } | undefined;
  return {
    code: typeof e?.error_code === 'string' ? e.error_code : null,
    message:
      typeof e?.message === 'string' && e.message
        ? e.message
        : String(error ?? ''),
  };
};

export type SessionLauncherExtensionGate =
  | {
      ok: true;
      /** Reports the launch result to every extension, once. */
      afterLaunch: (outcome: SessionLauncherExtensionOutcome) => void;
    }
  | {
      ok: false;
      /** The extension's message; undefined when it threw or timed out. */
      message?: string;
    };

const TIMED_OUT = Symbol('timed out');

/**
 * Runs each extension's `beforeLaunch` in order. The first veto, throw or
 * timeout stops the launch, and every extension is told `aborted`.
 */
export const runSessionLauncherExtensions = async (
  extensions: Array<{ tag: string; element: SessionLauncherExtensionElement }>,
  launch: { context: SessionLauncherExtensionContext; numOfSessions: number },
  logger: Logger,
  timeoutMs: number = SESSION_LAUNCHER_EXTENSION_TIMEOUT_MS,
): Promise<SessionLauncherExtensionGate> => {
  let notified = false;
  const afterLaunch = (outcome: SessionLauncherExtensionOutcome) => {
    if (notified) return;
    notified = true;
    for (const { tag, element } of extensions) {
      try {
        const result: unknown = element.afterLaunch?.(outcome);
        // A rejected promise must not surface as an unhandled rejection.
        Promise.resolve(result).catch((error) =>
          logger.warn(`Launcher extension "${tag}" afterLaunch failed:`, error),
        );
      } catch (error) {
        logger.warn(`Launcher extension "${tag}" afterLaunch failed:`, error);
      }
    }
  };

  for (const { tag, element } of extensions) {
    if (typeof element.beforeLaunch !== 'function') continue;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let verdict: unknown;
    let failed = false;
    try {
      verdict = await Promise.race([
        Promise.resolve().then(() =>
          element.beforeLaunch!({
            context: launch.context,
            numOfSessions: launch.numOfSessions,
            signal: controller.signal,
          }),
        ),
        new Promise<typeof TIMED_OUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
        }),
      ]);
      if (verdict === TIMED_OUT) {
        controller.abort();
        logger.warn(`Launcher extension "${tag}" did not answer in time`);
        failed = true;
      }
    } catch (error) {
      logger.warn(`Launcher extension "${tag}" beforeLaunch failed:`, error);
      failed = true;
    } finally {
      clearTimeout(timer);
    }
    const block = (verdict as { block?: unknown } | undefined)?.block;
    if (failed || block !== undefined) {
      afterLaunch({ status: 'aborted', sessions: [], errors: [] });
      return {
        ok: false,
        message:
          !failed && typeof block === 'string' && block ? block : undefined,
      };
    }
  }
  return { ok: true, afterLaunch };
};

/**
 * The session launcher's extension registry. The `resource` slot registers
 * its mounted elements; the launch calls `runBeforeLaunch` before sending any
 * session request.
 */
export const useSessionLauncherExtensions = () => {
  'use memo';

  const tags = useAtomValue(sessionLauncherExtensionTagsState);
  const { logger } = useBAILogger();
  const registryRef = useRef(
    new Map<string, SessionLauncherExtensionElement>(),
  );

  const register = useCallback(
    (tag: string, element: SessionLauncherExtensionElement) => {
      registryRef.current.set(tag, element);
      return () => {
        if (registryRef.current.get(tag) === element) {
          registryRef.current.delete(tag);
        }
      };
    },
    [],
  );

  const runBeforeLaunch = (launch: {
    context: SessionLauncherExtensionContext;
    numOfSessions: number;
  }) => {
    const extensions = _.flatMap(tags, (tag) => {
      const element = registryRef.current.get(tag);
      return element ? [{ tag, element }] : [];
    });
    return runSessionLauncherExtensions(extensions, launch, logger);
  };

  return { tags, register, runBeforeLaunch };
};
