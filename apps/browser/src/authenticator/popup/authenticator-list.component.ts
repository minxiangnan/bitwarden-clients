import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { AutofillSettingsServiceAbstraction } from "@bitwarden/common/autofill/services/autofill-settings.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { ButtonModule, FormFieldModule, ToastService } from "@bitwarden/components";

import { PopOutComponent } from "../../platform/popup/components/pop-out.component";
import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";
import { parseAuthenticatorImport } from "../authenticator-import";
import { filterAuthenticatorEntries, parseOtpAuthUri } from "../authenticator-otpauth";
import { scanCurrentTabForOtpauth } from "../authenticator-scan";
import { AuthenticatorGroup } from "../authenticator-ui-state";
import { AuthenticatorEntryView } from "../authenticator.models";
import { clipboardClearMs } from "../clipboard-delay";

import { AuthenticatorCodeComponent } from "./authenticator-code.component";
import { AuthenticatorUiService } from "./authenticator-ui.service";
import { AuthenticatorService } from "./authenticator.service";

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
  private readonly autofillSettings = inject(AutofillSettingsServiceAbstraction, {
    optional: true,
  });
  protected readonly ui = inject(AuthenticatorUiService);
  private readonly codes = new Map<string, string>();

  protected readonly query = signal("");
  protected readonly favoritesOnly = signal(false);
  protected readonly scanning = signal(false);
  protected readonly busyId = signal<string | null>(null);

  private readonly state = toSignal(this.authenticator.state$, {
    initialValue: {
      status: "loading" as const,
      entries: [] as AuthenticatorEntryView[],
      syncedAt: null as string | null,
    },
  });

  protected readonly status = computed(() => this.state().status);
  protected readonly loading = computed(() => this.status() === "loading");
  protected readonly readOnly = computed(() => this.status() === "offline");
  protected readonly syncedAt = computed(() => this.state().syncedAt ?? null);
  protected readonly recentOnly = this.ui.recentOnly;
  protected readonly visible = computed(() => {
    const filtered = filterAuthenticatorEntries(
      this.state().entries.filter((entry) => !entry.deletedAt),
      this.query(),
      this.favoritesOnly(),
      this.ui.sort(),
    );
    if (!this.ui.recentOnly()) {
      return filtered;
    }
    const byId = new Map(filtered.map((entry) => [entry.id, entry]));
    return this.ui
      .recentIds()
      .map((id) => byId.get(id))
      .filter((entry): entry is AuthenticatorEntryView => entry != null);
  });
  protected readonly groups = computed(() => groupEntries(this.visible(), this.ui.group()));

  constructor() {
    const probe = this.authenticator.confirmServer;
    if (typeof probe === "function") {
      void probe.call(this.authenticator);
    }
  }

  protected rememberCode(id: string, code: string): void {
    this.codes.set(id, code);
  }

  protected async copy(entry: AuthenticatorEntryView): Promise<void> {
    const value = this.codes.get(entry.id);
    if (!value) {
      return;
    }
    const clearMs = this.autofillSettings
      ? clipboardClearMs(await firstValueFrom(this.autofillSettings.clearClipboardDelay$))
      : undefined;
    this.platformUtils.copyToClipboard(value, clearMs ? { clearMs } : undefined);
    this.toast.showToast({
      variant: "success",
      title: null,
      message: this.i18n.t("authenticatorCopied"),
    });
    this.ui.noteRecent(entry.id);
    if (entry.kind === "hotp" && !this.readOnly()) {
      try {
        await this.authenticator.advanceHotp(entry);
      } catch {
        this.failSave();
      }
    }
  }

  protected add(): void {
    void this.router.navigate(["/authenticator/new"]);
  }

  protected openTools(): void {
    void this.router.navigate(["/authenticator-tools"]);
  }

  protected async scanCurrentPage(): Promise<void> {
    if (this.scanning()) {
      return;
    }
    this.scanning.set(true);
    try {
      const uri = await scanCurrentTabForOtpauth();
      if (!uri) {
        this.toast.showToast({
          variant: "error",
          title: null,
          message: this.i18n.t("authenticatorScanEmpty"),
        });
        return;
      }
      const imported = parseAuthenticatorImport(uri);
      if (imported.entries.length > 1 || uri.toLowerCase().startsWith("otpauth-migration://")) {
        const saved = await this.authenticator.saveImported(imported.entries);
        this.toast.showToast({
          variant: saved > 0 ? "success" : "error",
          title: null,
          message: this.i18n.t(
            saved > 0 ? "authenticatorImported" : "authenticatorImportEmpty",
            String(saved),
          ),
        });
        return;
      }
      const parsed = parseOtpAuthUri(uri);
      if (!parsed) {
        this.toast.showToast({
          variant: "error",
          title: null,
          message: this.i18n.t("authenticatorInvalidUri"),
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
    } catch {
      this.toast.showToast({
        variant: "error",
        title: null,
        message: this.i18n.t("serverSaveFailed"),
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
    } catch {
      this.failSave();
    } finally {
      this.busyId.set(null);
    }
  }

  protected syncedLabel(): string {
    const value = this.syncedAt();
    if (!value) {
      return "";
    }
    const time = new Date(value);
    if (Number.isNaN(time.getTime())) {
      return "";
    }
    return this.i18n.t("authenticatorSyncedAt", time.toLocaleString());
  }

  private failSave(): void {
    this.toast.showToast({
      variant: "error",
      title: null,
      message: this.i18n.t("serverSaveFailed"),
    });
  }
}

function groupEntries(
  entries: AuthenticatorEntryView[],
  mode: AuthenticatorGroup,
): { title: string; entries: AuthenticatorEntryView[] }[] {
  if (mode === "none") {
    return [{ title: "", entries }];
  }
  const groups = new Map<string, AuthenticatorEntryView[]>();
  for (const entry of entries) {
    const titles =
      mode === "tag"
        ? entry.tags && entry.tags.length > 0
          ? entry.tags
          : ["未分组"]
        : [entry.issuer || "未分组"];
    for (const title of titles) {
      const list = groups.get(title) ?? [];
      list.push(entry);
      groups.set(title, list);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh"))
    .map(([title, grouped]) => ({ title, entries: grouped }));
}
