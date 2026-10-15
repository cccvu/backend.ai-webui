/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import { buildSessionActionExtensionContext } from '../hooks/useSessionActionExtensions';
import type {
  SessionActionExtensionContext,
  SessionActionExtensionElement,
} from '../types/sessionActionExtension';
import SessionActionExtensionSlot from './SessionActionExtensionSlot';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const define = (tag: string, elementClass: CustomElementConstructor) => {
  if (!customElements.get(tag)) customElements.define(tag, elementClass);
};

// Records each context it is given, and whether it had one when inserted.
class RecordingAction extends HTMLElement {
  given: SessionActionExtensionContext[] = [];
  contextWhenConnected: SessionActionExtensionContext | undefined;
  #context: SessionActionExtensionContext | undefined;
  get context() {
    return this.#context;
  }
  set context(value: SessionActionExtensionContext | undefined) {
    this.#context = value;
    if (value) this.given.push(value);
  }
  connectedCallback() {
    this.contextWhenConnected = this.#context;
  }
}
define('action-test-recording', RecordingAction);

class OtherAction extends HTMLElement {}
define('action-test-other', OtherAction);

class ExplodingAction extends HTMLElement {
  constructor() {
    super();
    throw new Error('broken constructor');
  }
}
define('action-test-exploding', ExplodingAction);

class RejectingAction extends HTMLElement {
  set context(_value: unknown) {
    throw new Error('broken setter');
  }
}
define('action-test-rejecting', RejectingAction);

class FailingConnectAction extends HTMLElement {
  connectedCallback() {
    throw new Error('broken connectedCallback');
  }
}
define('action-test-failing-connect', FailingConnectAction);

// Accepts its first context and throws on any later one.
class RejectsLaterAction extends HTMLElement {
  #given = 0;
  set context(_value: unknown) {
    this.#given += 1;
    if (this.#given > 1) throw new Error('broken on update');
  }
}
define('action-test-rejects-later', RejectsLaterAction);

const contextFor = (status: string) =>
  buildSessionActionExtensionContext({
    row_id: '3b8e2f4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
    name: 'my-session',
    status,
    type: 'interactive',
  });

const mounted = (container: HTMLElement, tag: string) =>
  container.querySelector(tag) as SessionActionExtensionElement | null;

// Errors the elements report (as a browser does for custom element callbacks)
// are expected here; keep them from failing the run.
const reported = vi.fn((event: ErrorEvent) => event.preventDefault());
beforeEach(() => {
  reported.mockClear();
  window.addEventListener('error', reported);
});
afterEach(() => window.removeEventListener('error', reported));

describe('SessionActionExtensionSlot', () => {
  it('renders nothing without extensions', () => {
    const { container } = render(
      <SessionActionExtensionSlot tags={[]} context={contextFor('RUNNING')} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mounts each extension, given its context before it is inserted', () => {
    const context = contextFor('RUNNING');
    const { container } = render(
      <SessionActionExtensionSlot
        tags={['action-test-recording', 'action-test-other']}
        context={context}
      />,
    );
    const element = mounted(
      container,
      'action-test-recording',
    ) as RecordingAction | null;
    expect(element).toBeInstanceOf(RecordingAction);
    expect(element?.contextWhenConnected).toBe(context);
    expect(element?.given).toEqual([context]);
    expect(mounted(container, 'action-test-other')).toBeInstanceOf(OtherAction);
  });

  it('gives the same element a new context only when a field changes', () => {
    const { container, rerender } = render(
      <SessionActionExtensionSlot
        tags={['action-test-recording']}
        context={contextFor('PREPARING')}
      />,
    );
    const element = mounted(
      container,
      'action-test-recording',
    ) as RecordingAction;
    rerender(
      <SessionActionExtensionSlot
        tags={['action-test-recording']}
        context={contextFor('PREPARING')}
      />,
    );
    expect(element.given).toHaveLength(1);
    const running = contextFor('RUNNING');
    rerender(
      <SessionActionExtensionSlot
        tags={['action-test-recording']}
        context={running}
      />,
    );
    expect(mounted(container, 'action-test-recording')).toBe(element);
    expect(element.given).toHaveLength(2);
    expect(element.context).toBe(running);
  });

  it('removes the element on unmount', () => {
    const { container, unmount } = render(
      <SessionActionExtensionSlot
        tags={['action-test-recording']}
        context={contextFor('RUNNING')}
      />,
    );
    const element = mounted(container, 'action-test-recording');
    unmount();
    expect(element?.isConnected).toBe(false);
  });

  it.each([
    ['a constructor that throws', 'action-test-exploding'],
    ['a context setter that throws', 'action-test-rejecting'],
    ['a connectedCallback that throws', 'action-test-failing-connect'],
  ])('leaves out an element with %s and keeps the others', (_what, tag) => {
    const { container } = render(
      <div data-testid="buttons">
        <button>other action</button>
        <SessionActionExtensionSlot
          tags={[tag, 'action-test-other']}
          context={contextFor('RUNNING')}
        />
      </div>,
    );
    expect(mounted(container, tag)).toBeNull();
    expect(
      container.querySelector(`[data-session-action-extension="${tag}"]`),
    ).toBeNull();
    expect(mounted(container, 'action-test-other')).not.toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('other action');
  });

  it('removes an element that rejects a later context', () => {
    const tag = 'action-test-rejects-later';
    const { container, rerender } = render(
      <SessionActionExtensionSlot
        tags={[tag, 'action-test-other']}
        context={contextFor('PREPARING')}
      />,
    );
    expect(mounted(container, tag)).not.toBeNull();
    rerender(
      <SessionActionExtensionSlot
        tags={[tag, 'action-test-other']}
        context={contextFor('RUNNING')}
      />,
    );
    expect(mounted(container, tag)).toBeNull();
    expect(mounted(container, 'action-test-other')).not.toBeNull();
  });
});
