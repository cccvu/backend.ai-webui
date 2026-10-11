/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import {
  SESSION_LAUNCHER_EXTENSION_TIMEOUT_MS,
  SESSION_LAUNCHER_EXTENSION_VERSION,
  type SessionLauncherExtensionContext,
  type SessionLauncherExtensionElement,
  type SessionLauncherExtensionHost,
  type SessionLauncherExtensionOutcome,
  type SessionLauncherExtensionPlacement,
} from '../types/sessionLauncherExtension';
import type { StartSessionResults } from './useStartSession';
import { useWebUIPluginLoadedValue } from './useWebUIPluginState';
import { Form, type FormInstance } from 'antd';
import { useBAILogger } from 'backend.ai-ui';
import { atom, useAtomValue } from 'jotai';
import * as _ from 'lodash-es';
import { useCallback, useMemo, useRef } from 'react';

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

// The same rule as `isUnifiedAcceleratorSlot` in ResourceAllocationFormItems;
// repeated here so that PluginLoader, which imports this module, does not pull
// the launcher's form components into the main bundle.
const isUnifiedSlot = (slotName?: string | null) =>
  !!slotName && _.endsWith(slotName, '.unified');

/**
 * Builds the context an extension sees from the launcher form, following the
 * same rules `useStartSession` uses for the session request: owner mode, batch
 * scheduling, multi-node with one container sent as single-node, and no
 * accelerator quantity without a type or for a unified-memory slot.
 */
export const buildSessionLauncherExtensionContext = (
  values: SessionLauncherExtensionFormValues | undefined,
  currentProject: { id?: string | null; name?: string | null },
  placement: SessionLauncherExtensionPlacement,
): SessionLauncherExtensionContext => {
  const onBehalf = !!values?.owner?.enabled;
  const sessionType = values?.sessionType ?? 'interactive';
  const clusterSize = values?.cluster_size ?? 1;
  const acceleratorType = values?.resource?.acceleratorType;
  const accelerator = values?.resource?.accelerator;
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
      mode:
        values?.cluster_mode === 'multi-node' && clusterSize !== 1
          ? 'multi-node'
          : 'single-node',
      size: clusterSize,
    },
    resource: {
      cpu: values?.resource?.cpu ?? null,
      mem: values?.resource?.mem ?? null,
      shmem: values?.resource?.shmem ?? null,
      acceleratorType: acceleratorType || null,
      accelerator:
        acceleratorType &&
        !isUnifiedSlot(acceleratorType) &&
        accelerator !== undefined &&
        accelerator > 0
          ? accelerator
          : 0,
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
  /** Declared extensions with a `beforeLaunch` that are not mounted. */
  unmounted: string[] = [],
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

  if (unmounted.length > 0) {
    logger.warn(
      `Launcher extensions with a launch check are not mounted: ${unmounted.join(', ')}`,
    );
    afterLaunch({ status: 'aborted', sessions: [], errors: [] });
    return { ok: false };
  }

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
 * The launch sequence: the extensions' check first, the session requests only
 * when it passed, then the outcome to every extension, once. A refusal
 * resolves to `{ ok: false }` without calling `start`; an error from `start` is
 * reported as `failed` and rethrown.
 */
export const launchThroughSessionLauncherExtensions = async <
  R extends StartSessionResults | undefined,
>(
  runBeforeLaunch: () => Promise<SessionLauncherExtensionGate>,
  start: () => Promise<R>,
): Promise<{ ok: false; message?: string } | { ok: true; results: R }> => {
  const gate = await runBeforeLaunch();
  if (!gate.ok) return { ok: false, message: gate.message };
  let results: R;
  try {
    results = await start();
  } catch (error) {
    gate.afterLaunch({
      status: 'failed',
      sessions: [],
      errors: [sessionLauncherExtensionError(error)],
    });
    throw error;
  }
  gate.afterLaunch(sessionLauncherExtensionOutcome(results));
  return { ok: true, results };
};

/** True when the element class defines `beforeLaunch` (a class method). */
export const declaresBeforeLaunch = (
  tag: string,
  registry: Pick<CustomElementRegistry, 'get'> = customElements,
): boolean =>
  typeof (
    registry.get(tag) as { prototype?: { beforeLaunch?: unknown } } | undefined
  )?.prototype?.beforeLaunch === 'function';

/**
 * Runs the launch check of the declared extensions. Fails closed when the
 * plugins have not finished loading (the declared extensions are not known
 * yet), or when a declared extension whose class defines `beforeLaunch` is
 * not mounted.
 */
export const runSessionLauncherExtensionGate = (
  options: {
    pluginsLoaded: boolean;
    tags: string[];
    mounted: ReadonlyMap<string, SessionLauncherExtensionElement>;
    launch: { context: SessionLauncherExtensionContext; numOfSessions: number };
    logger: Logger;
  },
  registry: Pick<CustomElementRegistry, 'get'> = customElements,
  timeoutMs: number = SESSION_LAUNCHER_EXTENSION_TIMEOUT_MS,
): Promise<SessionLauncherExtensionGate> => {
  const { pluginsLoaded, tags, mounted, launch, logger } = options;
  if (!pluginsLoaded) {
    logger.warn('Launch refused: page plugins are still loading');
    return Promise.resolve({ ok: false });
  }
  const extensions = _.flatMap(tags, (tag) => {
    const element = mounted.get(tag);
    return element ? [{ tag, element }] : [];
  });
  const unmounted = _.filter(
    tags,
    (tag) => !mounted.has(tag) && declaresBeforeLaunch(tag, registry),
  );
  return runSessionLauncherExtensions(
    extensions,
    launch,
    logger,
    timeoutMs,
    unmounted,
  );
};

/**
 * Builds the `host` an extension uses to change the launcher form. The
 * accelerator request is applied only when custom allocation is allowed and
 * the type is one the selected resource group offers (the same choices as the
 * accelerator selector), never a unified-memory slot, whose quantity is not
 * sent.
 */
export const createSessionLauncherExtensionHost = (
  form: Pick<FormInstance, 'setFieldsValue' | 'validateFields'>,
  options: {
    allowCustomResourceAllocation: boolean;
    /** Undefined while the resource group's slots are loading. */
    offeredAcceleratorTypes: string[] | undefined;
  },
): SessionLauncherExtensionHost => ({
  setAcceleratorRequest: (request) => {
    const { acceleratorType, accelerator } = request ?? {};
    if (
      !options.allowCustomResourceAllocation ||
      typeof acceleratorType !== 'string' ||
      !_.includes(options.offeredAcceleratorTypes, acceleratorType) ||
      isUnifiedSlot(acceleratorType) ||
      typeof accelerator !== 'number' ||
      !Number.isFinite(accelerator) ||
      accelerator < 0
    ) {
      return false;
    }
    form.setFieldsValue({
      allocationPreset: 'custom',
      resource: { acceleratorType, accelerator },
    });
    form.validateFields(['resource'], { recursive: true }).catch(() => {});
    return true;
  },
});

/** The `host` of the review-step instance, which is display only. */
export const DISPLAY_ONLY_SESSION_LAUNCHER_EXTENSION_HOST: SessionLauncherExtensionHost =
  Object.freeze({ setAcceleratorRequest: () => false });

/**
 * The session launcher's extension wiring: the declared tags, the registry
 * the `resource` slot registers its mounted elements in, the contexts and
 * host the slots pass on, and the launch check the launch runs before sending
 * any session request.
 */
export const useSessionLauncherExtensions = (
  form: FormInstance,
  options: {
    currentProject: { id?: string | null; name?: string | null };
    allowCustomResourceAllocation: boolean;
    /** Undefined while the resource group's slots are loading. */
    offeredAcceleratorTypes: string[] | undefined;
  },
) => {
  'use memo';

  const { currentProject, allowCustomResourceAllocation } = options;
  const tags = useAtomValue(sessionLauncherExtensionTagsState);
  const pluginsLoaded = useWebUIPluginLoadedValue();
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

  // Nothing is watched when no extension is loaded.
  const formValues = Form.useWatch(
    (values) =>
      tags.length > 0
        ? _.pick(values, SESSION_LAUNCHER_EXTENSION_FIELDS)
        : undefined,
    { form, preserve: true },
  );
  const contexts = useMemo(
    () => ({
      resource: buildSessionLauncherExtensionContext(
        formValues,
        currentProject,
        'resource',
      ),
      review: buildSessionLauncherExtensionContext(
        formValues,
        currentProject,
        'review',
      ),
    }),
    [formValues, currentProject],
  );

  const { offeredAcceleratorTypes } = options;
  const host = useMemo(
    () =>
      createSessionLauncherExtensionHost(form, {
        allowCustomResourceAllocation,
        offeredAcceleratorTypes,
      }),
    [form, allowCustomResourceAllocation, offeredAcceleratorTypes],
  );

  const runBeforeLaunch = (
    values: SessionLauncherExtensionFormValues,
    numOfSessions: number,
  ) =>
    runSessionLauncherExtensionGate({
      pluginsLoaded,
      tags,
      mounted: registryRef.current,
      launch: {
        context: buildSessionLauncherExtensionContext(
          values,
          currentProject,
          'resource',
        ),
        numOfSessions,
      },
      logger,
    });

  /** Runs the launch check, then `start` only when it passed. */
  const launch = <R extends StartSessionResults | undefined>(
    values: SessionLauncherExtensionFormValues,
    numOfSessions: number,
    start: () => Promise<R>,
  ) =>
    launchThroughSessionLauncherExtensions(
      () => runBeforeLaunch(values, numOfSessions),
      start,
    );

  return { tags, register, contexts, host, runBeforeLaunch, launch };
};
