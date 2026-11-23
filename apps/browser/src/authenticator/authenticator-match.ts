import { entryKind } from "./authenticator-codes";
import { AuthenticatorKinds } from "./authenticator-meta";
import { toOtpAuthUri } from "./authenticator-otpauth";
import { AuthenticatorEntryView } from "./authenticator.models";

const SIMPLE_SUFFIXES = new Set(["com", "org", "net", "cn", "io"]);

export function pageHostname(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname || null;
  } catch {
    return null;
  }
}

/**
 * Exact hostname when the entry stores one. Otherwise the issuer or name must be
 * that hostname, or `label` plus a single common suffix such as github.com.
 */
export function entryMatchesHost(entry: AuthenticatorEntryView, hostname: string): boolean {
  const host = (entry.host ?? "").trim().toLowerCase();
  if (host) {
    return host === hostname;
  }
  const bare = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  for (const raw of [entry.issuer, entry.name]) {
    const label = raw.trim().toLowerCase().replace(/\s+/g, "");
    if (label.length < 3) {
      continue;
    }
    if (label === hostname || label === bare) {
      return true;
    }
    if (label.includes(".")) {
      continue;
    }
    const suffix = bare.slice(label.length + 1);
    if (bare.startsWith(`${label}.`) && SIMPLE_SUFFIXES.has(suffix)) {
      return true;
    }
  }
  return false;
}

/** One matching code. Several matches only resolve when one of them is a favorite. */
export function bestAuthenticatorForUrl(
  entries: AuthenticatorEntryView[],
  url: string,
): AuthenticatorEntryView | null {
  const hostname = pageHostname(url);
  if (hostname == null) {
    return null;
  }
  const matches = entries.filter(
    (entry) =>
      !entry.undecryptable &&
      entryKind(entry) !== AuthenticatorKinds.Hotp &&
      entryMatchesHost(entry, hostname),
  );
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    const favorites = matches.filter((entry) => entry.favorite);
    return favorites.length === 1 ? favorites[0] : null;
  }
  return null;
}

/** Seed accepted by the vault TOTP service. HOTP is omitted so a fill does not burn the counter. */
export function totpSeedForEntry(entry: AuthenticatorEntryView): string | null {
  if (entry.undecryptable || !entry.secret) {
    return null;
  }
  const kind = entryKind(entry);
  if (kind === AuthenticatorKinds.Hotp) {
    return null;
  }
  if (kind === AuthenticatorKinds.Steam) {
    return `steam://${entry.secret.replace(/\s+/g, "").toUpperCase()}`;
  }
  return toOtpAuthUri(entry);
}
