import { firstValueFrom, Observable } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { StateProvider } from "@bitwarden/common/platform/state";
import { UserId } from "@bitwarden/common/types/guid";
import { AuthenticatorEntryResponse } from "@bitwarden/common/vault/models/response/authenticator-entry.response";
import { AUTHENTICATOR_SYNC_SNAPSHOT } from "@bitwarden/common/vault/services/key-state/authenticator.state";
// eslint-disable-next-line no-restricted-imports
import { EncString, EncryptService, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";

import { bestAuthenticatorForUrl, totpSeedForEntry } from "./authenticator-match";
import { kindFromStored, splitAuthenticatorNotes } from "./authenticator-meta";
import {
  AuthenticatorEntryView,
  DEFAULT_AUTHENTICATOR_DIGITS,
  DEFAULT_AUTHENTICATOR_PERIOD,
  normalizeAlgorithm,
} from "./authenticator.models";

type LookupDeps = {
  accountService: AccountService;
  stateProvider: StateProvider;
  keyService: { userKey$: (userId: UserId) => Observable<unknown> };
  encryptService: EncryptService;
  logService: LogService;
};

/** Resolves the current page to an authenticator seed the autofill TOTP path can fill. */
export function createAuthenticatorTotpLookup(
  deps: LookupDeps,
): (url: string) => Promise<string | null> {
  return async (url: string) => {
    try {
      const account = await firstValueFrom(deps.accountService.activeAccount$);
      const userId = account?.id;
      if (userId == null) {
        return null;
      }
      const snapshot = await firstValueFrom(
        deps.stateProvider.getUser(userId, AUTHENTICATOR_SYNC_SNAPSHOT).state$,
      );
      if (snapshot?.source !== "sync" || snapshot.entries.length === 0) {
        return null;
      }
      const key = await firstValueFrom(deps.keyService.userKey$(userId));
      if (key == null) {
        return null;
      }
      const entries: AuthenticatorEntryView[] = [];
      for (const entry of snapshot.entries) {
        entries.push(
          await decryptEntry(entry, key as unknown as SymmetricCryptoKey, deps.encryptService),
        );
      }
      const match = bestAuthenticatorForUrl(entries, url);
      return match ? totpSeedForEntry(match) : null;
    } catch (error) {
      deps.logService.error(error);
      return null;
    }
  };
}

async function decryptEntry(
  entry: AuthenticatorEntryResponse,
  key: SymmetricCryptoKey,
  encryptService: EncryptService,
): Promise<AuthenticatorEntryView> {
  const name = await decryptField(entry.name, key, encryptService);
  const secret = await decryptField(entry.secret, key, encryptService);
  const issuer = entry.issuer ? await decryptField(entry.issuer, key, encryptService) : ok("");
  const notes = entry.notes ? await decryptField(entry.notes, key, encryptService) : ok("");
  const undecryptable = !name.ok || !secret.ok || !issuer.ok || !notes.ok;
  const digits = entry.digits || DEFAULT_AUTHENTICATOR_DIGITS;
  const split = splitAuthenticatorNotes(notes.ok ? notes.text : "");
  return {
    id: entry.id,
    name: name.ok ? name.text : "",
    issuer: issuer.ok ? issuer.text : "",
    secret: secret.ok ? secret.text.replace(/\s+/g, "").toUpperCase() : "",
    algorithm: normalizeAlgorithm(entry.algorithm),
    digits,
    period: entry.period || DEFAULT_AUTHENTICATOR_PERIOD,
    notes: split.text,
    favorite: entry.favorite,
    sortOrder: entry.sortOrder,
    revisionDate: entry.revisionDate,
    creationDate: entry.creationDate,
    undecryptable,
    kind: kindFromStored(split.meta, split.hasTrailer, digits),
    host: split.meta.host,
    tags: split.meta.tags,
    counter: split.meta.counter,
    deletedAt: split.meta.deletedAt,
  };
}

async function decryptField(
  value: string,
  key: SymmetricCryptoKey,
  encryptService: EncryptService,
): Promise<{ ok: true; text: string } | { ok: false }> {
  if (!value) {
    return ok("");
  }
  try {
    const text = await encryptService.decryptString(new EncString(value), key);
    return text == null ? { ok: false } : ok(text);
  } catch {
    return { ok: false };
  }
}

function ok(text: string): { ok: true; text: string } {
  return { ok: true, text };
}
