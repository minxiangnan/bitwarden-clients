import { Component, inject } from "@angular/core";
import { RouterModule } from "@angular/router";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { ButtonModule, ItemModule, ToastService } from "@bitwarden/components";
import { GeneratorModule } from "@bitwarden/generator-components";
import { PasswordGenerationServiceAbstraction } from "@bitwarden/generator-legacy";

import { PasswordPresets } from "../../../authenticator/password-presets";

import { CurrentAccountComponent } from "../../../auth/popup/account-switching/current-account.component";
import { PopOutComponent } from "../../../platform/popup/components/pop-out.component";
import { PopupHeaderComponent } from "../../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../../platform/popup/layout/popup-page.component";

// FIXME(https://bitwarden.atlassian.net/browse/CL-764): Migrate to OnPush
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  selector: "credential-generator",
  templateUrl: "credential-generator.component.html",
  imports: [
    GeneratorModule,
    CurrentAccountComponent,
    JslibModule,
    PopOutComponent,
    PopupHeaderComponent,
    PopupPageComponent,
    RouterModule,
    ItemModule,
    ButtonModule,
  ],
})
export class CredentialGeneratorComponent {
  private readonly generator = inject(PasswordGenerationServiceAbstraction);
  private readonly platformUtils = inject(PlatformUtilsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly presets = PasswordPresets;

  protected async usePreset(id: string): Promise<void> {
    const preset = this.presets.find((item) => item.id === id);
    if (preset == null) {
      return;
    }
    const password = await this.generator.generatePassword(preset.options);
    this.platformUtils.copyToClipboard(password);
    this.toast.showToast({
      variant: "success",
      title: null,
      message: this.i18n.t("passwordPresetCopied"),
    });
  }
}
