import {
  AuthenticatorEntryResponse,
  AuthenticatorListResponse,
} from "@bitwarden/common/vault/models/response/authenticator-entry.response";

export { AuthenticatorEntryResponse, AuthenticatorListResponse };

export const AuthenticatorAlgorithms = Object.freeze({
  Sha1: "SHA1",
  Sha256: "SHA256",
  Sha512: "SHA512",
} as const);

export type AuthenticatorAlgorithm =
  (typeof AuthenticatorAlgorithms)[keyof typeof AuthenticatorAlgorithms];

export const DEFAULT_AUTHENTICATOR_DIGITS = 6;
export const DEFAULT_AUTHENTICATOR_PERIOD = 30;

/** Decrypted entry shown in the popup. */
export type AuthenticatorEntryView = {
  id: string;
  name: string;
  issuer: string;
  secret: string;
  algorithm: AuthenticatorAlgorithm;
  digits: number;
  period: number;
  notes: string;
  favorite: boolean;
  sortOrder: number;
  revisionDate: string;
  creationDate: string;
};

/** camelCase body for POST and PUT. Name, issuer, secret, and notes are EncStrings. */
export type AuthenticatorEntryRequest = {
  name: string;
  issuer?: string;
  secret: string;
  algorithm?: AuthenticatorAlgorithm;
  digits?: number;
  period?: number;
  notes?: string;
  favorite?: boolean;
  sortOrder?: number;
};

export function normalizeAlgorithm(value: unknown): AuthenticatorAlgorithm {
  const upper = typeof value === "string" ? value.toUpperCase() : "";
  if (upper === AuthenticatorAlgorithms.Sha256 || upper === AuthenticatorAlgorithms.Sha512) {
    return upper;
  }
  return AuthenticatorAlgorithms.Sha1;
}
