import {
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  merge,
  mergeMap,
  of,
  pairwise,
  switchMap,
} from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { BadgeSettingsServiceAbstraction } from "@bitwarden/common/autofill/services/badge-settings.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { UserId } from "@bitwarden/common/types/guid";

import { Tab } from "../../platform/badge/badge-browser-api";
import { BadgeService } from "../../platform/badge/badge.service";
import { BadgeStatePriority } from "../../platform/badge/priority";

import { CipherUse, FillCipherPolicy } from "./abstractions/fill-cipher-policy";

const StateName = "autofill-badge-updater";

export class AutofillBadgeUpdaterService {
  constructor(
    private badgeService: BadgeService,
    private accountService: AccountService,
    private fillCipherPolicy: FillCipherPolicy,
    private badgeSettingsService: BadgeSettingsServiceAbstraction,
    private logService: LogService,
    private authService: AuthService,
  ) {}

  init() {
    const authStatus$ = this.accountService.activeAccount$.pipe(
      switchMap((account) =>
        account?.id
          ? this.authService.authStatusFor$(account.id)
          : of(AuthenticationStatus.LoggedOut),
      ),
      distinctUntilChanged(),
    );

    const ciphersChanged$ = this.accountService.activeAccount$.pipe(
      switchMap((account) =>
        account?.id ? this.fillCipherPolicy.changed$(account.id) : of(undefined),
      ),
    );

    // PIN unlock and master-password unlock both move the status to Unlocked. Recount then,
    // even when the cipher stream does not emit again.
    const unlockRecount$ = authStatus$.pipe(
      pairwise(),
      filter(
        ([previous, current]) =>
          previous !== AuthenticationStatus.Unlocked && current === AuthenticationStatus.Unlocked,
      ),
      map((): void => undefined),
    );

    this.badgeService.setState(StateName, (tab) => {
      return combineLatest({
        account: this.accountService.activeAccount$,
        enableBadgeCounter:
          this.badgeSettingsService.enableBadgeCounter$.pipe(distinctUntilChanged()),
        authStatus: authStatus$,
        ciphersChanged: merge(ciphersChanged$, unlockRecount$),
      }).pipe(
        mergeMap(async ({ account, enableBadgeCounter, authStatus }) => {
          if (!account || !enableBadgeCounter || authStatus !== AuthenticationStatus.Unlocked) {
            return undefined;
          }

          return {
            state: {
              text: await this.calculateCountText(tab, account.id),
            },
            priority: BadgeStatePriority.Default,
          };
        }),
      );
    });
  }

  private async calculateCountText(tab: Tab, userId: UserId) {
    if (!tab.tabId) {
      this.logService.warning("Tab event received but tab id is undefined");
      return;
    }

    const ciphers = tab.url
      ? await this.fillCipherPolicy.ciphersForUrl(tab.url, userId, CipherUse.Badge)
      : [];
    const cipherCount = ciphers.length;

    if (cipherCount === 0) {
      return undefined;
    }

    return cipherCount > 9 ? "9+" : cipherCount.toString();
  }
}
