import { mock } from "jest-mock-extended";
import { firstValueFrom, of } from "rxjs";

import { ClientType } from "@bitwarden/client-type";
import {
  VAULT_TIMEOUT,
  VAULT_TIMEOUT_CHOSEN,
  VaultTimeoutStringType,
} from "@bitwarden/common/key-management/vault-timeout";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { UserId } from "@bitwarden/common/types/guid";
import { UserKey } from "@bitwarden/common/types/key";
import { KeyService } from "@bitwarden/key-management";
// eslint-disable-next-line no-restricted-imports
import { CsprngArray, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";
import { LogService } from "@bitwarden/logging";
import { StateProvider, StateService } from "@bitwarden/state";

import { DefaultAutoUnlockService } from "./default-auto-unlock.service";

describe("DefaultAutoUnlockService", () => {
  const mockUserId = "b1e2d3c4-a1b2-c3d4-e5f6-a1b2c3d4e5f6" as UserId;
  const mockUserKey = new SymmetricCryptoKey(new Uint8Array(64) as CsprngArray) as UserKey;

  const keyService = mock<KeyService>();
  const stateService = mock<StateService>();
  const stateProvider = mock<StateProvider>();
  const platformUtilsService = mock<PlatformUtilsService>();
  const logService = mock<LogService>();

  let sut: DefaultAutoUnlockService;

  beforeEach(() => {
    jest.resetAllMocks();

    platformUtilsService.getClientType.mockReturnValue(ClientType.Browser);
    stateProvider.getUserState$.mockReturnValue(of(VaultTimeoutStringType.Never));
    keyService.userKey$.mockReturnValue(of(mockUserKey));

    sut = new DefaultAutoUnlockService(
      keyService,
      stateService,
      stateProvider,
      platformUtilsService,
      logService,
    );
  });

  describe("setAutoUnlockKey", () => {
    it("stores the key when the vault timeout is never", async () => {
      await sut.setAutoUnlockKey(mockUserId, mockUserKey);

      expect(stateProvider.getUserState$).toHaveBeenCalledWith(VAULT_TIMEOUT, mockUserId);
      expect(stateService.setUserKeyAutoUnlock).toHaveBeenCalledWith(mockUserKey.toBase64(), {
        userId: mockUserId,
      });
    });

    it("stores the key on the cli without reading the vault timeout", async () => {
      platformUtilsService.getClientType.mockReturnValue(ClientType.Cli);
      stateProvider.getUserState$.mockReturnValue(of(60));

      await sut.setAutoUnlockKey(mockUserId, mockUserKey);

      expect(stateProvider.getUserState$).not.toHaveBeenCalled();
      expect(stateService.setUserKeyAutoUnlock).toHaveBeenCalledWith(mockUserKey.toBase64(), {
        userId: mockUserId,
      });
    });

    it.each([60, VaultTimeoutStringType.OnRestart, VaultTimeoutStringType.OnLocked])(
      "clears the key when the vault timeout is %s",
      async (timeout) => {
        stateProvider.getUserState$.mockReturnValue(of(timeout));

        await sut.setAutoUnlockKey(mockUserId, mockUserKey);

        expect(stateService.setUserKeyAutoUnlock).toHaveBeenCalledWith(null, {
          userId: mockUserId,
        });
      },
    );
  });

  describe("getAutoUnlockKey", () => {
    it("returns null when no never-lock key is stored", async () => {
      stateService.getUserKeyAutoUnlock.mockResolvedValue(null);

      const result = await sut.getAutoUnlockKey(mockUserId);

      expect(result).toBeNull();
      expect(stateService.getUserKeyAutoUnlock).toHaveBeenCalledWith({ userId: mockUserId });
      expect(keyService.validateUserKey).not.toHaveBeenCalled();
    });

    it("returns the stored key when it is valid", async () => {
      stateService.getUserKeyAutoUnlock.mockResolvedValue(mockUserKey.keyB64);
      keyService.validateUserKey.mockResolvedValue(true);

      const result = await sut.getAutoUnlockKey(mockUserId);

      expect(result).toEqual(mockUserKey);
      expect(keyService.validateUserKey).toHaveBeenCalledWith(mockUserKey, mockUserId);
      expect(keyService.clearAllStoredUserKeys).not.toHaveBeenCalled();
    });

    it("throws away the stored keys and returns null when the stored key fails validation", async () => {
      stateService.getUserKeyAutoUnlock.mockResolvedValue(mockUserKey.keyB64);
      keyService.validateUserKey.mockResolvedValue(false);

      const result = await sut.getAutoUnlockKey(mockUserId);

      expect(result).toBeNull();
      expect(logService.warning).toHaveBeenCalledWith("Invalid key, throwing away stored keys");
      expect(keyService.clearAllStoredUserKeys).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe("refreshAutoUnlockKey", () => {
    it("re-stores the in-memory user key", async () => {
      await sut.refreshAutoUnlockKey(mockUserId);

      expect(keyService.userKey$).toHaveBeenCalledWith(mockUserId);
      expect(stateService.setUserKeyAutoUnlock).toHaveBeenCalledWith(mockUserKey.toBase64(), {
        userId: mockUserId,
      });
    });

    it("clears the stored key when the vault timeout no longer allows it", async () => {
      stateProvider.getUserState$.mockReturnValue(of(VaultTimeoutStringType.OnLocked));

      await sut.refreshAutoUnlockKey(mockUserId);

      expect(stateService.setUserKeyAutoUnlock).toHaveBeenCalledWith(null, { userId: mockUserId });
    });

    it.each([null as unknown as UserId, undefined as unknown as UserId])(
      "throws when the provided userId is %s",
      async (userId) => {
        await expect(sut.refreshAutoUnlockKey(userId)).rejects.toThrow("UserId is required.");

        expect(stateService.setUserKeyAutoUnlock).not.toHaveBeenCalled();
      },
    );

    it("throws when the user is locked", async () => {
      keyService.userKey$.mockReturnValue(of(null));

      await expect(sut.refreshAutoUnlockKey(mockUserId)).rejects.toThrow(
        "No user key found for: " + mockUserId,
      );

      expect(stateService.setUserKeyAutoUnlock).not.toHaveBeenCalled();
    });
  });

  describe("browser accounts across logout, login, and restart", () => {
    const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UserId;
    const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as UserId;
    const keyA = new SymmetricCryptoKey(new Uint8Array(64).fill(1) as CsprngArray) as UserKey;
    const keyB = new SymmetricCryptoKey(new Uint8Array(64).fill(2) as CsprngArray) as UserKey;

    function memoryProvider() {
      const values = new Map<string, Map<string, unknown>>();
      const read = (key: string, userId: string) => values.get(userId)?.get(key) ?? null;
      return {
        getUserState$: (definition: { key: string }, userId: string) =>
          of(read(definition.key, userId)),
        setUserState: async (definition: { key: string }, value: unknown, userId: string) => {
          let user = values.get(userId);
          if (user == null) {
            user = new Map();
            values.set(userId, user);
          }
          user.set(definition.key, value);
        },
      };
    }

    function serviceFor(
      provider: ReturnType<typeof memoryProvider>,
      stored: Map<string, string | null>,
    ) {
      const state = mock<StateService>();
      state.setUserKeyAutoUnlock.mockImplementation(async (value, options) => {
        stored.set(options.userId, value);
      });
      state.getUserKeyAutoUnlock.mockImplementation(
        async (options) => stored.get(options.userId) ?? null,
      );
      const keys = mock<KeyService>();
      keys.validateUserKey.mockResolvedValue(true);
      const platform = mock<PlatformUtilsService>();
      platform.getClientType.mockReturnValue(ClientType.Browser);
      return new DefaultAutoUnlockService(
        keys,
        state,
        provider as unknown as StateProvider,
        platform,
        mock<LogService>(),
      );
    }

    it("keeps every account unlocked after logout, a later login, and a restart", async () => {
      const stored = new Map<string, string | null>();
      const service = serviceFor(memoryProvider(), stored);

      await service.setAutoUnlockKey(userA, keyA);
      await service.setAutoUnlockKey(userB, keyB);

      expect(stored.get(userA)).toBe(keyA.toBase64());
      expect(stored.get(userB)).toBe(keyB.toBase64());

      stored.set(userA, null);
      await service.setAutoUnlockKey(userA, keyA);

      expect((await service.getAutoUnlockKey(userA))?.toBase64()).toBe(keyA.toBase64());
      expect(stored.get(userB)).toBe(keyB.toBase64());
    });

    it("does not replace a timeout the person saved", async () => {
      const provider = memoryProvider();
      await provider.setUserState(VAULT_TIMEOUT, 15, userA);
      await provider.setUserState(VAULT_TIMEOUT_CHOSEN, true, userA);
      const stored = new Map<string, string | null>();
      const service = serviceFor(provider, stored);

      await service.setAutoUnlockKey(userA, keyA);

      expect(stored.get(userA)).toBeNull();
      expect(await firstValueFrom(provider.getUserState$(VAULT_TIMEOUT, userA))).toBe(15);
    });
  });
});
