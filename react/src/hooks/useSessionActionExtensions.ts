/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import {
  SESSION_ACTION_EXTENSION_VERSION,
  type SessionActionExtensionContext,
} from '../types/sessionActionExtension';
import { atom, useAtomValue } from 'jotai';

/**
 * Tags of the session action extension elements declared by the loaded page
 * plugins, in plugin configuration order. Set by PluginLoader.
 */
export const sessionActionExtensionTagsState = atom<string[]>([]);

export const useSessionActionExtensionTags = () =>
  useAtomValue(sessionActionExtensionTagsState);

// A valid custom element name: lower case, starts with a letter, has a hyphen.
const CUSTOM_ELEMENT_NAME = /^[a-z][a-z0-9._]*(-[a-z0-9._]*)+$/;

/**
 * Reads the static `sessionActionExtension` tag from a page plugin's element
 * class. Returns undefined when the class declares none, and null when the
 * declared tag is not the name of a defined custom element.
 */
export const readSessionActionExtensionTag = (
  pageTag: string,
  registry: Pick<CustomElementRegistry, 'get'> = customElements,
): string | null | undefined => {
  const pageClass = registry.get(pageTag) as
    { sessionActionExtension?: unknown } | undefined;
  const tag = pageClass?.sessionActionExtension;
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

/** The session fields the context is built from. */
export interface SessionActionExtensionSession {
  row_id: string;
  name?: string | null;
  status?: string | null;
  type?: string | null;
}

/**
 * Builds the frozen context an extension sees: the session's UUID, name,
 * status and type, and nothing else.
 */
export const buildSessionActionExtensionContext = (
  session: SessionActionExtensionSession,
): SessionActionExtensionContext =>
  Object.freeze({
    version: SESSION_ACTION_EXTENSION_VERSION,
    id: session.row_id,
    name: session.name ?? null,
    status: session.status ?? null,
    type: session.type ?? null,
  });
