import { css } from "@emotion/css";
import { html, nothing } from "lit";

import { Theme } from "@bitwarden/common/platform/enums";

import {
  NotificationType,
  NotificationTypes,
} from "../../../notification/abstractions/notification-bar";
import { OrgView, FolderView, I18n, CollectionView } from "../common-types";
import { spacing } from "../constants/styles";

import { NotificationButtonRow } from "./button-row";

export type NotificationFooterProps = {
  collections?: CollectionView[];
  folders?: FolderView[];
  i18n: I18n;
  isLoading?: boolean;
  notificationType?: NotificationType;
  organizations?: OrgView[];
  personalVaultIsAllowed: boolean;
  theme: Theme;
  handleNeverAction?: (e: Event) => void;
  handleSaveAction: (e: Event) => void;
};

export function NotificationFooter({
  collections,
  folders,
  i18n,
  isLoading,
  notificationType,
  organizations,
  personalVaultIsAllowed,
  theme,
  handleNeverAction,
  handleSaveAction,
}: NotificationFooterProps) {
  const isChangeNotification = notificationType === NotificationTypes.Change;
  const isUnlockNotification = notificationType === NotificationTypes.Unlock;

  let primaryButtonText = i18n.saveAction;

  if (isUnlockNotification) {
    primaryButtonText = i18n.notificationUnlock;
  }

  return html`
    <div class=${notificationFooterStyles({ isChangeNotification })}>
      ${
        !isChangeNotification
          ? NotificationButtonRow({
              collections,
              folders,
              organizations,
              i18n,
              primaryButton: {
                handlePrimaryButtonClick: handleSaveAction,
                isLoading,
                text: primaryButtonText,
              },
              personalVaultIsAllowed,
              theme,
            })
          : nothing
      }
      ${
        !isUnlockNotification && handleNeverAction
          ? html`<button type="button" class=${neverButtonStyles} @click=${handleNeverAction}>
              ${i18n.neverForWebsite}
            </button>`
          : nothing
      }
    </div>
  `;
}

const neverButtonStyles = css`
  margin-right: auto;
  border: 0;
  background: transparent;
  color: rgba(92, 88, 78, 1);
  cursor: pointer;
  font-size: 13px;
  line-height: 20px;
  padding: 4px 0;
  text-decoration: underline;
  text-underline-offset: 2px;
`;

const notificationFooterStyles = ({
  isChangeNotification,
}: {
  isChangeNotification: boolean;
}) => css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[4]} ${isChangeNotification ? spacing[3] : spacing[4]}
    ${spacing[4]};

  :last-child {
    border-radius: 0 0 ${spacing["4"]} ${spacing["4"]};
  }
`;
