import { firstValueFrom } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { withPasswordManagerSdk } from "@bitwarden/common/key-management/utils";
import { SdkService } from "@bitwarden/common/platform/abstractions/sdk/sdk.service";
import { finishAuthenticatorKeyRotation } from "@bitwarden/common/vault/services/authenticator-rotation";
import { KeyService } from "@bitwarden/key-management";
// eslint-disable-next-line no-restricted-imports
import { EncryptService } from "@bitwarden/legacy-crypto";
import { LogService } from "@bitwarden/logging";
import {
  KeyRotationMethod,
  PasswordChangeAndRotateUserKeysRequest,
  RotateUserKeysRequest,
  UpgradeTokenAction,
} from "@bitwarden/sdk-internal";
import { UserId } from "@bitwarden/user-core";

import { UserCryptoDialogService } from "./user-crypto-dialog.service.abstraction";
import {
  TrustVerificationResult,
  UserKeyRotationService,
} from "./user-key-rotation.service.abstraction";

/**
 * Service for rotating user keys using the SDK.
 * Handles key rotation and trust verification for organizations and emergency access users.
 */
export class DefaultUserKeyRotationService implements UserKeyRotationService {
  constructor(
    private sdkService: SdkService,
    private logService: LogService,
    private userCryptoDialogService: UserCryptoDialogService,
    private apiService: ApiService,
    private encryptService: EncryptService,
    private keyService: KeyService,
  ) {}

  async changePasswordAndRotateUserKey(
    currentMasterPassword: string,
    newMasterPassword: string,
    hint: string | undefined,
    userId: UserId,
  ): Promise<boolean> {
    // First, the provided organizations and emergency access users need to be verified;
    // this is currently done by providing the user a manual confirmation dialog.
    const { wasTrustDenied, trustedOrganizationPublicKeys, trustedEmergencyAccessUserPublicKeys } =
      await this.verifyTrust(userId, "Skip");
    if (wasTrustDenied) {
      this.logService.info("[Userkey rotation] Trust was denied by user. Aborting!");
      return false;
    }

    return await withPasswordManagerSdk(userId, this.sdkService, async (sdk) => {
      this.logService.info("[UserKey Rotation] Re-encrypting user data with new user key...");
      try {
        await sdk.user_crypto_management().password_change_and_rotate_user_keys({
          old_password: currentMasterPassword,
          password: newMasterPassword,
          hint: hint,
          trusted_emergency_access_public_keys: trustedEmergencyAccessUserPublicKeys,
          trusted_organization_public_keys: trustedOrganizationPublicKeys,
        } as PasswordChangeAndRotateUserKeysRequest);
        return true;
      } catch (error) {
        this.logService.error(`Failed to rotate user keys: ${error}`);
        return false;
      }
    });
  }

  async rotateUserKey(
    keyRotationMethod: KeyRotationMethod,
    upgradeTokenAction: UpgradeTokenAction,
    userId: UserId,
  ): Promise<boolean> {
    const { wasTrustDenied, trustedOrganizationPublicKeys, trustedEmergencyAccessUserPublicKeys } =
      await this.verifyTrust(userId, upgradeTokenAction);
    if (wasTrustDenied) {
      this.logService.info("[UserKeyRotationService] Trust was denied by user. Aborting!");
      return false;
    }

    const oldUserKey = await firstValueFrom(this.keyService.userKey$(userId));
    const rotated = await withPasswordManagerSdk(userId, this.sdkService, async (sdk) => {
      this.logService.info("[UserKeyRotationService] Re-encrypting user data with new user key...");
      await sdk.user_crypto_management().rotate_user_keys({
        key_rotation_method: keyRotationMethod,
        trusted_emergency_access_public_keys: trustedEmergencyAccessUserPublicKeys,
        trusted_organization_public_keys: trustedOrganizationPublicKeys,
        upgrade_token_action: upgradeTokenAction,
      } as RotateUserKeysRequest);
      return true;
    });
    if (!rotated || oldUserKey == null) {
      return rotated;
    }
    const newUserKey = await firstValueFrom(this.keyService.userKey$(userId));
    if (newUserKey == null || oldUserKey.toEncoded() === newUserKey.toEncoded()) {
      return true;
    }
    try {
      // rotate-user-keys may omit authenticator entries. Re-encrypt them before logout
      // while the previous user key is still the one captured above.
      await finishAuthenticatorKeyRotation(
        this.apiService,
        this.encryptService,
        oldUserKey,
        newUserKey,
      );
    } catch (error) {
      this.logService.error(
        `[UserKeyRotationService] Authenticator re-encryption was deferred: ${error}`,
      );
    }
    return true;
  }

  async verifyTrust(
    userId: UserId,
    upgradeTokenAction: UpgradeTokenAction,
  ): Promise<TrustVerificationResult> {
    // Since currently the joined organizations and emergency access grantees are
    // not signed, manual trust prompts are required, to verify that the server
    // does not inject public keys here.
    //
    // Once signing is implemented, this is the place to also sign the keys and
    // upload the signed trust claims.
    this.logService.info("[Userkey rotation] Verifying trust...");
    const [emergencyAccessV1Memberships, organizationV1Memberships] = await withPasswordManagerSdk(
      userId,
      this.sdkService,
      async (sdk) => {
        const untrustedMemberships = await sdk
          .user_crypto_management()
          .get_untrusted_memberships(upgradeTokenAction);
        return [
          untrustedMemberships.emergency_access_memberships,
          untrustedMemberships.organization_memberships,
        ] as const;
      },
    );
    this.logService.info("result", { emergencyAccessV1Memberships, organizationV1Memberships });

    return this.userCryptoDialogService.verifyTrust(
      organizationV1Memberships,
      emergencyAccessV1Memberships,
    );
  }
}
