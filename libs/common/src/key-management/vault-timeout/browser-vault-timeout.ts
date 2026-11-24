import { firstValueFrom } from "rxjs";

import { StateProvider } from "../../platform/state";
import { UserId } from "../../types/guid";

import { VaultTimeoutAction } from "./enums/vault-timeout-action.enum";
import {
  VAULT_TIMEOUT,
  VAULT_TIMEOUT_ACTION,
  VAULT_TIMEOUT_CHOSEN,
} from "./services/vault-timeout-settings.state";
import { VaultTimeoutStringType } from "./types/vault-timeout.type";

/**
 * Browser accounts stay unlocked across a restart unless the person saved a
 * different timeout. Logout does not count as that choice, and neither does
 * the old client default of locking when the browser starts.
 */
export async function ensureBrowserVaultTimeout(
  stateProvider: StateProvider,
  userId: UserId,
): Promise<void> {
  const chosen = await firstValueFrom(stateProvider.getUserState$(VAULT_TIMEOUT_CHOSEN, userId));
  if (chosen === true) {
    return;
  }

  const timeout = await firstValueFrom(stateProvider.getUserState$(VAULT_TIMEOUT, userId));
  if (timeout !== VaultTimeoutStringType.Never) {
    await stateProvider.setUserState(VAULT_TIMEOUT, VaultTimeoutStringType.Never, userId);
  }

  const action = await firstValueFrom(stateProvider.getUserState$(VAULT_TIMEOUT_ACTION, userId));
  if (action !== VaultTimeoutAction.Lock) {
    await stateProvider.setUserState(VAULT_TIMEOUT_ACTION, VaultTimeoutAction.Lock, userId);
  }
}

/** Remember that the person saved the timeout or its action themselves. */
export async function markVaultTimeoutChosen(
  stateProvider: StateProvider,
  userId: UserId,
): Promise<void> {
  await stateProvider.setUserState(VAULT_TIMEOUT_CHOSEN, true, userId);
}
