/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */

/**
 * Session launcher extension contract, version 1.
 *
 * A page plugin may contribute an element to the session launcher by
 * declaring a static property on its custom element class:
 *
 * ```js
 * class MyPage extends HTMLElement {
 *   static sessionLauncherExtension = 'my-launcher-extension';
 * }
 * customElements.define('my-page', MyPage);
 * customElements.define('my-launcher-extension', MyLauncherExtension);
 * ```
 *
 * The named element must be defined by the time the plugin module finishes
 * loading. PluginLoader records the tag; the launcher then mounts one
 * instance in the Resource Allocation card (`placement: 'resource'`) and one
 * on the review step (`placement: 'review'`, display only: its `host` refuses
 * every change). The two instances share no state.
 *
 * The launcher sets `host` and `context` as properties on each instance and
 * replaces `context` with a new object whenever the form changes (the first
 * one may reflect the form's defaults). Only the
 * `resource` instance's `beforeLaunch` and `afterLaunch` are called.
 *
 * Failure rules:
 * - A tag that is invalid or not defined is ignored, and an element without
 *   `beforeLaunch` that fails to mount renders nothing: the launcher works as
 *   it does without extensions.
 * - `beforeLaunch` is fail-closed. A veto, a throw, a rejection or no answer
 *   within `SESSION_LAUNCHER_EXTENSION_TIMEOUT_MS` stops the launch before
 *   any session request is sent; `signal` is aborted on the timeout. The
 *   launch is also stopped while page plugins are still loading, and when an
 *   extension whose class defines `beforeLaunch` is not mounted, for example
 *   because its constructor or a property setter threw. Define `beforeLaunch`
 *   as a class method, not a class field: only a method can be seen on the
 *   class of an element that failed to mount. A plugin whose module fails to
 *   load declares nothing, so its extension is not known to the launcher.
 * - `afterLaunch` is never awaited and its errors are ignored.
 *
 * `beforeLaunch` is a check in this launcher only, not an enforcement point:
 * other ways of creating sessions (other WebUI dialogs, the API, the CLI) do
 * not run it. Anything that must hold for every session needs a check on the
 * server. Every page plugin's extension is mounted for every user who opens
 * the launcher, whatever the plugin's menu permission.
 *
 * Every launch that reaches the extensions (form valid and confirmed) calls
 * each `resource` instance's `afterLaunch` exactly once: with `aborted` when
 * an extension stopped the launch, otherwise with the result of the session
 * requests. Extensions run one at a time, in plugin configuration order.
 */

export const SESSION_LAUNCHER_EXTENSION_VERSION = 1;

/** How long the launcher waits for one extension's `beforeLaunch`. */
export const SESSION_LAUNCHER_EXTENSION_TIMEOUT_MS = 30_000;

export type SessionLauncherExtensionPlacement = 'resource' | 'review';

/** A read-only snapshot of the launcher form, as the launch would send it. */
export interface SessionLauncherExtensionContext {
  version: typeof SESSION_LAUNCHER_EXTENSION_VERSION;
  placement: SessionLauncherExtensionPlacement;
  sessionType: 'interactive' | 'batch' | 'inference' | 'system';
  /** Empty when the launcher will generate a name at launch. */
  sessionName: string;
  /**
   * The project the session is created in. `id` is set only for the current
   * project; it is null when launching on behalf of another user.
   */
  project: { id: string | null; name: string | null };
  /** The resource group the session is created in. */
  resourceGroup: string | null;
  /** True when the session is launched on behalf of another user. */
  onBehalfOfAnotherUser: boolean;
  /** True when a batch session is scheduled to start at a later time. */
  scheduled: boolean;
  /**
   * `size` containers. A multi-node request for one container is sent as
   * single-node, and reported so.
   */
  cluster: { mode: 'single-node' | 'multi-node'; size: number };
  /**
   * The resources of each container: a session requests `cluster.size` times
   * these.
   */
  resource: {
    cpu: number | null;
    mem: string | null;
    shmem: string | null;
    /** The accelerator slot name, for example `cuda.device`. */
    acceleratorType: string | null;
    /**
     * The accelerator quantity sent for each container; 0 when none is sent,
     * which includes unified-memory slots (`*.unified`).
     */
    accelerator: number;
  };
}

/** Changes an extension may ask the launcher to apply to the form. */
export interface SessionLauncherExtensionHost {
  /**
   * Sets the accelerator request (per container) and switches the resource
   * preset to "custom". Returns false and changes nothing when custom
   * allocation is not allowed in this deployment, when the type is not one
   * of the selected resource group's accelerator slots or is a unified-memory
   * slot, or when
   * the quantity is not a finite number of at least 0. The form validates the
   * new values as usual. A change made while `beforeLaunch` runs does not
   * affect that launch.
   */
  setAcceleratorRequest(request: {
    acceleratorType: string;
    accelerator: number;
  }): boolean;
}

export interface SessionLauncherExtensionLaunch {
  /** The validated values the session request is built from. */
  context: SessionLauncherExtensionContext;
  /** How many sessions this launch creates (more than 1 for multi-launch). */
  numOfSessions: number;
  /** Aborted when the launcher stops waiting for this extension (timeout). */
  signal: AbortSignal;
}

/** Return `{ block: message }` to stop the launch and show the message. */
export type SessionLauncherExtensionVerdict = void | { block: string };

export interface SessionLauncherExtensionOutcome {
  /**
   * - `created`: every requested session was accepted.
   * - `partial`: some sessions were accepted and some refused.
   * - `failed`: no session was accepted.
   * - `aborted`: no session request was sent (an extension stopped the
   *   launch).
   */
  status: 'created' | 'partial' | 'failed' | 'aborted';
  sessions: Array<{ id: string | null; name: string | null }>;
  errors: Array<{ code: string | null; message: string }>;
}

/** The properties and methods the launcher uses on an extension element. */
export interface SessionLauncherExtensionElement extends HTMLElement {
  host?: SessionLauncherExtensionHost;
  context?: SessionLauncherExtensionContext;
  beforeLaunch?: (
    launch: SessionLauncherExtensionLaunch,
  ) =>
    SessionLauncherExtensionVerdict | Promise<SessionLauncherExtensionVerdict>;
  afterLaunch?: (outcome: SessionLauncherExtensionOutcome) => void;
}
