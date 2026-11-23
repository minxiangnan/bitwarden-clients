import { mock } from "jest-mock-extended";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { UserKey } from "@bitwarden/common/types/key";
// eslint-disable-next-line no-restricted-imports
import { EncString, EncryptService, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";

import {
  countAuthenticatorEntries,
  getRotatedAuthenticatorEntries,
} from "./authenticator-key-rotation";

describe("getRotatedAuthenticatorEntries", () => {
  const apiService = mock<ApiService>();
  const encryptService = mock<EncryptService>();
  const oldKey = new SymmetricCryptoKey(new Uint8Array(64)) as UserKey;
  const newKey = new SymmetricCryptoKey(new Uint8Array(64)) as UserKey;

  beforeEach(() => {
    jest.resetAllMocks();
    encryptService.decryptString.mockImplementation(async (value: EncString) =>
      value.encryptedString.replace(/^old:/, ""),
    );
    encryptService.encryptString.mockImplementation(
      async (value: string) => ({ toJSON: () => `new:${value}` }) as EncString,
    );
  });

  it("reports no authenticator API on 404 and a count otherwise", async () => {
    apiService.send.mockRejectedValueOnce(new ErrorResponse({}, 404));
    await expect(countAuthenticatorEntries(apiService)).resolves.toBeUndefined();

    apiService.send.mockResolvedValueOnce({ data: [{ id: "1" }, { id: "2" }], object: "list" });
    await expect(countAuthenticatorEntries(apiService)).resolves.toBe(2);
  });

  it("omits the field when the server returns 404", async () => {
    apiService.send.mockRejectedValue(new ErrorResponse({}, 404));

    await expect(
      getRotatedAuthenticatorEntries(apiService, encryptService, oldKey, newKey),
    ).resolves.toBeUndefined();
  });

  it("rethrows errors other than 404", async () => {
    apiService.send.mockRejectedValue(new ErrorResponse({}, 500));

    await expect(
      getRotatedAuthenticatorEntries(apiService, encryptService, oldKey, newKey),
    ).rejects.toBeInstanceOf(ErrorResponse);
  });

  it("returns an empty array when the server supports the API and has no entries", async () => {
    apiService.send.mockResolvedValue({ data: [], object: "list" });

    await expect(
      getRotatedAuthenticatorEntries(apiService, encryptService, oldKey, newKey),
    ).resolves.toEqual([]);
  });

  it("re-encrypts every entry and keeps issuer and notes only when they were stored", async () => {
    apiService.send.mockResolvedValue({
      data: [
        {
          id: "plain",
          name: "old:Ada",
          issuer: null,
          secret: "old:SECRET",
          notes: "",
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          favorite: false,
          sortOrder: 0,
        },
        {
          id: "full",
          name: "old:Grace",
          issuer: "old:Example",
          secret: "old:OTHER",
          notes: "old:desk",
          algorithm: "SHA256",
          digits: 8,
          period: 60,
          favorite: true,
          sortOrder: -2,
        },
      ],
      object: "list",
    });

    const rotated = await getRotatedAuthenticatorEntries(
      apiService,
      encryptService,
      oldKey,
      newKey,
    );

    expect(rotated?.map((entry) => entry.id)).toEqual(["plain", "full"]);
    expect(rotated?.[0]).toEqual({
      id: "plain",
      name: "new:Ada",
      secret: "new:SECRET",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      favorite: false,
      sortOrder: 0,
    });
    expect(JSON.parse(JSON.stringify(rotated?.[0]))).not.toHaveProperty("issuer");
    expect(JSON.parse(JSON.stringify(rotated?.[0]))).not.toHaveProperty("notes");
    expect(rotated?.[1]).toEqual({
      id: "full",
      name: "new:Grace",
      issuer: "new:Example",
      secret: "new:OTHER",
      notes: "new:desk",
      algorithm: "SHA256",
      digits: 8,
      period: 60,
      favorite: true,
      sortOrder: -2,
    });
  });

  it("fails the rotation when a stored issuer cannot be decrypted", async () => {
    apiService.send.mockResolvedValue({
      data: [
        {
          id: "full",
          name: "old:Ada",
          issuer: "not-decryptable",
          secret: "old:SECRET",
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          favorite: false,
          sortOrder: 1,
        },
      ],
    });
    encryptService.decryptString.mockImplementation(async (value: EncString) =>
      value.encryptedString.startsWith("old:") ? value.encryptedString.slice(4) : null,
    );

    await expect(
      getRotatedAuthenticatorEntries(apiService, encryptService, oldKey, newKey),
    ).rejects.toThrow(/decrypt authenticator field/);
  });
});
