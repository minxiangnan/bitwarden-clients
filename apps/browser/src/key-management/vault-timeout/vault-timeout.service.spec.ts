import { mock } from "jest-mock-extended";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { LogoutService } from "@bitwarden/common/auth/logout";
import { VaultTimeoutSettingsService } from "@bitwarden/common/key-management/vault-timeout";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { TaskSchedulerService } from "@bitwarden/common/platform/scheduling";
import { LockService } from "@bitwarden/unlock";

import { SafariApp } from "../../browser/safariApp";

import VaultTimeoutService from "./vault-timeout.service";

describe("VaultTimeoutService", () => {
  const previousBrowser = process.env.BROWSER;

  afterEach(() => {
    process.env.BROWSER = previousBrowser;
    jest.restoreAllMocks();
  });

  function createService() {
    return new VaultTimeoutService(
      mock<AccountService>(),
      mock<PlatformUtilsService>(),
      mock<AuthService>(),
      mock<VaultTimeoutSettingsService>(),
      mock<TaskSchedulerService>(),
      mock<LogService>(),
      mock<LockService>(),
      mock<LogoutService>(),
    );
  }

  it("does not call the Safari native sleep loop outside the Safari app extension build", async () => {
    delete process.env.BROWSER;
    const send = jest.spyOn(SafariApp, "sendMessageToApp").mockResolvedValue(null);

    await createService().checkSafari();

    expect(send).not.toHaveBeenCalled();
  });
});
