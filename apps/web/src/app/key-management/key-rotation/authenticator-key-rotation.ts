import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { UserKey } from "@bitwarden/common/types/key";
import {
  AuthenticatorEntryResponse,
  AuthenticatorListResponse,
} from "@bitwarden/common/vault/models/response/authenticator-entry.response";
// EncStrings are the authenticator contract: name, issuer, secret, and notes.
// eslint-disable-next-line no-restricted-imports
import { EncString, EncryptService, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";

/**
 * One `accountData.authenticatorEntries` item.
 *
 * Both `POST /accounts/key-management/rotate-user-account-keys` and
 * `POST /accounts/key-management/rotate-user-keys` read this array. `name` and `secret`
 * are EncStrings under the new user key. `issuer` and `notes` are included only when the
 * stored ciphertext was non-empty. Plaintext metadata is copied unchanged; the server
 * rejects a value that differs and keeps the stored value when a field is omitted.
 */
export type AuthenticatorRotationRequest = {
  id: string;
  name: string;
  issuer?: string;
  secret: string;
  notes?: string;
  algorithm?: string;
  digits?: number;
  period?: number;
  favorite?: boolean;
  sortOrder?: number;
};

/**
 * Re-encrypts authenticator entries with the new user key.
 * Returns undefined when the server has no authenticator API (404), so the field is omitted.
 * An empty array means the server supports the API and the user has no entries.
 */
/** How many authenticator entries the server has. Undefined when the API is absent (404). */
export async function countAuthenticatorEntries(
  apiService: ApiService,
): Promise<number | undefined> {
  try {
    const response = await apiService.send("GET", "/authenticator", null, true, true);
    return new AuthenticatorListResponse(response).data.length;
  } catch (error) {
    if (error instanceof ErrorResponse && error.statusCode === 404) {
      return undefined;
    }
    throw error;
  }
}

export async function getRotatedAuthenticatorEntries(
  apiService: ApiService,
  encryptService: EncryptService,
  oldKey: UserKey,
  newKey: UserKey,
): Promise<AuthenticatorRotationRequest[] | undefined> {
  let list: AuthenticatorListResponse;
  try {
    const response = await apiService.send("GET", "/authenticator", null, true, true);
    list = new AuthenticatorListResponse(response);
  } catch (error) {
    if (error instanceof ErrorResponse && error.statusCode === 404) {
      return undefined;
    }
    throw error;
  }

  const rotated: AuthenticatorRotationRequest[] = [];
  for (const entry of list.data) {
    rotated.push(
      await rotateEntry(entry, encryptService, asSymmetricKey(oldKey), asSymmetricKey(newKey)),
    );
  }
  return rotated;
}

async function rotateEntry(
  entry: AuthenticatorEntryResponse,
  encryptService: EncryptService,
  oldKey: SymmetricCryptoKey,
  newKey: SymmetricCryptoKey,
): Promise<AuthenticatorRotationRequest> {
  const request: AuthenticatorRotationRequest = {
    id: entry.id,
    name: await reencryptRequired(entry.name, encryptService, oldKey, newKey),
    secret: await reencryptRequired(entry.secret, encryptService, oldKey, newKey),
    algorithm: entry.algorithm,
    digits: entry.digits,
    period: entry.period,
    favorite: entry.favorite,
    sortOrder: entry.sortOrder,
  };
  const issuer = await reencryptOptional(entry.issuer, encryptService, oldKey, newKey);
  if (issuer != null) {
    request.issuer = issuer;
  }
  const notes = await reencryptOptional(entry.notes, encryptService, oldKey, newKey);
  if (notes != null) {
    request.notes = notes;
  }
  return request;
}

async function reencryptRequired(
  value: string,
  encryptService: EncryptService,
  oldKey: SymmetricCryptoKey,
  newKey: SymmetricCryptoKey,
): Promise<string> {
  const plain = await encryptService.decryptString(new EncString(value), oldKey);
  if (plain == null) {
    throw new Error("Failed to decrypt authenticator field during key rotation");
  }
  const encrypted = await encryptService.encryptString(plain, newKey);
  return encrypted.toJSON();
}

/** Re-encrypt when the stored EncString is non-empty. Absent and empty stay omitted. */
async function reencryptOptional(
  value: string | null,
  encryptService: EncryptService,
  oldKey: SymmetricCryptoKey,
  newKey: SymmetricCryptoKey,
): Promise<string | undefined> {
  if (value == null || value === "") {
    return undefined;
  }
  return reencryptRequired(value, encryptService, oldKey, newKey);
}

function asSymmetricKey(key: UserKey): SymmetricCryptoKey {
  return key as unknown as SymmetricCryptoKey;
}
