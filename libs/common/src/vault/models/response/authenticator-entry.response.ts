import { BaseResponse } from "../../../models/response/base.response";

export type AuthenticatorAlgorithmName = "SHA1" | "SHA256" | "SHA512";

export class AuthenticatorEntryResponse extends BaseResponse {
  id: string;
  name: string;
  issuer: string | null;
  secret: string;
  algorithm: AuthenticatorAlgorithmName;
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
    this.algorithm = normalizeAuthenticatorAlgorithm(this.getResponseProperty("algorithm"));
    this.digits = positiveNumberOr(this.getResponseProperty("digits"), 6);
    this.period = positiveNumberOr(this.getResponseProperty("period"), 30);
    this.notes = this.getResponseProperty("notes");
    this.favorite = this.getResponseProperty("favorite") === true;
    // sortOrder may be zero or negative. Only a missing or non-numeric value falls back to 0.
    this.sortOrder = integerOr(this.getResponseProperty("sortOrder"), 0);
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

export function normalizeAuthenticatorAlgorithm(value: unknown): AuthenticatorAlgorithmName {
  const upper = typeof value === "string" ? value.toUpperCase() : "";
  if (upper === "SHA256" || upper === "SHA512") {
    return upper;
  }
  return "SHA1";
}

function positiveNumberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function integerOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}
