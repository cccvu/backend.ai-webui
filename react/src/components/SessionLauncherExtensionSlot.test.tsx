/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import { buildSessionLauncherExtensionContext } from '../hooks/useSessionLauncherExtensions';
import type {
  SessionLauncherExtensionElement,
  SessionLauncherExtensionHost,
} from '../types/sessionLauncherExtension';
import SessionLauncherExtensionSlot from './SessionLauncherExtensionSlot';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

class TestExtension extends HTMLElement {}
if (!customElements.get('slot-test-extension')) {
  customElements.define('slot-test-extension', TestExtension);
}
class OtherExtension extends HTMLElement {}
if (!customElements.get('slot-other-extension')) {
  customElements.define('slot-other-extension', OtherExtension);
}

const host: SessionLauncherExtensionHost = {
  setAcceleratorRequest: vi.fn(() => true),
};
const contextFor = (resourceGroup: string) =>
  buildSessionLauncherExtensionContext(
    { resourceGroup },
    { id: 'p', name: 'project' },
    'resource',
  );

const mounted = (container: HTMLElement, tag: string) =>
  container.querySelector(tag) as SessionLauncherExtensionElement | null;

describe('SessionLauncherExtensionSlot', () => {
  it('renders nothing without extensions', () => {
    const { container } = render(
      <SessionLauncherExtensionSlot
        tags={[]}
        context={contextFor('a')}
        host={host}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mounts each extension with its host and context', () => {
    const context = contextFor('a');
    const { container } = render(
      <SessionLauncherExtensionSlot
        tags={['slot-test-extension', 'slot-other-extension']}
        context={context}
        host={host}
      />,
    );
    const element = mounted(container, 'slot-test-extension');
    expect(element).toBeInstanceOf(TestExtension);
    expect(element?.host).toBe(host);
    expect(element?.context).toBe(context);
    expect(mounted(container, 'slot-other-extension')).toBeInstanceOf(
      OtherExtension,
    );
  });

  it('gives the element a new context when the form changes', () => {
    const { container, rerender } = render(
      <SessionLauncherExtensionSlot
        tags={['slot-test-extension']}
        context={contextFor('a')}
        host={host}
      />,
    );
    const element = mounted(container, 'slot-test-extension');
    const next = contextFor('b');
    rerender(
      <SessionLauncherExtensionSlot
        tags={['slot-test-extension']}
        context={next}
        host={host}
      />,
    );
    // The same element instance keeps its state and sees the new context.
    expect(mounted(container, 'slot-test-extension')).toBe(element);
    expect(element?.context).toBe(next);
  });

  it('registers the element and removes it on unmount', () => {
    const unregister = vi.fn();
    const register = vi.fn(() => unregister);
    const { container, unmount } = render(
      <SessionLauncherExtensionSlot
        tags={['slot-test-extension']}
        context={contextFor('a')}
        host={host}
        register={register}
      />,
    );
    const element = mounted(container, 'slot-test-extension');
    expect(register).toHaveBeenCalledWith('slot-test-extension', element);
    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(element?.isConnected).toBe(false);
  });

  it('leaves out an element that fails to mount and keeps the others', () => {
    class Throwing extends HTMLElement {
      set context(_value: unknown) {
        throw new Error('broken');
      }
    }
    if (!customElements.get('slot-throwing-extension')) {
      customElements.define('slot-throwing-extension', Throwing);
    }
    const register = vi.fn(() => () => {});
    const { container } = render(
      <SessionLauncherExtensionSlot
        tags={['slot-throwing-extension', 'slot-test-extension']}
        context={contextFor('a')}
        host={host}
        register={register}
      />,
    );
    expect(mounted(container, 'slot-throwing-extension')).toBeNull();
    expect(mounted(container, 'slot-test-extension')).not.toBeNull();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('survives a constructor that throws', () => {
    class Exploding extends HTMLElement {
      constructor() {
        super();
        throw new Error('broken');
      }
    }
    if (!customElements.get('slot-exploding-extension')) {
      customElements.define('slot-exploding-extension', Exploding);
    }
    // createElement reports a throwing constructor as a window error and
    // returns an inert element instead of throwing.
    // The inert element is neither mounted nor registered, so a launch check
    // its class declares fails closed (see runSessionLauncherExtensionGate).
    const reported = vi.fn((event: ErrorEvent) => event.preventDefault());
    window.addEventListener('error', reported);
    try {
      const register = vi.fn(() => () => {});
      const { container } = render(
        <SessionLauncherExtensionSlot
          tags={['slot-exploding-extension', 'slot-test-extension']}
          context={contextFor('a')}
          host={host}
          register={register}
        />,
      );
      expect(mounted(container, 'slot-test-extension')).not.toBeNull();
      expect(mounted(container, 'slot-exploding-extension')).toBeNull();
      expect(register).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledWith(
        'slot-test-extension',
        expect.anything(),
      );
      expect(reported).toHaveBeenCalled();
    } finally {
      window.removeEventListener('error', reported);
    }
  });
});
