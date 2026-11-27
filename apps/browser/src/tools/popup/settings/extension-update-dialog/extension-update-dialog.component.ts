import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import {
  ButtonModule,
  DIALOG_DATA,
  DialogModule,
  DialogRef,
  DialogService,
} from "@bitwarden/components";

import { UpdateNotice } from "../../../../platform/update/extension-update";
import { downloadExtensionUpdate } from "../../../../platform/update/extension-update-background";

/** Download prompt for a newer authenticator build. It never installs the zip. */
@Component({
  selector: "app-extension-update-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, DialogModule, JslibModule],
  templateUrl: "./extension-update-dialog.component.html",
})
export class ExtensionUpdateDialogComponent {
  private readonly dialogRef = inject(DialogRef);
  private readonly i18n = inject(I18nService);
  protected readonly notice = inject<UpdateNotice>(DIALOG_DATA);
  protected readonly title = `${this.i18n.t("authenticatorUpdateFound")} ${this.notice.version}`;
  protected readonly downloading = signal(false);
  protected readonly hint = signal(false);

  protected dismiss(): void {
    void this.dialogRef.close();
  }

  protected async download(): Promise<void> {
    if (this.downloading()) {
      return;
    }
    this.downloading.set(true);
    const saved = await downloadExtensionUpdate(this.notice.downloadUrl);
    this.downloading.set(false);
    this.hint.set(saved);
  }

  static open(dialogService: DialogService, notice: UpdateNotice) {
    return dialogService.open(ExtensionUpdateDialogComponent, { data: notice });
  }
}
