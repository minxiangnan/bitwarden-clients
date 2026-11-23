import {
  AuthenticatorEntryResponse,
  AuthenticatorListResponse,
} from "@bitwarden/common/vault/models/response/authenticator-entry.response";

import { AuthenticatorKind } from "./authenticator-meta";

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
export const MIN_AUTHENTICATOR_DIGITS = 5;
export const MAX_AUTHENTICATOR_DIGITS = 10;
export const MIN_AUTHENTICATOR_PERIOD = 1;
export const MAX_AUTHENTICATOR_PERIOD = 86400;

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
  /** True when name, secret, issuer, or notes could not be decrypted. Do not save this entry. */
  undecryptable: boolean;
  /** Omitted on older in-memory fixtures. Steam used to be implied by 5 digits. */
  kind?: AuthenticatorKind;
  host?: string;
  tags?: string[];
  counter?: number;
  deletedAt?: string | null;
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
