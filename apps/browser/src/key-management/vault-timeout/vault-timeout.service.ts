import { VaultTimeoutService as BaseVaultTimeoutService } from "@bitwarden/common/key-management/vault-timeout/services/vault-timeout.service";

import { SafariApp } from "../../browser/safariApp";
import { isSafariAppExtension } from "../../platform/browser/safari-app-extension";

export default class VaultTimeoutService extends BaseVaultTimeoutService {
  startCheck() {
    if (this.platformUtilsService.isSafari()) {
      this.checkVaultTimeout().catch((error) => this.logService.error(error));
      this.checkSafari().catch((error) => this.logService.error(error));
      return;
    }

    super.startCheck();
  }

  // This is a work-around to safari adding an arbitrary delay to setTimeout and
  //  setIntervals. It works by calling the native extension which sleeps for 10s,
  //  efficiently replicating setInterval.
  async checkSafari() {
    // A Chromium service worker mis-detected as Safari resolves the native call
    // immediately and this loop pegs a core. Only the Safari app-extension build
    // has that native side.
    if (!isSafariAppExtension()) {
      return;
    }

    while (true) {
      try {
        await SafariApp.sendMessageToApp("sleep");
        // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.checkVaultTimeout();
      } catch (e) {
        // eslint-disable-next-line
        console.log("Exception Safari VaultTimeout", e);
      }
    }
  }
}
