import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { ButtonModule, FormFieldModule, ToastService } from "@bitwarden/components";

import { PopOutComponent } from "../../platform/popup/components/pop-out.component";
import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";
import { filterAuthenticatorEntries, parseOtpAuthUri } from "../authenticator-otpauth";
import { scanCurrentTabForOtpauth } from "../authenticator-scan";
import { AuthenticatorEntryView } from "../authenticator.models";

import { AuthenticatorCodeComponent } from "./authenticator-code.component";
import { AuthenticatorDraft, AuthenticatorService } from "./authenticator.service";

@Component({
  selector: "app-authenticator-list",
  imports: [
    CommonModule,
    FormsModule,
    JslibModule,
    ButtonModule,
    FormFieldModule,
    PopupPageComponent,
    PopupHeaderComponent,
    PopOutComponent,
    AuthenticatorCodeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./authenticator-list.component.html",
})
export class AuthenticatorListComponent {
  private readonly authenticator = inject(AuthenticatorService);
  private readonly router = inject(Router);
  private readonly platformUtils = inject(PlatformUtilsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly codes = new Map<string, string>();

  protected readonly query = signal("");
  protected readonly favoritesOnly = signal(false);
  protected readonly importing = signal(false);
  protected readonly scanning = signal(false);
  protected readonly vaultImports = signal<
    Awaited<ReturnType<AuthenticatorService["importVaultTotp"]>>
  >([]);
  protected readonly pendingDelete = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);

  private readonly state = toSignal(this.authenticator.state$, {
    initialValue: { status: "loading" as const, entries: [] as AuthenticatorEntryView[] },
  });

  protected readonly status = computed(() => this.state().status);
  protected readonly loading = computed(() => this.status() === "loading");
  protected readonly visible = computed(() =>
    filterAuthenticatorEntries(this.state().entries, this.query(), this.favoritesOnly()),
  );

  protected rememberCode(id: string, code: string): void {
    this.codes.set(id, code);
  }

  protected copy(entry: AuthenticatorEntryView): void {
    const value = this.codes.get(entry.id);
    if (!value) {
      return;
    }
    this.platformUtils.copyToClipboard(value);
    this.toast.showToast({
      variant: "success",
      title: null,
      message: this.i18n.t("authenticatorCopied"),
    });
  }

  protected add(): void {
    void this.router.navigate(["/authenticator/new"]);
  }

  protected async scanCurrentPage(): Promise<void> {
    if (this.scanning()) {
      return;
    }
    this.scanning.set(true);
    try {
      const uri = await scanCurrentTabForOtpauth();
      const parsed = uri ? parseOtpAuthUri(uri) : null;
      if (!parsed) {
        this.toast.showToast({
          variant: "error",
          title: null,
          message: this.i18n.t(uri ? "authenticatorInvalidUri" : "authenticatorScanEmpty"),
        });
        return;
      }
      if (!parsed.name.trim()) {
        const state = await firstValueFrom(this.authenticator.state$);
        parsed.name =
          parsed.issuer ||
          this.i18n.t("authenticatorDefaultName", String(state.entries.length + 1));
      }
      await this.authenticator.save({ ...parsed, notes: "", favorite: false });
      this.toast.showToast({
        variant: "success",
        title: null,
        message: this.i18n.t("authenticatorScanFound"),
      });
    } finally {
      this.scanning.set(false);
    }
  }

  protected edit(entry: AuthenticatorEntryView): void {
    if (entry.undecryptable || this.busyId() != null) {
      return;
    }
    void this.router.navigate(["/authenticator", entry.id]);
  }

  protected async toggleFavorite(entry: AuthenticatorEntryView): Promise<void> {
    if (entry.undecryptable || this.busyId() != null) {
      return;
    }
    this.busyId.set(entry.id);
    try {
      await this.authenticator.setFavorite(entry, !entry.favorite);
    } finally {
      this.busyId.set(null);
    }
  }

  protected async move(entry: AuthenticatorEntryView, direction: -1 | 1): Promise<void> {
    if (entry.undecryptable || this.busyId() != null) {
      return;
    }
    this.busyId.set(entry.id);
    try {
      await this.authenticator.move(entry.id, direction);
    } finally {
      this.busyId.set(null);
    }
  }

  protected async remove(entry: AuthenticatorEntryView): Promise<void> {
    if (this.busyId() != null) {
      return;
    }
    this.busyId.set(entry.id);
    try {
      await this.authenticator.remove(entry.id);
      this.pendingDelete.set(null);
    } finally {
      this.busyId.set(null);
    }
  }

  protected async toggleImport(): Promise<void> {
    if (this.importing()) {
      this.importing.set(false);
      return;
    }
    this.vaultImports.set(await this.authenticator.importVaultTotp());
    this.importing.set(true);
  }

  protected async importOne(draft: AuthenticatorDraft): Promise<void> {
    await this.authenticator.save(draft);
    this.vaultImports.set(await this.authenticator.importVaultTotp());
  }
}
