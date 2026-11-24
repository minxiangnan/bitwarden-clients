import { of } from "rxjs";

import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { VaultTimeoutAction } from "@bitwarden/common/key-management/vault-timeout";

import { BrowserApi } from "../platform/browser/browser-api";
import BrowserPopupUtils from "../platform/browser/browser-popup-utils";

import { BrowserProcessReloadService } from "./browser-process-reload.service";

describe("BrowserProcessReloadService", () => {
  const messagingService = { send: jest.fn() };
  const taskSchedulerService = { clearAllScheduledTasks: jest.fn().mockResolvedValue(undefined) };
  const pinService = {
    getPinLockType: jest.fn().mockResolvedValue("Disabled"),
    isPinDecryptionAvailable: jest.fn().mockResolvedValue(false),
  };
  const vaultTimeoutSettingsService = {
    getVaultTimeoutActionByUserId$: () => of(VaultTimeoutAction.Lock),
  };
  const accountService = {
    accounts$: of({}),
    activeAccount$: of(null),
    nextUpAccount$: of(null),
  };
  const logService = { info: jest.fn() };
  const authService = { getAuthStatus: jest.fn().mockResolvedValue(AuthenticationStatus.Locked) };

  const service = new BrowserProcessReloadService(
    pinService as never,
    messagingService as never,
    vaultTimeoutSettingsService as never,
    accountService as never,
    logService as never,
    authService as never,
    taskSchedulerService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(BrowserPopupUtils, "waitForAllPopupsClose").mockResolvedValue();
    jest.spyOn(BrowserApi, "reloadExtension").mockImplementation();
  });

  it("keeps an open extension page and asks it to show the unlock screen", async () => {
    jest.spyOn(BrowserApi, "isExtensionUiOpen").mockResolvedValue(true);

    await service.reloadProcess();

    expect(messagingService.send).toHaveBeenCalledWith("reloadProcess");
    expect(BrowserApi.reloadExtension).not.toHaveBeenCalled();
    expect(taskSchedulerService.clearAllScheduledTasks).not.toHaveBeenCalled();
  });

  it("reloads the extension when no vault UI is open", async () => {
    jest.spyOn(BrowserApi, "isExtensionUiOpen").mockResolvedValue(false);

    await service.reloadProcess();

    expect(messagingService.send).toHaveBeenCalledWith("reloadProcess");
    expect(taskSchedulerService.clearAllScheduledTasks).toHaveBeenCalled();
    expect(BrowserApi.reloadExtension).toHaveBeenCalled();
  });
});
