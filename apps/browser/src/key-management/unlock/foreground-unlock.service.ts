import { firstValueFrom } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AccountCryptographicStateService } from "@bitwarden/common/key-management/account-cryptography/account-cryptographic-state.service";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/key-management/master-password/abstractions/master-password.service.abstraction";
import { V2UpgradeTokenStateService } from "@bitwarden/common/key-management/upgrade-token/abstractions/v2-upgrade-token-state.service.abstraction";
import { RegisterSdkService } from "@bitwarden/common/platform/abstractions/sdk/register-sdk.service";
import { SdkService } from "@bitwarden/common/platform/abstractions/sdk/sdk.service";
import { MessageListener, MessageSender } from "@bitwarden/common/platform/messaging";
import { UserId } from "@bitwarden/common/types/guid";
import { recoverAuthenticatorKeyRotation } from "@bitwarden/common/vault/services/authenticator-rotation";
import {
  BiometricsService,
  BiometricStateService,
  KdfConfigService,
  KeyService,
} from "@bitwarden/key-management";
// The deferred user key is wrapped by the master key, which this unlock just derived.
// eslint-disable-next-line no-restricted-imports
import {
  EncryptionType,
  EncryptService,
  KeyGenerationService,
  LegacyCompatKeyService,
} from "@bitwarden/legacy-crypto";
import { LogService } from "@bitwarden/logging";
import { StateProvider } from "@bitwarden/state";
import { AutoUnlockService, CrossContextUnlockService } from "@bitwarden/unlock";

import { BACKGROUND_UNLOCK_COMPLETED, FOREGROUND_UNLOCK_COMPLETED } from "./unlock-messages";

/**
 * The popup's unlock service. Unlocks performed here — master password, PIN, PRF — are announced
 * to the background so its listeners run too.
 */
export class ForegroundUnlockService extends CrossContextUnlockService {
  protected readonly announces = FOREGROUND_UNLOCK_COMPLETED;
  protected readonly listensFor = BACKGROUND_UNLOCK_COMPLETED;

  constructor(
    registerSdkService: RegisterSdkService,
    accountCryptographicStateService: AccountCryptographicStateService,
    kdfService: KdfConfigService,
    accountService: AccountService,
    private readonly recoveryMasterPasswordService: InternalMasterPasswordServiceAbstraction,
    stateProvider: StateProvider,
    logService: LogService,
    biometricsService: BiometricsService,
    biometricStateService: BiometricStateService,
    v2UpgradeTokenStateService: V2UpgradeTokenStateService,
    private readonly recoveryKeyService: KeyService,
    sdkService: SdkService,
    autoUnlockService: AutoUnlockService,
    messageSender: MessageSender,
    messageListener: MessageListener,
    private readonly apiService: ApiService,
    private readonly encryptService: EncryptService,
    private readonly legacyCompatKeyService: LegacyCompatKeyService,
    private readonly keyGenerationService: KeyGenerationService,
  ) {
    super(
      registerSdkService,
      accountCryptographicStateService,
      kdfService,
      accountService,
      recoveryMasterPasswordService,
      stateProvider,
      logService,
      biometricsService,
      biometricStateService,
      v2UpgradeTokenStateService,
      recoveryKeyService,
      sdkService,
      autoUnlockService,
      messageSender,
      messageListener,
    );
  }

  /**
   * Biometrics is the one unlock the popup delegates entirely: retrieving the biometrics-protected
   * key runs in the background, which unlocks itself with it so the user stays unlocked even if the
   * popup dies while the OS prompt has focus. The popup is told through
   * {@link BACKGROUND_UNLOCK_COMPLETED} like any other unlock the background performs, and its SDK
   * client re-initializes off the user key the unlock wrote to state.
   *
   * Unlocking here as well would announce the unlock back to the background, running both contexts'
   * on-unlock actions twice for the one unlock.
   */
  override async unlockWithBiometrics(userId: UserId): Promise<void> {
    const userKey = await this.biometricsService.unlockWithBiometricsForUser(userId);
    if (!userKey) {
      throw new Error("Failed to unlock with biometrics");
    }
  }

  /**
   * A `rotate-user-keys` that omitted authenticator entries left them under the previous user key.
   * The master password did not change, so this unlock can finish the re-encryption.
   * Failure here must not keep the vault locked.
   */
  override async unlockWithMasterPassword(userId: UserId, masterPassword: string): Promise<void> {
    await super.unlockWithMasterPassword(userId, masterPassword);
    try {
      const unlockData = await firstValueFrom(
        this.recoveryMasterPasswordService.masterPasswordUnlockData$(userId),
      );
      const userKey = await firstValueFrom(this.recoveryKeyService.userKey$(userId));
      if (unlockData == null || userKey == null) {
        return;
      }
      const derived = await this.legacyCompatKeyService.makeMasterKey(
        masterPassword,
        unlockData.salt,
        unlockData.kdf,
      );
      // A type-2 user key is wrapped by the stretched 64-byte master key.
      const masterKey =
        derived.inner().type === EncryptionType.AesCbc256_B64
          ? ((await this.keyGenerationService.stretchKey(derived)) as typeof derived)
          : derived;
      await recoverAuthenticatorKeyRotation(
        this.apiService,
        this.encryptService,
        masterKey,
        userKey,
      );
    } catch (error) {
      this.logService.error(
        "[ForegroundUnlockService] Authenticator key recovery did not finish",
        error,
      );
    }
  }
}
