import { firstValueFrom } from "rxjs";

// EncStrings are the authenticator contract: name, issuer, secret, and notes.
// eslint-disable-next-line no-restricted-imports
import { EncString, EncryptService, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";

import { ApiService } from "../../abstractions/api.service";
import { InternalMasterPasswordServiceAbstraction } from "../../key-management/master-password/abstractions/master-password.service.abstraction";
import {
  MasterKeyWrappedUserKey,
  MasterPasswordUnlockData,
} from "../../key-management/master-password/types/master-password.types";
import { ErrorResponse } from "../../models/response/error.response";
import { UserId } from "../../types/guid";
import { MasterKey, UserKey } from "../../types/key";
import {
  AuthenticatorEntryResponse,
  AuthenticatorListResponse,
} from "../models/response/authenticator-entry.response";

export type AuthenticatorRotationItem = {
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

export type AuthenticatorKeyRotationStatus = {
  required: boolean;
  wrappedOldUserKey: string | null;
  oldUserKeyId: string | null;
};

/**
 * Re-encrypts every authenticator entry from the old user key to the new one and
 * submits `PUT /authenticator/rotate`. A 404 means this server has no authenticator API.
 * An empty list is not submitted: nothing was deferred.
 */
export async function finishAuthenticatorKeyRotation(
  apiService: ApiService,
  encryptService: EncryptService,
  oldKey: UserKey,
  newKey: UserKey,
): Promise<void> {
  const rotated = await reencryptAuthenticatorEntries(apiService, encryptService, oldKey, newKey);
  if (rotated == null || rotated.length === 0) {
    return;
  }
  await apiService.send(
    "PUT",
    "/authenticator/rotate",
    { authenticatorEntries: rotated },
    true,
    true,
  );
}

/** Reads the deferral left by `rotate-user-keys`. Undefined when the server has no such route. */
export async function readAuthenticatorKeyRotation(
  apiService: ApiService,
): Promise<AuthenticatorKeyRotationStatus | undefined> {
  try {
    const response = await apiService.send("GET", "/authenticator/rotate", null, true, true);
    return {
      required: response?.required === true || response?.Required === true,
      wrappedOldUserKey: response?.wrappedOldUserKey ?? response?.WrappedOldUserKey ?? null,
      oldUserKeyId: response?.oldUserKeyId ?? response?.OldUserKeyId ?? null,
    };
  } catch (error) {
    if (error instanceof ErrorResponse && error.statusCode === 404) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Finishes an interrupted `rotate-user-keys` deferral. `wrappedOldUserKey` is the previous
 * user key wrapped by the master key, which did not change on that path.
 */
export async function recoverAuthenticatorKeyRotation(
  apiService: ApiService,
  encryptService: EncryptService,
  masterKey: MasterKey,
  currentUserKey: UserKey,
): Promise<void> {
  const status = await readAuthenticatorKeyRotation(apiService);
  if (status == null || !status.required || status.wrappedOldUserKey == null) {
    return;
  }
  const oldKey = (await encryptService.unwrapSymmetricKey(
    new EncString(status.wrappedOldUserKey),
    masterKey as unknown as SymmetricCryptoKey,
  )) as unknown as UserKey;
  await finishAuthenticatorKeyRotation(apiService, encryptService, oldKey, currentUserKey);
}

/**
 * Re-encrypts authenticator entries after `rotate-user-keys` using the account key the server
 * stored. `userKey$` often still holds the previous key when the POST returns, so the new key is
 * unwrapped from the profile with the same master password.
 */
export async function reencryptAuthenticatorsWithAccountKey(
  apiService: ApiService,
  encryptService: EncryptService,
  masterPasswordService: InternalMasterPasswordServiceAbstraction,
  oldKey: UserKey,
  userId: UserId,
  masterPassword: string,
): Promise<void> {
  const status = await readAuthenticatorKeyRotation(apiService);
  if (status == null || !status.required) {
    return;
  }
  const unlockData = await firstValueFrom(masterPasswordService.masterPasswordUnlockData$(userId));
  const wrapped = (await apiService.getProfile()).key?.encryptedString;
  if (unlockData == null || wrapped == null || wrapped === "") {
    return;
  }
  const newKey = await masterPasswordService.unwrapUserKeyFromMasterPasswordUnlockData(
    masterPassword,
    new MasterPasswordUnlockData(
      unlockData.salt,
      unlockData.kdf,
      wrapped as MasterKeyWrappedUserKey,
    ),
  );
  if (sameKeyBytes(oldKey, newKey)) {
    return;
  }
  await finishAuthenticatorKeyRotation(apiService, encryptService, oldKey, newKey);
}

function sameKeyBytes(left: UserKey, right: UserKey): boolean {
  const a = left.toEncoded();
  const b = right.toEncoded();
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

async function reencryptAuthenticatorEntries(
  apiService: ApiService,
  encryptService: EncryptService,
  oldKey: UserKey,
  newKey: UserKey,
): Promise<AuthenticatorRotationItem[] | undefined> {
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
  const oldSymmetric = oldKey as unknown as SymmetricCryptoKey;
  const newSymmetric = newKey as unknown as SymmetricCryptoKey;
  const rotated: AuthenticatorRotationItem[] = [];
  for (const entry of list.data) {
    rotated.push(await rotateEntry(entry, encryptService, oldSymmetric, newSymmetric));
  }
  return rotated;
}

async function rotateEntry(
  entry: AuthenticatorEntryResponse,
  encryptService: EncryptService,
  oldKey: SymmetricCryptoKey,
  newKey: SymmetricCryptoKey,
): Promise<AuthenticatorRotationItem> {
  const request: AuthenticatorRotationItem = {
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
