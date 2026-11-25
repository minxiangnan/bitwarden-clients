import { entryKind } from "./authenticator-codes";
import { AuthenticatorKind, AuthenticatorKinds } from "./authenticator-meta";
import { AuthenticatorSort } from "./authenticator-ui-state";
import {
  AuthenticatorAlgorithm,
  AuthenticatorEntryView,
  DEFAULT_AUTHENTICATOR_DIGITS,
  DEFAULT_AUTHENTICATOR_PERIOD,
  MAX_AUTHENTICATOR_DIGITS,
  MAX_AUTHENTICATOR_PERIOD,
  MIN_AUTHENTICATOR_DIGITS,
  MIN_AUTHENTICATOR_PERIOD,
  normalizeAlgorithm,
} from "./authenticator.models";

export type ParsedOtpAuth = {
  name: string;
  issuer: string;
  secret: string;
  algorithm: AuthenticatorAlgorithm;
  digits: number;
  period: number;
  kind: AuthenticatorKind;
  counter: number;
};

const BASE32_ALPHABET = /^[A-Z2-7]+=*$/;

/** Strips spaces and uppercases a user-entered TOTP secret. */
export function normalizeTotpSecret(secret: string): string {
  return secret.replace(/\s+/g, "").toUpperCase();
}

export function isValidTotpSecret(secret: string): boolean {
  const normalized = normalizeTotpSecret(secret);
  return normalized.length >= 8 && BASE32_ALPHABET.test(normalized);
}

/** Builds the otpauth URI the existing TOTP service accepts. */
export function toOtpAuthUri(
  entry: Pick<
    AuthenticatorEntryView,
    "name" | "issuer" | "secret" | "algorithm" | "digits" | "period"
  > & { kind?: AuthenticatorKind; counter?: number },
): string {
  const label = entry.issuer ? `${entry.issuer}:${entry.name}` : entry.name;
  const kind = entryKind(entry);
  const params = new URLSearchParams({
    secret: normalizeTotpSecret(entry.secret),
    algorithm: kind === AuthenticatorKinds.Steam ? "steam" : entry.algorithm,
    digits: String(kind === AuthenticatorKinds.Steam ? MIN_AUTHENTICATOR_DIGITS : entry.digits),
    period: String(entry.period),
  });
  if (entry.issuer) {
    params.set("issuer", entry.issuer);
  }
  if (kind === AuthenticatorKinds.Hotp) {
    params.set("counter", String(entry.counter ?? 0));
    return `otpauth://hotp/${encodeURIComponent(label)}?${params.toString()}`;
  }
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

/** Reads an otpauth://totp URI. Returns null when the URI is not a TOTP secret. */
export function parseOtpAuthUri(value: string): ParsedOtpAuth | null {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("otpauth://")) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const type = url.hostname.toLowerCase();
  if (url.protocol !== "otpauth:" || (type !== "totp" && type !== "hotp")) {
    return null;
  }

  const secret = normalizeTotpSecret(url.searchParams.get("secret") ?? "");
  if (!isValidTotpSecret(secret)) {
    return null;
  }

  let label: string;
  try {
    label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
  const separator = label.indexOf(":");
  const issuerFromLabel = separator >= 0 ? label.slice(0, separator) : "";
  const nameFromLabel = separator >= 0 ? label.slice(separator + 1) : label;
  const issuer = (url.searchParams.get("issuer") ?? issuerFromLabel).trim();
  const steam = (url.searchParams.get("algorithm") ?? "").toLowerCase() === "steam";
  const hotp = type === "hotp";
  const counter = boundedInteger(url.searchParams.get("counter"), 0, 0, Number.MAX_SAFE_INTEGER);
  const digits = boundedInteger(
    url.searchParams.get("digits"),
    steam ? MIN_AUTHENTICATOR_DIGITS : DEFAULT_AUTHENTICATOR_DIGITS,
    MIN_AUTHENTICATOR_DIGITS,
    MAX_AUTHENTICATOR_DIGITS,
  );
  const period = boundedInteger(
    url.searchParams.get("period"),
    DEFAULT_AUTHENTICATOR_PERIOD,
    MIN_AUTHENTICATOR_PERIOD,
    MAX_AUTHENTICATOR_PERIOD,
  );
  if (
    digits == null ||
    period == null ||
    counter == null ||
    (steam && digits !== MIN_AUTHENTICATOR_DIGITS)
  ) {
    return null;
  }

  return {
    name: nameFromLabel.trim() || issuer || "TOTP",
    issuer,
    secret,
    algorithm: normalizeAlgorithm(steam ? "SHA1" : url.searchParams.get("algorithm")),
    digits,
    period,
    kind: steam ? AuthenticatorKinds.Steam : hotp ? AuthenticatorKinds.Hotp : AuthenticatorKinds.Totp,
    counter: hotp ? counter : 0,
  };
}

function boundedInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (raw == null || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

/** List order. Up and down swap neighbors in this order, so favorites stay a filter rather than a sort key. */
export function compareAuthenticatorEntries(
  a: Pick<AuthenticatorEntryView, "sortOrder" | "name">,
  b: Pick<AuthenticatorEntryView, "sortOrder" | "name">,
): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  return a.name.localeCompare(b.name);
}

export function filterAuthenticatorEntries(
  entries: AuthenticatorEntryView[],
  query: string,
  favoritesOnly: boolean,
  sort: AuthenticatorSort = "manual",
): AuthenticatorEntryView[] {
  const term = query.trim().toLowerCase();
  return entries
    .filter((entry) => !favoritesOnly || entry.favorite)
    .filter((entry) => {
      if (!term) {
        return true;
      }
      return (
        entry.name.toLowerCase().includes(term) ||
        entry.issuer.toLowerCase().includes(term) ||
        entry.notes.toLowerCase().includes(term) ||
        (entry.host ?? "").toLowerCase().includes(term) ||
        (entry.tags ?? []).some((tag) => tag.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => compareBySort(a, b, sort));
}

function compareBySort(
  a: AuthenticatorEntryView,
  b: AuthenticatorEntryView,
  sort: AuthenticatorSort,
): number {
  if (sort === "name") {
    return a.name.localeCompare(b.name, "zh") || a.issuer.localeCompare(b.issuer, "zh");
  }
  if (sort === "issuer") {
    return a.issuer.localeCompare(b.issuer, "zh") || a.name.localeCompare(b.name, "zh");
  }
  return compareAuthenticatorEntries(a, b);
}
