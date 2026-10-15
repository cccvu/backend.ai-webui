/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import type {
  SessionActionExtensionContext,
  SessionActionExtensionElement,
} from '../types/sessionActionExtension';
import ErrorBoundaryWithNullFallback from './ErrorBoundaryWithNullFallback';
import { useBAILogger } from 'backend.ai-ui';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

interface SessionActionExtensionSlotProps {
  tags: string[];
  context: SessionActionExtensionContext;
}

/**
 * Mounts the session action extension elements declared by page plugins
 * (see `types/sessionActionExtension.ts`). Renders nothing when there are
 * none; an element that fails is removed and leaves nothing in its place.
 */
const SessionActionExtensionSlot: React.FC<SessionActionExtensionSlotProps> = ({
  tags,
  context,
}) => {
  'use memo';
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => (
        <ErrorBoundaryWithNullFallback key={tag}>
          <ExtensionElement tag={tag} context={context} />
        </ErrorBoundaryWithNullFallback>
      ))}
    </>
  );
};

/**
 * Runs `step` and returns what it threw or what a custom element callback
 * reported while it ran (a constructor or lifecycle callback reports its
 * error to the window instead of throwing it), or undefined.
 */
export const failureOf = (step: () => void): unknown => {
  let failure: unknown;
  const onError = (event: ErrorEvent) => {
    failure ??= event.error ?? event.message;
  };
  window.addEventListener('error', onError);
  try {
    step();
  } catch (error) {
    failure ??= error;
  } finally {
    window.removeEventListener('error', onError);
  }
  return failure;
};

const sameContext = (
  a: SessionActionExtensionContext | null,
  b: SessionActionExtensionContext,
) =>
  !!a &&
  a.version === b.version &&
  a.id === b.id &&
  a.name === b.name &&
  a.status === b.status &&
  a.type === b.type;

const ExtensionElement: React.FC<{
  tag: string;
  context: SessionActionExtensionContext;
}> = ({ tag, context }) => {
  'use memo';
  const { logger } = useBAILogger();
  const containerRef = useRef<HTMLSpanElement>(null);
  const elementRef = useRef<SessionActionExtensionElement | null>(null);
  // The context the element was last given (never read back from it).
  const givenRef = useRef<SessionActionExtensionContext | null>(null);
  const [failed, setFailed] = useState(false);

  const fail = (
    element: SessionActionExtensionElement | undefined,
    what: string,
    failure: unknown,
  ) => {
    logger.warn(`Session action extension "${tag}" ${what}:`, failure);
    elementRef.current = null;
    try {
      element?.remove();
    } catch {
      // It already failed; it is left as it is.
    }
    setFailed(true);
  };

  const mount = useEffectEvent((container: HTMLElement) => {
    let element: SessionActionExtensionElement | undefined;
    const failure = failureOf(() => {
      element = document.createElement(tag) as SessionActionExtensionElement;
      // A constructor that throws is reported as a window error, and
      // createElement returns an inert element instead.
      const elementClass = customElements.get(tag);
      if (!elementClass || !(element instanceof elementClass)) {
        throw new Error('the element failed to construct');
      }
      element.context = context;
      container.appendChild(element);
    });
    if (failure !== undefined || !element) {
      fail(element, 'failed to mount', failure);
      return undefined;
    }
    const mounted = element;
    elementRef.current = mounted;
    givenRef.current = context;
    return () => {
      elementRef.current = null;
      givenRef.current = null;
      try {
        mounted.remove();
      } catch (error) {
        logger.warn(
          `Session action extension "${tag}" failed to unmount:`,
          error,
        );
      }
    };
  });

  const update = useEffectEvent(() => {
    const element = elementRef.current;
    if (!element || sameContext(givenRef.current, context)) return;
    givenRef.current = context;
    const failure = failureOf(() => {
      element.context = context;
    });
    if (failure !== undefined) fail(element, 'rejected its context', failure);
  });

  // Create the element once per tag; React never renders its children.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return mount(container);
  }, [tag]);

  // A new context only when one of its fields changes.
  useEffect(() => {
    update();
  }, [context.version, context.id, context.name, context.status, context.type]);

  if (failed) return null;
  return (
    <span
      ref={containerRef}
      data-session-action-extension={tag}
      style={{ display: 'contents' }}
    />
  );
};

export default SessionActionExtensionSlot;
