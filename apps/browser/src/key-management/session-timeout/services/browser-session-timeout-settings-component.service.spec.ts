import { mock } from "jest-mock-extended";
import { of } from "rxjs";

import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { SessionTimeoutTypeService } from "@bitwarden/common/key-management/session-timeout";
import {
  VAULT_TIMEOUT_CHOSEN,
  VaultTimeoutNumberType,
  VaultTimeoutStringType,
} from "@bitwarden/common/key-management/vault-timeout";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { StateProvider } from "@bitwarden/common/platform/state";
import { UserId } from "@bitwarden/common/types/guid";

import { BrowserSessionTimeoutSettingsComponentService } from "./browser-session-timeout-settings-component.service";

describe("BrowserSessionTimeoutSettingsComponentService", () => {
  let service: BrowserSessionTimeoutSettingsComponentService;
  let mockI18nService: jest.Mocked<I18nService>;
  let mockSessionTimeoutTypeService: jest.Mocked<SessionTimeoutTypeService>;
  let mockPolicyService: jest.Mocked<PolicyService>;
  let mockMessagingService: jest.Mocked<MessagingService>;
  let accountService: jest.Mocked<AccountService>;
  let stateProvider: jest.Mocked<StateProvider>;
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UserId;

  beforeEach(() => {
    mockI18nService = mock<I18nService>();
    mockSessionTimeoutTypeService = mock<SessionTimeoutTypeService>();
    mockPolicyService = mock<PolicyService>();
    mockMessagingService = mock<MessagingService>();
    accountService = mock<AccountService>();
    stateProvider = mock<StateProvider>();
    accountService.activeAccount$ = of({ id: userId } as any);

    service = new BrowserSessionTimeoutSettingsComponentService(
      mockI18nService,
      mockSessionTimeoutTypeService,
      mockPolicyService,
      mockMessagingService,
      accountService,
      stateProvider,
    );
  });

  describe("onTimeoutSave", () => {
    it("should call messagingService.send with 'bgReseedStorage' when timeout is Never", async () => {
      await service.onTimeoutSave(VaultTimeoutStringType.Never);

      expect(mockMessagingService.send).toHaveBeenCalledWith("bgReseedStorage");
      expect(stateProvider.setUserState).toHaveBeenCalledWith(VAULT_TIMEOUT_CHOSEN, true, userId);
    });

    it.each([
      VaultTimeoutNumberType.Immediately,
      VaultTimeoutNumberType.OnMinute,
      VaultTimeoutNumberType.EightHours,
      VaultTimeoutStringType.OnIdle,
      VaultTimeoutStringType.OnSleep,
      VaultTimeoutStringType.OnLocked,
      VaultTimeoutStringType.OnRestart,
      VaultTimeoutStringType.Custom,
    ])("should not call messagingService.send when timeout is %s", async (timeoutValue) => {
      await service.onTimeoutSave(timeoutValue);

      expect(mockMessagingService.send).not.toHaveBeenCalled();
    });
  });
});
