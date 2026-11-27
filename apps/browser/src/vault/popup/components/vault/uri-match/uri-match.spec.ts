import {
  UriMatchStrategy,
  UriMatchStrategySetting,
} from "@bitwarden/common/models/domain/domain-service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { LoginUriView } from "@bitwarden/common/vault/models/view/login-uri.view";
import { LoginView } from "@bitwarden/common/vault/models/view/login.view";
import { CipherViewLikeUtils } from "@bitwarden/common/vault/utils/cipher-view-like-utils";
import { CipherListView } from "@bitwarden/sdk-internal";

import { applyUriMatches, customUriMatchLabelKey } from "./uri-match";

describe("uri match rules", () => {
  it("clears a URI match when the choice is the global default", () => {
    const uris = [{ match: UriMatchStrategy.Exact }, { match: UriMatchStrategy.Never }];

    applyUriMatches(uris, [null, UriMatchStrategy.Host]);

    expect(uris[0].match).toBeUndefined();
    expect(uris[1].match).toBe(UriMatchStrategy.Host);
  });

  it("hides the badge until a URI has its own match", () => {
    const cipher = loginCipher(undefined);

    expect(customUriMatchLabelKey(cipher)).toBeNull();
  });

  it("labels one custom strategy and mixed strategies separately", () => {
    expect(customUriMatchLabelKey(loginCipher(UriMatchStrategy.Host))).toBe("host");
    const mixed = loginCipher(UriMatchStrategy.Exact);
    mixed.login.uris.push(uri("https://other.example.com", UriMatchStrategy.Never));

    expect(customUriMatchLabelKey(mixed)).toBe("uriMatchMixed");
  });
});

/**
 * Suggestions and the inline menu filter list rows. The shortcut fill and the fill script
 * recheck the decrypted login. Both go through the same item-then-global comparison.
 */
describe("item match before the global default", () => {
  const saved = "https://login.example.com/path";
  const sameHost = "https://login.example.com/other";
  const otherHost = "https://app.example.com/path";

  it("keeps an exact item from matching a different path when the global default is host", () => {
    expect(matches(saved, UriMatchStrategy.Exact, sameHost, UriMatchStrategy.Host)).toBe(false);
    expect(listMatches(saved, UriMatchStrategy.Exact, sameHost, UriMatchStrategy.Host)).toBe(false);
  });

  it("follows the global host default when the item match is unset", () => {
    expect(matches(saved, undefined, sameHost, UriMatchStrategy.Host)).toBe(true);
    expect(matches(saved, undefined, otherHost, UriMatchStrategy.Host)).toBe(false);
    expect(listMatches(saved, undefined, otherHost, UriMatchStrategy.Host)).toBe(false);
  });

  it("lets a domain item match another host while the global default stays host", () => {
    expect(matches(saved, UriMatchStrategy.Domain, otherHost, UriMatchStrategy.Host)).toBe(true);
    expect(listMatches(saved, UriMatchStrategy.Domain, otherHost, UriMatchStrategy.Host)).toBe(
      true,
    );
  });

  it("does not match a never item even when the global default would", () => {
    expect(matches(saved, UriMatchStrategy.Never, sameHost, UriMatchStrategy.Host)).toBe(false);
    expect(listMatches(saved, UriMatchStrategy.Never, sameHost, UriMatchStrategy.Domain)).toBe(
      false,
    );
  });
});

function matches(
  savedUri: string,
  itemMatch: UriMatchStrategySetting | undefined,
  target: string,
  globalMatch: UriMatchStrategySetting,
): boolean {
  const cipher = loginCipher(itemMatch, savedUri);
  return CipherViewLikeUtils.matchesUri(cipher, target, new Set(), globalMatch);
}

function listMatches(
  savedUri: string,
  itemMatch: UriMatchStrategySetting | undefined,
  target: string,
  globalMatch: UriMatchStrategySetting,
): boolean {
  const cipher = {
    type: { login: { uris: [{ uri: savedUri, match: itemMatch }] } },
  } as CipherListView;
  return CipherViewLikeUtils.matchesUri(cipher, target, new Set(), globalMatch);
}

function loginCipher(
  match: UriMatchStrategySetting | undefined,
  savedUri = "https://example.com",
): CipherView {
  const cipher = new CipherView();
  cipher.type = CipherType.Login;
  cipher.login = new LoginView();
  cipher.login.uris = [uri(savedUri, match)];
  return cipher;
}

function uri(value: string, match: UriMatchStrategySetting | undefined): LoginUriView {
  const view = new LoginUriView();
  view.uri = value;
  view.match = match;
  return view;
}
