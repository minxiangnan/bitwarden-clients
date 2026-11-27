import {
  UriMatchStrategy,
  UriMatchStrategySetting,
} from "@bitwarden/common/models/domain/domain-service";
import {
  CipherViewLike,
  CipherViewLikeUtils,
} from "@bitwarden/common/vault/utils/cipher-view-like-utils";

/** A saved URI match, or null when the item should follow the global default. */
export type UriMatchChoice = UriMatchStrategySetting | null;

export const URI_MATCH_CHOICES: readonly { value: UriMatchChoice; labelKey: string }[] = [
  { value: null, labelKey: "default" },
  { value: UriMatchStrategy.Domain, labelKey: "baseDomain" },
  { value: UriMatchStrategy.Host, labelKey: "host" },
  { value: UriMatchStrategy.Exact, labelKey: "exact" },
  { value: UriMatchStrategy.StartsWith, labelKey: "startsWith" },
  { value: UriMatchStrategy.RegularExpression, labelKey: "regEx" },
  { value: UriMatchStrategy.Never, labelKey: "never" },
];

/** Writes each choice onto the matching URI. Null clears the item so it follows the global default. */
export function applyUriMatches(
  uris: { match?: UriMatchStrategySetting | null }[],
  matches: readonly UriMatchChoice[],
): void {
  uris.forEach((uri, index) => {
    const next = index < matches.length ? matches[index] : null;
    uri.match = next == null ? undefined : next;
  });
}

/**
 * The badge for a login whose URIs do not all follow the global default.
 * Mixed custom strategies share one short label.
 */
export function customUriMatchLabelKey(cipher: CipherViewLike): string | null {
  return uriMatchSummaryLabelKey(CipherViewLikeUtils.getLogin(cipher)?.uris);
}

export function uriMatchSummaryLabelKey(
  uris: { match?: UriMatchStrategySetting | null }[] | null | undefined,
): string | null {
  const chosen = new Set<UriMatchStrategySetting>();
  for (const uri of uris ?? []) {
    if (uri.match != null) {
      chosen.add(uri.match);
    }
  }
  if (chosen.size === 0) {
    return null;
  }
  if (chosen.size > 1) {
    return "uriMatchMixed";
  }
  const only = [...chosen][0];
  return URI_MATCH_CHOICES.find((choice) => choice.value === only)?.labelKey ?? null;
}
