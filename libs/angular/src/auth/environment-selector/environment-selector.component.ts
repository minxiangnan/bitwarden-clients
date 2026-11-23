import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit } from "@angular/core";
import { Observable, Subject, map, takeUntil } from "rxjs";

import { AvailableRegionsService } from "@bitwarden/common/platform/abstractions/available-regions.service";
import {
  EnvironmentService,
  Region,
  RegionConfig,
} from "@bitwarden/common/platform/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import {
  DialogService,
  IconModule,
  LinkModule,
  MenuModule,
  ToastService,
  TypographyModule,
} from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";

import { SelfHostedEnvConfigDialogComponent } from "../self-hosted-env-config-dialog";

// FIXME(https://bitwarden.atlassian.net/browse/CL-764): Migrate to OnPush
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  selector: "environment-selector",
  templateUrl: "environment-selector.component.html",
  standalone: true,
  imports: [CommonModule, I18nPipe, IconModule, LinkModule, MenuModule, TypographyModule],
})
export class EnvironmentSelectorComponent implements OnInit, OnDestroy {
  protected ServerEnvironmentType = Region;
  protected showCloudRegions = false;
  protected baseUrl = "";
  private savedBaseUrl = "";
  protected availableRegions$: Observable<RegionConfig[]> =
    this.availableRegionsService.availableRegions$;
  protected selectedRegion$: Observable<RegionConfig | undefined> =
    this.environmentService.globalEnvironment$.pipe(
      map((env) =>
        this.environmentService.availableRegions().find((ar) => ar.key === env.getRegion()),
      ),
    );

  private destroy$ = new Subject<void>();

  constructor(
    public environmentService: EnvironmentService,
    private availableRegionsService: AvailableRegionsService,
    private dialogService: DialogService,
    private toastService: ToastService,
    private i18nService: I18nService,
  ) {}

  ngOnInit() {
    this.environmentService.environment$.pipe(takeUntil(this.destroy$)).subscribe((env) => {
      this.savedBaseUrl = env.getUrls()?.base ?? "";
      this.baseUrl = this.savedBaseUrl;
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected async saveBaseUrl(): Promise<void> {
    const base = this.baseUrl.trim();
    if (!base || base === this.savedBaseUrl) {
      return;
    }
    if (!base.startsWith("https://")) {
      this.toastService.showToast({
        variant: "error",
        title: "",
        message: this.i18nService.t("selfHostedEnvMustUseHttps"),
      });
      return;
    }
    await this.environmentService.setEnvironment(Region.SelfHosted, { base });
    this.toastService.showToast({
      variant: "success",
      title: "",
      message: this.i18nService.t("environmentSaved"),
    });
  }

  async toggle(option: Region) {
    if (option === null) {
      return;
    }

    /**
     * Opens the self-hosted settings dialog when the self-hosted option is selected.
     */
    if (option === Region.SelfHosted) {
      const dialogResult = await SelfHostedEnvConfigDialogComponent.open(this.dialogService);
      if (dialogResult) {
        this.toastService.showToast({
          variant: "success",
          title: "",
          message: this.i18nService.t("environmentSaved"),
        });
      }
      // Don't proceed to setEnvironment when the self-hosted dialog is cancelled
      return;
    }

    await this.environmentService.setEnvironment(option);
  }
}
