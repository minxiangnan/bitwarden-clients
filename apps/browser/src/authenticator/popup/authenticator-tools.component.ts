import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import {
  ButtonModule,
  destructiveDialogOptions,
  destructiveTitle,
  DialogService,
  FormFieldModule,
  ToastService,
} from "@bitwarden/components";

import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";
import { buildAuthenticatorExport } from "../authenticator-export";
import { parseAuthenticatorImport } from "../authenticator-import";
import { decodeQrPayload } from "../authenticator-scan";

import { AuthenticatorUiService } from "./authenticator-ui.service";
import { AuthenticatorDraft, AuthenticatorService } from "./authenticator.service";

@Component({
  selector: "app-authenticator-tools",
  imports: [
    CommonModule,
    FormsModule,
    JslibModule,
    ButtonModule,
    FormFieldModule,
    PopupPageComponent,
    PopupHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./authenticator-tools.component.html",
})
export class AuthenticatorToolsComponent {
  private readonly authenticator = inject(AuthenticatorService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly dialogService = inject(DialogService);
  protected readonly ui = inject(AuthenticatorUiService);

  protected readonly importText = signal("");
  protected readonly importingFile = signal(false);
  protected readonly showVault = signal(false);
  protected readonly vaultImports = signal<
    Awaited<ReturnType<AuthenticatorService["importVaultTotp"]>>
  >([]);
  private readonly state = toSignal(this.authenticator.state$, {
    initialValue: { status: "loading" as const, entries: [] },
  });
  protected readonly readOnly = computed(() => this.state().status === "offline");
  protected readonly trash = computed(() =>
    this.state().entries.filter((entry) => entry.deletedAt && !entry.undecryptable),
  );

  protected async restore(entryId: string): Promise<void> {
    const entry = this.state().entries.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }
    try {
      await this.authenticator.restore(entry);
    } catch {
      this.failSave();
    }
  }

  protected async purge(entryId: string): Promise<void> {
    const entry = this.state().entries.find((item) => item.id === entryId);
    const label = entry
      ? entry.issuer
        ? `${entry.issuer} · ${destructiveTitle(entry.name, this.i18n.t("authenticator"))}`
        : destructiveTitle(entry.name, this.i18n.t("authenticator"))
      : this.i18n.t("authenticatorTrashPermanent");
    const confirmed = await this.dialogService.openSimpleDialog(
      destructiveDialogOptions({
        title: label,
        content: this.i18n.t("permanentlyDeleteItemConfirmation"),
        acceptText: this.i18n.t("authenticatorTrashPermanent"),
      }),
    );
    if (!confirmed) {
      return;
    }
    try {
      await this.authenticator.remove(entryId);
    } catch {
      this.failSave();
    }
  }

  protected help(): void {
    void this.router.navigate(["/authenticator-help"]);
  }

  protected async showVaultImport(): Promise<void> {
    if (this.showVault()) {
      this.showVault.set(false);
      return;
    }
    this.vaultImports.set(await this.authenticator.importVaultTotp());
    this.showVault.set(true);
  }

  protected async importOne(draft: AuthenticatorDraft): Promise<void> {
    try {
      await this.authenticator.save(draft);
      this.vaultImports.set(await this.authenticator.importVaultTotp());
    } catch {
      this.failSave();
    }
  }

  protected async importPasted(): Promise<void> {
    await this.importPayload(this.importText());
  }

  protected async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || this.readOnly()) {
      return;
    }
    this.importingFile.set(true);
    try {
      if (file.type.startsWith("image/")) {
        const payload = await decodeQrPayload(await readFileAsDataUrl(file));
        if (!payload) {
          this.toast.showToast({
            variant: "error",
            title: null,
            message: this.i18n.t("authenticatorScanEmpty"),
          });
          return;
        }
        await this.importPayload(payload);
        return;
      }
      await this.importPayload(await file.text());
    } finally {
      this.importingFile.set(false);
    }
  }

  protected exportFile(): void {
    const document = buildAuthenticatorExport(this.state().entries);
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "authenticator-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    this.toast.showToast({
      variant: "info",
      title: null,
      message: this.i18n.t("authenticatorExportWarning"),
    });
  }

  protected async backupToVault(): Promise<void> {
    if (this.readOnly()) {
      return;
    }
    try {
      await this.authenticator.backupToVault();
      this.toast.showToast({
        variant: "success",
        title: null,
        message: this.i18n.t("authenticatorBackupSaved"),
      });
    } catch {
      this.failSave();
    }
  }

  private async importPayload(text: string): Promise<void> {
    if (this.readOnly()) {
      return;
    }
    const result = parseAuthenticatorImport(text);
    if (result.encrypted) {
      this.toast.showToast({
        variant: "error",
        title: null,
        message: this.i18n.t("authenticatorImportEncrypted"),
      });
      return;
    }
    if (result.entries.length === 0) {
      this.toast.showToast({
        variant: "error",
        title: null,
        message: this.i18n.t("authenticatorImportEmpty"),
      });
      return;
    }
    try {
      const saved = await this.authenticator.saveImported(result.entries);
      this.importText.set("");
      this.toast.showToast({
        variant: "success",
        title: null,
        message: this.i18n.t("authenticatorImported", String(saved)),
      });
    } catch {
      this.failSave();
    }
  }

  private failSave(): void {
    this.toast.showToast({
      variant: "error",
      title: null,
      message: this.i18n.t("serverSaveFailed"),
    });
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
