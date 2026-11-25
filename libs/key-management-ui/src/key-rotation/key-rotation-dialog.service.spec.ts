import { TestBed } from "@angular/core/testing";
import { mock, MockProxy } from "jest-mock-extended";
import { BehaviorSubject, of } from "rxjs";

import {
  UserDecryptionOptions,
  UserDecryptionOptionsServiceAbstraction,
} from "@bitwarden/auth/common";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { LogoutService } from "@bitwarden/common/auth/logout";
import { DeviceTrustServiceAbstraction } from "@bitwarden/common/key-management/device-trust/abstractions/device-trust.service.abstraction";
import { MasterPasswordUnlockService } from "@bitwarden/common/key-management/master-password/abstractions/master-password-unlock.service";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/key-management/master-password/abstractions/master-password.service.abstraction";
import {
  MasterKeyWrappedUserKey,
  MasterPasswordSalt,
  MasterPasswordUnlockData,
} from "@bitwarden/common/key-management/master-password/types/master-password.types";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { ToastService } from "@bitwarden/components";
import { KeyService } from "@bitwarden/key-management";
// eslint-disable-next-line no-restricted-imports
import { EncryptService, PBKDF2KdfConfig, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";
import { UserId } from "@bitwarden/user-core";
import { UserKeyRotationServiceAbstraction } from "@bitwarden/user-crypto-management";

import { KeyRotationDialogService } from "./key-rotation-dialog.service";

describe("KeyRotationDialogService", () => {
  let sut: KeyRotationDialogService;

  let mockCipherService: MockProxy<CipherService>;
  let mockUserKeyRotationService: MockProxy<UserKeyRotationServiceAbstraction>;
  let mockToastService: MockProxy<ToastService>;
  let mockI18nService: MockProxy<I18nService>;
  let mockLogoutService: MockProxy<LogoutService>;
  let mockMasterPasswordUnlockService: MockProxy<MasterPasswordUnlockService>;
  let mockUserDecryptionOptionsService: MockProxy<UserDecryptionOptionsServiceAbstraction>;
  let mockDeviceTrustService: MockProxy<DeviceTrustServiceAbstraction>;

  const mockUserId = "mockUserId" as UserId;
  const masterPassword = "mockPassword";
  const mockKeyConnectorUrl = "https://key-connector.example.com";

  beforeEach(() => {
    jest.clearAllMocks();
    mockCipherService = mock<CipherService>();
    mockUserKeyRotationService = mock<UserKeyRotationServiceAbstraction>();
    mockToastService = mock<ToastService>();
    mockI18nService = mock<I18nService>();
    mockLogoutService = mock<LogoutService>();
    mockMasterPasswordUnlockService = mock<MasterPasswordUnlockService>();
    mockUserDecryptionOptionsService = mock<UserDecryptionOptionsServiceAbstraction>();
    mockDeviceTrustService = mock<DeviceTrustServiceAbstraction>();
    const keyService = mock<KeyService>();
    keyService.userKey$.mockReturnValue(of(null));

    mockI18nService.t.mockImplementation((key) => `${key}-used-i18n`);

    TestBed.configureTestingModule({
      providers: [
        { provide: CipherService, useValue: mockCipherService },
        { provide: UserKeyRotationServiceAbstraction, useValue: mockUserKeyRotationService },
        { provide: ToastService, useValue: mockToastService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: LogoutService, useValue: mockLogoutService },
        { provide: MasterPasswordUnlockService, useValue: mockMasterPasswordUnlockService },
        {
          provide: InternalMasterPasswordServiceAbstraction,
          useValue: mock<InternalMasterPasswordServiceAbstraction>(),
        },
        {
          provide: UserDecryptionOptionsServiceAbstraction,
          useValue: mockUserDecryptionOptionsService,
        },
        { provide: DeviceTrustServiceAbstraction, useValue: mockDeviceTrustService },
        { provide: ApiService, useValue: mock<ApiService>() },
        { provide: EncryptService, useValue: mock<EncryptService>() },
        { provide: KeyService, useValue: keyService },
        { provide: LogService, useValue: mock<LogService>() },
      ],
    });

    sut = TestBed.inject(KeyRotationDialogService);
  });

  describe("rotateKeys", () => {
    beforeEach(() => {
      mockMasterPasswordUnlockService.proofOfDecryption.mockResolvedValue(true);
    });

    it("re-encrypts authenticator entries from the profile key when userKey$ does not change", async () => {
      const oldKey = new SymmetricCryptoKey(new Uint8Array(64).fill(1));
      const newKey = new SymmetricCryptoKey(new Uint8Array(64).fill(2));
      (TestBed.inject(KeyService) as MockProxy<KeyService>).userKey$.mockReturnValue(
        new BehaviorSubject(oldKey) as never,
      );
      mockUserKeyRotationService.rotateUserKey.mockResolvedValue(true);
      const passwords = TestBed.inject(
        InternalMasterPasswordServiceAbstraction,
      ) as MockProxy<InternalMasterPasswordServiceAbstraction>;
      passwords.masterPasswordUnlockData$.mockReturnValue(
        of(
          new MasterPasswordUnlockData(
            "salt" as MasterPasswordSalt,
            new PBKDF2KdfConfig(600000),
            "2.old" as MasterKeyWrappedUserKey,
          ),
        ),
      );
      passwords.unwrapUserKeyFromMasterPasswordUnlockData.mockResolvedValue(newKey as never);
      const api = TestBed.inject(ApiService) as MockProxy<ApiService>;
      api.getProfile.mockResolvedValue({ key: { encryptedString: "2.new" } } as never);
      api.send.mockImplementation(async (method: string, path: string) => {
        if (path === "/authenticator/rotate" && method === "GET") {
          return { required: true, wrappedOldUserKey: "2.old", oldUserKeyId: null };
        }
        if (path === "/authenticator") {
          return {
            data: [{ id: "entry-1", name: "2.name", secret: "2.secret" }],
            object: "list",
          };
        }
        return { data: [], object: "list" };
      });
      const encrypt = TestBed.inject(EncryptService) as MockProxy<EncryptService>;
      encrypt.decryptString.mockResolvedValue("plain");
      encrypt.encryptString.mockResolvedValue({ toJSON: () => "2.enc" } as never);

      const result = await sut.rotateKeys(masterPassword, mockUserId);

      expect(result).toBe(true);
      expect(passwords.unwrapUserKeyFromMasterPasswordUnlockData).toHaveBeenCalledWith(
        masterPassword,
        expect.objectContaining({ masterKeyWrappedUserKey: "2.new" }),
      );
      expect(api.send).toHaveBeenCalledWith("PUT", "/authenticator/rotate", expect.anything(), true, true);
      expect(mockLogoutService.logout).toHaveBeenCalledWith(mockUserId, "userKeyRotation");
    });

    it("shows error toast when proof of decryption fails", async () => {
      mockMasterPasswordUnlockService.proofOfDecryption.mockResolvedValue(false);

      const result = await sut.rotateKeys(masterPassword, mockUserId);

      expect(mockToastService.showToast).toHaveBeenCalledWith({
        variant: "error",
        message: "incorrectPassword-used-i18n",
      });
      expect(result).toBe(false);
      expect(mockUserKeyRotationService.rotateUserKey).not.toHaveBeenCalled();
      expect(mockLogoutService.logout).not.toHaveBeenCalled();
    });

    it("shows success toast and logs out when rotation succeeds", async () => {
      mockUserKeyRotationService.rotateUserKey.mockResolvedValue(true);

      const result = await sut.rotateKeys(masterPassword, mockUserId);

      expect(mockUserKeyRotationService.rotateUserKey).toHaveBeenCalledWith(
        { Password: { password: masterPassword } },
        "Skip",
        mockUserId,
      );
      expect(mockToastService.showToast).toHaveBeenCalledWith({
        variant: "success",
        title: "",
        message: "accountEncryptionKeyRotated-used-i18n",
        timeout: 15000,
      });
      expect(mockLogoutService.logout).toHaveBeenCalledWith(mockUserId, "userKeyRotation");
      expect(result).toBe(true);
    });

    it("does not show success toast or logout when rotation returns false", async () => {
      mockUserKeyRotationService.rotateUserKey.mockResolvedValue(false);

      const result = await sut.rotateKeys(masterPassword, mockUserId);

      expect(mockToastService.showToast).not.toHaveBeenCalled();
      expect(mockLogoutService.logout).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe("rotateKeysForKeyConnector", () => {
    beforeEach(() => {
      mockUserDecryptionOptionsService.userDecryptionOptionsById$.mockReturnValue(
        of({
          keyConnectorOption: { keyConnectorUrl: mockKeyConnectorUrl },
        } as UserDecryptionOptions),
      );
    });

    it("shows success toast and logs out when rotation succeeds", async () => {
      mockUserKeyRotationService.rotateUserKey.mockResolvedValue(true);

      const result = await sut.rotateKeysForKeyConnector(mockUserId);

      expect(mockUserKeyRotationService.rotateUserKey).toHaveBeenCalledWith(
        { KeyConnector: { key_connector_url: mockKeyConnectorUrl } },
        "Skip",
        mockUserId,
      );
      expect(mockToastService.showToast).toHaveBeenCalledWith({
        variant: "success",
        title: "",
        message: "accountEncryptionKeyRotated-used-i18n",
        timeout: 15000,
      });
      expect(mockLogoutService.logout).toHaveBeenCalledWith(mockUserId, "userKeyRotation");
      expect(result).toBe(true);
    });

    it("does not show success toast or logout when rotation returns false", async () => {
      mockUserKeyRotationService.rotateUserKey.mockResolvedValue(false);

      const result = await sut.rotateKeysForKeyConnector(mockUserId);

      expect(mockToastService.showToast).not.toHaveBeenCalled();
      expect(mockLogoutService.logout).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe("rotateKeysForTDE", () => {
    beforeEach(() => {
      mockDeviceTrustService.supportsDeviceTrustByUserId$.mockReturnValue(of(true));
    });

    it("shows success toast and logs out when rotation succeeds", async () => {
      mockUserKeyRotationService.rotateUserKey.mockResolvedValue(true);

      const result = await sut.rotateKeysForTDE(mockUserId);

      expect(mockUserKeyRotationService.rotateUserKey).toHaveBeenCalledWith(
        "Tde",
        "Skip",
        mockUserId,
      );
      expect(mockToastService.showToast).toHaveBeenCalledWith({
        variant: "success",
        title: "",
        message: "accountEncryptionKeyRotated-used-i18n",
        timeout: 15000,
      });
      expect(mockLogoutService.logout).toHaveBeenCalledWith(mockUserId, "userKeyRotation");
      expect(result).toBe(true);
    });

    it("does not show success toast or logout when rotation returns false", async () => {
      mockUserKeyRotationService.rotateUserKey.mockResolvedValue(false);

      const result = await sut.rotateKeysForTDE(mockUserId);

      expect(mockToastService.showToast).not.toHaveBeenCalled();
      expect(mockLogoutService.logout).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe("hasLegacyCipherAttachments", () => {
    it("returns false when ciphers array is null", async () => {
      mockCipherService.getAllDecrypted.mockResolvedValue(null as any);

      const result = await sut.hasLegacyCipherAttachments(mockUserId);

      expect(result).toBe(false);
    });

    it("returns false when ciphers array is empty", async () => {
      mockCipherService.getAllDecrypted.mockResolvedValue([]);

      const result = await sut.hasLegacyCipherAttachments(mockUserId);

      expect(result).toBe(false);
    });

    it("returns false when no ciphers have old attachments", async () => {
      mockCipherService.getAllDecrypted.mockResolvedValue([
        { organizationId: null, hasOldAttachments: false } as any,
        { organizationId: null, hasOldAttachments: false } as any,
      ]);

      const result = await sut.hasLegacyCipherAttachments(mockUserId);

      expect(result).toBe(false);
    });

    it("returns false when cipher has old attachments but belongs to an organization", async () => {
      mockCipherService.getAllDecrypted.mockResolvedValue([
        { organizationId: "orgId", hasOldAttachments: true } as any,
      ]);

      const result = await sut.hasLegacyCipherAttachments(mockUserId);

      expect(result).toBe(false);
    });

    it("returns true when a personal cipher has old attachments", async () => {
      mockCipherService.getAllDecrypted.mockResolvedValue([
        { organizationId: null, hasOldAttachments: true } as any,
      ]);

      const result = await sut.hasLegacyCipherAttachments(mockUserId);

      expect(result).toBe(true);
    });

    it("returns true when only one of multiple ciphers has legacy attachments", async () => {
      mockCipherService.getAllDecrypted.mockResolvedValue([
        { organizationId: "orgId", hasOldAttachments: true } as any,
        { organizationId: null, hasOldAttachments: false } as any,
        { organizationId: null, hasOldAttachments: true } as any,
      ]);

      const result = await sut.hasLegacyCipherAttachments(mockUserId);

      expect(result).toBe(true);
    });
  });
});
