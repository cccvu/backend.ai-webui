/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */

/**
 * Session action extension contract, version 1.
 *
 * A page plugin may contribute an element to the action buttons of a
 * compute session by declaring a static property on its custom element
 * class:
 *
 * ```js
 * class MyPage extends HTMLElement {
 *   static sessionActionExtension = 'my-session-action';
 * }
 * customElements.define('my-page', MyPage);
 * customElements.define('my-session-action', MySessionAction);
 * ```
 *
 * The named element must be defined by the time the plugin module finishes
 * loading. PluginLoader records the tag, and the element is mounted, only for
 * a session the signed-in user owns, in two places:
 * - the session action buttons (for example in the session detail), one
 *   instance after their own buttons;
 * - each row of a session list, one instance in a column right after the
 *   session's name.
 * Each instance is given `context` as a property before it is inserted, and
 * a new object whenever one of its fields changes. The context is frozen and
 * is all the element is given.
 *
 * The element may be mounted once per listed session, so it should do no
 * work, such as a request, until it is used.
 *
 * The element decides what to show, including nothing: for example nothing
 * for a session in a status or of a type it does not act on. It is laid out
 * as one item beside the buttons, or alone in its cell, and should size
 * itself from its container.
 *
 * Failure rules (fail-open): an extension never blocks or hides the other
 * actions.
 * - A tag that is invalid or not defined is ignored.
 * - An element whose constructor throws, or that throws (or reports an
 *   error) while it is given its context or inserted, is removed, and
 *   nothing is shown in its place until the buttons are mounted again.
 *   Define `context` as an accessor that never throws.
 * - A plugin whose module fails to load declares nothing.
 *
 * The slot only places an element; it is not an access check. Anything the
 * element does must be authorized by the server. Every page plugin's
 * extension is mounted for the owner of every session, whatever the
 * plugin's menu permission.
 */

export const SESSION_ACTION_EXTENSION_VERSION = 1;

/** A read-only snapshot of the session the buttons act on. */
export interface SessionActionExtensionContext {
  readonly version: typeof SESSION_ACTION_EXTENSION_VERSION;
  /** The session's UUID. */
  readonly id: string;
  readonly name: string | null;
  /** The session's status, for example `RUNNING`; null when unknown. */
  readonly status: string | null;
  /**
   * The session's type, for example `interactive` or `batch`; null when
   * unknown.
   */
  readonly type: string | null;
}

/** The property the session action buttons set on an extension element. */
export interface SessionActionExtensionElement extends HTMLElement {
  context?: SessionActionExtensionContext;
}
