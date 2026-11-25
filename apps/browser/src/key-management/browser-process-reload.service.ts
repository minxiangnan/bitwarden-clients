import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { PinServiceAbstraction } from "@bitwarden/common/key-management/pin/pin.service.abstraction";
import { DefaultProcessReloadService } from "@bitwarden/common/key-management/process-reload";
import { VaultTimeoutSettingsService } from "@bitwarden/common/key-management/vault-timeout";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";

import { BrowserApi } from "../platform/browser/browser-api";
import BrowserPopupUtils from "../platform/browser/browser-popup-utils";
import { BrowserTaskSchedulerService } from "../platform/services/abstractions/browser-task-scheduler.service";

/**
 * Browser implementation of the process reload. An open vault window stays on the
 * unlock screen. The extension restarts only when no vault UI is open.
 */
export class BrowserProcessReloadService extends DefaultProcessReloadService {
  constructor(
    pinService: PinServiceAbstraction,
    messagingService: MessagingService,
    vaultTimeoutSettingsService: VaultTimeoutSettingsService,
    accountService: AccountService,
    logService: LogService,
    authService: AuthService,
    private taskSchedulerService: BrowserTaskSchedulerService,
  ) {
    super(
      pinService,
      messagingService,
      vaultTimeoutSettingsService,
      accountService,
      logService,
      authService,
    );
  }

  protected override async performProcessReload(): Promise<void> {
    // Asks the open vault UI to reload onto the unlock screen. Reloading the
    // whole extension while that page is open invalidates it and closes the window.
    await super.performProcessReload();
    if (await BrowserApi.isExtensionUiOpen()) {
      return;
    }

    await this.taskSchedulerService.clearAllScheduledTasks();
    await BrowserPopupUtils.waitForAllPopupsClose();
    BrowserApi.reloadExtension();
  }
}
