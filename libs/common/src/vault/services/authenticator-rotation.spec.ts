import { mock } from "jest-mock-extended";

// eslint-disable-next-line no-restricted-imports
import { EncString, EncryptService, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";

import { ApiService } from "../../abstractions/api.service";
import { ErrorResponse } from "../../models/response/error.response";
import { MasterKey, UserKey } from "../../types/key";

import {
  finishAuthenticatorKeyRotation,
  readAuthenticatorKeyRotation,
  recoverAuthenticatorKeyRotation,
} from "./authenticator-rotation";

describe("authenticator key rotation", () => {
  const apiService = mock<ApiService>();
  const encryptService = mock<EncryptService>();
  const oldKey = new SymmetricCryptoKey(new Uint8Array(64).fill(1)) as UserKey;
  const newKey = new SymmetricCryptoKey(new Uint8Array(64).fill(2)) as UserKey;

  beforeEach(() => {
    jest.resetAllMocks();
    encryptService.decryptString.mockImplementation(async (value: EncString) =>
      value.encryptedString.replace(/^old:/, ""),
    );
    encryptService.encryptString.mockImplementation(
      async (value: string) => ({ toJSON: () => `new:${value}` }) as EncString,
    );
  });

  it("does nothing when the server has no authenticator API", async () => {
    apiService.send.mockRejectedValue(new ErrorResponse({}, 404));

    await expect(
      finishAuthenticatorKeyRotation(apiService, encryptService, oldKey, newKey),
    ).resolves.toBeUndefined();
    expect(apiService.send).toHaveBeenCalledTimes(1);
  });

  it("puts the full re-encrypted set", async () => {
    apiService.send.mockImplementation(async (method: string) => {
      if (method === "GET") {
        return {
          data: [
            {
              id: "entry-1",
              name: "old:Ada",
              issuer: null,
              secret: "old:SECRET",
              notes: "old:desk",
              algorithm: "SHA1",
              digits: 6,
              period: 30,
              favorite: false,
              sortOrder: 0,
            },
          ],
          object: "list",
        };
      }
      return { data: [], object: "list" };
    });

    await finishAuthenticatorKeyRotation(apiService, encryptService, oldKey, newKey);

    expect(apiService.send).toHaveBeenCalledWith(
      "PUT",
      "/authenticator/rotate",
      {
        authenticatorEntries: [
          {
            id: "entry-1",
            name: "new:Ada",
            secret: "new:SECRET",
            notes: "new:desk",
            algorithm: "SHA1",
            digits: 6,
            period: 30,
            favorite: false,
            sortOrder: 0,
          },
        ],
      },
      true,
      true,
    );
  });

  it("reads a pending rotation and treats 404 as unsupported", async () => {
    apiService.send.mockResolvedValueOnce({
      required: true,
      wrappedOldUserKey: "2.old",
      oldUserKeyId: "key-1",
      object: "authenticatorKeyRotation",
    });
    await expect(readAuthenticatorKeyRotation(apiService)).resolves.toEqual({
      required: true,
      wrappedOldUserKey: "2.old",
      oldUserKeyId: "key-1",
    });

    apiService.send.mockRejectedValueOnce(new ErrorResponse({}, 404));
    await expect(readAuthenticatorKeyRotation(apiService)).resolves.toBeUndefined();
  });

  it("recovers a deferred rotation by unwrapping the old user key", async () => {
    const masterKey = new SymmetricCryptoKey(new Uint8Array(64).fill(3)) as MasterKey;
    encryptService.unwrapSymmetricKey.mockResolvedValue(oldKey as unknown as SymmetricCryptoKey);
    apiService.send.mockImplementation(async (method: string, path: string) => {
      if (method === "GET" && path === "/authenticator/rotate") {
        return { required: true, wrappedOldUserKey: "2.old", oldUserKeyId: null };
      }
      if (method === "GET") {
        return {
          data: [
            {
              id: "entry-1",
              name: "old:Ada",
              secret: "old:SECRET",
              algorithm: "SHA1",
              digits: 5,
              period: 30,
              favorite: false,
              sortOrder: -1,
            },
          ],
          object: "list",
        };
      }
      return { data: [], object: "list" };
    });

    await recoverAuthenticatorKeyRotation(apiService, encryptService, masterKey, newKey);

    expect(apiService.send).toHaveBeenCalledWith(
      "PUT",
      "/authenticator/rotate",
      expect.objectContaining({
        authenticatorEntries: [
          expect.objectContaining({ id: "entry-1", digits: 5, sortOrder: -1 }),
        ],
      }),
      true,
      true,
    );
  });
});
