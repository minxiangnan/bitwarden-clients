import { BaseResponse } from "@bitwarden/common/models/response/base.response";

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

export class AuthenticatorEntryResponse extends BaseResponse {
  id: string;
  name: string;
  issuer: string | null;
  secret: string;
  algorithm: AuthenticatorAlgorithm;
  digits: number;
  period: number;
  notes: string | null;
  favorite: boolean;
  sortOrder: number;
  revisionDate: string;
  creationDate: string;
  object: string;

  constructor(response: unknown) {
    super(response);
    this.id = this.getResponseProperty("id");
    this.name = this.getResponseProperty("name");
    this.issuer = this.getResponseProperty("issuer");
    this.secret = this.getResponseProperty("secret");
    this.algorithm = normalizeAlgorithm(this.getResponseProperty("algorithm"));
    this.digits = numberOr(this.getResponseProperty("digits"), DEFAULT_AUTHENTICATOR_DIGITS);
    this.period = numberOr(this.getResponseProperty("period"), DEFAULT_AUTHENTICATOR_PERIOD);
    this.notes = this.getResponseProperty("notes");
    this.favorite = this.getResponseProperty("favorite") === true;
    this.sortOrder = numberOr(this.getResponseProperty("sortOrder"), 0);
    this.revisionDate = this.getResponseProperty("revisionDate") ?? "";
    this.creationDate = this.getResponseProperty("creationDate") ?? "";
    this.object = this.getResponseProperty("object");
  }
}

export class AuthenticatorListResponse extends BaseResponse {
  data: AuthenticatorEntryResponse[] = [];
  object: string | null = null;
  continuationToken: string | null = null;

  constructor(response: unknown) {
    super(response);
    const data = this.getResponseProperty("data");
    this.data = Array.isArray(data) ? data.map((item) => new AuthenticatorEntryResponse(item)) : [];
    this.object = this.getResponseProperty("object");
    this.continuationToken = this.getResponseProperty("continuationToken");
  }
}

export function normalizeAlgorithm(value: unknown): AuthenticatorAlgorithm {
  const upper = typeof value === "string" ? value.toUpperCase() : "";
  if (upper === AuthenticatorAlgorithms.Sha256 || upper === AuthenticatorAlgorithms.Sha512) {
    return upper;
  }
  return AuthenticatorAlgorithms.Sha1;
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
