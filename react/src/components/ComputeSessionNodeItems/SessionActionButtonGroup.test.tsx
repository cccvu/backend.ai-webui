/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import SessionActionButtonGroup from './SessionActionButtonGroup';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// The session detail's header lays its children out with justify="between": the buttons and a
// page plugin's element must reach it as one child, or the buttons move to the middle.
describe('SessionActionButtonGroup', () => {
  it('keeps the buttons and the extension in one element', () => {
    const { container } = render(
      <SessionActionButtonGroup compact extra={<span data-testid="extra" />}>
        <button>one</button>
        <button>two</button>
      </SessionActionButtonGroup>,
    );
    expect(container.childElementCount).toBe(1);
    const group = container.firstElementChild!;
    expect(group.querySelectorAll('button')).toHaveLength(2);
    expect(group.querySelector('[data-testid="extra"]')).not.toBeNull();
    expect(group.lastElementChild?.getAttribute('data-testid')).toBe('extra');
  });

  it('renders the compact buttons alone, as before, without an extension', () => {
    const { container } = render(
      <SessionActionButtonGroup compact>
        <button>one</button>
        <button>two</button>
      </SessionActionButtonGroup>,
    );
    expect(container.childElementCount).toBe(1);
    expect(container.firstElementChild?.className).toContain(
      'ant-space-compact',
    );
  });

  it('leaves the buttons as they were when not compact and without an extension', () => {
    const { container } = render(
      <SessionActionButtonGroup>
        <button>one</button>
        <button>two</button>
      </SessionActionButtonGroup>,
    );
    expect(container.childElementCount).toBe(2);
  });
});
