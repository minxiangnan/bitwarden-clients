import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { Router, RouterModule } from "@angular/router";
import {
  combineLatest,
  filter,
  firstValueFrom,
  map,
  Observable,
  shareReplay,
  switchMap,
} from "rxjs";

import { PremiumUpgradeDialogComponent } from "@bitwarden/angular/billing/components";
import { JslibModule } from "@bitwarden/angular/jslib.module";
import { NudgesService, NudgeType } from "@bitwarden/angular/vault";
import { AutomaticUserConfirmationService } from "@bitwarden/auto-confirm";
import { Account, AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { AutofillSettingsServiceAbstraction } from "@bitwarden/common/autofill/services/autofill-settings.service";
import { BillingAccountProfileStateService } from "@bitwarden/common/billing/abstractions";
import { UserId } from "@bitwarden/common/types/guid";
import {
  DialogService,
  IconModule,
  ItemModule,
  LinkModule,
  TypographyModule,
  CalloutModule,
  BerryComponent,
} from "@bitwarden/components";

import { CurrentAccountComponent } from "../../../auth/popup/account-switching/current-account.component";
import { PopOutComponent } from "../../../platform/popup/components/pop-out.component";
import { PopupHeaderComponent } from "../../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../../platform/popup/layout/popup-page.component";
import {
  AUTHENTICATOR_RELEASE_VERSION,
  SETTINGS_UPDATE_CACHE_MS,
} from "../../../platform/update/extension-update";
import {
  checkForExtensionUpdate,
  watchUpdateNotice,
} from "../../../platform/update/extension-update-background";

import { ExtensionUpdateDialogComponent } from "./extension-update-dialog/extension-update-dialog.component";

@Component({
  templateUrl: "settings-v2.component.html",
  imports: [
    CommonModule,
    JslibModule,
    RouterModule,
    PopupPageComponent,
    PopupHeaderComponent,
    PopOutComponent,
    IconModule,
    ItemModule,
    CurrentAccountComponent,
    TypographyModule,
    LinkModule,
    CalloutModule,
    BerryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsV2Component implements OnInit {
  readonly NudgeType = NudgeType;
  protected readonly releaseVersion = AUTHENTICATOR_RELEASE_VERSION;
  protected readonly updateNotice = toSignal(watchUpdateNotice(), { initialValue: null });

  private readonly authenticatedAccount$: Observable<Account> =
    this.accountService.activeAccount$.pipe(
      filter((account): account is Account => account !== null),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

  protected readonly hasPremium$ = this.authenticatedAccount$.pipe(
    switchMap((account) => this.accountProfileStateService.hasPremiumFromAnySource$(account.id)),
  );

  readonly showDownloadBitwardenNudge$: Observable<boolean> = this.authenticatedAccount$.pipe(
    switchMap((account) =>
      this.nudgesService.showNudgeBadge$(NudgeType.DownloadBitwarden, account.id),
    ),
  );

  readonly showVaultBadge$: Observable<boolean> = this.authenticatedAccount$.pipe(
    switchMap((account) =>
      this.nudgesService.showNudgeBadge$(NudgeType.EmptyVaultNudge, account.id),
    ),
  );

  readonly showAdminBadge$: Observable<boolean> = this.authenticatedAccount$.pipe(
    switchMap((account) =>
      this.nudgesService.showNudgeBadge$(NudgeType.AutoConfirmNudge, account.id),
    ),
  );

  readonly showAutofillBadge$: Observable<boolean> = this.authenticatedAccount$.pipe(
    switchMap((account) =>
      combineLatest([
        this.nudgesService.showNudgeBadge$(NudgeType.AutofillNudge, account.id),
        this.autofillSettingsService.showClipboardSettingUpdateNotification$,
      ]).pipe(
        map(
          ([showAutofillNudge, showClipboardNotification]) =>
            showAutofillNudge || showClipboardNotification,
        ),
      ),
    ),
  );

  readonly showAdminSettingsLink$: Observable<boolean> = this.accountService.activeAccount$.pipe(
    getUserId,
    switchMap((userId) => this.autoConfirmService.canManageAutoConfirm$(userId)),
  );

  constructor(
    private readonly nudgesService: NudgesService,
    private readonly accountService: AccountService,
    private readonly autoConfirmService: AutomaticUserConfirmationService,
    private readonly accountProfileStateService: BillingAccountProfileStateService,
    private readonly dialogService: DialogService,
    private readonly autofillSettingsService: AutofillSettingsServiceAbstraction,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    void checkForExtensionUpdate({ maxAgeMs: SETTINGS_UPDATE_CACHE_MS }).catch(
      (): void => undefined,
    );
  }

  protected openAbout(): void {
    const notice = this.updateNotice();
    if (notice != null) {
      ExtensionUpdateDialogComponent.open(this.dialogService, notice);
      return;
    }
    void this.router.navigate(["/about"]);
  }

  protected openUpgradeDialog() {
    PremiumUpgradeDialogComponent.open(this.dialogService);
  }

  async dismissBadge(type: NudgeType) {
    if (await firstValueFrom(this.showVaultBadge$)) {
      const account = await firstValueFrom(this.authenticatedAccount$);
      await this.nudgesService.dismissNudge(type, account.id as UserId, true);
    }
  }
}
