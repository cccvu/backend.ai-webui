/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import { SESSION_ACTION_EXTENSION_VERSION } from '../types/sessionActionExtension';
import {
  buildSessionActionExtensionContext,
  readSessionActionExtensionTag,
} from './useSessionActionExtensions';
import { describe, expect, it } from 'vitest';

const registryOf = (entries: Record<string, unknown>) => ({
  get: (name: string) => entries[name] as CustomElementConstructor | undefined,
});

describe('readSessionActionExtensionTag', () => {
  class Extension {}

  it('returns the tag a page plugin declares when it is defined', () => {
    const registry = registryOf({
      'test-page': { sessionActionExtension: 'test-action' },
      'test-action': Extension,
    });
    expect(readSessionActionExtensionTag('test-page', registry)).toBe(
      'test-action',
    );
  });

  it('ignores a page without the static property', () => {
    const registry = registryOf({ 'test-page': class {} });
    expect(readSessionActionExtensionTag('test-page', registry)).toBe(
      undefined,
    );
  });

  it('ignores a page that is not defined', () => {
    expect(readSessionActionExtensionTag('test-page', registryOf({}))).toBe(
      undefined,
    );
  });

  it('refuses a tag that is not defined', () => {
    const registry = registryOf({
      'test-page': { sessionActionExtension: 'test-action' },
    });
    expect(readSessionActionExtensionTag('test-page', registry)).toBe(null);
  });

  it.each([42, '', 'noHyphen', 'Test-Action', '1-action', 'a b-c', {}])(
    'refuses a declaration that is not a custom element name: %j',
    (tag) => {
      const registry = registryOf({
        'test-page': { sessionActionExtension: tag },
        [String(tag)]: Extension,
      });
      expect(readSessionActionExtensionTag('test-page', registry)).toBe(null);
    },
  );

  it('does not read the launcher extension property', () => {
    const registry = registryOf({
      'test-page': { sessionLauncherExtension: 'test-action' },
      'test-action': Extension,
    });
    expect(readSessionActionExtensionTag('test-page', registry)).toBe(
      undefined,
    );
  });
});

describe('buildSessionActionExtensionContext', () => {
  it('gives the session id, name, status and type, and nothing else', () => {
    const context = buildSessionActionExtensionContext({
      row_id: '3b8e2f4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
      name: 'my-session',
      status: 'RUNNING',
      type: 'interactive',
      // A field the buttons have but the contract does not give.
      ...({ access_key: 'not-a-key' } as object),
    });
    expect(context).toEqual({
      version: SESSION_ACTION_EXTENSION_VERSION,
      id: '3b8e2f4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
      name: 'my-session',
      status: 'RUNNING',
      type: 'interactive',
    });
    expect(Object.keys(context).sort()).toEqual(
      ['id', 'name', 'status', 'type', 'version'].sort(),
    );
  });

  it('is frozen', () => {
    const context = buildSessionActionExtensionContext({ row_id: 'id' });
    expect(Object.isFrozen(context)).toBe(true);
    expect(() => {
      (context as { status: string | null }).status = 'RUNNING';
    }).toThrow(TypeError);
  });

  it('reports unknown fields as null', () => {
    expect(
      buildSessionActionExtensionContext({
        row_id: 'id',
        name: undefined,
        status: null,
      }),
    ).toEqual({
      version: SESSION_ACTION_EXTENSION_VERSION,
      id: 'id',
      name: null,
      status: null,
      type: null,
    });
  });
});
