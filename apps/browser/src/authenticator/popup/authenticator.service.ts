import { Injectable } from "@angular/core";
import {
  BehaviorSubject,
  distinctUntilChanged,
  EMPTY,
  filter,
  firstValueFrom,
  from,
  map,
  switchMap,
} from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { getOptionalUserId } from "@bitwarden/common/auth/services/account.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { StateProvider } from "@bitwarden/common/platform/state";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import {
  AUTHENTICATOR_SYNC_SNAPSHOT,
  AuthenticatorSyncSnapshot,
} from "@bitwarden/common/vault/services/key-state/authenticator.state";
import { KeyService } from "@bitwarden/key-management";
// The authenticator contract stores name, issuer, secret, and notes as user-key EncStrings.
// eslint-disable-next-line no-restricted-imports
import { EncString, EncryptService, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";

import { parseOtpAuthUri } from "../authenticator-otpauth";
import {
  AuthenticatorAlgorithm,
  AuthenticatorEntryRequest,
  AuthenticatorEntryResponse,
  AuthenticatorEntryView,
  DEFAULT_AUTHENTICATOR_DIGITS,
  DEFAULT_AUTHENTICATOR_PERIOD,
  normalizeAlgorithm,
} from "../authenticator.models";

import { AuthenticatorApiService, isAuthenticatorUnsupported } from "./authenticator-api.service";

export type AuthenticatorDraft = {
  name: string;
  issuer: string;
  secret: string;
  algorithm: AuthenticatorAlgorithm;
  digits: number;
  period: number;
  notes: string;
  favorite: boolean;
};

export type VaultTotpImport = {
  cipherId: string;
  name: string;
  username: string;
  draft: AuthenticatorDraft;
};

type AuthenticatorStatus = "loading" | "ready" | "unsupported" | "error";

type AuthenticatorState = {
  status: AuthenticatorStatus;
  entries: AuthenticatorEntryView[];
};

const EMPTY_STATE: AuthenticatorState = { status: "loading", entries: [] };

@Injectable({ providedIn: "root" })
export class AuthenticatorService {
  private readonly stateSubject = new BehaviorSubject<AuthenticatorState>(EMPTY_STATE);
  private refreshGeneration = 0;

  readonly state$ = this.stateSubject.asObservable();

  /** True once this server exposes the authenticator API. A 404 keeps the tab hidden. */
  readonly supported$ = this.state$.pipe(
    map((state) => state.status === "ready" || state.status === "error"),
    distinctUntilChanged(),
  );

  constructor(
    private api: AuthenticatorApiService,
    private accountService: AccountService,
    private authService: AuthService,
    private keyService: KeyService,
    private encryptService: EncryptService,
    private cipherService: CipherService,
    private logService: LogService,
    private stateProvider: StateProvider,
  ) {
    this.authService.activeAccountStatus$
      .pipe(
        switchMap((status) =>
          status === AuthenticationStatus.Unlocked
            ? this.accountService.activeAccount$.pipe(
                getOptionalUserId,
                filter((userId): userId is UserId => userId != null),
              )
            : EMPTY,
        ),
        switchMap((userId) =>
          this.stateProvider.getUser(userId, AUTHENTICATOR_SYNC_SNAPSHOT).state$.pipe(
            distinctUntilChanged(),
            switchMap((snapshot) => from(this.consumeSnapshot(userId, snapshot))),
          ),
        ),
      )
      .subscribe();
  }

  /**
   * Sync already stored ciphertext when the server included authenticatorEntries.
   * Otherwise GET /authenticator, which also covers official Bitwarden (404) and a refresh.
   */
  private async consumeSnapshot(
    userId: UserId,
    snapshot: AuthenticatorSyncSnapshot | null,
  ): Promise<void> {
    if (snapshot?.source === "sync") {
      await this.publishDecrypted(snapshot.entries, userId);
      return;
    }
    if (snapshot?.source === "unsupported") {
      this.stateSubject.next({ status: "unsupported", entries: [] });
      return;
    }
    await this.refresh(userId);
  }

  private async publishDecrypted(
    encrypted: AuthenticatorEntryResponse[],
    userId: UserId,
  ): Promise<void> {
    const generation = ++this.refreshGeneration;
    try {
      const entries = await this.decryptAll(encrypted, userId);
      if (generation !== this.refreshGeneration) {
        return;
      }
      this.stateSubject.next({ status: "ready", entries });
    } catch (error) {
      if (generation !== this.refreshGeneration) {
        return;
      }
      this.logService.error(error);
      this.stateSubject.next({
        status: "error",
        entries: this.stateSubject.value.entries,
      });
    }
  }

  private async writeSnapshot(
    userId: UserId,
    snapshot: AuthenticatorSyncSnapshot,
  ): Promise<void> {
    await this.stateProvider.getUser(userId, AUTHENTICATOR_SYNC_SNAPSHOT).update(() => snapshot);
  }

  async refresh(userId?: UserId): Promise<void> {
    const activeUserId = userId ?? (await this.activeUserId());
    if (activeUserId == null) {
      this.stateSubject.next(EMPTY_STATE);
      return;
    }

    const generation = ++this.refreshGeneration;
    try {
      const encrypted = await this.api.list();
      const entries = await this.decryptAll(encrypted, activeUserId);
      if (generation !== this.refreshGeneration) {
        return;
      }
      await this.writeSnapshot(activeUserId, { source: "sync", entries: encrypted });
      this.stateSubject.next({ status: "ready", entries });
    } catch (error) {
      if (generation !== this.refreshGeneration) {
        return;
      }
      if (isAuthenticatorUnsupported(error)) {
        await this.writeSnapshot(activeUserId, { source: "unsupported", entries: [] });
        this.stateSubject.next({ status: "unsupported", entries: [] });
        return;
      }
      this.logService.error(error);
      this.stateSubject.next({
        status: "error",
        entries: this.stateSubject.value.entries,
      });
    }
  }

  async save(draft: AuthenticatorDraft, id?: string): Promise<void> {
    const userId = await this.requireUserId();
    const request = await this.encryptDraft(draft, userId, id);
    if (id) {
      await this.api.update(id, request);
    } else {
      await this.api.create(request);
    }
    await this.refresh(userId);
  }

  async remove(id: string): Promise<void> {
    const userId = await this.requireUserId();
    await this.api.delete(id);
    await this.refresh(userId);
  }

  async setFavorite(entry: AuthenticatorEntryView, favorite: boolean): Promise<void> {
    await this.save(draftFromView({ ...entry, favorite }), entry.id);
  }

  async importVaultTotp(): Promise<VaultTotpImport[]> {
    const userId = await this.requireUserId();
    const ciphers = await this.cipherService.getAllDecrypted(userId);
    const existingSecrets = new Set(
      this.stateSubject.value.entries.map((entry) =>
        entry.secret.replace(/\s+/g, "").toUpperCase(),
      ),
    );
    const imports: VaultTotpImport[] = [];
    for (const cipher of ciphers) {
      const draft = draftFromCipher(cipher);
      if (draft == null || existingSecrets.has(draft.secret)) {
        continue;
      }
      existingSecrets.add(draft.secret);
      imports.push({
        cipherId: cipher.id,
        name: cipher.name ?? draft.name,
        username: cipher.login?.username ?? "",
        draft,
      });
    }
    return imports;
  }

  private async encryptDraft(
    draft: AuthenticatorDraft,
    userId: UserId,
    id?: string,
  ): Promise<AuthenticatorEntryRequest> {
    const key = await this.userKey(userId);
    const request: AuthenticatorEntryRequest = {
      name: await this.encrypt(draft.name.trim(), key),
      secret: await this.encrypt(draft.secret.replace(/\s+/g, "").toUpperCase(), key),
      algorithm: draft.algorithm,
      digits: draft.digits,
      period: draft.period,
      favorite: draft.favorite,
      sortOrder: id
        ? (this.stateSubject.value.entries.find((entry) => entry.id === id)?.sortOrder ?? 0)
        : this.nextSortOrder(),
    };
    const issuer = draft.issuer.trim();
    if (issuer) {
      request.issuer = await this.encrypt(issuer, key);
    }
    const notes = draft.notes.trim();
    if (notes) {
      request.notes = await this.encrypt(notes, key);
    }
    return request;
  }

  private async decryptAll(
    entries: AuthenticatorEntryResponse[],
    userId: UserId,
  ): Promise<AuthenticatorEntryView[]> {
    const key = await this.userKey(userId);
    const views: AuthenticatorEntryView[] = [];
    for (const entry of entries) {
      views.push(await this.decryptEntry(entry, key));
    }
    return views;
  }

  private async decryptEntry(
    entry: AuthenticatorEntryResponse,
    key: SymmetricCryptoKey,
  ): Promise<AuthenticatorEntryView> {
    return {
      id: entry.id,
      name: await this.decrypt(entry.name, key),
      issuer: entry.issuer ? await this.decrypt(entry.issuer, key) : "",
      secret: (await this.decrypt(entry.secret, key)).replace(/\s+/g, "").toUpperCase(),
      algorithm: normalizeAlgorithm(entry.algorithm),
      digits: entry.digits || DEFAULT_AUTHENTICATOR_DIGITS,
      period: entry.period || DEFAULT_AUTHENTICATOR_PERIOD,
      notes: entry.notes ? await this.decrypt(entry.notes, key) : "",
      favorite: entry.favorite,
      sortOrder: entry.sortOrder,
      revisionDate: entry.revisionDate,
      creationDate: entry.creationDate,
    };
  }

  private async encrypt(value: string, key: SymmetricCryptoKey): Promise<string> {
    const encrypted = await this.encryptService.encryptString(value, key);
    return encrypted.toJSON();
  }

  private async decrypt(value: string, key: SymmetricCryptoKey): Promise<string> {
    if (!value) {
      return "";
    }
    try {
      return await this.encryptService.decryptString(new EncString(value), key);
    } catch (error) {
      this.logService.error(error);
      return "";
    }
  }

  private async userKey(userId: UserId): Promise<SymmetricCryptoKey> {
    const userKey = await firstValueFrom(this.keyService.userKey$(userId));
    if (userKey == null) {
      throw new Error("User key is not available.");
    }
    return userKey as unknown as SymmetricCryptoKey;
  }

  private nextSortOrder(): number {
    return (
      this.stateSubject.value.entries.reduce((max, entry) => Math.max(max, entry.sortOrder), 0) + 1
    );
  }

  private async activeUserId(): Promise<UserId | null> {
    const account = await firstValueFrom(this.accountService.activeAccount$);
    return account?.id ?? null;
  }

  private async requireUserId(): Promise<UserId> {
    const userId = await this.activeUserId();
    if (userId == null) {
      throw new Error("No active account.");
    }
    return userId;
  }
}

export function draftFromView(entry: AuthenticatorEntryView): AuthenticatorDraft {
  return {
    name: entry.name,
    issuer: entry.issuer,
    secret: entry.secret,
    algorithm: entry.algorithm,
    digits: entry.digits,
    period: entry.period,
    notes: entry.notes,
    favorite: entry.favorite,
  };
}

export function draftFromCipher(cipher: CipherView): AuthenticatorDraft | null {
  const raw = cipher.login?.totp?.trim();
  if (!raw) {
    return null;
  }
  const parsed = parseOtpAuthUri(raw);
  if (parsed) {
    return {
      ...parsed,
      name: parsed.name || cipher.name || parsed.issuer || "TOTP",
      notes: "",
      favorite: false,
    };
  }
  const secret = raw.replace(/\s+/g, "").toUpperCase();
  if (secret.length < 8) {
    return null;
  }
  return {
    name: cipher.name || "TOTP",
    issuer: "",
    secret,
    algorithm: "SHA1",
    digits: DEFAULT_AUTHENTICATOR_DIGITS,
    period: DEFAULT_AUTHENTICATOR_PERIOD,
    notes: "",
    favorite: false,
  };
}
