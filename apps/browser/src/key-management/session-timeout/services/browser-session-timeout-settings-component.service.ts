import { firstValueFrom } from "rxjs";

import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { SessionTimeoutTypeService } from "@bitwarden/common/key-management/session-timeout";
import {
  markVaultTimeoutChosen,
  VaultTimeout,
  VaultTimeoutStringType,
} from "@bitwarden/common/key-management/vault-timeout";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { StateProvider } from "@bitwarden/common/platform/state";
import { SessionTimeoutSettingsComponentService } from "@bitwarden/key-management-ui";

export class BrowserSessionTimeoutSettingsComponentService extends SessionTimeoutSettingsComponentService {
  constructor(
    i18nService: I18nService,
    sessionTimeoutTypeService: SessionTimeoutTypeService,
    policyService: PolicyService,
    private readonly messagingService: MessagingService,
    private readonly accountService: AccountService,
    private readonly stateProvider: StateProvider,
  ) {
    super(i18nService, sessionTimeoutTypeService, policyService);
  }

  override async onTimeoutSave(timeout: VaultTimeout): Promise<void> {
    await this.rememberChoice();
    if (timeout === VaultTimeoutStringType.Never) {
      this.messagingService.send("bgReseedStorage");
    }
  }

  override async onTimeoutActionSave(): Promise<void> {
    await this.rememberChoice();
  }

  private async rememberChoice(): Promise<void> {
    const userId = await firstValueFrom(getUserId(this.accountService.activeAccount$));
    await markVaultTimeoutChosen(this.stateProvider, userId);
  }
}
