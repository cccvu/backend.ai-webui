/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import { Space } from 'antd';
import { BAIFlex } from 'backend.ai-ui';
import React from 'react';

/**
 * The session's action buttons, compact or not. With `extra` (the elements page plugins
 * contribute, types/sessionActionExtension.ts), the buttons and `extra` share one flex row, so a
 * parent that spreads its children (a header with `justify="between"`) keeps them together as
 * one item.
 */
const SessionActionButtonGroup: React.FC<{
  compact?: boolean;
  extra?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ children, compact, extra }) => {
  const buttons = compact ? (
    <Space.Compact>{children}</Space.Compact>
  ) : (
    <>{children}</>
  );
  return extra ? (
    <BAIFlex direction="row" align="center" gap="xs" wrap="wrap">
      {buttons}
      {extra}
    </BAIFlex>
  ) : (
    buttons
  );
};

export default SessionActionButtonGroup;
