import {
  AuthenticatorAlgorithm,
  AuthenticatorEntryView,
  DEFAULT_AUTHENTICATOR_DIGITS,
  DEFAULT_AUTHENTICATOR_PERIOD,
  normalizeAlgorithm,
} from "./authenticator.models";

export type ParsedOtpAuth = {
  name: string;
  issuer: string;
  secret: string;
  algorithm: AuthenticatorAlgorithm;
  digits: number;
  period: number;
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
  >,
): string {
  const label = entry.issuer ? `${entry.issuer}:${entry.name}` : entry.name;
  const params = new URLSearchParams({
    secret: normalizeTotpSecret(entry.secret),
    algorithm: entry.algorithm,
    digits: String(entry.digits),
    period: String(entry.period),
  });
  if (entry.issuer) {
    params.set("issuer", entry.issuer);
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

  if (url.protocol !== "otpauth:" || url.hostname.toLowerCase() !== "totp") {
    return null;
  }

  const secret = normalizeTotpSecret(url.searchParams.get("secret") ?? "");
  if (!isValidTotpSecret(secret)) {
    return null;
  }

  const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const separator = label.indexOf(":");
  const issuerFromLabel = separator >= 0 ? label.slice(0, separator) : "";
  const nameFromLabel = separator >= 0 ? label.slice(separator + 1) : label;
  const issuer = (url.searchParams.get("issuer") ?? issuerFromLabel).trim();
  const digits = Number(url.searchParams.get("digits") ?? DEFAULT_AUTHENTICATOR_DIGITS);
  const period = Number(url.searchParams.get("period") ?? DEFAULT_AUTHENTICATOR_PERIOD);

  return {
    name: nameFromLabel.trim() || issuer || "TOTP",
    issuer,
    secret,
    algorithm: normalizeAlgorithm(url.searchParams.get("algorithm")),
    digits: Number.isFinite(digits) && digits > 0 ? digits : DEFAULT_AUTHENTICATOR_DIGITS,
    period: Number.isFinite(period) && period > 0 ? period : DEFAULT_AUTHENTICATOR_PERIOD,
  };
}

export function filterAuthenticatorEntries(
  entries: AuthenticatorEntryView[],
  query: string,
  favoritesOnly: boolean,
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
        entry.notes.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      if (a.favorite !== b.favorite) {
        return a.favorite ? -1 : 1;
      }
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });
}
