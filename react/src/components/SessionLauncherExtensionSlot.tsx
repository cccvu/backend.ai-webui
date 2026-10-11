/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import type {
  SessionLauncherExtensionContext,
  SessionLauncherExtensionElement,
  SessionLauncherExtensionHost,
} from '../types/sessionLauncherExtension';
import ErrorBoundaryWithNullFallback from './ErrorBoundaryWithNullFallback';
import { useBAILogger } from 'backend.ai-ui';
import { useEffect, useRef } from 'react';

interface SessionLauncherExtensionSlotProps {
  tags: string[];
  context: SessionLauncherExtensionContext;
  host: SessionLauncherExtensionHost;
  /** Given only to the `resource` slot: registers the element's hooks. */
  register?: (
    tag: string,
    element: SessionLauncherExtensionElement,
  ) => () => void;
}

/**
 * Mounts the session launcher extension elements declared by page plugins
 * (see `types/sessionLauncherExtension.ts`). Renders nothing when there are
 * none, and an element that fails to mount is left out.
 */
const SessionLauncherExtensionSlot: React.FC<
  SessionLauncherExtensionSlotProps
> = ({ tags, ...props }) => {
  'use memo';
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => (
        <ErrorBoundaryWithNullFallback key={tag}>
          <ExtensionElement tag={tag} {...props} />
        </ErrorBoundaryWithNullFallback>
      ))}
    </>
  );
};

const ExtensionElement: React.FC<
  Omit<SessionLauncherExtensionSlotProps, 'tags'> & { tag: string }
> = ({ tag, context, host, register }) => {
  'use memo';
  const { logger } = useBAILogger();
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<SessionLauncherExtensionElement | null>(null);

  // Create the element once per tag; React never renders its children.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let element: SessionLauncherExtensionElement;
    try {
      element = document.createElement(tag) as SessionLauncherExtensionElement;
      element.host = host;
      element.context = context;
      container.appendChild(element);
    } catch (error) {
      logger.warn(`Launcher extension "${tag}" failed to mount:`, error);
      return;
    }
    elementRef.current = element;
    const unregister = register?.(tag, element);
    return () => {
      unregister?.();
      elementRef.current = null;
      try {
        element.remove();
      } catch (error) {
        logger.warn(`Launcher extension "${tag}" failed to unmount:`, error);
      }
    };
    // The element is created once; later context and host changes are
    // applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    try {
      element.context = context;
    } catch (error) {
      logger.warn(`Launcher extension "${tag}" rejected its context:`, error);
    }
  }, [context, tag, logger]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    try {
      element.host = host;
    } catch (error) {
      logger.warn(`Launcher extension "${tag}" rejected its host:`, error);
    }
  }, [host, tag, logger]);

  return (
    <div
      ref={containerRef}
      data-session-launcher-extension={tag}
      style={{ display: 'contents' }}
    />
  );
};

export default SessionLauncherExtensionSlot;
