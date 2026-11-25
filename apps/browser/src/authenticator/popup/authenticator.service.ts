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
  tap,
} from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { getOptionalUserId } from "@bitwarden/common/auth/services/account.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { StateProvider } from "@bitwarden/common/platform/state";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums/cipher-type";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { SecureNoteView } from "@bitwarden/common/vault/models/view/secure-note.view";
import {
  AUTHENTICATOR_SYNC_SNAPSHOT,
  AuthenticatorSyncSnapshot,
} from "@bitwarden/common/vault/services/key-state/authenticator.state";
import { KeyService } from "@bitwarden/key-management";
// The authenticator contract stores name, issuer, secret, and notes as user-key EncStrings.
// eslint-disable-next-line no-restricted-imports
import { EncString, EncryptService, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";

import { buildAuthenticatorExport } from "../authenticator-export";
import {
  AuthenticatorKind,
  joinAuthenticatorNotes,
  kindFromStored,
  splitAuthenticatorNotes,
} from "../authenticator-meta";
import { compareAuthenticatorEntries, parseOtpAuthUri } from "../authenticator-otpauth";
import {
  AuthenticatorAlgorithm,
  AuthenticatorEntryRequest,
  AuthenticatorEntryResponse,
  AuthenticatorEntryView,
  DEFAULT_AUTHENTICATOR_DIGITS,
  DEFAULT_AUTHENTICATOR_PERIOD,
  normalizeAlgorithm,
} from "../authenticator.models";

import {
  AuthenticatorApiService,
  isAuthenticatorUnsupported,
  isMcpUnsupported,
} from "./authenticator-api.service";

export type AuthenticatorDraft = {
  name: string;
  issuer: string;
  secret: string;
  algorithm: AuthenticatorAlgorithm;
  digits: number;
  period: number;
  notes: string;
  favorite: boolean;
  kind?: AuthenticatorKind;
  host?: string;
  tags?: string[];
  counter?: number;
  deletedAt?: string | null;
};

export type VaultTotpImport = {
  cipherId: string;
  name: string;
  username: string;
  draft: AuthenticatorDraft;
};

type AuthenticatorStatus = "loading" | "ready" | "unsupported" | "error" | "offline";

type AuthenticatorState = {
  status: AuthenticatorStatus;
  entries: AuthenticatorEntryView[];
  syncedAt?: string | null;
};

const EMPTY_STATE: AuthenticatorState = { status: "loading", entries: [] };

/** The server kept a newer revision. The local form must not overwrite it. */
export class AuthenticatorConflictError extends Error {
  constructor() {
    super("Authenticator entry was changed on another device.");
  }
}

function isConflict(error: unknown): boolean {
  return error instanceof ErrorResponse && error.statusCode === 409;
}

function newClientId(): string {
  const uuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (uuid) {
    return uuid();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const nibble = (Math.random() * 16) | 0;
    const value = char === "x" ? nibble : (nibble & 0x3) | 0x8;
    return value.toString(16);
  });
}

function duplicateIds(entries: AuthenticatorEntryView[]): string[] {
  const groups = new Map<string, AuthenticatorEntryView[]>();
  for (const entry of entries) {
    if (entry.undecryptable || !entry.secret || entry.deletedAt) {
      continue;
    }
    const key = [
      entry.secret.trim().toUpperCase(),
      entry.issuer.trim().toLowerCase(),
      entry.name.trim(),
      entry.algorithm,
      entry.digits,
      entry.period,
    ].join("|");
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  const drop: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    const ranked = [...group].sort((left, right) => {
      if (left.revisionDate !== right.revisionDate) {
        return left.revisionDate < right.revisionDate ? 1 : -1;
      }
      return left.id < right.id ? -1 : 1;
    });
    for (const extra of ranked.slice(1)) {
      drop.push(extra.id);
    }
  }
  return drop;
}

@Injectable({ providedIn: "root" })
export class AuthenticatorService {
  private readonly stateSubject = new BehaviorSubject<AuthenticatorState>(EMPTY_STATE);
  private refreshGeneration = 0;
  /** Ciphertext fingerprint already decrypted into stateSubject. */
  private lastPublishedKey: string | null = null;
  private droppingDuplicates = false;

  readonly state$ = this.stateSubject.asObservable();

  /** True once this server exposes the authenticator API. A 404 keeps the tab hidden. */
  readonly supported$ = this.state$.pipe(
    map(
      (state) => state.status === "ready" || state.status === "error" || state.status === "offline",
    ),
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
        tap((status) => {
          if (status !== AuthenticationStatus.Unlocked) {
            this.clearDecryptedState();
          }
        }),
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
      await this.publishDecrypted(snapshot.entries, userId, snapshot.syncedAt ?? null);
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
    syncedAt?: string | null,
  ): Promise<void> {
    const key = snapshotKey(encrypted);
    if (key === this.lastPublishedKey && this.stateSubject.value.status === "ready") {
      if (syncedAt && syncedAt !== this.stateSubject.value.syncedAt) {
        this.stateSubject.next({ ...this.stateSubject.value, syncedAt });
      }
      return;
    }
    const generation = ++this.refreshGeneration;
    try {
      const entries = await this.decryptAll(encrypted, userId);
      if (generation !== this.refreshGeneration) {
        return;
      }
      if (await this.dropDuplicates(entries)) {
        await this.refresh(userId);
        return;
      }
      this.lastPublishedKey = key;
      this.stateSubject.next({ status: "ready", entries, syncedAt: syncedAt ?? null });
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

  private async writeSnapshot(userId: UserId, snapshot: AuthenticatorSyncSnapshot): Promise<void> {
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
      if (await this.dropDuplicates(entries)) {
        await this.refresh(activeUserId);
        return;
      }
      const syncedAt = new Date().toISOString();
      this.lastPublishedKey = snapshotKey(encrypted);
      this.stateSubject.next({ status: "ready", entries, syncedAt });
      await this.writeSnapshot(activeUserId, { source: "sync", entries: encrypted, syncedAt });
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
        status: this.stateSubject.value.entries.length > 0 ? "offline" : "error",
        entries: this.stateSubject.value.entries,
        syncedAt: this.stateSubject.value.syncedAt,
      });
    }
  }

  /** Confirms the cache against the server. A failure keeps the cached codes read-only. */
  async confirmServer(): Promise<void> {
    const userId = await this.activeUserId();
    if (userId == null) {
      return;
    }
    if (this.stateSubject.value.status === "loading") {
      await firstValueFrom(this.state$.pipe(filter((state) => state.status !== "loading")));
    }
    await this.refresh(userId);
  }

  async save(draft: AuthenticatorDraft, id?: string, sortOrder?: number): Promise<string> {
    const userId = await this.requireUserId();
    this.assertOnline();
    this.assertEditable(id);
    const existing = id
      ? this.stateSubject.value.entries.find((entry) => entry.id === id)
      : undefined;
    const request = await this.encryptDraft(draft, userId, id, sortOrder);
    try {
      const saved = existing
        ? await this.api.update(id as string, {
            ...request,
            revisionDate: existing.revisionDate,
          })
        : await this.api.create({ ...request, id: id ?? newClientId() });
      // The server write already succeeded. A later refresh failure must not look like a local-only save.
      try {
        await this.refresh(userId);
      } catch (error) {
        this.logService.error(error);
      }
      return saved.id;
    } catch (error) {
      if (error instanceof AuthenticatorConflictError) {
        throw error;
      }
      if (isConflict(error)) {
        try {
          await this.refresh(userId);
        } catch (refreshError) {
          this.logService.error(refreshError);
        }
        throw new AuthenticatorConflictError();
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const userId = await this.requireUserId();
    this.assertOnline();
    await this.api.delete(id);
    try {
      await this.api.deleteMcpEntry("authenticator", id);
    } catch (error) {
      if (!isMcpUnsupported(error)) {
        this.logService.error(error);
      }
    }
    await this.refresh(userId);
  }

  async setFavorite(entry: AuthenticatorEntryView, favorite: boolean): Promise<void> {
    await this.save(draftFromView({ ...entry, favorite }), entry.id);
  }

  /** Swaps sortOrder with the neighboring entry. Undecryptable entries are left unchanged. */
  async move(id: string, direction: -1 | 1): Promise<void> {
    const ordered = [...this.stateSubject.value.entries].sort(compareAuthenticatorEntries);
    const index = ordered.findIndex((entry) => entry.id === id);
    const neighbor = ordered[index + direction];
    const current = ordered[index];
    if (current == null || neighbor == null) {
      return;
    }
    if (current.undecryptable || neighbor.undecryptable) {
      throw new Error("Cannot reorder an authenticator entry that could not be decrypted.");
    }
    const currentOrder = current.sortOrder;
    const neighborOrder =
      neighbor.sortOrder === currentOrder ? currentOrder + direction : neighbor.sortOrder;
    const restoredNeighbor = neighbor.sortOrder === currentOrder ? currentOrder : currentOrder;
    await this.save(draftFromView(current), current.id, neighborOrder);
    await this.save(draftFromView(neighbor), neighbor.id, restoredNeighbor);
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

  private assertOnline(): void {
    if (this.stateSubject.value.status === "offline") {
      throw new Error("当前离线，只能查看，不能修改。");
    }
  }

  private async dropDuplicates(entries: AuthenticatorEntryView[]): Promise<boolean> {
    if (this.droppingDuplicates) {
      return false;
    }
    const ids = duplicateIds(entries);
    if (ids.length === 0) {
      return false;
    }
    this.droppingDuplicates = true;
    let removed = false;
    try {
      for (const id of ids) {
        try {
          await this.api.delete(id);
          removed = true;
        } catch (error) {
          this.logService.error(error);
        }
      }
      return removed;
    } finally {
      this.droppingDuplicates = false;
    }
  }

  private assertEditable(id?: string): void {
    if (id == null) {
      return;
    }
    const existing = this.stateSubject.value.entries.find((entry) => entry.id === id);
    if (existing?.undecryptable) {
      throw new Error("Cannot edit an authenticator entry that could not be decrypted.");
    }
  }

  private async encryptDraft(
    draft: AuthenticatorDraft,
    userId: UserId,
    id?: string,
    sortOrder?: number,
  ): Promise<AuthenticatorEntryRequest> {
    const key = await this.userKey(userId);
    const request: AuthenticatorEntryRequest = {
      name: await this.encrypt(draft.name.trim(), key),
      secret: await this.encrypt(draft.secret.replace(/\s+/g, "").toUpperCase(), key),
      algorithm: draft.algorithm,
      digits: draft.digits,
      period: draft.period,
      favorite: draft.favorite,
      sortOrder:
        sortOrder ??
        (id
          ? (this.stateSubject.value.entries.find((entry) => entry.id === id)?.sortOrder ?? 0)
          : this.nextSortOrder()),
    };
    const issuer = draft.issuer.trim();
    if (issuer) {
      request.issuer = await this.encrypt(issuer, key);
    }
    const notes = joinAuthenticatorNotes(
      draft.notes.trim(),
      {
        kind: draft.kind ?? "totp",
        host: (draft.host ?? "").trim().toLowerCase(),
        tags: draft.tags ?? [],
        counter: draft.counter ?? 0,
        deletedAt: draft.deletedAt ?? null,
      },
      draft.digits,
    );
    if (notes) {
      request.notes = await this.encrypt(notes, key);
    }
    return request;
  }

  async saveImported(drafts: AuthenticatorDraft[]): Promise<number> {
    const existing = new Set(
      this.stateSubject.value.entries.map((entry) =>
        entry.secret.replace(/\s+/g, "").toUpperCase(),
      ),
    );
    let saved = 0;
    for (const draft of drafts) {
      const secret = draft.secret.replace(/\s+/g, "").toUpperCase();
      if (!secret || existing.has(secret)) {
        continue;
      }
      await this.save({ ...draft, secret });
      existing.add(secret);
      saved++;
    }
    return saved;
  }

  async moveToTrash(entry: AuthenticatorEntryView): Promise<void> {
    await this.save(draftFromView({ ...entry, deletedAt: new Date().toISOString() }), entry.id);
  }

  async restore(entry: AuthenticatorEntryView): Promise<void> {
    await this.save(draftFromView({ ...entry, deletedAt: null }), entry.id);
  }

  async advanceHotp(entry: AuthenticatorEntryView): Promise<void> {
    await this.save(draftFromView({ ...entry, counter: (entry.counter ?? 0) + 1 }), entry.id);
  }

  /** Stores the plain migration file inside a vault secure note, which the server encrypts. */
  async backupToVault(): Promise<void> {
    const document = buildAuthenticatorExport(
      this.stateSubject.value.entries.filter((entry) => !entry.undecryptable),
    );
    const cipher = new CipherView();
    cipher.name = "验证器备份";
    cipher.type = CipherType.SecureNote;
    cipher.notes = JSON.stringify(document);
    cipher.secureNote = new SecureNoteView();
    await this.cipherService.createWithServer(cipher, await this.requireUserId());
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
    const name = await this.decryptField(entry.name, key);
    const secret = await this.decryptField(entry.secret, key);
    const issuer = entry.issuer ? await this.decryptField(entry.issuer, key) : ok("");
    const notes = entry.notes ? await this.decryptField(entry.notes, key) : ok("");
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

  private async encrypt(value: string, key: SymmetricCryptoKey): Promise<string> {
    const encrypted = await this.encryptService.encryptString(value, key);
    return encrypted.toJSON();
  }

  private async decryptField(
    value: string,
    key: SymmetricCryptoKey,
  ): Promise<{ ok: true; text: string } | { ok: false }> {
    if (!value) {
      return ok("");
    }
    try {
      const text = await this.encryptService.decryptString(new EncString(value), key);
      if (text == null) {
        return { ok: false };
      }
      return ok(text);
    } catch (error) {
      this.logService.error(error);
      return { ok: false };
    }
  }

  private clearDecryptedState(): void {
    this.lastPublishedKey = null;
    this.refreshGeneration++;
    if (
      this.stateSubject.value.entries.length > 0 ||
      this.stateSubject.value.status !== EMPTY_STATE.status
    ) {
      this.stateSubject.next(EMPTY_STATE);
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

function snapshotKey(entries: AuthenticatorEntryResponse[]): string {
  return entries
    .map((entry) =>
      [
        entry.id,
        entry.name,
        entry.issuer ?? "",
        entry.secret,
        entry.notes ?? "",
        entry.favorite,
        entry.sortOrder,
        entry.revisionDate,
      ].join("\u0001"),
    )
    .join("\u0002");
}

function ok(text: string): { ok: true; text: string } {
  return { ok: true, text };
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
    kind: entry.kind ?? (entry.digits === 5 ? "steam" : "totp"),
    host: entry.host ?? "",
    tags: entry.tags ?? [],
    counter: entry.counter ?? 0,
    deletedAt: entry.deletedAt ?? null,
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
