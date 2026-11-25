import { Injectable, signal } from "@angular/core";

import {
  AuthenticatorGroup,
  AuthenticatorSort,
  readAuthenticatorUi,
  rememberRecentId,
  writeAuthenticatorUi,
} from "../authenticator-ui-state";

/** Remembers sort, grouping, and recent codes on this browser. Vault data stays on the server. */
@Injectable({ providedIn: "root" })
export class AuthenticatorUiService {
  private readonly storage = typeof localStorage === "undefined" ? null : localStorage;
  private readonly initial = readAuthenticatorUi(this.storage);

  readonly sort = signal<AuthenticatorSort>(this.initial.sort);
  readonly group = signal<AuthenticatorGroup>(this.initial.group);
  readonly recentIds = signal<string[]>(this.initial.recentIds);
  readonly recentOnly = signal(false);

  setSort(value: string): void {
    this.sort.set(value === "name" || value === "issuer" ? value : "manual");
    this.persist();
  }

  setGroup(value: string): void {
    this.group.set(value === "issuer" || value === "tag" ? value : "none");
    this.persist();
  }

  noteRecent(id: string): void {
    this.recentIds.set(rememberRecentId(this.recentIds(), id));
    this.persist();
  }

  private persist(): void {
    writeAuthenticatorUi(this.storage, {
      sort: this.sort(),
      group: this.group(),
      recentIds: this.recentIds(),
    });
  }
}
