import { firstValueFrom } from "rxjs";

import { FakeActiveUserAccessor, FakeStateProvider } from "@bitwarden/state-test-utils";
import { UserId } from "@bitwarden/user-core";

import { ensureBrowserVaultTimeout, markVaultTimeoutChosen } from "./browser-vault-timeout";
import { VaultTimeoutAction } from "./enums/vault-timeout-action.enum";
import {
  VAULT_TIMEOUT,
  VAULT_TIMEOUT_ACTION,
  VAULT_TIMEOUT_CHOSEN,
} from "./services/vault-timeout-settings.state";
import { VaultTimeoutStringType } from "./types/vault-timeout.type";

describe("browser vault timeout", () => {
  const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UserId;
  const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as UserId;
  let stateProvider: FakeStateProvider;

  beforeEach(() => {
    stateProvider = new FakeStateProvider(new FakeActiveUserAccessor(userA));
  });

  async function stored(userId: UserId) {
    return {
      timeout: await firstValueFrom(stateProvider.getUserState$(VAULT_TIMEOUT, userId)),
      action: await firstValueFrom(stateProvider.getUserState$(VAULT_TIMEOUT_ACTION, userId)),
      chosen: await firstValueFrom(stateProvider.getUserState$(VAULT_TIMEOUT_CHOSEN, userId)),
    };
  }

  it("sets never + lock for an account that has no timeout", async () => {
    await ensureBrowserVaultTimeout(stateProvider, userA);

    expect(await stored(userA)).toEqual({
      timeout: VaultTimeoutStringType.Never,
      action: VaultTimeoutAction.Lock,
      chosen: null,
    });
  });

  it("replaces the old on-restart default for a second account too", async () => {
    await stateProvider.setUserState(VAULT_TIMEOUT, VaultTimeoutStringType.OnRestart, userA);
    await stateProvider.setUserState(VAULT_TIMEOUT, VaultTimeoutStringType.OnRestart, userB);
    await stateProvider.setUserState(VAULT_TIMEOUT_ACTION, VaultTimeoutAction.LogOut, userB);

    await ensureBrowserVaultTimeout(stateProvider, userA);
    await ensureBrowserVaultTimeout(stateProvider, userB);

    expect((await stored(userA)).timeout).toBe(VaultTimeoutStringType.Never);
    expect((await stored(userA)).action).toBe(VaultTimeoutAction.Lock);
    expect((await stored(userB)).timeout).toBe(VaultTimeoutStringType.Never);
    expect((await stored(userB)).action).toBe(VaultTimeoutAction.Lock);
  });

  it("keeps a timeout the person saved, including after another account is created", async () => {
    await stateProvider.setUserState(VAULT_TIMEOUT, 15, userA);
    await stateProvider.setUserState(VAULT_TIMEOUT_ACTION, VaultTimeoutAction.LogOut, userA);
    await markVaultTimeoutChosen(stateProvider, userA);

    await ensureBrowserVaultTimeout(stateProvider, userB);
    await ensureBrowserVaultTimeout(stateProvider, userA);

    expect(await stored(userA)).toEqual({
      timeout: 15,
      action: VaultTimeoutAction.LogOut,
      chosen: true,
    });
    expect((await stored(userB)).timeout).toBe(VaultTimeoutStringType.Never);
  });
});
