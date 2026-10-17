/**
 @license
 Copyright (c) 2015-2026 Lablup Inc. All rights reserved.
 */
import {
  SessionActionButtonsFragment$data,
  SessionActionButtonsFragment$key,
} from '../../__generated__/SessionActionButtonsFragment.graphql';
import { followLaunch, openAppWindow } from '../../helper/appWindow';
import { useSuspendedBackendaiClient } from '../../hooks';
import { useCurrentUserInfo } from '../../hooks/backendai';
import { useSuspendedAppTemplateConfig } from '../../hooks/useAppTemplate';
import { useBackendAIAppLauncher } from '../../hooks/useBackendAIAppLauncher';
import {
  buildSessionActionExtensionContext,
  useSessionActionExtensionTags,
} from '../../hooks/useSessionActionExtensions';
import ErrorBoundaryWithNullFallback from '../ErrorBoundaryWithNullFallback';
import SessionActionExtensionSlot from '../SessionActionExtensionSlot';
import AppLauncherModal from './AppLauncherModal';
import ContainerCommitModal from './ContainerCommitModal';
import ContainerLogModal from './ContainerLogModal';
import SFTPConnectionInfoModal from './SFTPConnectionInfoModal';
import SessionActionButtonGroup from './SessionActionButtonGroup';
import TerminateSessionModal from './TerminateSessionModal';
import { Tooltip, Button, theme, type ButtonProps } from 'antd';
import {
  BAIAppIcon,
  BAIContainerCommitIcon,
  BAIFileBrowserIcon,
  BAIJupyterIcon,
  BAISessionLogIcon,
  BAISftpIcon,
  BAITerminalAppIcon,
  BAITerminateIcon,
  BAIUnmountAfterClose,
} from 'backend.ai-ui';
import * as _ from 'lodash-es';
import React, { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { graphql, useFragment } from 'react-relay';

type SessionActionButtonKey =
  | 'appLauncher'
  | 'terminal'
  | 'logs'
  | 'containerCommit'
  | 'sftp'
  | 'terminate'
  /** The elements page plugins contribute (types/sessionActionExtension.ts). */
  | 'extensions';

export type PrimaryAppOption = {
  appName: 'jupyter' | 'filebrowser';
  urlPostfix?: string;
};

interface SessionActionButtonsProps {
  sessionFrgmt: SessionActionButtonsFragment$key | null;
  size?: ButtonProps['size'];
  compact?: boolean;
  hiddenButtonKeys?: SessionActionButtonKey[];
  onAction?: (action: SessionActionButtonKey) => void;
  primaryAppOption?: PrimaryAppOption;
}

const isActive = (session: SessionActionButtonsFragment$data) => {
  if (session?.type === 'system') {
    return session?.status === 'RUNNING';
  }
  return !['TERMINATED', 'CANCELLED', 'TERMINATING', 'ERROR'].includes(
    session?.status || '',
  );
};
const isAppSupported = (session: SessionActionButtonsFragment$data) => {
  return (
    ['batch', 'interactive', 'inference', 'system', 'running'].includes(
      session?.type || '',
    ) && !_.isEmpty(JSON.parse(session?.service_ports ?? '{}'))
  );
};

const SessionActionButtons: React.FC<SessionActionButtonsProps> = ({
  sessionFrgmt,
  compact,
  size,
  hiddenButtonKeys,
  primaryAppOption,
  onAction,
}) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const baiClient = useSuspendedBackendaiClient();
  const { hideAppsOnBatchSession } = useSuspendedAppTemplateConfig();

  const session = useFragment(
    graphql`
      fragment SessionActionButtonsFragment on ComputeSessionNode {
        id
        name
        row_id @required(action: NONE)
        type
        status
        access_key
        service_ports
        commit_status
        user_id
        ...TerminateSessionModalFragment
        ...ContainerLogModalFragment
        ...ContainerCommitModalFragment
        ...AppLauncherModalFragment
        ...SFTPConnectionInfoModalFragment
        ...useBackendAIAppLauncherFragment
      }
    `,
    sessionFrgmt,
  );
  const appLauncher = useBackendAIAppLauncher(session);

  const [openAppLauncherModal, setOpenAppLauncherModal] = useState(false);
  const [openTerminateModal, setOpenTerminateModal] = useState(false);
  const [openLogModal, setOpenLogModal] = useState(false);
  const [openContainerCommitModal, setOpenContainerCommitModal] =
    useState(false);
  const [openSFTPConnectionInfoModal, setOpenSFTPConnectionInfoModal] =
    useState(false);

  const userInfo = useCurrentUserInfo();
  // A known user id is required: an unknown user owns nothing.
  const isOwner = !!userInfo[0]?.uuid && userInfo[0].uuid === session?.user_id;

  const extensionTags = useSessionActionExtensionTags();

  const hiddenButtons = React.useMemo(
    () => new Set(hiddenButtonKeys ?? []),
    [hiddenButtonKeys],
  );
  const isVisible = (key: SessionActionButtonKey) => {
    // If system session, hide not applicable buttons
    if (
      ['appLauncher', 'terminal', 'containerCommit'].includes(key) &&
      session?.type === 'system'
    ) {
      return false;
    }

    // Hide the app launcher and terminal for batch sessions when configured
    // to do so.
    if (
      (key === 'appLauncher' || key === 'terminal') &&
      hideAppsOnBatchSession &&
      session?.type === 'batch'
    ) {
      return false;
    }

    // sftp button is only for system sessions
    if (key === 'sftp' && session?.type !== 'system') {
      return false;
    }

    // If containerCommit feature is disabled in the config, hide the button
    if (!baiClient._config.enableContainerCommit && key === 'containerCommit') {
      return false;
    }
    return !hiddenButtons.has(key);
  };

  // When size is 'small', use the button's title attribute instead of a Tooltip
  const isButtonTitleMode = size === 'small';

  const launchApp = () => {
    if (!primaryAppOption?.appName) return;

    // Open the app's window while the click still counts as a user gesture.
    const appWindow = openAppWindow();
    // The notification shows any error; only the window is left to handle.
    followLaunch(
      appWindow,
      appLauncher.launchAppWithNotification({ app: primaryAppOption.appName }),
      (workInfo) => {
        if (!workInfo.appConnectUrl) return undefined;
        const urlPostfix = primaryAppOption.urlPostfix || '';
        return urlPostfix
          ? new URL(urlPostfix, workInfo.appConnectUrl.href).href
          : workInfo.appConnectUrl.href;
      },
      1000,
    );
  };

  return session ? (
    <>
      <SessionActionButtonGroup
        compact={compact}
        extra={
          isVisible('extensions') && isOwner && extensionTags.length > 0 ? (
            <SessionActionExtensionSlot
              tags={extensionTags}
              context={buildSessionActionExtensionContext(session)}
            />
          ) : undefined
        }
      >
        {primaryAppOption && (
          <>
            {primaryAppOption.appName === 'jupyter' && (
              <Tooltip
                title={
                  isButtonTitleMode
                    ? undefined
                    : t('session.ExecuteSpecificApp', {
                        appName: 'Jupyter Notebook',
                      })
                }
              >
                <Button
                  size={size}
                  type={'primary'}
                  disabled={
                    !isAppSupported(session) || !isActive(session) || !isOwner
                  }
                  icon={<BAIJupyterIcon />}
                  aria-label={t('session.ExecuteSpecificApp', {
                    appName: 'Jupyter Notebook',
                  })}
                  onClick={() => {
                    launchApp();
                  }}
                  title={
                    isButtonTitleMode
                      ? t('session.ExecuteSpecificApp', {
                          appName: 'Jupyter Notebook',
                        })
                      : undefined
                  }
                />
              </Tooltip>
            )}
            {primaryAppOption.appName === 'filebrowser' && (
              <Tooltip
                title={
                  isButtonTitleMode
                    ? undefined
                    : t('session.ExecuteSpecificApp', {
                        appName: 'File browser',
                      })
                }
              >
                <Button
                  size={size}
                  type={'primary'}
                  disabled={
                    !isAppSupported(session) || !isActive(session) || !isOwner
                  }
                  icon={<BAIFileBrowserIcon />}
                  aria-label={t('session.ExecuteSpecificApp', {
                    appName: 'File browser',
                  })}
                  onClick={() => {
                    launchApp();
                  }}
                  title={
                    isButtonTitleMode
                      ? t('session.ExecuteSpecificApp', {
                          appName: 'File browser',
                        })
                      : undefined
                  }
                />
              </Tooltip>
            )}
          </>
        )}
        {isVisible('appLauncher') && (
          <>
            <Tooltip
              title={isButtonTitleMode ? undefined : t('session.SeeAppDialog')}
            >
              <Button
                size={size}
                type={primaryAppOption ? undefined : 'primary'}
                disabled={
                  !isAppSupported(session) || !isActive(session) || !isOwner
                }
                icon={<BAIAppIcon />}
                // Beside the other icons it carries a visible label; its
                // accessible name is that label (WCAG 2.5.3, label in name).
                aria-label={
                  isButtonTitleMode
                    ? t('session.SeeAppDialog')
                    : t('session.appLauncher.App')
                }
                onClick={() => {
                  onAction?.('appLauncher');
                  setOpenAppLauncherModal(true);
                }}
                title={
                  isButtonTitleMode ? t('session.SeeAppDialog') : undefined
                }
              >
                {isButtonTitleMode ? null : t('session.appLauncher.App')}
              </Button>
            </Tooltip>
          </>
        )}
        {isVisible('sftp') && (
          <Tooltip title={t('data.explorer.RunSSH/SFTPserver')}>
            <Button
              type="primary"
              disabled={!isActive(session) || !isOwner}
              size={size}
              icon={<BAISftpIcon />}
              aria-label={t('data.explorer.RunSSH/SFTPserver')}
              onClick={() => {
                setOpenSFTPConnectionInfoModal(true);
              }}
            />
          </Tooltip>
        )}
        {isVisible('terminal') && (
          <>
            <Tooltip
              title={
                isButtonTitleMode ? undefined : t('session.ExecuteTerminalApp')
              }
            >
              <Button
                size={size}
                disabled={
                  !isAppSupported(session) || !isActive(session) || !isOwner
                }
                icon={<BAITerminalAppIcon />}
                aria-label={t('session.ExecuteTerminalApp')}
                onClick={() => {
                  onAction?.('terminal');
                  appLauncher.runTerminal({});
                }}
                title={
                  isButtonTitleMode
                    ? t('session.ExecuteTerminalApp')
                    : undefined
                }
              />
            </Tooltip>
          </>
        )}
        {isVisible('logs') && (
          <Tooltip
            title={
              isButtonTitleMode ? undefined : t('session.SeeContainerLogs')
            }
          >
            <Button
              size={size}
              icon={<BAISessionLogIcon />}
              aria-label={t('session.SeeContainerLogs')}
              onClick={() => {
                onAction?.('logs');
                setOpenLogModal(true);
              }}
              title={
                isButtonTitleMode ? t('session.SeeContainerLogs') : undefined
              }
            />
          </Tooltip>
        )}
        {isVisible('containerCommit') && (
          <Tooltip
            title={
              isButtonTitleMode
                ? undefined
                : t('session.RequestContainerCommit')
            }
          >
            <Button
              size={size}
              disabled={session?.status !== 'RUNNING' || !isOwner}
              icon={<BAIContainerCommitIcon />}
              aria-label={t('session.RequestContainerCommit')}
              onClick={() => {
                onAction?.('containerCommit');
                setOpenContainerCommitModal(true);
              }}
              title={
                isButtonTitleMode
                  ? t('session.RequestContainerCommit')
                  : undefined
              }
            />
          </Tooltip>
        )}
        {isVisible('terminate') && (
          <Tooltip
            title={
              isButtonTitleMode ? undefined : t('session.TerminateSession')
            }
          >
            <Button
              size={size}
              disabled={!isActive(session)}
              icon={
                <BAITerminateIcon
                  style={{
                    color: isActive(session) ? token.colorError : undefined,
                  }}
                />
              }
              aria-label={t('session.TerminateSession')}
              onClick={() => {
                onAction?.('terminate');
                setOpenTerminateModal(true);
              }}
              title={
                isButtonTitleMode ? t('session.TerminateSession') : undefined
              }
            />
          </Tooltip>
        )}
      </SessionActionButtonGroup>

      <Suspense fallback={null}>
        {isVisible('appLauncher') && (
          <ErrorBoundaryWithNullFallback>
            <BAIUnmountAfterClose>
              <AppLauncherModal
                sessionFrgmt={session}
                open={openAppLauncherModal}
                onRequestClose={() => {
                  setOpenAppLauncherModal(false);
                }}
              />
            </BAIUnmountAfterClose>
          </ErrorBoundaryWithNullFallback>
        )}
        {isVisible('logs') && (
          <BAIUnmountAfterClose>
            <ContainerLogModal
              sessionFrgmt={session}
              open={openLogModal}
              onCancel={() => {
                setOpenLogModal(false);
              }}
            />
          </BAIUnmountAfterClose>
        )}
        {isVisible('containerCommit') && (
          <ContainerCommitModal
            sessionFrgmt={session}
            open={openContainerCommitModal}
            onRequestClose={() => setOpenContainerCommitModal(false)}
          />
        )}
        {isVisible('sftp') && (
          <BAIUnmountAfterClose>
            <SFTPConnectionInfoModal
              sessionFrgmt={session}
              open={openSFTPConnectionInfoModal}
              onCancel={() => {
                setOpenSFTPConnectionInfoModal(false);
              }}
            />
          </BAIUnmountAfterClose>
        )}
        {isVisible('terminate') && (
          <TerminateSessionModal
            sessionFrgmts={[session]}
            open={openTerminateModal}
            onRequestClose={() => {
              setOpenTerminateModal(false);
            }}
          />
        )}
      </Suspense>
    </>
  ) : (
    []
  );
};

export default SessionActionButtons;
